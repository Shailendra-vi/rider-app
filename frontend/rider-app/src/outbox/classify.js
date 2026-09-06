export const OUTCOME = {
  CONFIRMED: 'CONFIRMED',
  CONFLICT: 'CONFLICT',
  DEAD: 'DEAD',
  RETRY: 'RETRY',
};

export function classify(action, { payload, error } = {}) {
  if (error) {
    if (error.timedOut) return { outcome: OUTCOME.RETRY, reason: 'TIMEOUT' };

    if (!error.status) return { outcome: OUTCOME.RETRY, reason: 'NETWORK' };

    if (error.status >= 500) return { outcome: OUTCOME.RETRY, reason: 'SERVER' };

    if (error.status === 409) {
      if (error.code === 'RIDER_OFFLINE') {
        return { outcome: OUTCOME.CONFLICT, code: error.code, message: 'You went offline — go back on shift first.' };
      }


      if (error.code === 'STALE_CLAIM') {
        return {
          outcome: OUTCOME.CONFLICT,
          code: error.code,
          message: 'This order is no longer yours — it was reassigned or closed.',
        };
      }


      if (error.code === 'INVALID_TRANSITION') {
        const current = error.details?.current;
        return {
          outcome: OUTCOME.CONFLICT,
          code: error.code,
          message:
            current === 'CANCELLED'
              ? 'Cancelled by ops while you were offline.'
              : `The order moved on without you${current ? ` (now ${current})` : ''}.`,
        };
      }


      return { outcome: OUTCOME.CONFLICT, code: error.code, message: error.message };
    }

    return { outcome: OUTCOME.DEAD, code: error.code, message: error.message };
  }

  if (payload === null && action.kind === 'CLAIM') {
    return { 
      outcome: OUTCOME.CONFIRMED, 
      resultCode: 'NO_ORDER', 
      message: 'No orders ready right now' 
    };
  }

  if (payload?.alreadyApplied) {
    return { 
      outcome: OUTCOME.CONFIRMED, 
      resultCode: 'ALREADY_APPLIED', 
      payload 
    };
  }

  return { outcome: OUTCOME.CONFIRMED, resultCode: 'OK', payload };
}

export function backoffMs(attempts, { cap = 60_000, random = Math.random } = {}) {
  const ceiling = Math.min(cap, 2 ** attempts * 1000);
  return Math.round(random() * ceiling);
}
