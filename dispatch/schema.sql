-- Pimentel Transportation LLC — PostgreSQL schema for dispatch
-- Run only in a private PostgreSQL database, never in GitHub Pages.
CREATE TABLE IF NOT EXISTS drivers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(120) NOT NULL,
  email VARCHAR(254) NOT NULL UNIQUE,
  phone VARCHAR(40) NOT NULL,
  vehicle VARCHAR(160),
  password_hash TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reference VARCHAR(60) NOT NULL UNIQUE,
  customer_name VARCHAR(120) NOT NULL,
  customer_email VARCHAR(254) NOT NULL,
  customer_phone VARCHAR(40) NOT NULL,
  pickup TEXT NOT NULL,
  destination TEXT NOT NULL,
  pickup_at TIMESTAMPTZ NOT NULL,
  estimated_fare_cents INTEGER NOT NULL CHECK (estimated_fare_cents >= 0),
  status VARCHAR(24) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','assigned','in_progress','completed','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL REFERENCES bookings(id),
  driver_id UUID NOT NULL REFERENCES drivers(id),
  status VARCHAR(24) NOT NULL DEFAULT 'offered'
    CHECK (status IN ('offered','accepted','rejected','revoked','completed')),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  responded_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS one_live_assignment_per_booking
  ON assignments(booking_id) WHERE status IN ('offered','accepted');
CREATE TABLE IF NOT EXISTS dispatch_audit (
  id BIGSERIAL PRIMARY KEY,
  booking_id UUID REFERENCES bookings(id),
  actor_role VARCHAR(20) NOT NULL,
  actor_id TEXT NOT NULL,
  action VARCHAR(80) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS driver_sessions (
  token_hash CHAR(64) PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES drivers(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS driver_sessions_driver_id_idx ON driver_sessions(driver_id);


-- Public intake metadata; additive and safe to re-run in the isolated development DB.
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS request_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE drivers ADD COLUMN IF NOT EXISTS pin_configured BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS failed_pin_attempts INTEGER NOT NULL DEFAULT 0, ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMPTZ;

-- Durable notification records; sending remains disabled in the beta.
CREATE TABLE IF NOT EXISTS dispatch_notifications(
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 booking_id UUID NOT NULL REFERENCES bookings(id),
 assignment_id UUID REFERENCES assignments(id),
 kind VARCHAR(24) NOT NULL CHECK(kind IN ('admin_request','customer_request','driver_offer')),
 dedupe_key VARCHAR(120) NOT NULL UNIQUE,
 status VARCHAR(20) NOT NULL CHECK(status IN ('pending','sending','sent','failed','suppressed','obsolete')),
 attempts INTEGER NOT NULL DEFAULT 0,
 next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 lease_until TIMESTAMPTZ,
 last_error_code VARCHAR(40),
 sent_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dispatch_notification_due ON dispatch_notifications(status,next_attempt_at);

ALTER TABLE assignments ADD COLUMN IF NOT EXISTS trip_stage VARCHAR(24) NOT NULL DEFAULT 'not_started' CHECK(trip_stage IN ('not_started','on_the_way','arrived','passenger_onboard','completed'));
