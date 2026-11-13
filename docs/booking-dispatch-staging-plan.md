# Booking to dispatch integration — staging plan

Status: design only; no production changes.

## Verified existing paths
- Booking server: `POST /api/booking-request` in root `server.js`; validates and recalculates fare, generates PT reference, sends administrator/customer emails. No durable reservation write currently occurs.
- Dispatch server: `dispatch/app.js` mounts `dispatch/router.js` under `/dispatch`; `POST /dispatch/admin/trips` requires administrator session and creates pending trip.
- Dispatch trip currently stores passenger surname, pickup/destination, pickup time, status; reservation fields such as phone, email, tier, fare, tip, reference and payment preference need separate protected storage or schema migration.

## Required implementation
1. Add durable `booking_requests` table (reference unique, contact, origin/destination, scheduled time, tier, fare/tip, payment mode, details, status, dispatch_trip_id unique nullable, timestamps). Do not log sensitive customer fields.
2. Save validated booking before acknowledging receipt; make email delivery an independent retriable notification so temporary mail failure does not lose a booking. Retain current public API response and fare validation.
3. Create authenticated admin-only inbox to list requests and show `Enviar a despacho`. Require CSRF protection, session auth, and rate limits.
4. Transfer from backend to dispatch through a server-to-server authenticated endpoint, not a browser secret. Use booking reference as idempotency key; enforce unique reference in dispatch DB and transactional trip + audit creation. Return existing trip on safe retries.
5. Preserve approval workflow: transfer creates PENDING trip; only admin approves and assigns driver. Do not automatically confirm customer or collect payment.
6. Record transfer result and errors; retries must never create duplicates. Handle partial failures and network timeouts with reconciliation by reference.
7. Test isolated databases with fake bookings, repeated clicks, concurrent retries, server restart, missing auth, invalid input, mail failures, and driver workflow. Never use real passengers for staging tests.
8. Roll out only after review, backup, migration verification, and explicit production readiness check.

## Open checks
- Identify available Postgres connection for booking inbox and staging.
- Inspect current deployed dispatch branch separately from main; staging runs feature/dispatch-security-review-20261029.
- Confirm production admin inbox location and notification preference before changing UI.
