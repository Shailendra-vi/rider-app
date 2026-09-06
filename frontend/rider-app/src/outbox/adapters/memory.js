import { STATE } from '../core';

export function createMemoryAdapter(seed = []) {
  let rows = seed.map((r) => ({ ...r }));
  let nextId = rows.reduce((max, r) => Math.max(max, r.id), 0) + 1;

  const api = {
    async init() {},

    async insert(row) {
      const stored = { id: nextId++, settled_at: null, ...row };
      rows.push(stored);
      return { ...stored };
    },

    async nextUnsettled() {
      const pending = rows
        .filter((r) => r.state === STATE.QUEUED || r.state === STATE.SENDING)
        .sort((a, b) => a.id - b.id);
      return pending[0] ? { ...pending[0] } : null;
    },

    async update(id, patch) {
      const row = rows.find((r) => r.id === id);
      Object.assign(row, patch);
      return { ...row };
    },

    async resetSending() {
      const stuck = rows.filter((r) => r.state === STATE.SENDING);
      stuck.forEach((r) => {
        r.state = STATE.QUEUED;
      });
      return stuck.length;
    },

    async all() {
      return rows.map((r) => ({ ...r }));
    },

    async byStates(states) {
      return rows.filter((r) => states.includes(r.state)).map((r) => ({ ...r }));
    },

    async countByStates(states) {
      return rows.filter((r) => states.includes(r.state)).length;
    },

    async deleteByStates(states) {
      rows = rows.filter((r) => !states.includes(r.state));
    },

    reopen() {
      return createMemoryAdapter(rows);
    },
  };

  return api;
}
