import { beforeAll, afterAll, beforeEach } from 'vitest';
import { config } from '../src/config.js';
import { pool } from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrate.js';

if (!config.databaseUrl.includes('test')) {
  throw new Error(`Refusing to run tests against ${config.databaseUrl} — it must be a test database.`);
}

beforeAll(async () => {
  await runMigrations();
});

beforeEach(async () => {
  await pool.query('TRUNCATE orders, deliveries, payments, subscriptions, plans, riders, customers RESTART IDENTITY CASCADE');
});

afterAll(async () => {
  await pool.end();
});
