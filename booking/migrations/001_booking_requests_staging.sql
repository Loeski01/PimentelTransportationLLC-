-- STAGING ONLY. Apply to an isolated booking database after review.
-- Never apply to production automatically.
BEGIN;
CREATE TABLE IF NOT EXISTS booking_requests (
 id BIGSERIAL PRIMARY KEY,
 reference TEXT NOT NULL UNIQUE,
 passenger_name TEXT NOT NULL,
 passenger_phone TEXT NOT NULL,
 passenger_email TEXT NOT NULL,
 pickup_address TEXT NOT NULL,
 destination_address TEXT NOT NULL,
 pickup_local_date DATE NOT NULL,
 pickup_local_time TIME NOT NULL,
 passenger_count TEXT,
 service_tier TEXT NOT NULL CHECK (service_tier IN ('luxury','comfort')),
 fare_cents INTEGER NOT NULL CHECK (fare_cents >= 0),
 tip_cents INTEGER NOT NULL DEFAULT 0 CHECK (tip_cents >= 0),
 payment_preference TEXT NOT NULL CHECK (payment_preference IN ('later','coordinate')),
 special_instructions TEXT,
 status TEXT NOT NULL DEFAULT 'received' CHECK (status IN ('received','transferring','transferred','cancelled')),
 dispatch_trip_id BIGINT UNIQUE,
 transfer_attempts INTEGER NOT NULL DEFAULT 0 CHECK (transfer_attempts >= 0),
 last_transfer_error TEXT,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 transferred_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS booking_requests_inbox_idx ON booking_requests(status,created_at DESC);
-- This is a staging data model only; authentication, encryption, retention,
-- access controls and cross-service transfer are required before use.
COMMIT;
