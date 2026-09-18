import { config } from '../config.js';
import { equalDigest, tokenDigest } from '../auth/crypto.js';
import { HttpError } from './httpError.js';
import { requireRider } from './riderAuth.js';

export function requireOps(req, res, next) {
  const key = req.get('X-Ops-Key');
  if (
    !config.auth.opsApiKey ||
    !key ||
    !equalDigest(tokenDigest(key), tokenDigest(config.auth.opsApiKey))
  ) {
    return next(
      new HttpError(401, 'OPS_AUTH_REQUIRED', 'Operations authentication is required'),
    );
  }
  req.isOps = true;
  res.set('Cache-Control', 'no-store');
  next();
}

export function requireRiderOrOps(req, res, next) {
  if (req.get('X-Ops-Key')) return requireOps(req, res, next);
  return requireRider(req, res, next);
}
