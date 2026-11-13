# Persistent booking inbox module — 2026-11-12

Added `booking/booking-inbox.js` to persist validated requests into the staging `booking_requests` table. It stores the fields currently collected by `POST /api/booking-request`: reference, passenger name, phone, email, pickup, destination, local date/time, passenger count, service tier, fare cents, tip cents, payment preference and instructions.

The insert sets status to `received`, uses the unique reference with `ON CONFLICT DO NOTHING`, and returns the existing row on a retry rather than creating a duplicate. Validation rejects malformed references, invalid date/time formats, unsupported tier/payment values and invalid money values before writing.

Added five unit tests for persistence, duplicate reference handling, and invalid input rejection. The GitHub Actions workflow now includes the module and tests.

Important status:
- This is a standalone storage module; it is not yet wired into the live `/api/booking-request` route.
- The staging migration has not been applied because secure PostgreSQL access remains unresolved.
- Tests have been added but no CI run is confirmed.
- No Render configuration, production booking endpoint, payment flow, or public site was changed.
- Before wiring it in, verify the migration against the actual isolated staging database and make email delivery retryable so a mail-provider outage cannot discard an already-persisted booking.
