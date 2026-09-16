import { randomBytes, randomInt, randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';
import { HttpError } from '../lib/httpError.js';
import { codeDigest, equalDigest, hashPassword, keyedDigest, tokenDigest, verifyPassword } from './crypto.js';
import { deliverOtp } from './delivery.js';

export const PUBLIC_RIDER_FIELDS = `id, name, email, phone, email_verified_at, phone_verified_at,
  identity_verification_status, identity_verification_type, identity_verified_at,
  status, is_online, last_seen_at, created_at, updated_at`;
const invalidCode = () => new HttpError(400, 'INVALID_OTP', 'Code is invalid, expired, or already used');
const invalidLogin = () => new HttpError(401, 'INVALID_CREDENTIALS', 'Unable to sign in with these credentials');

async function transaction(fn) {
  const client = await pool.connect();
  let result;
  try {
    await client.query('BEGIN');
    result = await fn(client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally { 
    client.release(); 
  }

  if (result instanceof HttpError) throw result;
  return result;
}

async function limit(key, maximum, seconds) {
  const { rows } = await pool.query(`
    INSERT INTO rider_auth_limits (key, attempts, expires_at)
    VALUES ($1, 1, now() + $2 * interval '1 second')
    ON CONFLICT (key) DO UPDATE SET
      attempts = CASE WHEN rider_auth_limits.expires_at <= now() THEN 1 ELSE rider_auth_limits.attempts + 1 END,
      expires_at = CASE WHEN rider_auth_limits.expires_at <= now() THEN EXCLUDED.expires_at ELSE rider_auth_limits.expires_at END
    RETURNING attempts, expires_at`, [keyedDigest(key), seconds]);
  if (rows[0].attempts > maximum) throw new HttpError(429, 'RATE_LIMITED', 'Too many attempts. Please try again later', {
    retryAfterSeconds: Math.max(1, Math.ceil((new Date(rows[0].expires_at) - Date.now()) / 1000)),
  });
}

export async function limitAuthIp(ip) { await limit(`request-ip:${ip}`, 120, 3600); }

async function sendLimits(channel, contact, ip) {
  await limit('send-global', 1000, 3600);
  await limit(`send-ip:${ip}`, 30, 3600);
  await limit(`send-contact:${channel}:${contact}`, 5, 3600);
  await limit(`send-cooldown:${channel}:${contact}`, 1, 60);
}

async function findRider(client, channel, contact, lock = false) {
  const column = channel === 'email' ? 'email' : 'phone';
  const { rows } = await client.query(`SELECT * FROM riders WHERE ${column} = $1${lock ? ' FOR UPDATE' : ''}`, [contact]);
  return rows[0];
}

function eligible(rider, channel) {
  return rider && ['pending', 'active'].includes(rider.status)
    && rider[channel === 'email' ? 'email_verified_at' : 'phone_verified_at'];
}

export async function issueSession(client, riderId) {
  const token = randomBytes(32).toString('base64url');
  const { rows } = await client.query(`INSERT INTO rider_sessions (rider_id, token_digest, expires_at)
    VALUES ($1, $2, now() + interval '7 days') RETURNING expires_at`, [riderId, tokenDigest(token)]);
  const { rows: riders } = await client.query(`SELECT ${PUBLIC_RIDER_FIELDS} FROM riders WHERE id = $1`, [riderId]);
  return { token, tokenType: 'Bearer', expiresAt: rows[0].expires_at, role: 'rider', rider: riders[0] };
}

export function createAuthService({ sendOtp = deliverOtp } = {}) {
  async function createChallenge(data, purpose, ip, previousId = null) {
    const { channel, contact } = data;
    await sendLimits(channel, contact, ip);
    const passwordHash = data.password ? await hashPassword(data.password) : data.password_hash ?? null;
    const id = randomUUID();
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const result = await transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${channel}:${contact}:${purpose}`]);
      if (previousId) {
        const { rows } = await client.query('SELECT consumed_at FROM rider_auth_challenges WHERE id = $1 FOR UPDATE', [previousId]);
        if (!rows[0] || rows[0].consumed_at) return invalidCode();
      }
      const rider = await findRider(client, channel, contact);
      const canSend = purpose === 'signup' ? !rider : eligible(rider, channel);
      await client.query(`UPDATE rider_auth_challenges SET consumed_at = now(), password_hash = NULL
        WHERE channel = $1 AND contact = $2 AND purpose = $3 AND consumed_at IS NULL`, [channel, contact, purpose]);
      const { rows } = await client.query(`INSERT INTO rider_auth_challenges
        (id, purpose, channel, contact, rider_id, name, password_hash, code_digest, credential_version, expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now() + interval '5 minutes') RETURNING expires_at`,
      [id, purpose, channel, contact, purpose !== 'signup' && canSend ? rider.id : null,
        data.name ?? null, canSend ? passwordHash : null, codeDigest(id, code), rider?.credential_version ?? 0]);
      return { canSend: Boolean(canSend), expiresAt: rows[0].expires_at };
    });
    if (result.canSend) {
      try {
        await sendOtp({ challengeId: id, channel, contact, code, purpose });
        await pool.query('UPDATE rider_auth_challenges SET delivered = true WHERE id = $1', [id]);
      } catch {
        await pool.query(`UPDATE rider_auth_challenges SET consumed_at = now(), password_hash = NULL WHERE id = $1`, [id]);
        console.error('OTP delivery failed', { challengeId: id, channel });
      }
    }
    return { challengeId: id, expiresAt: result.expiresAt, resendAfterSeconds: 60,
      message: 'If this request is eligible, a verification code will be sent' };
  }

  async function verify({ challengeId, code, password }, purpose, ip) {
    await limit(`verify-ip:${ip}`, 60, 3600);
    const { rows: peek } = await pool.query('SELECT channel, contact FROM rider_auth_challenges WHERE id = $1', [challengeId]);
    if (peek[0]) await limit(`verify-contact:${peek[0].channel}:${peek[0].contact}`, 20, 3600);
    const newPasswordHash = purpose === 'reset' ? await hashPassword(password) : null;
    return transaction(async (client) => {
      const { rows } = await client.query('SELECT * FROM rider_auth_challenges WHERE id = $1 FOR UPDATE', [challengeId]);
      const challenge = rows[0];
      if (!challenge || challenge.purpose !== purpose || challenge.consumed_at || !challenge.delivered
        || new Date(challenge.expires_at) <= new Date() || challenge.attempts >= 5) return invalidCode();
      await client.query('UPDATE rider_auth_challenges SET attempts = attempts + 1 WHERE id = $1', [challengeId]);
      if (!equalDigest(challenge.code_digest, codeDigest(challengeId, code))) return invalidCode();
      let rider;
      if (purpose === 'signup') {
        const { rows: created } = await client.query(`INSERT INTO riders
          (name, email, phone, password_hash, email_verified_at, phone_verified_at)
          VALUES ($1,$2,$3,$4,CASE WHEN $2::text IS NOT NULL THEN now() END,CASE WHEN $3::text IS NOT NULL THEN now() END)
          ON CONFLICT DO NOTHING RETURNING *`, [challenge.name,
          challenge.channel === 'email' ? challenge.contact : null,
          challenge.channel === 'phone' ? challenge.contact : null, challenge.password_hash]);
        rider = created[0];
      } else {
        rider = await findRider(client, challenge.channel, challenge.contact, true);
        if (!eligible(rider, challenge.channel) || rider.id !== challenge.rider_id
          || rider.credential_version !== challenge.credential_version) rider = null;
      }
      await client.query(`UPDATE rider_auth_challenges SET consumed_at = now(), password_hash = NULL WHERE id = $1`, [challengeId]);
      if (!rider) return invalidCode();
      if (purpose === 'reset') {
        await client.query('UPDATE riders SET password_hash = $2, credential_version = credential_version + 1, updated_at = now() WHERE id = $1', [rider.id, newPasswordHash]);
        await client.query('UPDATE rider_sessions SET revoked_at = now() WHERE rider_id = $1 AND revoked_at IS NULL', [rider.id]);
        return { message: 'Password updated. Please sign in again' };
      }
      return issueSession(client, rider.id);
    });
  }

  return {
    start: createChallenge, verify,
    async resend(challengeId, ip) {
      const { rows } = await pool.query(`SELECT * FROM rider_auth_challenges WHERE id = $1
        AND consumed_at IS NULL AND created_at > now() - interval '1 day'`, [challengeId]);
      if (!rows[0]) throw invalidCode();
      return createChallenge(rows[0], rows[0].purpose, ip, challengeId);
    },
    async passwordLogin({ email, password }, ip) {
      await limit(`password-ip:${ip}`, 30, 3600);
      await limit(`password-contact:${email}`, 10, 900);
      return transaction(async (client) => {
        const rider = await findRider(client, 'email', email, true);
        const matches = await verifyPassword(password, rider?.password_hash);
        if (!matches || !eligible(rider, 'email')) return invalidLogin();
        return issueSession(client, rider.id);
      });
    },
  };
}
