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
