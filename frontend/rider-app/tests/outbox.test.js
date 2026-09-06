import { describe, it, expect } from 'vitest';
import { createOutbox, STATE } from '../src/outbox/core';
import { createMemoryAdapter } from '../src/outbox/adapters/memory';

function harness({ handlers = [], clock = { t: 0 }, random = () => 1 } = {}) {
  const sent = [];
  let n = 0;

  const transport = async (row) => {
    sent.push({ key: row.idempotency_key, kind: row.kind, target: row.target_status });
    const handler = handlers[Math.min(n++, handlers.length - 1)];
    if (typeof handler === 'function') return handler(row);
    return handler;
  };

  let keySeq = 0;
  const adapter = createMemoryAdapter();
  const outbox = createOutbox({
    adapter,
    transport,
    now: () => clock.t,
    newKey: () => `key-${++keySeq}`,
    random,
  });

  return { outbox, adapter, sent, clock };
}


const timeout = () => {
  const err = new Error('Request timed out');
  err.timedOut = true;
  throw err;
};

const httpError = (status, code, details) => () => {
  const err = new Error(code);
  err.status = status;
  err.code = code;
  err.details = details;
  throw err;
};



describe('outbox', () => {
  it('sends a queued action once and confirms it', async () => {
    const { outbox, sent } = harness({ handlers: [{ id: 'order-1' }] });
    await outbox.enqueue({ kind: 'CLAIM' });
    await outbox.drain();

    expect(sent).toHaveLength(1);
    const [row] = await outbox.all();
    expect(row.state).toBe(STATE.CONFIRMED);
    expect(row.result_code).toBe('OK');
  });


  it('treats a claim that found nothing as confirmed, not failed', async () => {
    const { outbox } = harness({ handlers: [null] });
    await outbox.enqueue({ kind: 'CLAIM' });
    await outbox.drain();

    const [row] = await outbox.all();
    expect(row.state).toBe(STATE.CONFIRMED);
    expect(row.result_code).toBe('NO_ORDER');
  });


  it('retries a timed-out action with the same key and ends confirmed', async () => {
    const clock = { t: 0 };
    const { outbox, sent } = harness({
      clock,
      handlers: [timeout, { id: 'order-1', alreadyApplied: true }],
    });

    await outbox.enqueue({ kind: 'TRANSITION', orderId: 'order-1', targetStatus: 'DELIVERED' });
    await outbox.drain();

    let [row] = await outbox.all();
    expect(row.state).toBe(STATE.QUEUED);
    expect(row.attempts).toBe(1);

    clock.t = row.next_attempt_at;
    await outbox.drain();

    [row] = await outbox.all();
    expect(row.state).toBe(STATE.CONFIRMED);
    expect(row.result_code).toBe('ALREADY_APPLIED');

    expect(sent).toHaveLength(2);
    expect(sent[0].key).toBe(sent[1].key);
    expect(await outbox.all()).toHaveLength(1);
  });



  it('recovers rows left mid-flight by an app kill', async () => {
    const { outbox, adapter } = harness({ handlers: [timeout] });
    await outbox.enqueue({ kind: 'TRANSITION', orderId: 'o1', targetStatus: 'DELIVERED' });

    const [before] = await adapter.all();
    await adapter.update(before.id, { state: STATE.SENDING });

    const restarted = createOutbox({
      adapter: adapter.reopen(),
      transport: async () => ({ ok: true }),
      now: () => 0,
      newKey: () => 'unused',
    });

    expect(await restarted.recover()).toBe(1);
    const [row] = await restarted.all();
    expect(row.state).toBe(STATE.QUEUED);
    expect(row.idempotency_key).toBe(before.idempotency_key);
  });


  it('does not let a later action overtake a stalled one', async () => {
    const clock = { t: 0 };
    const { outbox, sent } = harness({ clock, handlers: [timeout] });

    await outbox.enqueue({ kind: 'TRANSITION', orderId: 'o1', targetStatus: 'OUT_FOR_DELIVERY' });
    await outbox.enqueue({ kind: 'TRANSITION', orderId: 'o1', targetStatus: 'DELIVERED' });

    await outbox.drain();

    expect(sent).toHaveLength(1);
    expect(sent[0].target).toBe('OUT_FOR_DELIVERY');

    const rows = await outbox.all();
    expect(rows[1].state).toBe(STATE.QUEUED);
    expect(rows[1].attempts).toBe(0);
  });



  it('marks a stale claim as a conflict and never retries it', async () => {
    const { outbox, sent } = harness({ handlers: [httpError(409, 'STALE_CLAIM')] });
    await outbox.enqueue({ kind: 'TRANSITION', orderId: 'o1', targetStatus: 'DELIVERED' });

    await outbox.drain();
    await outbox.drain();

    expect(sent).toHaveLength(1);
    const [row] = await outbox.all();
    expect(row.state).toBe(STATE.CONFLICT);
    expect(row.user_message).toMatch(/no longer yours/i);
  });

  it('explains an ops cancellation in the rider’s words', async () => {
    const { outbox } = harness({
      handlers: [httpError(409, 'INVALID_TRANSITION', { current: 'CANCELLED' })],
    });
    await outbox.enqueue({ kind: 'TRANSITION', orderId: 'o1', targetStatus: 'DELIVERED' });
    await outbox.drain();

    const [row] = await outbox.all();
    expect(row.state).toBe(STATE.CONFLICT);
    expect(row.user_message).toMatch(/cancelled by ops/i);
  });



  it('gives up on errors a retry cannot fix', async () => {
    const { outbox, sent } = harness({ handlers: [httpError(404, 'NOT_FOUND')] });
    await outbox.enqueue({ kind: 'TRANSITION', orderId: 'gone', targetStatus: 'DELIVERED' });

    await outbox.drain();
    await outbox.drain();

    expect(sent).toHaveLength(1);
    const [row] = await outbox.all();
    expect(row.state).toBe(STATE.DEAD);
  });

  it('backs off further each attempt and never drops the action', async () => {
    const clock = { t: 0 };
    const { outbox } = harness({ clock, handlers: [timeout], random: () => 1 });
    await outbox.enqueue({ kind: 'CLAIM' });

    const delays = [];
    for (let i = 0; i < 4; i += 1) {
      await outbox.drain();
      const [row] = await outbox.all();
      delays.push(row.next_attempt_at - clock.t);
      clock.t = row.next_attempt_at;
    }

    expect(delays).toEqual([2000, 4000, 8000, 16000]);
    const [row] = await outbox.all();
    expect(row.state).toBe(STATE.QUEUED);
    expect(row.attempts).toBe(4);
  });

  it('labels an action stuck after repeated failures without dropping it', async () => {
    const clock = { t: 0 };
    const { outbox } = harness({ clock, handlers: [timeout], random: () => 1 });
    await outbox.enqueue({ kind: 'CLAIM' });

    for (let i = 0; i < 5; i += 1) {
      await outbox.drain();
      const [row] = await outbox.all();
      clock.t = row.next_attempt_at;
    }

    const [row] = await outbox.all();
    expect(row.attempts).toBe(5);
    expect(row.user_message).toMatch(/still trying/i);
    expect(row.state).toBe(STATE.QUEUED);
  });



  it('runs one drain at a time so an action cannot be sent twice', async () => {
    let release;
    const gate = new Promise((r) => {
      release = r;
    });

    const { outbox, sent } = harness({
      handlers: [
        async () => {
          await gate;
          return { ok: true };
        },
      ],
    });
    await outbox.enqueue({ kind: 'CLAIM' });

    const first = outbox.drain();
    const second = outbox.drain();

    expect(await second).toEqual({ drained: 0 });
    release();
    await first;

    expect(sent).toHaveLength(1);
  });


  
  it('keeps pending count honest for the UI', async () => {
    const { outbox } = harness({ handlers: [timeout] });
    await outbox.enqueue({ kind: 'CLAIM' });
    await outbox.enqueue({ kind: 'TRANSITION', orderId: 'o1', targetStatus: 'DELIVERED' });

    expect(await outbox.pendingCount()).toBe(2);
    await outbox.drain();
    expect(await outbox.pendingCount()).toBe(2);
  });
});
