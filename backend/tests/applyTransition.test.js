import { describe, it, expect } from 'vitest';
import { pool } from '../src/db/pool.js';
import { applyTransition } from '../src/orders/applyTransition.js';
import { HttpError } from '../src/lib/httpError.js';

async function seedOrder() {
  const { rows: plan } = await pool.query(
    `INSERT INTO plans (code, name, meal_slot, price_paise)
     VALUES ('WEEKDAY_LUNCH_VEG', 'Weekday Lunch Veg', 'LUNCH', 12000) RETURNING id`,
  );
  const { rows: customer } = await pool.query(
    `INSERT INTO customers (name, phone) VALUES ('Test Customer', '+919876500000') RETURNING id`,
  );
  const { rows: subscription } = await pool.query(
    `INSERT INTO subscriptions (customer_id, plan_id, start_date, weekday_mask)
     VALUES ($1, $2, '2020-01-01', 127) RETURNING id`,
    [customer[0].id, plan[0].id],
  );
  const { rows: order } = await pool.query(
    `INSERT INTO orders (subscription_id, customer_id, service_date, price_paise, delivery_address)
     VALUES ($1, $2, '2025-08-12', 12000, 'Test Address') RETURNING id`,
    [subscription[0].id, customer[0].id],
  );
  return order[0].id;
}

describe('applyTransition', () => {
  it('walks the happy path from PLACED to DELIVERED', async () => {
    const orderId = await seedOrder();

    await applyTransition(orderId, 'CONFIRMED');
    await applyTransition(orderId, 'PREPARING');
    await applyTransition(orderId, 'OUT_FOR_DELIVERY');
    const delivered = await applyTransition(orderId, 'DELIVERED');

    expect(delivered.status).toBe('DELIVERED');
  });

  it('allows cancellation from PLACED', async () => {
    const orderId = await seedOrder();
    const cancelled = await applyTransition(orderId, 'CANCELLED');
    expect(cancelled.status).toBe('CANCELLED');
  });

  it('rejects cancellation once out for delivery, with a clear error', async () => {
    const orderId = await seedOrder();
    await applyTransition(orderId, 'CONFIRMED');
    await applyTransition(orderId, 'PREPARING');
    await applyTransition(orderId, 'OUT_FOR_DELIVERY');

    await expect(applyTransition(orderId, 'CANCELLED')).rejects.toMatchObject({
      status: 409,
      code: 'INVALID_TRANSITION',
      details: { current: 'OUT_FOR_DELIVERY', allowed: ['DELIVERED', 'FAILED'] },
    });
  });

  it('rejects skipping straight from PLACED to DELIVERED', async () => {
    const orderId = await seedOrder();
    await expect(applyTransition(orderId, 'DELIVERED')).rejects.toBeInstanceOf(HttpError);
  });

  it('rejects a transition on an order that does not exist', async () => {
    await expect(applyTransition('00000000-0000-0000-0000-000000000000', 'CONFIRMED')).rejects.toMatchObject({
      status: 404,
      code: 'NOT_FOUND',
    });
  });

  it('leaves status unchanged after a rejected transition', async () => {
    const orderId = await seedOrder();
    await expect(applyTransition(orderId, 'DELIVERED')).rejects.toThrow();

    const { rows } = await pool.query('SELECT status FROM orders WHERE id = $1', [orderId]);
    expect(rows[0].status).toBe('PLACED');
  });
});
