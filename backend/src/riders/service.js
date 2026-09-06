import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { allowedTransitions } from '../orders/stateMachine.js';

export async function listRiders() {
  const { rows } = await pool.query('SELECT id, name, phone, is_online FROM riders ORDER BY name');
  return rows;
}

export async function setShift(riderId, online) {
  const { rows } = await pool.query(
    'UPDATE riders SET is_online = $2 WHERE id = $1 RETURNING id, name, phone, is_online',
    [riderId, online],
  );
  return rows[0];
}

export async function getRiderState(riderId) {
  const { rows: riders } = await pool.query('SELECT id, name, phone, is_online FROM riders WHERE id = $1', [riderId]);
  const rider = riders[0];

  const { rows } = await pool.query(
    `SELECT o.*, d.id AS claim_id, d.expires_at AS claim_expires_at
       FROM orders o
       JOIN deliveries d ON d.order_id = o.id
      WHERE d.rider_id = $1 AND d.released_at IS NULL`,
    [riderId],
  );

  const current = rows[0];
  return {
    rider,
    currentOrder: current ? { ...current, allowedTransitions: allowedTransitions(current.status) } : null,
  };
}

const MAX_PING_AGE_MINUTES = 10;

async function renewLease(riderId) {
  const expiresAt = new Date(Date.now() + config.riders.leaseMinutes * 60_000);
  const { rows } = await pool.query(
    `UPDATE deliveries SET expires_at = $2
      WHERE rider_id = $1 AND released_at IS NULL
      RETURNING id, expires_at`,
    [riderId, expiresAt],
  );
  return rows[0]?.expires_at ?? null;
}

export async function recordLocations(riderId, pings) {
  const cutoff = Date.now() - MAX_PING_AGE_MINUTES * 60_000;
  const fresh = pings.filter((p) => new Date(p.recordedAt).getTime() >= cutoff);

  for (const ping of fresh) {
    await pool.query(
      `INSERT INTO rider_locations (rider_id, order_id, lat, lng, recorded_at)
       VALUES ($1, $2, $3, $4, $5)`,
      [riderId, ping.orderId ?? null, ping.lat, ping.lng, ping.recordedAt],
    );
  }

  const leaseRenewedUntil = await renewLease(riderId);

  return {
    accepted: fresh.length,
    dropped: pings.length - fresh.length,
    leaseRenewedUntil,
  };
}

export async function sendHeartbeat(riderId) {
  const leaseRenewedUntil = await renewLease(riderId);
  return { leaseRenewedUntil };
}
