import { istWeekday, toDateString } from '../lib/time.js';

function activeEntries(list, asOf) {
  const knownByCutoff = (entry) => new Date(entry.recorded_at).getTime() <= asOf.getTime();
  const known = (list ?? []).filter(knownByCutoff);
  const cancelledIds = new Set(known.filter((e) => e.cancels).map((e) => e.cancels));
  return known.filter((e) => !e.cancels && !cancelledIds.has(e.id));
}

export function resolveSubscriptionForDate(subscription, serviceDate, asOf) {
  const knownByCutoff = (entry) => new Date(entry.recorded_at).getTime() <= asOf.getTime();

  if (!subscription.is_active) return { eligible: false, reason: 'CANCELLED' };

  if (toDateString(subscription.start_date) > serviceDate) {
    return { eligible: false, reason: 'BEFORE_START' };
  }

  const dow = istWeekday(serviceDate);
  if ((subscription.weekday_mask & (1 << dow)) === 0) {
    return { eligible: false, reason: 'NOT_ACTIVE_WEEKDAY' };
  }

  const skipped = activeEntries(subscription.skips, asOf).some((s) => toDateString(s.service_date) === serviceDate);
  if (skipped) return { eligible: false, reason: 'SKIPPED' };

  const paused = activeEntries(subscription.pauses, asOf).some(
    (p) => toDateString(p.from_date) <= serviceDate && serviceDate <= toDateString(p.to_date),
  );
  if (paused) return { eligible: false, reason: 'PAUSED' };

  const address = subscription.address_history
    .filter((a) => knownByCutoff(a) && toDateString(a.effective_from) <= serviceDate)
    .sort((a, b) => (a.effective_from < b.effective_from ? 1 : -1))[0];
  if (!address) return { eligible: false, reason: 'NO_ADDRESS' };

  return { eligible: true, reason: 'SERVABLE', address: address.address };
}
