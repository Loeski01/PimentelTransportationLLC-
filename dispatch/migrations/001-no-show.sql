-- Run only against isolated pimentel-dispatch-dev after verifying existing constraint.
-- Existing databases created before no-show require this migration.
BEGIN;
ALTER TABLE dispatch_trips DROP CONSTRAINT IF EXISTS dispatch_trips_status_check;
ALTER TABLE dispatch_trips ADD CONSTRAINT dispatch_trips_status_check
CHECK (status IN ('pending','approved','assigned','accepted','rejected','started','completed','cancelled','no_show'));
COMMIT;
