CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE customers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE plans (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  meal_slot    TEXT NOT NULL,
  price_paise  BIGINT NOT NULL CHECK (price_paise > 0),
  is_active    BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE riders (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL UNIQUE,
  is_online   BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE subscriptions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id       UUID NOT NULL REFERENCES customers(id),
  plan_id           UUID NOT NULL REFERENCES plans(id),
  start_date        DATE NOT NULL,
  weekday_mask      SMALLINT NOT NULL,   -- bit0=Mon .. bit6=Sun
  delivery_address  TEXT NOT NULL,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id  UUID NOT NULL REFERENCES subscriptions(id),
  customer_id      UUID NOT NULL REFERENCES customers(id),
  rider_id         UUID REFERENCES riders(id),
  service_date     DATE NOT NULL,
  status           TEXT NOT NULL DEFAULT 'PLACED',
  price_paise      BIGINT NOT NULL CHECK (price_paise > 0),
  delivery_address TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, service_date)
);

CREATE TABLE deliveries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id),
  rider_id      UUID NOT NULL REFERENCES riders(id),
  status        TEXT NOT NULL DEFAULT 'ASSIGNED',
  claimed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  picked_up_at  TIMESTAMPTZ,
  delivered_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id   UUID NOT NULL REFERENCES customers(id),
  order_id      UUID REFERENCES orders(id),
  amount_paise  BIGINT NOT NULL CHECK (amount_paise > 0),
  type          TEXT NOT NULL,        -- TOPUP | CHARGE | REFUND
  status        TEXT NOT NULL DEFAULT 'PENDING',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
