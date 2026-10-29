-- Development-only schema; apply only to isolated dispatch database.
CREATE TABLE IF NOT EXISTS dispatch_drivers (
 id BIGSERIAL PRIMARY KEY,
 display_name TEXT NOT NULL,
 pin_hash TEXT NOT NULL,
 active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS dispatch_trips (
 id BIGSERIAL PRIMARY KEY,
 passenger_surname TEXT NOT NULL,
 pickup_address TEXT NOT NULL,
 destination_address TEXT NOT NULL,
 pickup_at TIMESTAMPTZ NOT NULL,
 arrived_at TIMESTAMPTZ,
 fare_cents INTEGER CHECK (fare_cents IS NULL OR fare_cents >= 0),
 driver_id BIGINT REFERENCES dispatch_drivers(id),
 status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','assigned','accepted','rejected','started','completed','cancelled','no_show')),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS dispatch_trips_driver_idx ON dispatch_trips(driver_id,pickup_at);
CREATE TABLE IF NOT EXISTS dispatch_trip_audit (
 id BIGSERIAL PRIMARY KEY,
 trip_id BIGINT REFERENCES dispatch_trips(id),
 actor_role TEXT NOT NULL,
 actor_id TEXT NOT NULL,
 action TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- No public permissions or row-level access are granted by this migration.
