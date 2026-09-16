import { config } from '../config.js';
import { HttpError } from '../lib/httpError.js';

// Provider-independent server-to-server delivery bridge. Never called with a URL from the request.
export async function deliverOtp({ challengeId, channel, contact, code, purpose }) {
  if (config.auth.deliveryMode === 'console' && config.env === 'development') {
    console.info(`[DEV OTP] ${purpose} ${channel} ${contact} challenge=${challengeId} code=${code}`);
    return;
  }
  if (config.auth.deliveryMode !== 'webhook' || !config.auth.deliveryUrl || !config.auth.deliveryToken) {
    throw new HttpError(503, 'OTP_DELIVERY_UNAVAILABLE', 'OTP delivery is not configured');
  }
  try {
    const response = await fetch(config.auth.deliveryUrl, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(10_000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.auth.deliveryToken}` },
      body: JSON.stringify({ challengeId, channel, contact, code, purpose, expiresInSeconds: 300 }),
    });
    if (!response.ok) throw new Error('Delivery rejected');
  } catch {
    throw new HttpError(503, 'OTP_DELIVERY_UNAVAILABLE', 'Could not send a code. Please try again later');
  }
}
