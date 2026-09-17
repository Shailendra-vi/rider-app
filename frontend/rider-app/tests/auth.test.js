import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { maskContact, normalizeContact, validatePassword } from '../src/auth/validation';
import { getRevision, getSession, setSession, onSessionExpired } from '../src/auth/sessionRuntime';

beforeEach(() => { setSession(null); vi.stubEnv('EXPO_PUBLIC_API_URL', 'http://localhost:3000'); });
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('authentication input', () => {
  it('normalizes email and phone while rejecting ambiguous contacts', () => {
    expect(normalizeContact('email', ' RIDER@EXAMPLE.COM ')).toBe('rider@example.com');
    expect(normalizeContact('phone', '+91 98765 43210')).toBe('+919876543210');
    expect(() => normalizeContact('phone', '9876543210')).toThrow('country code');
    expect(() => normalizeContact('email', 'rider')).toThrow('valid email');
  });
  it('validates password confirmation and masks contact details', () => {
    expect(() => validatePassword('short', 'short')).toThrow('12');
    expect(() => validatePassword('long enough password', 'different password')).toThrow('match');
    expect(maskContact('phone', '+919876543210')).not.toContain('987654');
    expect(maskContact('email', 'rider@example.com')).toBe('ri•••@example.com');
  });
});

describe('authenticated transport', () => {
  it('sends bearer tokens and rejects a different account before sending', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ rider: { id: 'a' } }), { status: 200 }));
    vi.stubGlobal('fetch', fetch);
    const { api } = await import('../src/api/client');
    setSession({ riderId: 'a', token: 'secret' });
    await api.getMe('a');
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer secret');
    expect(fetch.mock.calls[0][1].headers).not.toHaveProperty('X-Rider-Id');
    await expect(api.claim('b')).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('discards late responses after an account switch', async () => {
    let resolve;
    vi.stubGlobal('fetch', vi.fn(() => new Promise(done => { resolve = done; })));
    const { api } = await import('../src/api/client');
    setSession({ riderId: 'a', token: 'old' });
    const pending = api.getMe('a');
    const revision = getRevision();
    setSession({ riderId: 'b', token: 'new' });
    resolve(new Response(JSON.stringify({ rider: { id: 'a' } }), { status: 200 }));
    await expect(pending).rejects.toMatchObject({ code: 'SESSION_CHANGED' });
    expect(getRevision()).toBeGreaterThan(revision);
    expect(getSession().riderId).toBe('b');
  });
  it('expires the current session on 401, but not public login failures', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: { message: 'Invalid', code: 'SESSION_INVALID' } }), { status: 401 })));
    const { api, authApi } = await import('../src/api/client');
    const expired = vi.fn();
    const unsubscribe = onSessionExpired(expired);
    setSession({ riderId: 'a', token: 'token' });
    await expect(api.getMe('a')).rejects.toMatchObject({ status: 401 });
    await expect(authApi.post('signin/password', {})).rejects.toMatchObject({ status: 401 });
    expect(expired).toHaveBeenCalledTimes(1);
    unsubscribe();
  });
  it('keeps the logout request alive when local credentials are cleared', async () => {
    const fetch = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', fetch);
    const { authApi } = await import('../src/api/client');
    setSession({ riderId: 'a', token: 'token' });
    const logout = authApi.logout();
    setSession(null);
    await logout;
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer token');
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(false);
  });
});
