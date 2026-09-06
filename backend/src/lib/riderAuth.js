import { pool } from '../db/pool.js';
import { HttpError } from './httpError.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function requireRider(req, res, next) {
  try {
    const riderId = req.get('X-Rider-Id');
    if (!riderId) {
      throw new HttpError(401, 'RIDER_ID_REQUIRED', 'X-Rider-Id header is required');
    }
    if (!UUID_RE.test(riderId)) {
      throw new HttpError(404, 'NOT_FOUND', `Rider ${riderId} not found`);
    }

    const { rows } = await pool.query('SELECT id, name, is_online FROM riders WHERE id = $1', [riderId]);
    if (rows.length === 0) {
      throw new HttpError(404, 'NOT_FOUND', `Rider ${riderId} not found`);
    }

    req.rider = rows[0];
    req.riderId = rows[0].id;
    next();
  } catch (err) {
    next(err);
  }
}

export async function optionalRider(req, res, next) {
  const riderId = req.get('X-Rider-Id');
  if (!riderId) return next();
  return requireRider(req, res, next);
}
