-- Draft only: DO NOT execute against production or the driver database.
-- Requires review of the authoritative booking store and its existing schema.
-- PostgreSQL transactional foundation for round-trip bookings and customer edits.
BEGIN;
CREATE TABLE IF NOT EXISTS pt_customer_bookings (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  reference text NOT NULL UNIQUE CHECK (reference ~ '^PT-[A-Z0-9-]{4,64}$'),
  customer_name text NOT NULL,
  customer_email text NOT NULL,
  customer_phone text NOT NULL,
  passengers text,
  trip_type text NOT NULL CHECK (trip_type IN ('one_way','round_trip')),
  tier text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  outbound jsonb NOT NULL,
  return_leg jsonb,
  fare_cents bigint NOT NULL CHECK (fare_cents >= 0),
  extras_cents bigint NOT NULL DEFAULT 0 CHECK (extras_cents >= 0),
  tip_cents bigint NOT NULL DEFAULT 0 CHECK (tip_cents >= 0),
  version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((trip_type = 'round_trip' AND return_leg IS NOT NULL) OR (trip_type = 'one_way' AND return_leg IS NULL))
);
ALTER TABLE pt_customer_bookings ADD COLUMN IF NOT EXISTS acceptance_notice_status text
  NOT NULL DEFAULT 'pending' CHECK (acceptance_notice_status IN ('pending','sending','accepted','failed','unknown'));
CREATE TABLE IF NOT EXISTS pt_booking_change_events (
  event_id uuid PRIMARY KEY,
  booking_id bigint NOT NULL REFERENCES pt_customer_bookings(id),
  booking_version bigint NOT NULL,
  actor text NOT NULL,
  changes jsonb NOT NULL,
  previous_fare_cents bigint NOT NULL CHECK (previous_fare_cents >= 0),
  new_fare_cents bigint NOT NULL CHECK (new_fare_cents >= 0),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (booking_id, booking_version)
);
CREATE TABLE IF NOT EXISTS pt_booking_notification_outbox (
  event_id uuid PRIMARY KEY REFERENCES pt_booking_change_events(event_id),
  recipient_email text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','accepted','retry','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  accepted_at timestamptz,
  sending_started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pt_booking_outbox_due_idx ON pt_booking_notification_outbox(next_attempt_at) WHERE status IN ('pending','retry');
-- Single-use signed edit grants; never store the raw token or nonce.
CREATE TABLE IF NOT EXISTS pt_booking_edit_grant_uses (
  nonce_hash text PRIMARY KEY CHECK (nonce_hash ~ '^[0-9a-f]{64}$'),
  booking_id bigint NOT NULL REFERENCES pt_customer_bookings(id),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pt_booking_edit_grant_expiry_idx ON pt_booking_edit_grant_uses(expires_at);
COMMIT;
