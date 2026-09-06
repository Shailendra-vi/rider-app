import crypto from 'node:crypto';
import { pool } from '../db/pool.js';
import { HttpError } from '../lib/httpError.js';
import { allowedTransitions } from '../orders/stateMachine.js';
import { balancesByCustomer, listLedger } from '../payments/ledger.js';
import { processPaymentWebhook, signPayload } from '../payments/webhook.js';
import { reconcileDate } from '../payments/reconciliation.js';

export async function listPlans() {
  const { rows } = await pool.query('SELECT * FROM plans ORDER BY name');
  return rows;
}

export async function createPlan({ code, name, mealSlot = 'LUNCH', pricePaise }) {
  const { rows } = await pool.query(`INSERT INTO plans (code, name, meal_slot, price_paise) VALUES ($1,$2,$3,$4) RETURNING *`, [code, name, mealSlot, pricePaise]);
  return rows[0];
}

export async function listCustomers() {
  const { rows } = await pool.query('SELECT * FROM customers ORDER BY name');
  return rows;
}

export async function createCustomer({ name, phone }) {
  const { rows } = await pool.query('INSERT INTO customers (name, phone) VALUES ($1,$2) RETURNING *', [name, phone]);
  return rows[0];
}

export async function createRider({ name, phone }) {
  const { rows } = await pool.query('INSERT INTO riders (name, phone) VALUES ($1,$2) RETURNING *', [name, phone]);
  return rows[0];
}

export async function listSubscriptions() {
  const { rows } = await pool.query(
    `SELECT s.*, c.name AS customer_name, p.code AS plan_code, p.price_paise
       FROM subscriptions s
       JOIN customers c ON c.id = s.customer_id
       JOIN plans p ON p.id = s.plan_id
      ORDER BY c.name`,
  );
  return rows;
}

export async function createSubscription({ customerId, planId, startDate, weekdayMask, address }) {
  const addressHistory = [{ address, effective_from: startDate, recorded_at: new Date().toISOString() }];
  const { rows } = await pool.query(
    `INSERT INTO subscriptions (customer_id, plan_id, start_date, weekday_mask, address_history)
     VALUES ($1,$2,$3,$4,$5::jsonb) RETURNING *`,
    [customerId, planId, startDate, weekdayMask, JSON.stringify(addressHistory)],
  );
  return rows[0];
}



const EVENT_COLUMNS = { pause: 'pauses', skip: 'skips', address: 'address_history' };
const EVENT_MATCH_KEYS = {
  pause: ['from_date', 'to_date'],
  skip: ['service_date'],
  address: ['address', 'effective_from'],
};

export async function addSubscriptionEvent(subscriptionId, kind, payload) {
  const column = EVENT_COLUMNS[kind];
  if (!column) throw new HttpError(400, 'VALIDATION_FAILED', `Unknown event kind: ${kind}`);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(`SELECT ${column} FROM subscriptions WHERE id = $1 FOR UPDATE`, [subscriptionId]);
    if (rows.length === 0) {
      throw new HttpError(404, 'NOT_FOUND', `Subscription ${subscriptionId} not found`);
    }

    const existing = rows[0][column] ?? [];
    const matchKeys = EVENT_MATCH_KEYS[kind];
    const isDuplicate = existing.some((entry) => matchKeys.every((key) => entry[key] === payload[key]));
    if (isDuplicate) {
      throw new HttpError(409, 'DUPLICATE_EVENT', `An identical ${kind} entry already exists`, { kind, payload });
    }


    const entry = { id: crypto.randomUUID(), ...payload, recorded_at: new Date().toISOString() };
    const { rows: updated } = await client.query(`UPDATE subscriptions SET ${column} = ${column} || $2::jsonb WHERE id = $1 RETURNING *`, [subscriptionId, JSON.stringify(entry)]);


    await client.query('COMMIT');
    return updated[0]; //
  } catch (err) {
    console.log(err);
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}


const CANCELLABLE_KINDS = new Set(['pause', 'skip']);

