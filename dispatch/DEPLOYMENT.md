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
