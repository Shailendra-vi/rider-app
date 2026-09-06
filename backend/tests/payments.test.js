import { describe, it, expect } from 'vitest';
import { pool } from '../src/db/pool.js';
import { claimNextOrder } from '../src/riders/claimNextOrder.js';
import { applyTransition } from '../src/orders/applyTransition.js';
import { processPaymentWebhook, signPayload } from '../src/payments/webhook.js';
import { balancesByCustomer } from '../src/payments/ledger.js';
import { reconcileDate } from '../src/payments/reconciliation.js';

async function seedReadyOrder(serviceDate = '2025-08-12', price = 12000) {
  const { rows: plan } = await pool.query(
    `INSERT INTO plans (code, name, meal_slot, price_paise)
     VALUES ('P_' || gen_random_uuid(), 'Plan', 'LUNCH', $1) RETURNING id`,
    [price],
  );
  const { rows: customer } = await pool.query(
    `INSERT INTO customers (name, phone) VALUES ('Cust', 'c' || gen_random_uuid()) RETURNING id`,
  );
  const { rows: sub } = await pool.query(
    `INSERT INTO subscriptions (customer_id, plan_id, start_date, weekday_mask)
     VALUES ($1, $2, '2020-01-01', 127) RETURNING id`,
    [customer[0].id, plan[0].id],
  );
  const { rows: order } = await pool.query(
    `INSERT INTO orders (subscription_id, customer_id, service_date, status, price_paise, delivery_address)
     VALUES ($1, $2, $3, 'PREPARING', $4, 'Test Address') RETURNING id`,
    [sub[0].id, customer[0].id, serviceDate, price],
  );
  return { orderId: order[0].id, customerId: customer[0].id };
}

async function seedRider(phone) {
  const { rows } = await pool.query(`INSERT INTO riders (name, phone) VALUES ('Rider', $1) RETURNING id`, [phone]);
  return rows[0].id;
}

async function deliver(orderId, price = 12000) {
  const riderId = await seedRider('+919200000001');
  const claimed = await claimNextOrder(riderId);
  await applyTransition(claimed.id, 'OUT_FOR_DELIVERY', { riderId, claimId: claimed.claim_id });
  return applyTransition(claimed.id, 'DELIVERED', { riderId, claimId: claimed.claim_id });
}

function webhook(body, { skewSeconds = 0 } = {}) {
  const rawBody = Buffer.from(JSON.stringify(body));
  const timestamp = Math.floor(Date.now() / 1000) - skewSeconds;
  const signatureHeader = signPayload(rawBody, timestamp);
  return { body, rawBody, signatureHeader, timestampHeader: String(timestamp) };
}

describe('charge on delivery', () => {
  it('charges the customer exactly once when an order is delivered', async () => {
    const { orderId, customerId } = await seedReadyOrder('2025-08-12', 15000);
    await deliver(orderId, 15000);

    const { rows } = await pool.query("SELECT * FROM payments WHERE order_id = $1 AND type = 'CHARGE'", [orderId]);
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount_paise)).toBe(15000);
    expect(rows[0].customer_id).toBe(customerId);
  });

  it('does not double-charge when the same rider retries a lost-response DELIVERED', async () => {
    const { orderId } = await seedReadyOrder();
    const riderId = await seedRider('+919200000002');
    const claimed = await claimNextOrder(riderId);
    await applyTransition(claimed.id, 'OUT_FOR_DELIVERY', { riderId, claimId: claimed.claim_id });

    const first = await applyTransition(claimed.id, 'DELIVERED', { riderId, claimId: claimed.claim_id });
    const retry = await applyTransition(claimed.id, 'DELIVERED', { riderId, claimId: claimed.claim_id });
    expect(first.alreadyApplied).toBeUndefined();
    expect(retry.alreadyApplied).toBe(true);

    const { rows } = await pool.query("SELECT count(*) FROM payments WHERE order_id = $1 AND type = 'CHARGE'", [
      orderId,
    ]);
    expect(Number(rows[0].count)).toBe(1);
  });
});

