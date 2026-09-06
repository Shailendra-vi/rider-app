ALTER TABLE payments
  ALTER COLUMN status SET DEFAULT 'COMPLETED',
  ADD COLUMN provider_event_id TEXT,
  ADD COLUMN occurred_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX payments_provider_event_id
  ON payments (provider_event_id)
  WHERE provider_event_id IS NOT NULL;

CREATE UNIQUE INDEX payments_one_charge_per_order
  ON payments (order_id)
  WHERE type = 'CHARGE';
