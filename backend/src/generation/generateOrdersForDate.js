import { pool } from '../db/pool.js';
import { cutoffInstant } from '../lib/time.js';
import { resolveSubscriptionForDate } from '../subscriptions/eligibility.js';

export async function generateOrdersForDate(serviceDate, { asOf } = {}) {
  const cutoffAt = asOf ?? cutoffInstant(serviceDate);

  const { rows: subscriptions } = await pool.query(
    `SELECT s.id, s.customer_id, s.start_date, s.weekday_mask, s.is_active,
            s.pauses, s.skips, s.address_history, p.price_paise
       FROM subscriptions s
       JOIN plans p ON p.id = s.plan_id
      WHERE s.is_active = true AND s.start_date <= $1`,
    [serviceDate],
  );

  let eligible = 0;
  let created = 0;
  let skippedExisting = 0;

  for (const subscription of subscriptions) {
    const result = resolveSubscriptionForDate(subscription, serviceDate, cutoffAt);
    if (!result.eligible) continue;
    eligible += 1;

    const { rows } = await pool.query(
      `INSERT INTO orders (subscription_id, customer_id, service_date, price_paise, delivery_address)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (subscription_id, service_date) DO NOTHING
       RETURNING id`,
      [subscription.id, subscription.customer_id, serviceDate, subscription.price_paise, result.address],
    );

    if (rows.length > 0) created += 1;
    else skippedExisting += 1;
  }

  return { serviceDate, cutoffAt, eligible, created, skippedExisting };
}
