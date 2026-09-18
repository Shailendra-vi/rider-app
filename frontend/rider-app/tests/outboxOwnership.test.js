import { beforeEach, describe, it, expect, vi } from 'vitest';
import { createMemoryAdapter } from '../src/outbox/adapters/memory';
import { getOutbox, initOutbox } from '../src/outbox';
import { setSession } from '../src/auth/sessionRuntime';
import { api } from '../src/api/client';
import { createSqliteAdapter } from '../src/outbox/adapters/sqlite';

vi.mock('expo-crypto', () => ({ randomUUID: () => Math.random().toString() }));
vi.mock('../src/outbox/adapters/sqlite', () => ({
  createSqliteAdapter: vi.fn(async () => createMemoryAdapter()),
}));
vi.mock('../src/api/client', () => ({
  api: { claim: vi.fn(async () => null), transition: vi.fn() },
}));
beforeEach(() => {
  setSession(null);
});

describe('account-owned delivery queues', () => {
  it('keeps queued work with its original rider across logout and account switching', async () => {
    const a = '11111111-1111-4111-8111-111111111111';
    const b = '22222222-2222-4222-8222-222222222222';
    setSession({ riderId: a, token: 'a' });
    const outboxA = await initOutbox(a);
    await outboxA.enqueue({ kind: 'CLAIM' });
    setSession({ riderId: b, token: 'b' });
    const outboxB = await initOutbox(b);
    expect(getOutbox()).toBe(outboxB);
    expect(await outboxB.pendingCount()).toBe(0);
    await outboxA.drain();
    expect(api.claim).not.toHaveBeenCalled();
    expect(await outboxA.pendingCount()).toBe(1);
    expect(createSqliteAdapter).toHaveBeenCalledWith(`riderapp-${a}.db`);
    expect(createSqliteAdapter).not.toHaveBeenCalledWith('riderapp.db');
    setSession(null);
    expect(getOutbox()).toBeNull();
    setSession({ riderId: a, token: 'new-a' });
    expect(await initOutbox(a)).toBe(outboxA);
    expect(await getOutbox().pendingCount()).toBe(1);
  });
});
