ALTER TABLE deliveries
  ADD COLUMN expires_at     TIMESTAMPTZ NOT NULL,
  ADD COLUMN released_at    TIMESTAMPTZ,
  ADD COLUMN release_reason TEXT;

CREATE UNIQUE INDEX deliveries_one_active_per_order ON deliveries (order_id) WHERE released_at IS NULL;

CREATE UNIQUE INDEX deliveries_one_active_per_rider ON deliveries (rider_id) WHERE released_at IS NULL;
