# Round-trip booking persistence and modification integration gate

Status: design only; not deployed or enabled. No new infrastructure or charges authorized.

## Verified current server behavior (branch feature/round-trip-10pct)
- `POST /api/booking-request` generates a PT reference and emails the admin/customer.
- It forwards a booking to production dispatch only when `BOOKING_DISPATCH_PRODUCTION_ENABLED=true`, and expects `{stored:true,reference}` acknowledgment.
- When dispatch forwarding is disabled, this endpoint has no demonstrated durable booking record of its own. Email delivery alone is not a safe editable record.
- Round-trip requests are currently rejected by legacy booking and Stripe endpoints; the isolated round-trip endpoint is a quote only.
- Brevo `sendBookingEmail` can send messages but a provider API acceptance is not proof of inbox delivery.

## Required storage before enabling customer edits
Persist a canonical booking in a durable store with reference (unique), customer ID/contact, trip type, outbound and return legs, tier, status, version integer, fare/tip/extras in integer cents, and timestamps. Persist a separate immutable audit event per edit and a notification outbox record. No new database service should be provisioned without explicit cost approval.

## Proposed atomic modification transaction
1. Authenticate customer with a short-lived, single-booking signed link or verified one-time token; never authorize using booking reference/email alone. Rate-limit and log failed attempts without secrets.
2. Read canonical booking and current version. Only allow explicit pre-ride statuses; verify actual ride start state from authoritative dispatcher, not a browser flag.
3. Validate patch using `diffBooking`, recompute both fares on the server, and show the changed price before user confirms.
4. On confirmation, transactionally compare-and-swap the booking version, save new booking, append immutable audit event, and insert admin notification into an outbox. A conflicting version returns 409 and asks customer to refresh.
5. Send Brevo notification asynchronously from outbox with retries and stable event ID to prevent duplicate processing. Record provider acceptance/failure; do not promise actual delivery without delivery confirmation.
6. Do not charge or refund automatically; any payment adjustment requires a separate explicit payment flow.
7. Never auto-approve a newly created booking. Existing confirmed bookings remain subject to driver/dispatch state restrictions.

## Integration acceptance tests
- Token absent, expired, replayed, wrong booking => rejected.
- Pending/approved/confirmed booking before ride => edit allowed; driver active/arrived/started/completed/cancelled/unknown => rejected.
- Fare changes shown before confirmation, 10% applies only to transport subtotal; extras excluded.
- Concurrent edits => one succeeds and other gets 409; audit and outbox each exactly once.
- Notification provider unavailable => committed edit preserved and queued for retry, admin alerted when delivery recovers.
- Round trip never falls back to legacy one-way booking/payment; no double charge.
- Full staging booking -> approval -> customer modification -> audit -> email -> driver flow, with no production dispatch changes.

## Blockers
Determine which existing persistent store is authoritative for bookings and whether a safe API for read/update and transaction/outbox exists. Do not modify driver dispatch application without separate scoped approval. Keep feature disabled until tests, owner review, and explicit publication authorization.

## CI evidence — 2026-11-18
- Development suite passed on commit `f3e23a16b29acbe9a5d7cdba4d5dec06acc77bb8`: https://github.com/Loeski01/PimentelTransportationLLC-/actions/runs/44323021160
- Isolated PostgreSQL suite passed on the same commit: https://github.com/Loeski01/PimentelTransportationLLC-/actions/runs/44323021227
- Covered: HTTP boundary rejects round trips in legacy payment/booking endpoints; pricing and schedule validation; atomic booking edits and version conflicts; outbox claim, provider acceptance, duplicate suppression, ambiguous outcomes, and explicit rejection/retry with durable booking state.
- These tests use mock notification providers and an isolated CI PostgreSQL container; they do **not** establish real customer email delivery, production booking persistence, live Stripe behavior, or actual driver assignment.

## Release gate — still blocked
1. Identify authoritative production booking database and verify a separate nonproduction database and migrations; never run the draft schema on the live driver database.
2. Implement customer authorization using short-lived single-booking tokens and test expired, reused, wrong-booking, and unauthenticated access.
3. Connect a nonproduction booking-create → approval → edit → outbox → provider sandbox → manual driver-assignment workflow; verify status transitions and the pickup date/time shown to drivers.
4. Validate real provider webhooks/receipts for notifications and payment adjustments, including idempotency and no double charges, without real customer messages or charges.
5. Run regression tests on existing one-way reservations, payment checkout, QR and bilingual booking UI, plus backup/rollback rehearsal and monitoring.
6. Only then consider a staged rollout with the feature flag initially disabled and explicit verification of the actual deployment destination and costs.

**Release decision: NOT READY.** Passing isolated tests alone is not permission to bypass missing production integration, authorization, or rollback evidence.
