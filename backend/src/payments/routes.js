import { Router } from 'express';
import { processPaymentWebhook } from './webhook.js';

export const paymentRoutes = Router();

paymentRoutes.post('/webhooks/payments', async (req, res, next) => {
  try {
    const result = await processPaymentWebhook({
      body: req.body,
      rawBody: req.rawBody,
      signatureHeader: req.get('X-Payment-Signature'),
      timestampHeader: req.get('X-Payment-Timestamp'),
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});
