import crypto from 'node:crypto';
import { pool } from '../db/pool.js';
import { config } from '../config.js';
import { HttpError } from '../lib/httpError.js';

const MAX_SKEW_SECONDS = 300;
const EVENT_TYPES = new Set(['TOPUP', 'REFUND']);

export function signPayload(rawBody, timestamp, secret = config.payments.webhookSecret) {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(String(timestamp));
  hmac.update('.');
  hmac.update(rawBody);
  return `sha256=${hmac.digest('hex')}`;
}

function verifySignature(rawBody, timestamp, signatureHeader) {
  const expected = signPayload(rawBody, timestamp);
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader ?? '');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function processPaymentWebhook({ body, rawBody, signatureHeader, timestampHeader }) {
  if (!rawBody || !signatureHeader || !timestampHeader) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'Signature and timestamp headers are required');
  }

  const timestamp = Number(timestampHeader);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > MAX_SKEW_SECONDS) {
    throw new HttpError(400, 'TIMESTAMP_OUT_OF_RANGE', 'Webhook timestamp is outside the accepted window');
  }

  if (!verifySignature(rawBody, timestamp, signatureHeader)) {
    throw new HttpError(401, 'INVALID_SIGNATURE', 'Webhook signature does not match');
  }

  const { eventId, customerId, type, amountPaise, occurredAt } = body ?? {};
  if (!eventId || !customerId || !EVENT_TYPES.has(type) || !(Number(amountPaise) > 0)) {
    throw new HttpError(400, 'VALIDATION_FAILED', 'eventId, customerId, type (TOPUP|REFUND) and amountPaise are required');
  }

  const customer = await pool.query('SELECT id FROM customers WHERE id = $1', [customerId]);
  if (customer.rows.length === 0) {
    throw new HttpError(404, 'NOT_FOUND', `Customer ${customerId} not found`);
  }

  const { rows } = await pool.query(
    `INSERT INTO payments (customer_id, amount_paise, type, status, provider_event_id, occurred_at)
     VALUES ($1, $2, $3, 'COMPLETED', $4, $5)
     ON CONFLICT (provider_event_id) WHERE provider_event_id IS NOT NULL DO NOTHING
     RETURNING *`,
    [customerId, amountPaise, type, eventId, occurredAt ?? new Date(timestamp * 1000)],
  );

  if (rows.length === 0) {
    return { duplicate: true, eventId };
  }
  return { duplicate: false, payment: rows[0] };
}
