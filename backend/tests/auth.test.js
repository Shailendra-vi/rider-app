import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { config } from '../src/config.js';
import { keyedDigest, tokenDigest } from '../src/auth/crypto.js';
import { cleanupAuth } from '../src/auth/cleanup.js';

const sent = new Map();
let failDelivery = false;
let server;
let base;
const password = 'a sufficiently long password';
const email = 'rider@example.com';
const phone = '+919876543210';
const opsKey = 'test-operations-key-not-a-real-secret';

beforeAll(async () => {
  config.auth.opsApiKey = opsKey;
  server = createApp({ sendOtp: async (message) => {
    if (failDelivery) throw new Error('Simulated provider failure');
    sent.set(message.challengeId, message);
  } }).listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
beforeEach(() => { sent.clear(); failDelivery = false; });
afterAll(async () => { await new Promise((resolve) => server.close(resolve)); });

async function request(path, body, token, extraHeaders = {}) {
  const response = await fetch(`${base}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...extraHeaders },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json(), headers: response.headers };
}
async function clearCooldown(channel, contact) {
  await pool.query('DELETE FROM rider_auth_limits WHERE key = $1', [keyedDigest(`send-cooldown:${channel}:${contact}`)]);
}
async function start(channel = 'email', contact = email) {
  return request('/auth/signup/start', { channel, contact, name: 'Test Rider', ...(channel === 'email' && { password }) });
}
async function verify(started, path = '/auth/signup/verify', extra = {}) {
  const challengeId = started.body.challengeId;
  return request(path, { challengeId, code: sent.get(challengeId).code, ...extra });
}
async function signup(channel = 'email', contact = email) { return (await verify(await start(channel, contact))).body; }

describe('rider signup and sessions over HTTP', () => {
  it('creates an email account only after verification and stores no plaintext credentials', async () => {
    const started = await start('email', '  RIDER@EXAMPLE.COM ');
    expect(started.status).toBe(202);
    expect(started.body).not.toHaveProperty('code');
    expect((await pool.query('SELECT * FROM riders')).rows).toHaveLength(0);
    const result = await verify(started);
    expect(result.status).toBe(201);
    expect(result.body).toMatchObject({ role: 'rider', tokenType: 'Bearer', rider: {
      email, phone: null, status: 'pending', identity_verification_status: 'not_started', phone_verified_at: null,
    } });
    expect(result.body.rider.email_verified_at).toBeTruthy();
    expect(result.body.rider).not.toHaveProperty('password_hash');
    const rider = (await pool.query('SELECT * FROM riders')).rows[0];
    expect(rider.password_hash).toMatch(/^scrypt\$/);
    expect(rider.password_hash).not.toContain(password);
    const session = (await pool.query('SELECT * FROM rider_sessions')).rows[0];
    expect(session.token_digest).toBe(tokenDigest(result.body.token));
    const me = await request('/rider/me', undefined, result.body.token);
    expect(me.status).toBe(200);
    expect(me.body.rider.id).toBe(rider.id);
    expect(me.body.rider).not.toHaveProperty('password_hash');
    expect(me.headers.get('cache-control')).toBe('no-store');
  });

  it('supports phone signup and subsequent SMS OTP login without a password', async () => {
    const account = await signup('phone', phone);
    expect(account.rider.phone_verified_at).toBeTruthy();
    expect(account.rider.email_verified_at).toBeNull();
    await clearCooldown('phone', phone);
    const challenge = await request('/auth/signin/otp/start', { channel: 'phone', contact: phone });
    const login = await verify(challenge, '/auth/signin/otp/verify');
    expect(login.status).toBe(200);
    expect(login.body.rider.id).toBe(account.rider.id);
  });

  it('supports email/password login and returns the same error for wrong and unknown credentials', async () => {
    const account = await signup();
    const login = await request('/auth/signin/password', { email: email.toUpperCase(), password });
    expect(login.status).toBe(200);
    expect(login.body.rider.id).toBe(account.rider.id);
    const wrong = await request('/auth/signin/password', { email, password: 'wrong' });
    const unknown = await request('/auth/signin/password', { email: 'unknown@example.com', password });
    expect(wrong.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
  });

  it('rejects rider-ID impersonation, expired sessions, and revoked sessions', async () => {
    const account = await signup('phone', phone);
    expect((await request('/rider/me', undefined, null, { 'X-Rider-Id': account.rider.id })).status).toBe(401);
    expect((await request('/rider/me', undefined, 'x'.repeat(43))).status).toBe(401);
    expect((await request('/auth/logout', {}, account.token)).status).toBe(204);
    expect((await request('/rider/me', undefined, account.token)).status).toBe(401);
    await pool.query("UPDATE rider_sessions SET revoked_at = NULL, expires_at = now() - interval '1 second'");
    expect((await request('/rider/me', undefined, account.token)).status).toBe(401);
  });

  it('requires separate operations credentials and gates unverified delivery work', async () => {
    const account = await signup('phone', phone);
    expect((await request('/rider/claim', {}, account.token)).status).toBe(403);
    expect((await request('/riders')).status).toBe(401);
    expect((await request('/customers', undefined, account.token)).status).toBe(401);
    const ops = await request('/ops/riders', undefined, null, { 'X-Ops-Key': opsKey });
    expect(ops.status).toBe(200);
    expect(JSON.stringify(ops.body)).not.toContain('password_hash');
    expect((await request(`/orders/${account.rider.id}/transitions`, { to: 'DELIVERED' })).status).toBe(401);
  });

  it('allows activated riders to claim work while rejecting access from another rider', async () => {
    const owner = await signup('phone', phone);
    const stranger = await signup('phone', '+919876543211');
    await pool.query("UPDATE riders SET status = 'active', identity_verification_status = 'verified', is_online = true");
    const { rows } = await pool.query(`WITH c AS (
      INSERT INTO customers (name, phone) VALUES ('Customer', '+919999999999') RETURNING id
    ), p AS (
      INSERT INTO plans (code, name, meal_slot, price_paise) VALUES ('AUTH_TEST', 'Plan', 'LUNCH', 10000) RETURNING id
    ), s AS (
      INSERT INTO subscriptions (customer_id, plan_id, start_date, weekday_mask)
      SELECT c.id, p.id, current_date, 127 FROM c, p RETURNING id, customer_id
    ) INSERT INTO orders (subscription_id, customer_id, service_date, status, price_paise, delivery_address)
      SELECT s.id, s.customer_id, current_date, 'PREPARING', 10000, 'Private address' FROM s RETURNING id`);
    const orderId = rows[0].id;
    const claimed = await request('/rider/claim', {}, owner.token);
    expect(claimed.status).toBe(200);
    expect(claimed.body.id).toBe(orderId);
    expect((await request(`/orders/${orderId}`, undefined, owner.token)).status).toBe(200);
    expect((await request(`/orders/${orderId}`, undefined, stranger.token, { 'X-Rider-Id': owner.rider.id })).status).toBe(404);
    expect((await request(`/orders/${orderId}/transitions`, { to: 'OUT_FOR_DELIVERY', claimId: claimed.body.claim_id }, stranger.token)).status).toBe(409);
    expect((await request(`/orders/${orderId}/transitions`, { to: 'OUT_FOR_DELIVERY', claimId: claimed.body.claim_id }, owner.token)).status).toBe(200);
  });

  it('rejects suspended accounts for both existing sessions and OTP login', async () => {
    const account = await signup('phone', phone);
    await pool.query("UPDATE riders SET status = 'suspended' WHERE id = $1", [account.rider.id]);
    expect((await request('/rider/me', undefined, account.token)).status).toBe(401);
    await clearCooldown('phone', phone);
    const login = await request('/auth/signin/otp/start', { channel: 'phone', contact: phone });
    expect(login.status).toBe(202);
    expect(sent.has(login.body.challengeId)).toBe(false);
  });
});

describe('OTP lifecycle and recovery', () => {
  it('keeps persisted send budgets across new challenges', async () => {
    for (let i = 0; i < 5; i++) {
      await clearCooldown('phone', phone);
      expect((await start('phone', phone)).status).toBe(202);
    }
    await clearCooldown('phone', phone);
    expect((await start('phone', phone)).status).toBe(429);
    expect(sent.size).toBe(5);
  });

  it('rate-limits password guessing even for unknown accounts', async () => {
    await pool.query(`INSERT INTO rider_auth_limits (key, attempts, expires_at)
      VALUES ($1, 10, now() + interval '15 minutes')`, [keyedDigest(`password-contact:${email}`)]);
    expect((await request('/auth/signin/password', { email, password })).status).toBe(429);
  });

  it('cleans expired authentication data without removing current sessions or challenges', async () => {
    const account = await signup('phone', phone);
    const expired = await start('phone', '+919876543211');
    const current = await start('phone', '+919876543212');
    await pool.query("UPDATE rider_auth_challenges SET created_at = now() - interval '2 days' WHERE id = $1", [expired.body.challengeId]);
    await cleanupAuth();
    expect((await pool.query('SELECT id FROM rider_auth_challenges WHERE id = $1', [expired.body.challengeId])).rows).toHaveLength(0);
    expect((await request('/rider/me', undefined, account.token)).status).toBe(200);
    expect((await verify(current)).status).toBe(201);
  });

  it('consumes codes exactly once under concurrent verification', async () => {
    const started = await start('phone', phone);
    const results = await Promise.all([verify(started), verify(started)]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    expect((await pool.query('SELECT * FROM riders')).rows).toHaveLength(1);
    expect((await pool.query('SELECT * FROM rider_sessions')).rows).toHaveLength(1);
  });

  it('rejects expired and cross-purpose codes', async () => {
    const started = await start('phone', phone);
    expect((await verify(started, '/auth/signin/otp/verify')).status).toBe(400);
    await pool.query("UPDATE rider_auth_challenges SET expires_at = now() - interval '1 second'");
    expect((await verify(started)).status).toBe(400);
  });

  it('persists wrong attempts and locks a code after five failures', async () => {
    const started = await start('phone', phone);
    const challengeId = started.body.challengeId;
    const wrong = sent.get(challengeId).code === '000000' ? '000001' : '000000';
    for (let i = 0; i < 5; i++) expect((await request('/auth/signup/verify', { challengeId, code: wrong })).status).toBe(400);
    expect((await verify(started)).status).toBe(400);
    expect((await pool.query('SELECT attempts FROM rider_auth_challenges WHERE id = $1', [challengeId])).rows[0].attempts).toBe(5);
  });

  it('enforces resend cooldown and invalidates the previous challenge', async () => {
    const started = await start('phone', phone);
    const tooSoon = await request('/auth/otp/resend', { challengeId: started.body.challengeId });
    expect(tooSoon.status).toBe(429);
    expect(Number(tooSoon.headers.get('retry-after'))).toBeGreaterThan(0);
    await clearCooldown('phone', phone);
    const resent = await request('/auth/otp/resend', { challengeId: started.body.challengeId });
    expect(resent.status).toBe(202);
    expect((await verify(started)).status).toBe(400);
    expect((await verify(resent)).status).toBe(201);
  });

  it('does not create duplicate accounts or let signup claim an existing demo rider', async () => {
    await signup('phone', phone);
    await clearCooldown('phone', phone);
    const duplicate = await start('phone', phone);
    expect(duplicate.status).toBe(202);
    expect(sent.has(duplicate.body.challengeId)).toBe(false);
    await pool.query("INSERT INTO riders (name, phone) VALUES ('Demo', '+919876543211')");
    const demo = await start('phone', '+919876543211');
    expect(sent.has(demo.body.challengeId)).toBe(false);
  });

  it('resets a password, revokes sessions, and invalidates outstanding login codes', async () => {
    const account = await signup();
    await clearCooldown('email', email);
    const loginCode = await request('/auth/signin/otp/start', { channel: 'email', contact: email });
    await clearCooldown('email', email);
    const reset = await request('/auth/password/reset/start', { channel: 'email', contact: email });
    const newPassword = 'a completely different password';
    expect((await verify(reset, '/auth/password/reset/complete', { password: newPassword })).status).toBe(200);
    expect((await request('/rider/me', undefined, account.token)).status).toBe(401);
    expect((await verify(loginCode, '/auth/signin/otp/verify')).status).toBe(400);
    expect((await request('/auth/signin/password', { email, password })).status).toBe(401);
    expect((await request('/auth/signin/password', { email, password: newPassword })).status).toBe(200);
    expect((await verify(reset, '/auth/password/reset/complete', { password: newPassword })).status).toBe(400);
  });

  it('fails closed on delivery failure and permits a fresh request after cooldown', async () => {
    failDelivery = true;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const failed = await start('phone', phone);
      expect(failed.status).toBe(202);
      expect((await request('/auth/signup/verify', { challengeId: failed.body.challengeId, code: '000000' })).status).toBe(400);
      failDelivery = false;
      await clearCooldown('phone', phone);
      expect((await verify(await start('phone', phone))).status).toBe(201);
    } finally { log.mockRestore(); }
  });

  it('validates contacts, passwords and rejects client-supplied privilege fields', async () => {
    expect((await request('/auth/signup/start', { channel: 'email', contact: email, name: 'Rider' })).status).toBe(400);
    expect((await request('/auth/signup/start', { channel: 'phone', contact: '9876543210', name: 'Rider' })).status).toBe(400);
    expect((await request('/auth/signup/start', { channel: 'phone', contact: phone, name: 'Rider', status: 'active' })).status).toBe(400);
    expect((await request('/auth/signup/verify', { challengeId: 'invalid', code: '123456' })).status).toBe(400);
    expect((await request('/auth/password/reset/start', { channel: 'phone', contact: phone })).status).toBe(400);
  });
});
