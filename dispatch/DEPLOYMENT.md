# Pimentel dispatch: deployment checklist

This is a separate service, **not yet deployed**. Never point production bookings or Stripe to it until tested.

1. Provision an isolated PostgreSQL database and apply `schema.sql`.
2. Set the variables named in `.env.example` as **hosting secrets**, never in GitHub.
3. Generate a personal administrator password scrypt hash (`salt:hash` in hex) offline; do not send the password through chat.
4. From `dispatch/`, install Node dependencies and run `npm run check` before starting `npm start`.
5. Use HTTPS, a private staging URL, and verify role restrictions, login throttling, session expiration, and driver data isolation before real data.
6. Test that the driver API never returns fare or payment data and cannot access another driver's trip.
7. Confirm backups, auditing, and customer confirmation only after admin approval before production use.

The `demo/index.html` is **visual-only**, has no login, database, or real dispatch capabilities. GitHub Pages must be configured to publish the branch/folder containing it; a committed file alone does not prove the URL is live.

## Render staging diagnosis (2026-10-29)

- New isolated web service `pimentel-dispatch-review` exists in Ohio, on this review branch; auto-deploy is off.
- Initial deployment failed at startup with `Missing DISPATCH_DATABASE_URL`. The server intentionally fails closed without its database, session secret and administrator password hash.
- Render rejected a second free PostgreSQL instance (`cannot have more than one active free tier database`). The existing free database is in Oregon and has legacy dispatch tables; do not delete it, broaden its IP allowlist, or apply the new schema blindly.
- To continue safely, provision an isolated database/schema with verified migrations and use the private connection string via Render environment secrets; configure `DISPATCH_SESSION_SECRET` and `DISPATCH_ADMIN_PASSWORD_HASH` without putting secrets in GitHub or chat.
- The current deployment is NOT ready for drivers. Keep production website and payment service unchanged.
