-- Dispatch staging only. Apply manually to the isolated dispatch PostgreSQL database.
-- Do not apply to the booking/payments database. Safe to rerun.
-- The router and notification inbox must be deployed separately after integration tests.
BEGIN;
ALTER TABLE dispatch_trips ADD COLUMN IF NOT EXISTS on_my_way_at TIMESTAMPTZ;
CREATE TABLE IF NOT EXISTS dispatch_admin_notifications (
  id BIGSERIAL PRIMARY KEY,
  trip_id BIGINT NOT NULL REFERENCES dispatch_trips(id),
  driver_id BIGINT NOT NULL REFERENCES dispatch_drivers(id),
  event_type TEXT NOT NULL CHECK (event_type IN ('on_my_way','arrived_at_pickup','trip_completed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  read_at TIMESTAMPTZ,
  UNIQUE (trip_id, event_type)
);
CREATE INDEX IF NOT EXISTS dispatch_admin_notifications_unread_idx
  ON dispatch_admin_notifications(read_at, created_at DESC);
COMMIT;
