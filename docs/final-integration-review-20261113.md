# Revisión final — 13 de noviembre de 2026

**Estado: candidato preparado, NO publicado.** Base web `main` b89ddcd; transporte de producción 15b7454; despacho probado a527ac7 (rama security-review). No se han cambiado servicios, secretos, planes ni datos en Render. Este informe prevalece sobre notas históricas de octubre.

## Bloqueos reales

1. `main` no incluye el despacho probado ni el emisor de reservas de producción. Desplegar su `dispatch/private-panel.html` actual perdería los hitos y la integración. El candidato reúne ambos componentes conservando servidores separados.
2. La bandeja del despacho probado tenía `/booking-staging` fijo: corregido para que el servidor seleccione `/booking` en producción. `/ready` ahora verifica también las columnas de integración cuando está activada.
3. Falta validar en Render un destino de despacho de producción y su base persistente, identidad exacta, respaldo/restauración y configuración de secretos. Ningún recurso de pago está autorizado. Si los recursos existentes no cumplen, detener activación; no contratar automáticamente.
4. Pendiente prueba completa en el destino definitivo. Los 65 tests locales no verifican PostgreSQL real, correo entregado, cookies HTTPS, ni entorno desplegado. La reserva guardada que pierde el acuse por timeout exige conciliación antes de reintentar: el navegador no tiene una clave idempotente persistente entre envíos.

## Comprobación externa realizada (solo lectura)

Render `My Workspace`: web `PimentelTransportationLLC-` usa `main`, `node server.js`, auto-deploy activado. Despacho `pimentel-dispatch-oregon-staging` usa security-review, `cd dispatch && npm start`, health `/ready`, auto-deploy desactivado. Reservas staging usa booking-dispatch-integration, auto-deploy desactivado. Esto confirma configuración de servicios; no confirma SHA desplegado, estado del esquema, credenciales, entrega ni permanencia de base. No se probaron contraseñas ni se crearon viajes.

## Archivos principales

| Archivo | Cambio concreto frente a main |
|---|---|
| `server.js` | Reenvío autenticado opcional con bandera explícita; referencia aleatoria; acuse con referencia exacta; preflight de presencia de configuración. Si despacho guardó y falla correo admin, devuelve recibido y `adminNoticeSent:false`, evitando presentar una reserva guardada como fallida. |
| `booking/production-dispatch-sender.js` | HTTPS, secreto servidor a servidor, timeout, rechazo de staging y validación del acuse. |
| `booking/booking-request-mapper.js` | Recupera módulo faltante que hacía fallar el test ya existente en main; usa importe calculado en servidor. |
| `dispatch/app.js` | Recupera inicio, sesiones y esquema de rama probada; monta intake separado de producción y staging; selecciona prefijo correcto de bandeja; readiness comprueba tablas de integración. |
| `dispatch/booking-staging-router.js` | Recupera receptor probado: guarda solicitud, bandeja admin y transferencia transaccional manual a viaje pendiente sin conductor. Se reutiliza bajo `/booking` en producción pese al nombre histórico. |
| `dispatch/booking-admin.html` | Recupera bandeja y reemplaza rutas fijas de staging por prefijo inyectado desde servidor; no contiene secretos. |
| `dispatch/private-panel.html` | Recupera panel probado: hitos, navegación, restauración de sesión, notificaciones, limpieza visual e historial; texto describe aprobación/asignación manual. |
| `dispatch/router.js`, `dispatch/login.js` | Recupera permisos, hitos, avisos, espera/no-show y sesiones de rama probada; precios excluidos del API del conductor. |
| `dispatch/schema.sql`, `dispatch/migrations/*.sql` | Recupera esquema probado y migraciones aditivas. NO se ejecutaron. Verificar esquema existente antes de aplicar; no sustituir datos ni historial. |
| `dispatch/no-show-policy.js`, `dispatch/trip-milestones.js` | Recupera validaciones usadas por flujos ya probados. |
| `dispatch/manifest.webmanifest`, `dispatch/app-icon.svg` | Recupera acceso instalado a `/panel`. |
| `dispatch/package.json`, `dispatch/package-lock.json` | Comprobaciones y dependencias del despacho; lock generado localmente. |
| `dispatch/tests/*.test.js`, `booking/production-dispatch-sender.test.js` | Tests existentes recuperados y nuevas verificaciones locales de prefijo, autenticación, persistencia fallida y acuse. |
| `.github/workflows/production-preflight-checks.yml` | Valida web, GPS, transporte y despacho sin secretos ni despliegues. |
| `.gitignore` | Excluye dependencias y archivos de secretos. |

`dispatch/scripts/*` y documentos históricos se conservan de la rama probada como respaldo operativo; NO forman parte de la secuencia a ejecutar. No ejecutar scripts de limpieza/restauración durante esta revisión.

## Archivos y rutas conservados

`index.html`, `calculadora-gps-pimentel.html`, `calculadora-gps-respaldo.html`, `confirmar-reserva.html` y las fotos no cambian. GPS, categorías, WhatsApp y mailto conservan comportamiento. `/api/quote` y `/api/create-checkout-session` conservan cálculo y pago. `/api/booking-request` integra únicamente solicitudes automáticas `later`/`coordinate`; WhatsApp, correo manual, servicio por horas y pagos Checkout NO generan viaje automáticamente y requieren gestión manual. Pago no equivale a aprobación ni a despacho.

Despacho independiente: `/panel`, `/auth/*`, `/dispatch/admin/*`, `/dispatch/driver/*`; bandeja `/booking-admin`, `/booking/inbox`, `/booking/:reference/send-to-dispatch`; receptor servidor a servidor `/booking/intake`. **No abrir el HTML privado en GitHub Pages**: necesita su servidor, sesión y API del mismo origen. No introducir contraseña en la página de confirmación pública.

## Verificación breve sin costo antes de publicación

1. Revisar diff de esta rama frente a main; comprobar que HTML público y calculadora no cambiaron. Ejecutar `node --check server.js`, `node --test gps.test.cjs booking/*.test.js` y `npm --prefix dispatch run check`. Resultado local: 23 + 42 = 65 aprobadas.
2. Con acceso de solo lectura a Render, confirmar SHA desplegado, comandos, plan existente, estado/permanencia de DB, identidad y respaldo/restauración. Revisar presencia de secretos sin revelar valores. Pendiente.
3. Validar candidato en entorno de pruebas existente y aislado: `/ready`, sesión admin, permisos de conductor, intake sin credencial rechazado, reserva ficticia recibida una sola vez, transferencia manual, aprobar, asignar, En camino, Llegué, Iniciar y Finalizar; precio oculto al conductor. No cobrar ni usar datos reales. Pendiente ejecución de este candidato.
4. Antes de producción, revisar configuración específica y destino permanente de `docs/production-booking-dispatch-rollout.md`. Mantener `BOOKING_DISPATCH_PRODUCTION_ENABLED=false` hasta cerrar pendientes y acordar publicación. Si no puede verificarse sin cargos, detenerse.
5. Tras autorización de publicación: desplegar despacho separado, comprobar readiness, publicar web con reenvío apagado, activar y hacer una reserva controlada sin cobro. La publicación definitiva no se ha ejecutado. Reversión: desactivar reenvío, conservar y conciliar reservas ya guardadas.
