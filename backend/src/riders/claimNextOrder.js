import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { HttpError } from '../lib/httpError.js';

const ACTIVE_CLAIM_SELECT = `
  SELECT o.*, d.id AS claim_id, d.expires_at AS claim_expires_at
  FROM orders o
  JOIN deliveries d ON d.order_id = o.id
  WHERE d.rider_id = $1 AND d.released_at IS NULL
`;

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
    const { rows: claim } = await client.query(
      'INSERT INTO deliveries (order_id, rider_id, expires_at) VALUES ($1, $2, $3) RETURNING id, expires_at',
      [orderId, riderId, expiresAt],
    );
    const { rows: order } = await client.query(
      'UPDATE orders SET rider_id = $1, updated_at = now() WHERE id = $2 RETURNING *',
      [riderId, orderId],
    );

    await client.query('COMMIT');
    return { ...order[0], claim_id: claim[0].id, claim_expires_at: claim[0].expires_at };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});

    if (err.code === '23505') {
      const { rows } = await pool.query(ACTIVE_CLAIM_SELECT, [riderId]);
      return rows[0] ?? null;
    }
    throw err;
  } finally {
    client.release();
  }
}
