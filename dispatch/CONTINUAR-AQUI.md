# Continuar aquí — Pimentel Transportation Dispatch

Fecha: 2026-10-29. Estado: EN DESARROLLO; NO APTO PARA VIAJES REALES.

## Repositorio y rama
- GitHub: Loeski01/PimentelTransportationLLC-
- Rama aislada: feature/dispatch-security-review-20261029
- Draft PR #6: https://github.com/Loeski01/PimentelTransportationLLC-/pull/6 (NO FUSIONAR aún)
- Producción GitHub Pages / Render y Stripe: NO MODIFICAR.

## Render
- Nuevo servicio de pruebas: pimentel-dispatch-review
- ID: srv-dbhig7flk1mc73crq6t0
- Dashboard: https://dashboard.render.com/web/srv-dbhig7flk1mc73crq6t0
- URL: https://pimentel-dispatch-review.onrender.com
- Rama: feature/dispatch-security-review-20261029
- Build: cd dispatch && npm install
- Start: cd dispatch && npm start
- Región: ohio; plan free; autoDeploy off.
- Primer despliegue: dep-dbhig7vlk1mc73crq7o0, update_failed por Missing DISPATCH_DATABASE_URL.
- Base de datos anterior: pimentel-dispatch-dev, ID dpg-dbggc7ei0phs73du2q10-a, región oregon, plan free, expira 2026-11-26. Tiene tablas antiguas; NO borrar ni migrar a ciegas.
- Render rechazó crear segunda DB free: cannot have more than one active free tier database.
- Consulta SQL externa no disponible: allowlist de IP vacía. NO abrir allowlist indiscriminadamente.

## Código
- Servicio autónomo en dispatch/, con autenticación admin/driver, PIN de 4 dígitos, roles y asignación manual.
- Chofer no ve tarifas; enlaces a Google Maps, Apple Maps y Waze; cartel negro con apellido del pasajero en blanco y compañía en amarillo.
- Llegada registrada en servidor y NO-SHOW solo tras 15 minutos, sin cargo automático.
- Pruebas GitHub Actions: última confirmada exitosa en commit 4572460b150a1669f627afe749d6b6d58a5491c0; cambios posteriores pendientes de validar.
- Cambio reciente: renombrar nueva tabla dispatch_audit -> dispatch_trip_audit en dispatch/schema.sql, dispatch/router.js y dispatch/app.js para evitar choque con tablas antiguas. Revisar todas las referencias y CI antes de desplegar.

## Próximos pasos prioritarios
1. Comprobar CI y consistencia de esquema/código, incluyendo migraciones.
2. Definir una conexión privada a una base aislada o esquema validado, sin comprometer la DB antigua; configurar DISPATCH_DATABASE_URL en Render.
3. Configurar DISPATCH_SESSION_SECRET y DISPATCH_ADMIN_PASSWORD_HASH de forma privada, nunca en GitHub ni chat.
4. Aplicar migraciones seguras y desplegar staging manualmente.
5. Validar /ready, inicio de sesión, creación/aprobación/asignación de viaje, aislamiento de conductores, navegación y NO-SHOW.
6. Mantener PR en draft y producción intacta hasta aprobación explícita.

El usuario desea que, cuando diga «continúa», se trabaje directamente en el proyecto y se informe solo progreso comprobado. No afirmar que se trabajó en segundo plano.