describe('payment webhook', () => {
  it('applies a valid, correctly signed top-up', async () => {
    const { rows: customer } = await pool.query(
      `INSERT INTO customers (name, phone) VALUES ('Payer', 'p1') RETURNING id`,
    );
    const customerId = customer[0].id;

    const result = await processPaymentWebhook(
      webhook({ eventId: 'evt-1', customerId, type: 'TOPUP', amountPaise: 50000 }),
    );

    expect(result.duplicate).toBe(false);
    const balances = await balancesByCustomer();
    expect(Number(balances.find((b) => b.id === customerId).balance_paise)).toBe(50000);
  });

  it('rejects a signature that does not match the body', async () => {
    const { rows: customer } = await pool.query(`INSERT INTO customers (name, phone) VALUES ('P', 'p2') RETURNING id`);
    const req = webhook({ eventId: 'evt-2', customerId: customer[0].id, type: 'TOPUP', amountPaise: 1000 });
    req.signatureHeader = 'sha256=deadbeef';

    await expect(processPaymentWebhook(req)).rejects.toMatchObject({ status: 401, code: 'INVALID_SIGNATURE' });
  });

  it('rejects a timestamp far outside the accepted window', async () => {
    const { rows: customer } = await pool.query(`INSERT INTO customers (name, phone) VALUES ('P', 'p3') RETURNING id`);
    const req = webhook(
      { eventId: 'evt-3', customerId: customer[0].id, type: 'TOPUP', amountPaise: 1000 },
      { skewSeconds: 3600 },
    );

    await expect(processPaymentWebhook(req)).rejects.toMatchObject({ status: 400, code: 'TIMESTAMP_OUT_OF_RANGE' });
  });

  it('applies the same event exactly once no matter how many times it is delivered', async () => {
    const { rows: customer } = await pool.query(`INSERT INTO customers (name, phone) VALUES ('P', 'p4') RETURNING id`);
    const customerId = customer[0].id;
    const req = webhook({ eventId: 'evt-dup', customerId, type: 'TOPUP', amountPaise: 20000 });

    const first = await processPaymentWebhook(req);
    const second = await processPaymentWebhook(req);
    const third = await processPaymentWebhook(req);

    expect(first.duplicate).toBe(false);
    expect(second.duplicate).toBe(true);
    expect(third.duplicate).toBe(true);

    const { rows } = await pool.query('SELECT count(*) FROM payments WHERE provider_event_id = $1', ['evt-dup']);
    expect(Number(rows[0].count)).toBe(1);

    const balances = await balancesByCustomer();
    expect(Number(balances.find((b) => b.id === customerId).balance_paise)).toBe(20000);
  });

  it('reaches the same balance regardless of the order two independent events are applied in', async () => {
    const { rows: customer } = await pool.query(`INSERT INTO customers (name, phone) VALUES ('P', 'p5') RETURNING id`);
    const customerId = customer[0].id;

    await processPaymentWebhook(webhook({ eventId: 'evt-a', customerId, type: 'TOPUP', amountPaise: 30000 }));
    await processPaymentWebhook(webhook({ eventId: 'evt-b', customerId, type: 'REFUND', amountPaise: 5000 }));

    const balances = await balancesByCustomer();
    expect(Number(balances.find((b) => b.id === customerId).balance_paise)).toBe(35000);
  });
});

describe('reconciliation', () => {
  it('reports ok when every delivered order has exactly one charge', async () => {
    const { orderId } = await seedReadyOrder('2025-08-13');
    await deliver(orderId);

    const report = await reconcileDate('2025-08-13');
    expect(report.ok).toBe(true);
    expect(report.divergences).toHaveLength(0);
  });

  it('flags a delivered order with no charge', async () => {
    const { orderId } = await seedReadyOrder('2025-08-14');
    await pool.query("UPDATE orders SET status = 'DELIVERED' WHERE id = $1", [orderId]);

    const report = await reconcileDate('2025-08-14');
    expect(report.ok).toBe(false);
    expect(report.divergences).toContainEqual({ code: 'DELIVERED_ORDER_NO_CHARGE', orderId });
  });
});
