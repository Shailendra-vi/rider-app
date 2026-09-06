
CREATE TABLE rider_locations (
  id           BIGSERIAL PRIMARY KEY,
  rider_id     UUID NOT NULL REFERENCES riders(id),
  order_id     UUID REFERENCES orders(id),
  lat          NUMERIC(9,6) NOT NULL,
  lng          NUMERIC(9,6) NOT NULL,
  recorded_at  TIMESTAMPTZ NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX rider_locations_rider_recorded ON rider_locations (rider_id, recorded_at DESC);
