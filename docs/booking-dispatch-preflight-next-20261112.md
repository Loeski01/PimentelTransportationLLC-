# Preflight: stored booking to dispatch transfer

Added a staging-only mapping helper and five unit tests:
- Transform a stored booking row to dispatch's allowlisted payload with timezone-aware pickup time.
- Do not transfer personal contact/payment fields to dispatch.
- Block cancelled/already transferred rows.
- Permit reconciliation of transfers left in transferring state.
- Require PostgreSQL date/time to be selected as text, avoiding UTC conversion errors.

Before integration testing: apply staging migrations on isolated PostgreSQL, confirm dispatch schema compatibility (including audit and unique booking reference), add protected admin inbox endpoint, use service-to-service authentication, and verify retry state transactions. No live service or database changes are implied by these files.
