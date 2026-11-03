-- Dispatch-only migration. Existing trips remain unchanged.
BEGIN;
ALTER TABLE dispatch_trips ADD COLUMN IF NOT EXISTS passenger_phone TEXT;
ALTER TABLE dispatch_trips DROP CONSTRAINT IF EXISTS dispatch_trips_passenger_phone_format;
ALTER TABLE dispatch_trips ADD CONSTRAINT dispatch_trips_passenger_phone_format
  CHECK (passenger_phone IS NULL OR passenger_phone ~ '^\\+[1-9][0-9]{7,14}$');
COMMIT;
