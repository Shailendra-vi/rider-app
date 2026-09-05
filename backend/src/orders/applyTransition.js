import { pool } from '../db/pool.js';
import { HttpError } from '../lib/httpError.js';
import { allowedTransitions, isValidTransition } from './stateMachine.js';


export async function applyTransition(orderId, toStatus) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const { rows } = await client.query('SELECT status FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (rows.length === 0) {
      throw new HttpError(404, 'NOT_FOUND', `Order ${orderId} not found`);
    }

    const current = rows[0].status;
    if (!isValidTransition(current, toStatus)) {
      throw new HttpError(409, 'INVALID_TRANSITION', `Cannot move order from ${current} to ${toStatus}`, {
        current,
        allowed: allowedTransitions(current),
      });
    }

    const { rows: updated } = await client.query(
      'UPDATE orders SET status = $2, updated_at = now() WHERE id = $1 RETURNING *',
      [orderId, toStatus],
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
