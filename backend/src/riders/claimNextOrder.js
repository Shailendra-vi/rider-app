import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { HttpError } from '../lib/httpError.js';

const ACTIVE_CLAIM_SELECT = `
  SELECT o.* FROM orders o
  JOIN deliveries d ON d.order_id = o.id
  WHERE d.rider_id = $1 AND d.released_at IS NULL
`;

/**
 * Atomically assigns one unassigned, ready (PREPARING) order to `riderId`.
 *
 * Race-freedom comes from `FOR UPDATE SKIP LOCKED`: concurrent callers competing for the
 * same row never block on it or double-grab it — one wins the lock, the rest skip past
 * to the next candidate (or find nothing). The `deliveries` partial unique indexes back
 * this up structurally, so the guarantee holds even if this code ever has a bug.
 *
 * Ghost riders: any lease past its `expires_at` is released here, before a new claim is
 * even considered — no background sweeper is required for correctness.
 */
export async function claimNextOrder(riderId) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const riderExists = await client.query('SELECT 1 FROM riders WHERE id = $1', [riderId]);
    if (riderExists.rows.length === 0) {
      throw new HttpError(404, 'NOT_FOUND', `Rider ${riderId} not found`);
    }

    await client.query(`
      WITH expired AS (
        UPDATE deliveries SET released_at = now(), release_reason = 'EXPIRED'
         WHERE released_at IS NULL AND expires_at <= now()
        RETURNING order_id
      )
      UPDATE orders SET rider_id = NULL WHERE id IN (SELECT order_id FROM expired)
    `);

    const { rows: existing } = await client.query(ACTIVE_CLAIM_SELECT, [riderId]);
    if (existing.length > 0) {
      await client.query('COMMIT');
      return existing[0];
    }

    const { rows: candidate } = await client.query(`
      SELECT id FROM orders
       WHERE status = 'PREPARING' AND rider_id IS NULL
       ORDER BY created_at
       FOR UPDATE SKIP LOCKED
       LIMIT 1
    `);
    if (candidate.length === 0) {
      await client.query('COMMIT');
      return null;
    }

    const orderId = candidate[0].id;
    const expiresAt = new Date(Date.now() + config.riders.leaseMinutes * 60_000);
    await client.query('INSERT INTO deliveries (order_id, rider_id, expires_at) VALUES ($1, $2, $3)', [
      orderId,
      riderId,
      expiresAt,
    ]);
    const { rows: order } = await client.query(
      'UPDATE orders SET rider_id = $1, updated_at = now() WHERE id = $2 RETURNING *',
      [riderId, orderId],
    );

    await client.query('COMMIT');
    return order[0];
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});

    // Two near-simultaneous claims from the SAME rider can both pass the "no active
    // claim yet" check before either commits. The loser hits deliveries_one_active_per_rider
    // instead of erroring out — hand back the order the other call already got.
    if (err.code === '23505') {
      const { rows } = await pool.query(ACTIVE_CLAIM_SELECT, [riderId]);
      return rows[0] ?? null;
    }
    throw err;
  } finally {
    client.release();
  }
}
