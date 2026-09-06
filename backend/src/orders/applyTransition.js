import { pool } from '../db/pool.js';
import { HttpError } from '../lib/httpError.js';
import { allowedTransitions, isValidTransition } from './stateMachine.js';
import { chargeForDelivery } from '../payments/ledger.js';

const TERMINAL = new Set(['DELIVERED', 'CANCELLED', 'FAILED']);

export async function applyTransition(orderId, toStatus, actor = {}) {
  const { riderId, claimId } = actor;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { rows } = await client.query('SELECT status, rider_id FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
    if (rows.length === 0) {
      throw new HttpError(404, 'NOT_FOUND', `Order ${orderId} not found`);
    }
    const current = rows[0].status;

    if (current === toStatus && (!riderId || rows[0].rider_id === riderId)) {
      const { rows: order } = await client.query('SELECT * FROM orders WHERE id = $1', [orderId]);
      await client.query('COMMIT');
      return { ...order[0], allowedTransitions: allowedTransitions(current), alreadyApplied: true };
    }

    const { rows: claims } = await client.query('SELECT id, rider_id FROM deliveries WHERE order_id = $1 AND released_at IS NULL', [orderId]);
    const activeClaim = claims[0];

    if (riderId) {
      if (!activeClaim || activeClaim.rider_id !== riderId) {
        throw new HttpError(409, 'STALE_CLAIM', 'This order is no longer assigned to you', {
          current,
          reason: activeClaim ? 'REASSIGNED' : 'NO_ACTIVE_CLAIM',
        });
      }
      if (claimId && claimId !== activeClaim.id) {
        throw new HttpError(409, 'STALE_CLAIM', 'Your claim on this order has expired', {
          current,
          reason: 'CLAIM_SUPERSEDED',
        });
      }
    }

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

    if (toStatus === 'DELIVERED') {
      await chargeForDelivery(client, updated[0]);
    }

    if (activeClaim) {
      if (toStatus === 'OUT_FOR_DELIVERY') {
        await client.query('UPDATE deliveries SET picked_up_at = now() WHERE id = $1', [activeClaim.id]);
      }
      if (TERMINAL.has(toStatus)) {
        await client.query(
          `UPDATE deliveries
              SET released_at = now(),
                  release_reason = $2,
                  delivered_at = CASE WHEN $2 = 'COMPLETED' THEN now() ELSE delivered_at END
            WHERE id = $1`,
          [activeClaim.id, toStatus === 'DELIVERED' ? 'COMPLETED' : 'ORDER_CLOSED'],
        );
      }
    }

    await client.query('COMMIT');
    return { ...updated[0], allowedTransitions: allowedTransitions(toStatus) };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
