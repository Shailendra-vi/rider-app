import { pool } from '../db/pool.js';

const CREDIT_TYPES = new Set(['TOPUP', 'REFUND']);

export async function chargeForDelivery(client, order) {
  await client.query(
    `INSERT INTO payments (customer_id, order_id, amount_paise, type, status)
     VALUES ($1, $2, $3, 'CHARGE', 'COMPLETED')
     ON CONFLICT (order_id) WHERE type = 'CHARGE' DO NOTHING`,
    [order.customer_id, order.id, order.price_paise],
  );
}

export async function balancesByCustomer() {
  const { rows } = await pool.query(`
    SELECT c.id, c.name, COALESCE(SUM(CASE WHEN p.type IN ('TOPUP','REFUND') THEN p.amount_paise WHEN p.type = 'CHARGE' THEN -p.amount_paise
      ELSE 0 END), 0) AS balance_paise
      FROM customers c
      LEFT JOIN payments p ON p.customer_id = c.id AND p.status = 'COMPLETED'
     GROUP BY c.id, c.name
     ORDER BY c.name
  `);
  return rows;
}

export async function listLedger({ customerId } = {}) {
  const { rows } = await pool.query(
    `SELECT p.*, c.name AS customer_name
       FROM payments p
       JOIN customers c ON c.id = p.customer_id
      WHERE ($1::uuid IS NULL OR p.customer_id = $1::uuid)
      ORDER BY p.occurred_at DESC
      LIMIT 100`,
    [customerId ?? null],
  );
  return rows;
}

export function isCredit(type) {
  return CREDIT_TYPES.has(type);
}
