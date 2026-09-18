import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const env = process.env.NODE_ENV || 'development';
const deliveryMode = process.env.OTP_DELIVERY_MODE || 'disabled';
if (!['disabled', 'console', 'webhook'].includes(deliveryMode))
  throw new Error('Invalid OTP_DELIVERY_MODE');
if (env === 'production') {
  if ((process.env.OTP_SECRET || '').length < 32)
    throw new Error('Production requires OTP_SECRET with at least 32 characters');
  if (deliveryMode !== 'webhook')
    throw new Error('Production requires webhook OTP delivery');
  if (
    !process.env.OTP_DELIVERY_URL?.startsWith('https://') ||
    !process.env.OTP_DELIVERY_TOKEN
  ) {
    throw new Error('Production requires HTTPS OTP_DELIVERY_URL and OTP_DELIVERY_TOKEN');
  }
  if ((process.env.OPS_API_KEY || '').length < 32)
    throw new Error('Production requires OPS_API_KEY with at least 32 characters');
}

export const config = {
  env,
  port: Number(process.env.PORT) || 3000,
  databaseUrl: env === 'test' ? required('TEST_DATABASE_URL') : required('DATABASE_URL'),
  auth: {
    otpSecret: process.env.OTP_SECRET || 'local-development-only-otp-secret',
    deliveryMode,
    deliveryUrl: process.env.OTP_DELIVERY_URL,
    deliveryToken: process.env.OTP_DELIVERY_TOKEN,
    opsApiKey: process.env.OPS_API_KEY,
  },
  riders: {
    leaseMinutes: Number(process.env.RIDER_LEASE_MINUTES) || 15,
  },
  payments: {
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || 'dev-webhook-secret',
  },
};
