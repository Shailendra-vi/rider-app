import { describe, it, expect } from 'vitest';
import { pool } from '../src/db/pool.js';
import { generateOrdersForDate } from '../src/generation/generateOrdersForDate.js';

const SERVICE_DATE = '2026-09-05';
const ALL_WEEKDAYS_MASK = 0b1111111;


async function insertPlan() {
  const { rows } = await pool.query(
    `INSERT INTO plans (code, name, meal_slot, price_paise)
     VALUES ('WEEKDAY_LUNCH_VEG', 'Weekday Lunch Veg', 'LUNCH', 12000) RETURNING id`,
  );
  return rows[0].id;
}


async function insertCustomer(phone) {
  const { rows } = await pool.query(
    `INSERT INTO customers (name, phone) VALUES ('Test Customer', $1) RETURNING id`,
    [phone],
  );
  return rows[0].id;
}



async function insertSubscription(customerId, planId, { startDate = '2020-01-01' } = {}) {
  const { rows } = await pool.query(
    `INSERT INTO subscriptions (customer_id, plan_id, start_date, weekday_mask, address_history)
     VALUES ($1, $2, $3::date, $4,
       jsonb_build_array(jsonb_build_object(
         'address', '221B, Sector 62, Noida',
         'effective_from', $3::date,
         'recorded_at', now()
       ))
     ) RETURNING id`,
    [customerId, planId, startDate, ALL_WEEKDAYS_MASK],
  );
  return rows[0].id;
}



async function seedSubscriptions(count) {
  const planId = await insertPlan();
  for (let i = 0; i < count; i += 1) {
    const customerId = await insertCustomer(`+9100000000${i}`);
    await insertSubscription(customerId, planId);
  }
}




describe('generateOrdersForDate', () => {
  it('is idempotent: running it twice creates no duplicates', async () => {
    await seedSubscriptions(3);
    const asOf = new Date();

    const first = await generateOrdersForDate(SERVICE_DATE, { asOf });
    expect(first.eligible).toBe(3);
    expect(first.created).toBe(3);
    expect(first.skippedExisting).toBe(0);

    const second = await generateOrdersForDate(SERVICE_DATE, { asOf });
    expect(second.eligible).toBe(3);
    expect(second.created).toBe(0);
    expect(second.skippedExisting).toBe(3);

    const { rows } = await pool.query('SELECT count(*) FROM orders WHERE service_date = $1', [SERVICE_DATE]);
    expect(Number(rows[0].count)).toBe(3);
  });

  it('running it again after a partial failure completes the day with no duplicates', async () => {
    await seedSubscriptions(5);
    const asOf = new Date();

    //  crash mid-run
    const { rows: subs } = await pool.query('SELECT id, customer_id FROM subscriptions ORDER BY id LIMIT 2');
    for (const s of subs) {
      await pool.query(
        `INSERT INTO orders (subscription_id, customer_id, service_date, price_paise, delivery_address)
         VALUES ($1, $2, $3, 12000, 'partial run')`,
        [s.id, s.customer_id, SERVICE_DATE],
      );
    }

    const result = await generateOrdersForDate(SERVICE_DATE, { asOf });
    expect(result.eligible).toBe(5);
    expect(result.created).toBe(3);
    expect(result.skippedExisting).toBe(2);


    const { rows } = await pool.query(
      `SELECT subscription_id, count(*) FROM orders WHERE service_date = $1 GROUP BY subscription_id HAVING count(*) > 1`,
      [SERVICE_DATE],
    );
    expect(rows).toHaveLength(0);
  });



  it('never creates duplicates when two runs race for the same date', async () => {
    await seedSubscriptions(20);
    const asOf = new Date();

    const [a, b] = await Promise.all([
      generateOrdersForDate(SERVICE_DATE, { asOf }),
      generateOrdersForDate(SERVICE_DATE, { asOf }),
    ]);

    expect(a.created + b.created).toBe(20);

    const { rows: total } = await pool.query('SELECT count(*) FROM orders WHERE service_date = $1', [SERVICE_DATE]);
    expect(Number(total[0].count)).toBe(20);

    const { rows: dupes } = await pool.query(
      `SELECT subscription_id, count(*) FROM orders WHERE service_date = $1 GROUP BY subscription_id HAVING count(*) > 1`,
      [SERVICE_DATE],
    );
    expect(dupes).toHaveLength(0);
  });
});
