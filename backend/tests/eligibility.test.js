import { describe, it, expect } from 'vitest';
import { resolveSubscriptionForDate } from '../src/subscriptions/eligibility.js';

function baseSubscription(overrides = {}) {
  return {
    is_active: true,
    start_date: '2020-01-01',
    weekday_mask: 0b1111111,
    pauses: [],
    skips: [],
    address_history: [{ address: 'Test Address', effective_from: '2020-01-01', recorded_at: '2020-01-01T00:00:00Z' }],
    ...overrides,
  };
}

const asOf = new Date('2025-08-12T12:00:00Z');

describe('cancelling a pause makes the day servable again', () => {
  it('is paused when the pause is active and not cancelled', () => {
    const sub = baseSubscription({
      pauses: [{ id: 'p1', from_date: '2025-08-11', to_date: '2025-08-13', recorded_at: '2025-08-01T00:00:00Z' }],
    });
    expect(resolveSubscriptionForDate(sub, '2025-08-12', asOf).reason).toBe('PAUSED');
  });

  it('is servable once a cancellation for that pause is recorded before the cutoff', () => {
    const sub = baseSubscription({
      pauses: [
        { id: 'p1', from_date: '2025-08-11', to_date: '2025-08-13', recorded_at: '2025-08-01T00:00:00Z' },
        { cancels: 'p1', recorded_at: '2025-08-05T00:00:00Z' },
      ],
    });
    expect(resolveSubscriptionForDate(sub, '2025-08-12', asOf).eligible).toBe(true);
  });

  it('the original pause still shows up in history — cancelling never removes it', () => {
    const sub = baseSubscription({
      pauses: [
        { id: 'p1', from_date: '2025-08-11', to_date: '2025-08-13', recorded_at: '2025-08-01T00:00:00Z' },
        { cancels: 'p1', recorded_at: '2025-08-05T00:00:00Z' },
      ],
    });
    expect(sub.pauses).toHaveLength(2);
    expect(sub.pauses[0]).toMatchObject({ id: 'p1', from_date: '2025-08-11' });
  });

  it('a cancellation recorded after the cutoff does not retroactively un-pause the day', () => {
    const sub = baseSubscription({
      pauses: [
        { id: 'p1', from_date: '2025-08-11', to_date: '2025-08-13', recorded_at: '2025-08-01T00:00:00Z' },
        { cancels: 'p1', recorded_at: '2025-08-20T00:00:00Z' },
      ],
    });
    expect(resolveSubscriptionForDate(sub, '2025-08-12', asOf).reason).toBe('PAUSED');
  });

  it('cancelling a skip makes that day servable again', () => {
    const sub = baseSubscription({
      skips: [
        { id: 's1', service_date: '2025-08-12', recorded_at: '2025-08-01T00:00:00Z' },
        { cancels: 's1', recorded_at: '2025-08-05T00:00:00Z' },
      ],
    });
    expect(resolveSubscriptionForDate(sub, '2025-08-12', asOf).eligible).toBe(true);
  });
});
