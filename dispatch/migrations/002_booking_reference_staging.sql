-- STAGING ONLY: run on an isolated dispatch database after checking schema.
-- Enforce exactly one dispatch trip per booking reference, including on retries.
BEGIN;
ALTER TABLE dispatch_trips ADD COLUMN IF NOT EXISTS booking_reference TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS dispatch_trips_booking_reference_unique
 ON dispatch_trips(booking_reference) WHERE booking_reference IS NOT NULL;
COMMIT;
-- Server-side authenticated transfer endpoint must create trip and audit atomically.
-- Do not expose this endpoint publicly or trust client-supplied status/driver_id.
