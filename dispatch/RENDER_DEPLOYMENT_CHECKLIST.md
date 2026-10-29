# Dispatch deployment checklist (isolated staging service)

## Confirmed issue
The security-review service builds but fails at startup with `Missing DISPATCH_DATABASE_URL`. Redeploying without configuring it will not resolve the failure.

## Safe configuration in Render
1. Keep the production booking service unchanged.
2. Use a PostgreSQL instance in the **same region** as the dispatch-review service, or deploy dispatch-review in the existing database's Oregon region. Render's internal database hostname is accessible only to services in the same account and region.
3. Copy the database's **Internal Database URL** from Render's database Connect panel to the dispatch-review service's secret environment variable `DISPATCH_DATABASE_URL`. Never commit this URL or password to GitHub.
4. Generate a random `DISPATCH_SESSION_SECRET` of at least 32 characters; keep it in Render environment settings only.
5. Generate `DISPATCH_ADMIN_PASSWORD_HASH` as `salt:hash`, where salt is 16 random bytes as hex and hash is `crypto.scryptSync(adminPassword,salt,64).toString('hex')`. Do not store the plaintext password in code or logs.
6. Set `NODE_ENV=production` for secure session cookies on HTTPS.
7. Run `cd dispatch && npm run check` in CI/build before starting; verify all tests pass.
8. Deploy staging; verify `/health` returns 200 and `/ready` returns 200 (the latter requires migrated dispatch tables).
9. Test admin-only trip approval/assignment, driver-specific trip lists, fare exclusion, unauthorized access, and session logout. Do not connect customer bookings until explicitly approved.

## Known limitations
The Render integration currently cannot retrieve database credentials or query this database while external connections are blocked. Do not open the database to the internet to work around this. A new database or region migration may affect costs; confirm before provisioning.
