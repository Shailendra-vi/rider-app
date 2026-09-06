import * as SQLite from 'expo-sqlite';
import { STATE } from '../core';

const SCHEMA = `
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS actions (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    idempotency_key  TEXT NOT NULL UNIQUE,
    kind             TEXT NOT NULL,
    order_id         TEXT,
    target_status    TEXT,
    claim_id         TEXT,
    body             TEXT NOT NULL,
    state            TEXT NOT NULL,
    attempts         INTEGER NOT NULL DEFAULT 0,
    next_attempt_at  INTEGER NOT NULL,
    created_at       INTEGER NOT NULL,
    settled_at       INTEGER,
    result_code      TEXT,
    user_message     TEXT
  );
  CREATE INDEX IF NOT EXISTS actions_state ON actions (state, id);
`;

const COLUMNS = [
  'idempotency_key',
  'kind',
  'order_id',
  'target_status',
  'claim_id',
  'body',
  'state',
  'attempts',
  'next_attempt_at',
  'created_at',
  'settled_at',
  'result_code',
  'user_message',
];

export async function createSqliteAdapter(name = 'riderapp.db') {
  const db = await SQLite.openDatabaseAsync(name);
  await db.execAsync(SCHEMA);

  const placeholders = (list) => list.map(() => '?').join(', ');

  return {
    async init() {},

    async insert(row) {
      const values = COLUMNS.map((c) => row[c] ?? null);
      const result = await db.runAsync(
        `INSERT INTO actions (${COLUMNS.join(', ')}) VALUES (${placeholders(COLUMNS)})`,
        values,
      );
      return db.getFirstAsync('SELECT * FROM actions WHERE id = ?', [result.lastInsertRowId]);
    },

    async nextUnsettled() {
      return db.getFirstAsync(
        `SELECT * FROM actions WHERE state IN (?, ?) ORDER BY id LIMIT 1`,
        [STATE.QUEUED, STATE.SENDING],
      );
    },

    async update(id, patch) {
      const keys = Object.keys(patch);
      await db.runAsync(
        `UPDATE actions SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`,
        [...keys.map((k) => patch[k]), id],
      );
    },

    async resetSending() {
      const result = await db.runAsync('UPDATE actions SET state = ? WHERE state = ?', [
        STATE.QUEUED,
        STATE.SENDING,
      ]);
      return result.changes;
    },

    async all() {
      return db.getAllAsync('SELECT * FROM actions ORDER BY id');
    },

    async byStates(states) {
      return db.getAllAsync(
        `SELECT * FROM actions WHERE state IN (${placeholders(states)}) ORDER BY id`,
        states,
      );
    },

    async countByStates(states) {
      const row = await db.getFirstAsync(
        `SELECT count(*) AS n FROM actions WHERE state IN (${placeholders(states)})`,
        states,
      );
      return row.n;
    },

    async deleteByStates(states) {
      await db.runAsync(`DELETE FROM actions WHERE state IN (${placeholders(states)})`, states);
    },
  };
}
