# Hourly booking dispatch integration — implementation checklist

Status: diagnosis confirmed; NOT deployed. Branch isolated from main.

## Observed behavior (2026-11-20)
- One-way booking submitted successfully and appeared in admin pending, no driver.
- Hourly booking's `sendHourlyRequest()` in `index.html` only creates WhatsApp/mailto links and displays "Request ready". It does NOT POST to the booking API or persist a booking.
- Existing `POST /api/booking-request` in `server.js` supports one-way/quotePending only. It rejects unexpected payment values and validates destination; hourly requires a distinct, validated contract.

## Implementation requirements
1. Add `serviceType: "hourly"`, `hours`, `hourlyFareCents`, `tier`, pickup, optional itinerary, date/time, contact, passengers, details, and tip to an authenticated server-side booking flow.
2. Calculate hourly price on the server: executive $95/hour, comfort $75/hour, minimum 3 hours. Never trust client-provided fare; reject non-finite or out-of-range hours.
3. Persist hourly service type, duration, and price in production dispatch booking records and expose them in admin detail. Avoid pretending hourly service is a point-to-point trip; preserve optional itinerary.
4. Return a generated PT- reference only AFTER dispatch acknowledges durable persistence. No silent email-only success.
5. Customer/admin notifications: received, NOT confirmed; admin approval required, driver unassigned, no payment collected.
6. If dispatch fails, display explicit error and safe contact fallback. Do not say "request received" or create duplicate submissions.
7. Add automated tests: valid minimum and longer hours, tier prices, tips, missing destination, invalid hours, duplicate reference, dispatch outage, admin pending visibility, no auto-assignment, no charge.
8. Stage and run end-to-end test before merging/deploying. Verify production configuration and database schema compatibility; preserve existing bookings.

## Safety
Do not enable production hourly submissions or alter production schema until the server, dispatch intake, admin display, and tests are implemented together.
