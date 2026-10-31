-- Isolated dispatch database only. Apply before deploying updated dispatch router.
ALTER TABLE dispatch_trips ADD COLUMN IF NOT EXISTS arrived_at TIMESTAMPTZ;
