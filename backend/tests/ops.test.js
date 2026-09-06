import { describe, it, expect } from 'vitest';
import { pool } from '../src/db/pool.js';
import { addSubscriptionEvent, cancelSubscriptionEvent } from '../src/ops/service.js';

async function seedSubscription() {
  const { rows: plan } = await pool.query(
    `INSERT INTO plans (code, name, meal_slot, price_paise)
     VALUES ('P_' || gen_random_uuid(), 'Plan', 'LUNCH', 12000) RETURNING id`,
  );
  const { rows: customer } = await pool.query(
    `INSERT INTO customers (name, phone) VALUES ('Cust', 'c' || gen_random_uuid())
     RETURNING id, name`,
  );
  const { rows: sub } = await pool.query(
    `INSERT INTO subscriptions (customer_id, plan_id, start_date, weekday_mask)
     VALUES ($1, $2, '2020-01-01', 127) RETURNING id`,
    [customer[0].id, plan[0].id],
  );
  return sub[0].id;
}

describe('subscription event duplicate guard', () => {
  it('rejects an exact-duplicate pause but allows a different one', async () => {
    const subId = await seedSubscription();
    const pause = { from_date: '2025-08-10', to_date: '2025-08-12' };

    const first = await addSubscriptionEvent(subId, 'pause', pause);
    expect(first.pauses).toHaveLength(1);

    await expect(addSubscriptionEvent(subId, 'pause', pause)).rejects.toMatchObject({
      status: 409,
      code: 'DUPLICATE_EVENT',
    });

    const different = await addSubscriptionEvent(subId, 'pause', { from_date: '2025-09-01', to_date: '2025-09-02' });
    expect(different.pauses).toHaveLength(2);
  });

  it('rejects an exact-duplicate skip for the same service date', async () => {
    const subId = await seedSubscription();
    await addSubscriptionEvent(subId, 'skip', { service_date: '2025-08-15' });

    await expect(addSubscriptionEvent(subId, 'skip', { service_date: '2025-08-15' })).rejects.toMatchObject({
      status: 409,
      code: 'DUPLICATE_EVENT',
    });

    const distinct = await addSubscriptionEvent(subId, 'skip', { service_date: '2025-08-16' });
    expect(distinct.skips).toHaveLength(2);
  });

  it('never overwrites or removes a past entry when a duplicate is rejected', async () => {
    const subId = await seedSubscription();
    const pause = { from_date: '2025-08-10', to_date: '2025-08-12' };
    await addSubscriptionEvent(subId, 'pause', pause);

    await expect(addSubscriptionEvent(subId, 'pause', pause)).rejects.toMatchObject({ code: 'DUPLICATE_EVENT' });

    const { rows } = await pool.query('SELECT pauses FROM subscriptions WHERE id = $1', [subId]);
    expect(rows[0].pauses).toHaveLength(1);
    expect(rows[0].pauses[0]).toMatchObject(pause);
  });
});

describe('cancelling a pause or skip', () => {
  it('appends a cancellation without removing the original entry', async () => {
    const subId = await seedSubscription();
    const created = await addSubscriptionEvent(subId, 'pause', { from_date: '2025-08-10', to_date: '2025-08-12' });
    const entryId = created.pauses[0].id;

    const cancelled = await cancelSubscriptionEvent(subId, 'pause', entryId);
    expect(cancelled.pauses).toHaveLength(2);
    expect(cancelled.pauses[0].id).toBe(entryId);
    expect(cancelled.pauses[1]).toMatchObject({ cancels: entryId });
  });

  it('rejects cancelling the same entry twice', async () => {
    const subId = await seedSubscription();
    const created = await addSubscriptionEvent(subId, 'skip', { service_date: '2025-08-15' });
    const entryId = created.skips[0].id;

    await cancelSubscriptionEvent(subId, 'skip', entryId);
    await expect(cancelSubscriptionEvent(subId, 'skip', entryId)).rejects.toMatchObject({
      status: 409,
      code: 'DUPLICATE_EVENT',
    });
  });

  it('rejects cancelling an entry that does not exist', async () => {
    const subId = await seedSubscription();
    await expect(cancelSubscriptionEvent(subId, 'pause', 'nonexistent-id')).rejects.toMatchObject({ status: 404 });
  });

  it('rejects cancelling an address change (not a cancellable kind)', async () => {
    const subId = await seedSubscription();
    await expect(cancelSubscriptionEvent(subId, 'address', 'whatever')).rejects.toMatchObject({
      status: 400,
      code: 'VALIDATION_FAILED',
    });
  });
});
