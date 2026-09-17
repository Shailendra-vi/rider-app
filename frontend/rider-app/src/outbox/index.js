import * as Crypto from 'expo-crypto';
import { createOutbox } from './core';
import { createSqliteAdapter } from './adapters/sqlite';
import { api } from '../api/client';
import { getSession } from '../auth/sessionRuntime';

const instances = new Map();
const opening = new Map();
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function makeTransport(riderId) {
  return async (row) => {
    if (getSession()?.riderId !== riderId) throw Object.assign(new Error('Sign in to resume your saved actions'), { status: 401 });
    const body = JSON.parse(row.body);

    if (row.kind === 'CLAIM') return api.claim(riderId);
    if (row.kind === 'TRANSITION') {
      return api.transition(
        riderId, 
        row.order_id, 
        row.target_status, 
        body.claimId ?? row.claim_id
      );
    }
    throw Object.assign(new Error(`Unknown action kind: ${row.kind}`), { status: 400, code: 'UNKNOWN_KIND' });
  };
}

export async function initOutbox(riderId) {
  if (!/^[a-f0-9-]{36}$/i.test(riderId)) throw new Error('A verified rider account is required');
  if (instances.has(riderId)) return instances.get(riderId);
  if (opening.has(riderId)) return opening.get(riderId);
  const promise = (async () => {
    const adapter = await createSqliteAdapter(`riderapp-${riderId}.db`);
    const instance = createOutbox({ adapter, transport: makeTransport(riderId), onChange: notify, newKey: () => Crypto.randomUUID() });
    await instance.recover();
    instances.set(riderId, instance);
    notify();
    return instance;
  })();
  opening.set(riderId, promise);
  try { return await promise; } finally { opening.delete(riderId); }
}

export function getOutbox() {
  return instances.get(getSession()?.riderId) || null;
}
