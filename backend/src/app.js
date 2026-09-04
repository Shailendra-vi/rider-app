import express from 'express';
import { pool } from './db/pool.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json());






  // Test DB connection
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });
  app.get('/health/db', async (req, res) => {
    const { rows } = await pool.query('SELECT now() AS now');
    res.json({ status: 'ok', now: rows[0].now });
  });


  return app;
}
