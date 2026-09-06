import { pool } from '../db/pool.js';
import { HttpError } from '../lib/httpError.js';
import { allowedTransitions } from './stateMachine.js';

export async function getOrder(orderId) {
  const { rows } = await pool.query(
    `SELECT o.*, d.id AS claim_id, d.rider_id AS claim_rider_id, d.expires_at AS claim_expires_at
       FROM orders o
       LEFT JOIN deliveries d ON d.order_id = o.id AND d.released_at IS NULL
      WHERE o.id = $1`,
    [orderId],
  );
  if (rows.length === 0) {
    throw new HttpError(404, 'NOT_FOUND', `Order ${orderId} not found`);
  }
  return { ...rows[0], allowedTransitions: allowedTransitions(rows[0].status) };
}
