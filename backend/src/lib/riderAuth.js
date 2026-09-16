import { pool } from '../db/pool.js';
import { HttpError } from './httpError.js';

import { tokenDigest } from '../auth/crypto.js';

export async function requireRider(req, res, next) {
  try {
    const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.get('Authorization') || '');
    if (!match) throw new HttpError(401, 'AUTH_REQUIRED', 'A rider session is required');
    const { rows } = await pool.query(`SELECT r.id, r.name, r.is_online, r.status,
      r.identity_verification_status, s.id AS session_id
      FROM rider_sessions s JOIN riders r ON r.id = s.rider_id
      WHERE s.token_digest = $1 AND s.revoked_at IS NULL AND s.expires_at > now()
        AND r.status IN ('pending', 'active')
        AND (r.email_verified_at IS NOT NULL OR r.phone_verified_at IS NOT NULL)`, [tokenDigest(match[1])]);
    if (!rows[0]) throw new HttpError(401, 'SESSION_INVALID', 'Please sign in again');

    req.rider = rows[0];
    req.riderId = rows[0].id;
    req.sessionId = rows[0].session_id;
    res.set('Cache-Control', 'no-store');
    next();
  } catch (err) {
    next(err);
  }
}

export function requireActiveRider(req, res, next) {
  if (req.rider.status !== 'active' || req.rider.identity_verification_status !== 'verified') {
    return next(new HttpError(403, 'RIDER_NOT_ACTIVATED', 'Identity verification and account activation are required for deliveries'));
  }
  next();
}
