import { classify, backoffMs, OUTCOME } from './classify';

export const STATE = {
  QUEUED: 'QUEUED',
  SENDING: 'SENDING',
  CONFIRMED: 'CONFIRMED',
  CONFLICT: 'CONFLICT',
  DEAD: 'DEAD',
};

const UNSETTLED = [STATE.QUEUED, STATE.SENDING];
const STUCK_AFTER_ATTEMPTS = 5;

export function createOutbox({
  adapter,
  transport,
  onChange = () => {},
  now = () => Date.now(),
  newKey,
  random = Math.random,
  backoffCap = 60_000,
}) {
  
  let draining = false;

  async function enqueue({ kind, orderId = null, targetStatus = null, claimId = null, body = {} }) {
    const row = await adapter.insert({
      idempotency_key: newKey(),
      kind,
      order_id: orderId,
      target_status: targetStatus,
      claim_id: claimId,
      body: JSON.stringify(body),
      state: STATE.QUEUED,
      attempts: 0,
      next_attempt_at: now(),
      created_at: now(),
      result_code: null,
      user_message: null,
    });


    onChange();
    return row;
  }

  async function recover() {
    const n = await adapter.resetSending();
    if (n > 0) onChange();
    return n;
  }

  async function attempt(row) {
    try {
      const payload = await transport(row);
      return classify(row, { payload });
    } catch (error) {
      return classify(row, { error });
    }
  }

  async function drain() {
    if (draining) return { drained: 0 };
    draining = true;
    let drained = 0;

    try {
      for (;;) {
        const row = await adapter.nextUnsettled();
        if (!row) break;
        if (row.next_attempt_at > now()) break;

        await adapter.update(row.id, { state: STATE.SENDING });
        onChange();

        const result = await attempt(row);
        drained += 1;

        if (result.outcome === OUTCOME.RETRY) {
          const attempts = row.attempts + 1;
          await adapter.update(row.id, {
            state: STATE.QUEUED,
            attempts,
            next_attempt_at: now() + backoffMs(attempts, { cap: backoffCap, random }),
            user_message: attempts >= STUCK_AFTER_ATTEMPTS ? 'Still trying — no connection' : null,
          });
          onChange();
          break;
        }

        await adapter.update(row.id, {
          state:
            result.outcome === OUTCOME.CONFIRMED
              ? STATE.CONFIRMED
              : result.outcome === OUTCOME.CONFLICT
                ? STATE.CONFLICT
                : STATE.DEAD,
          attempts: row.attempts + 1,
          result_code: result.resultCode ?? result.code ?? null,
          user_message: result.message ?? null,
          settled_at: now(),
        });
        onChange();
      }
    } finally {
      draining = false;
    }

    return { drained };
  }

  return {
    enqueue,
    recover,
    drain,
    isDraining: () => draining,
    all: () => adapter.all(),
    unsettled: () => adapter.byStates(UNSETTLED),
    pendingCount: () => adapter.countByStates(UNSETTLED),
    conflicts: () => adapter.byStates([STATE.CONFLICT, STATE.DEAD]),
    clearSettled: () => adapter.deleteByStates([STATE.CONFIRMED]),
    reset: () => adapter.deleteByStates(Object.values(STATE)),
  };
}
