# Booking transfer lifecycle (staging only)
The atomic transfer claim and completion helpers are now checked into the integration branch. The admin endpoint will use the following sequence **after** authentication:
1. Validate and claim a *received* booking via one conditional SQL UPDATE.
2. Convert its stored pickup date and time using the configured pickup timezone.
3. POST only the allowlisted dispatch data to the service-authenticated staging import endpoint.
4. On confirmed 200/201, record the dispatch trip ID and mark the booking transferred.
5. On repeated clicks, report in-progress/already-transferred instead of sending another request.
6. On uncertain network outcome, **do not reset and resend blindly**; reconcile by booking reference against the unique dispatch record.
7. On confirmed pre-commit rejection, return the booking to received with a generic error.

These are building blocks, not a mounted admin endpoint. Before staging tests: create isolated booking database, apply migrations, verify dispatch schema, implement reconciliation and admin authentication, configure secrets and run end-to-end tests. No production deploy, payment changes, or database mutations were performed by adding these files.
