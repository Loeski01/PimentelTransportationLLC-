# Booking modification policy — draft for implementation
Status: SPECIFICATION ONLY. Not enabled on production.

## Customer experience (English first, Spanish second)
- Modify Booking / Modificar reserva.
- Customers may request changes at any time without administrator approval, before trip service begins.
- Changes to pickup/dropoff, outbound/return date/time, and contact details are supported.
- A new booking still requires administrator approval.
- A change is not final until the server validates and saves it, and the customer sees confirmation.
- For changes affecting fare, display old fare, recalculated fare, difference, and any payment/refund action before customer confirms. Never automatically charge or refund without a separate approved payment flow.
- Preserve 10% discount on transportation legs when booking remains round trip. No discount on tips, tolls, parking, or extras.
- If a trip is already in progress, direct customer to contact the company instead of self-service editing.

## Security and operations
- Authenticate edit access with an unpredictable, expiring booking-specific token; never trust a booking ID alone.
- Server checks trip status, valid dates, availability/operational constraints, and recalculates pricing independently.
- Use atomic version checks to prevent conflicting simultaneous edits.
- Record immutable audit events: booking ID, timestamp, actor, old/new fields, old/new fare and difference.
- Queue an administrator notification for EVERY successful change (including no-price changes); include booking ID, customer, field-level before/after, price difference, and timestamps. Retry failed delivery and expose delivery status. A successful save must not be reported as a successfully delivered notification until delivery is confirmed.
- Notify assigned driver of changed trip details when relevant, but do not alter dispatch without testing and authorization.
- Never expose passenger private data in public links.

## Tests required before release
- Same-day and later return changes; invalid dates and time order; in-progress trip rejection.
- Fare increase/decrease and unchanged fare; discount and excluded extras; no automatic charge.
- Unauthorized/expired token, duplicate submission, concurrent edits.
- Audit history, admin notification delivery and retry, booking owner confirmation.
- Existing one-way quote, booking, checkout, and dispatch regression tests.
- No production deploy without owner approval.