export async function cancelSubscriptionEvent(subscriptionId, kind, entryId) {
  const column = EVENT_COLUMNS[kind];
  if (!column || !CANCELLABLE_KINDS.has(kind)) {
    throw new HttpError(400, 'VALIDATION_FAILED', `Cannot cancel a "${kind}" entry`);
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query(`SELECT ${column} FROM subscriptions WHERE id = $1 FOR UPDATE`, [subscriptionId]);
    if (rows.length === 0) {
      throw new HttpError(404, 'NOT_FOUND', `Subscription ${subscriptionId} not found`);
    }


    const existing = rows[0][column] ?? [];
    const target = existing.find((e) => e.id === entryId && !e.cancels);
    if (!target) {
      throw new HttpError(404, 'NOT_FOUND', `No cancellable ${kind} entry ${entryId}`);
    }


    const alreadyCancelled = existing.some((e) => e.cancels === entryId);
    if (alreadyCancelled) {
      throw new HttpError(409, 'DUPLICATE_EVENT', `Entry ${entryId} is already cancelled`);
    }

    const cancellation = { 
      id: crypto.randomUUID(), 
      cancels: entryId, 
      recorded_at: new Date().toISOString()
    };
    const { rows: updated } = await client.query(
      `UPDATE subscriptions SET ${column} = ${column} || $2::jsonb WHERE id = $1 RETURNING *`,
      [subscriptionId, JSON.stringify(cancellation)],
    );


    await client.query('COMMIT');
    return updated[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}


export async function listOrders({ serviceDate, status } = {}) {
  const { rows } = await pool.query(
    `SELECT o.*, c.name AS customer_name, r.name AS rider_name,
            d.id AS claim_id, d.expires_at AS claim_expires_at
       FROM orders o
       JOIN customers c ON c.id = o.customer_id
       LEFT JOIN riders r ON r.id = o.rider_id
       LEFT JOIN deliveries d ON d.order_id = o.id AND d.released_at IS NULL
      WHERE ($1::date IS NULL OR o.service_date = $1::date)
        AND ($2::text IS NULL OR o.status = $2::text)
      ORDER BY o.created_at`,
    [serviceDate ?? null, status ?? null],
  );
  return rows.map((o) => ({ ...o, allowedTransitions: allowedTransitions(o.status) }));
}

export async function getPaymentsOverview() {
  const [balances, ledger] = await Promise.all([balancesByCustomer(), listLedger()]);
  return { balances, ledger };
}

export async function simulatePaymentWebhook({ customerId, type, amountPaise }) {
  if (!customerId || !['TOPUP', 'REFUND'].includes(type) || !(Number(amountPaise) > 0)) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'customerId, type (TOPUP|REFUND) and amountPaise are required');
  }

  const body = { eventId: crypto.randomUUID(), customerId, type, amountPaise: Number(amountPaise) };
  const rawBody = Buffer.from(JSON.stringify(body));
  const timestamp = Math.floor(Date.now() / 1000);
  const signatureHeader = signPayload(rawBody, timestamp);

  return processPaymentWebhook({ body, rawBody, signatureHeader, timestampHeader: String(timestamp) });
}

export async function getReconciliation(serviceDate) {
  return reconcileDate(serviceDate);
}

export async function listRidersDetailed() {
  const { rows } = await pool.query(
    `SELECT r.*, o.id AS current_order_id, o.status AS current_order_status,
            l.lat AS last_lat, l.lng AS last_lng, l.recorded_at AS last_seen_at
       FROM riders r
       LEFT JOIN deliveries d ON d.rider_id = r.id AND d.released_at IS NULL
       LEFT JOIN orders o ON o.id = d.order_id
       LEFT JOIN LATERAL (
         SELECT lat, lng, recorded_at FROM rider_locations
          WHERE rider_id = r.id ORDER BY recorded_at DESC LIMIT 1
       ) l ON true
      ORDER BY r.name`,
  );
  return rows;
}
