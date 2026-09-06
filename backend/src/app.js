import express from 'express';
import { pool } from './db/pool.js';
import { generationRoutes } from './generation/routes.js';
import { orderRoutes } from './orders/routes.js';
import { riderRoutes } from './riders/routes.js';
import { opsRoutes } from './ops/routes.js';
import { paymentRoutes } from './payments/routes.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    express.json({
      verify: (req, res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Content-Type, X-Rider-Id');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  });

  app.use(generationRoutes);
  app.use(orderRoutes);
  app.use(riderRoutes);
  app.use(opsRoutes);
  app.use(paymentRoutes);

  // Test DB connection
  app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
  });
  app.get('/health/db', async (req, res) => {
    const { rows } = await pool.query('SELECT now() AS now');
    res.json({ status: 'ok', now: rows[0].now });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.status) {
      return res
        .status(err.status)
        .json({ error: { code: err.code, message: err.message, ...(err.details && { details: err.details }) } });
    }
    console.error(err);
    res.status(500).json({ error: { code: 'INTERNAL', message: err.message } });
  });

  return app;
}
