import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

const env = process.env.NODE_ENV || 'development';

export const config = {
  env,
  port: Number(process.env.PORT) || 3000,
  databaseUrl: env === 'test' ? required('TEST_DATABASE_URL') : required('DATABASE_URL'),
  riders: {
    leaseMinutes: Number(process.env.RIDER_LEASE_MINUTES) || 15,
  },
  payments: {
    webhookSecret: process.env.PAYMENT_WEBHOOK_SECRET || 'dev-webhook-secret',
  },
};
