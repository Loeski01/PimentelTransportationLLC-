# Pimentel — producción: reservas web → despacho

## Restricción de costos — decisión del propietario (2026-11-13)
**No se autoriza ningún cargo nuevo en Render.** No crear PostgreSQL de pago, servicios Starter, ni complementos facturables. Tampoco utilizar bases de desarrollo o temporales para reservas reales. Solo se permite avanzar con revisiones de código, CI y documentación sin costo adicional. La publicación permanece bloqueada hasta una autorización posterior, expresa y específica para cualquier recurso de pago.

## Estado
El flujo se probó de extremo a extremo en *staging*. Este documento NO declara producción activa.
No fusionar a `main` hasta verificar cada punto y ejecutar una reserva controlada.

## Separación obligatoria
- Base de datos PostgreSQL **permanente** y exclusiva para despacho de producción; no usar `pimentel_dispatch_dev` ni `pimentel_restore_test_20261112`.
- Servicio Render de despacho independiente, rama que incluya el receptor `/booking/intake`, `NODE_ENV=production`, con `DISPATCH_DATABASE_URL`, `DISPATCH_PRODUCTION_DATABASE_NAME` exactamente igual al nombre real de la base, `DISPATCH_SESSION_SECRET` (32+ caracteres), y credencial de administrador existente.
- Variables del despacho: `BOOKING_SCHEMA_PRODUCTION_ENABLED=true`, `BOOKING_INTAKE_PRODUCTION_ENABLED=true`. Nunca activar `BOOKING_INTAKE_STAGING_ENABLED` ni `BOOKING_SCHEMA_STAGING_ENABLED` en ese servicio.
- Configurar `BOOKING_SERVICE_SECRET` con un secreto **nuevo y exclusivo de producción** (32+ bytes), idéntico en los dos servicios. No registrar ni subir su valor a GitHub.
- En servidor web público: `BOOKING_DISPATCH_URL=https://<host-exclusivo-produccion>.onrender.com/booking/intake` y `BOOKING_DISPATCH_PRODUCTION_ENABLED=true` **solo después** de verificar despacho. Mantener configuración de Stripe/Brevo ya existente.
- No activar reenvío a staging desde la web pública.

## Secuencia de publicación
1. Aprovisionar la base permanente de producción y verificar acceso privado, plan/coste y estrategia de respaldo/restauración.
2. Desplegar despacho de producción con configuración aislada y verificar `GET /ready` = 200 y que el administrador puede iniciar sesión.
3. Verificar que `POST /booking/intake` sin credencial devuelve 403. No publicar el secreto.
4. Desplegar cambios web con `BOOKING_DISPATCH_PRODUCTION_ENABLED=false` y verificar que la web, las tarifas y Stripe siguen funcionando.
5. Activar el reenvío en web. Enviar **una reserva controlada sin cobro** y verificar que aparece en el buzón del despacho de producción con la misma referencia, sin duplicados.
6. Aprobar manualmente, asignar conductor, comprobar visibilidad de tarifa solo al administrador, notificaciones y cierre. Confirmar que ningún viaje se confirmó automáticamente.
7. Revisar logs sin información personal, respaldos, monitoreo y plan de reversión. No borrar datos de staging sin ensayo de restauración verificado.

## Reversión inmediata
Cambiar `BOOKING_DISPATCH_PRODUCTION_ENABLED=false` en web. Esto detiene nuevos reenvíos; no elimina reservas ya guardadas. Reconciliar manualmente cualquier solicitud con respuesta incierta antes de reintentar, para evitar duplicados.

## Límites conocidos
Las pruebas de GitHub validan código; no demuestran que las credenciales, base de datos, correo, pagos o la recepción en producción funcionen. La publicación no debe declararse completada sin pruebas de extremo a extremo.
