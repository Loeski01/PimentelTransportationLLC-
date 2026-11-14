# Render staging setup — Pimentel dispatch

Verified 2026-10-28: an existing Render test service `pimentel-dispatch-test` points to branch `feature/driver-dispatch-app`, root directory `/`, and runs `node server.js`. The new isolated dispatch backend currently lives under `dispatch/` on `main`. **Do not deploy by merely triggering the existing test service**: it would deploy the wrong branch/entrypoint.

## Required staging configuration (no production changes)

1. Configure the existing test service to build from the branch containing the reviewed `dispatch/` files. Set root directory to `dispatch`, build command `npm install`, start command `npm start`.
2. Configure `DISPATCH_DATABASE_URL` with Render's **internal** PostgreSQL connection URL for `pimentel-dispatch-dev`. Keep it in Render secrets only.
3. Set a strong random `DISPATCH_SESSION_SECRET` and a scrypt `DISPATCH_ADMIN_PASSWORD_HASH` generated privately; never send the actual password in chat.
4. Apply `schema.sql` to the isolated database using a private connection or trusted Render shell before opening the service for real data. The database is not externally queryable from the hosted connector due to its empty IP allowlist; do not widen that allowlist for convenience.
5. Test sessions, administrator approval, driver PIN authentication, driver isolation, audit history, trip navigation, and the absence of fare fields in all driver API responses.
6. Confirm that the existing commercial Render service `PimentelTransportationLLC-` and its payment/booking endpoints remain untouched.

**Current status:** the existing test service was observed live on its older branch, which does **not** confirm that the new dispatch app has been deployed. The separate dispatch backend is not yet production-ready.

## Revisión de configuración (2026-10-29)
La consulta actual al servicio Render confirma que `pimentel-dispatch-test` todavía apunta a `feature/driver-dispatch-app`, tiene root `/`, build `npm install`, start `node server.js` y autoDeploy desactivado. Por tanto, **no** está ejecutando este backend aislado de `dispatch/` ni las últimas funciones NO-SHOW. No activar deploy hasta configurar rama, directorio, migraciones y secretos, y validar la compilación.
