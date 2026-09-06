import { pool } from '../db/pool.js';

async function deliveredWithoutCharge(serviceDate) {
  const { rows } = await pool.query(
    `SELECT o.id AS order_id
       FROM orders o
      WHERE o.service_date = $1 AND o.status = 'DELIVERED'
        AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.order_id = o.id AND p.type = 'CHARGE')`,
    [serviceDate],
  );
  return rows.map((r) => ({ code: 'DELIVERED_ORDER_NO_CHARGE', orderId: r.order_id }));
}

async function duplicateCharges(serviceDate) {
  const { rows } = await pool.query(
    `SELECT p.order_id, count(*) AS n
       FROM payments p
       JOIN orders o ON o.id = p.order_id
      WHERE o.service_date = $1 AND p.type = 'CHARGE'
      GROUP BY p.order_id
     HAVING count(*) > 1`,
    [serviceDate],
  );
  return rows.map((r) => ({ code: 'DUPLICATE_CHARGE', orderId: r.order_id, count: Number(r.n) }));
}

async function chargesWithoutDeliveredOrder(serviceDate) {
  const { rows } = await pool.query(
    `SELECT p.id AS payment_id, p.order_id
       FROM payments p
       LEFT JOIN orders o ON o.id = p.order_id
      WHERE p.type = 'CHARGE' AND (o.id IS NULL OR o.status <> 'DELIVERED')
        AND (o.service_date = $1 OR o.id IS NULL)`,
    [serviceDate],
  );
  return rows.map((r) => ({ code: 'CHARGE_NO_DELIVERED_ORDER', paymentId: r.payment_id, orderId: r.order_id }));
}

async function multipleActiveClaims(serviceDate) {
  const { rows } = await pool.query(
    `SELECT d.order_id, count(*) AS n
       FROM deliveries d
       JOIN orders o ON o.id = d.order_id
      WHERE o.service_date = $1 AND d.released_at IS NULL
      GROUP BY d.order_id
     HAVING count(*) > 1`,
    [serviceDate],
  );
  return rows.map((r) => ({ code: 'MULTIPLE_ACTIVE_CLAIMS', orderId: r.order_id, count: Number(r.n) }));
}

async function orphanActiveClaims(serviceDate) {
  const { rows } = await pool.query(
    `SELECT d.id AS claim_id, d.order_id
       FROM deliveries d
       JOIN orders o ON o.id = d.order_id
      WHERE o.service_date = $1 AND d.released_at IS NULL
        AND o.status IN ('DELIVERED', 'CANCELLED', 'FAILED')`,
    [serviceDate],
  );
  return rows.map((r) => ({ code: 'ORPHAN_ACTIVE_CLAIM', claimId: r.claim_id, orderId: r.order_id }));
}

export async function reconcileDate(serviceDate) {
  const divergences = (
    await Promise.all([
      deliveredWithoutCharge(serviceDate),
      duplicateCharges(serviceDate),
      chargesWithoutDeliveredOrder(serviceDate),
      multipleActiveClaims(serviceDate),
      orphanActiveClaims(serviceDate),
    ])
  ).flat();

  const counts = divergences.reduce((acc, d) => ({ ...acc, [d.code]: (acc[d.code] ?? 0) + 1 }), {});

  return { date: serviceDate, ok: divergences.length === 0, divergences, counts };
}
