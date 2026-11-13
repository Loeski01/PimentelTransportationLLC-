# Booking / dispatch payload compatibility review — 2026-11-12

## Confirmed source contract
The booking endpoint in `server.js` accepts name, phone, email, pickup and destination addresses, local date, local time, passenger count, details, payment preference, service tier, tip values and expected fare. It recalculates the fare, creates a PT reference, and sends emails. It does not persist the request.

## Confirmed dispatch import contract
`dispatch/booking-transfer.js` currently accepts only:
- `booking_reference`
- `passenger_surname`
- `pickup_address`
- `destination_address`
- `pickup_at` as an ISO timestamp with timezone

The dispatch base schema currently stores surname, pickup, destination, pickup timestamp, fare, driver and status. The import SQL assumes a `booking_reference` column supplied by the separate staging migration.

## Compatibility gap — do not connect yet
The booking endpoint currently supplies local date and local time separately, while the dispatch import requires an ISO timestamp with an explicit timezone. The booking endpoint also has full customer name/contact, passenger count, service tier, fare, tip, payment preference and details, while the dispatch importer accepts only a surname and route/time. A direct HTTP pass-through would therefore lose data and could misinterpret the pickup time.

## Required safe adapter design
1. Persist the full validated booking request in the booking inbox before acknowledging it; keep email notifications retriable and separate from persistence.
2. Store the pickup timezone explicitly (configured for the operating service area or selected unambiguously per booking) and convert date/time to an ISO timestamp with offset. Reject ambiguous/nonexistent local times rather than guessing.
3. Decide which customer fields belong in dispatch versus the protected booking inbox. Do not send email/phone/payment details to driver-facing endpoints.
4. Use a server-side mapping adapter with an allowlist of fields; never accept client-supplied status, driver ID or fare as authoritative.
5. Add schema migrations and tests for the mapping, timezone conversion, validation, and retry/idempotency.
6. Only then test against isolated PostgreSQL and the staging dispatch service.

## Current state
This review is based on the checked-in source files. No Render service was reconfigured, no database migration was applied, no credentials were changed, and no production booking/payment code was modified.


## Adapter implementation added
- Added `booking/booking-to-dispatch.js`, an allowlisted mapper that passes only booking reference, passenger surname, pickup/destination, and timezone-normalized pickup instant to dispatch.
- It requires an explicit IANA timezone. For the Boston operating area, `America/New_York` is the intended configuration; the code does not silently default it.
- It rejects invalid dates, nonexistent spring-forward times, and ambiguous fall-back times rather than guessing.
- Added tests for the field allowlist, Eastern conversion, and daylight-saving edge cases; included them in the staging CI workflow.
- These tests have not yet produced a confirmed CI run. No Render database or service was changed.
