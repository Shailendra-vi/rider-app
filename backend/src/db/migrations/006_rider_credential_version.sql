-- A reset invalidates outstanding OTPs, including challenges racing with the reset.
ALTER TABLE riders ADD COLUMN credential_version INTEGER NOT NULL DEFAULT 0;
ALTER TABLE rider_auth_challenges ADD COLUMN credential_version INTEGER NOT NULL DEFAULT 0;
