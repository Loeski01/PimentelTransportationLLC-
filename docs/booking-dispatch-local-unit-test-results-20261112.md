# Local unit-test verification — 2026-11-12

Source files were fetched from branch `feature/booking-dispatch-integration-20261112` and executed with Node.js v22. The tests were run in a temporary local directory using the fetched source contents; this is not a GitHub Actions run and not a Render/database integration test.

Command:
```sh
node --test dispatch/booking-transfer.test.js dispatch/service-auth.test.js booking/transfer-state.test.js
```

Result:
- 15 tests passed
- 0 failed
- 0 skipped

Coverage:
- New booking creates a pending trip and audit record.
- Repeated reference returns the existing trip without a second audit record.
- Missing booking reference is rejected before database access.
- UTC and explicit-offset timestamps are accepted; timezone-free timestamps are rejected.
- Audit failure triggers rollback and releases the database connection.
- Service authentication rejects missing/wrong keys, accepts the matching key, and rejects weak configured secrets.
- Transfer-state decisions allow new bookings, reuse completed transfers, reconcile in-flight transfers, block cancelled bookings, and reject missing references.

Limitations:
- The tests use a fake database pool; no real PostgreSQL database or Render service was contacted.
- The GitHub Actions workflow run is not confirmed by this test.
- No staging migration has been applied.
- No service secret has been configured in Render.
- No end-to-end booking-to-dispatch test has been run.
- Production booking, dispatch, and payment services remain untouched.


## Follow-up verification
The same 15 tests were independently rerun from the branch source in a local Node.js test environment. Result: 15 passed, 0 failed, 0 skipped. This confirms the pure unit tests, not PostgreSQL integration.

The Render development database remains unreachable through the hosted query connector because its external IP allowlist is empty. No allowlist was widened and no migration was applied. The dispatch schema currently has no `booking_reference` column in its checked-in base schema; the separate staging migration adds it and its partial unique index. Apply and verify that migration only after secure staging database access is available.
