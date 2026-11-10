-- Apply only to the isolated dispatch database after backup and staging tests.
-- Archiving hides completed trips from the active admin queue without deleting history.
ALTER TABLE dispatch_trips
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS dispatch_trips_archived_at_idx
  ON dispatch_trips (archived_at, pickup_at DESC);
-- Existing trips remain visible until explicitly archived by an administrator.
