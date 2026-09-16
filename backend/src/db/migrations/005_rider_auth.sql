ALTER TABLE riders
  ALTER COLUMN phone DROP NOT NULL,
  ADD COLUMN email TEXT,
  ADD COLUMN password_hash TEXT,
  ADD COLUMN email_verified_at TIMESTAMPTZ,
  ADD COLUMN phone_verified_at TIMESTAMPTZ,
  ADD COLUMN identity_verification_status TEXT NOT NULL DEFAULT 'not_started'
    CHECK (identity_verification_status IN ('not_started', 'pending', 'verified', 'rejected')),
  ADD COLUMN identity_verification_type TEXT CHECK (identity_verification_type IN ('aadhaar')),
  ADD COLUMN identity_verified_at TIMESTAMPTZ,
  ADD COLUMN identity_verification_ref TEXT,
  ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'active', 'suspended', 'closed')),
  ADD COLUMN last_seen_at TIMESTAMPTZ,
  ADD COLUMN updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD CONSTRAINT riders_contact_required CHECK (email IS NOT NULL OR phone IS NOT NULL),
  ADD CONSTRAINT riders_email_normalized CHECK (email = lower(btrim(email)));

CREATE UNIQUE INDEX riders_email_unique ON riders (email) WHERE email IS NOT NULL;

CREATE TABLE rider_auth_challenges (
  id UUID PRIMARY KEY,
  purpose TEXT NOT NULL CHECK (purpose IN ('signup', 'signin', 'reset')),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'phone')),
  contact TEXT NOT NULL,
  rider_id UUID REFERENCES riders(id) ON DELETE CASCADE,
  name TEXT,
  password_hash TEXT,
  code_digest TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  consumed_at TIMESTAMPTZ,
  delivered BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX rider_auth_challenges_contact ON rider_auth_challenges (channel, contact, purpose);
CREATE INDEX rider_auth_challenges_expiry ON rider_auth_challenges (expires_at);

CREATE TABLE rider_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rider_id UUID NOT NULL REFERENCES riders(id) ON DELETE CASCADE,
  token_digest TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ
);
CREATE INDEX rider_sessions_rider ON rider_sessions (rider_id);

-- Shared across API processes; keys contain keyed digests rather than raw contacts/IPs.
CREATE TABLE rider_auth_limits (
  key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
