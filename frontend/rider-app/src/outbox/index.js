import * as Crypto from 'expo-crypto';
import { createOutbox } from './core';
import { createSqliteAdapter } from './adapters/sqlite';
import { api } from '../api/client';

let instance = null;
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => fn());
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function makeTransport(getRiderId) {
  return async (row) => {
    const riderId = getRiderId();
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

export async function initOutbox(getRiderId) {
  if (instance) return instance;

  const adapter = await createSqliteAdapter();
  instance = createOutbox({
    adapter,
    transport: makeTransport(getRiderId),
    onChange: notify,
    newKey: () => Crypto.randomUUID(),
  });

  await instance.recover();
  notify();
  return instance;
}

export function getOutbox() {
  return instance;
}
