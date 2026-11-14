# Validación de NO-SHOW y despliegue aislado

Estado: pendiente de ejecutar en staging. **No desplegar a producción.**

## Preparación
1. Mantener Render staging conectado a una rama revisada, con root `dispatch` y comando `npm start`.
2. Confirmar variables `DISPATCH_DATABASE_URL`, `DISPATCH_SESSION_SECRET` (mínimo 32 caracteres), `DISPATCH_ADMIN_PASSWORD_HASH`; no copiar secretos al repositorio.
3. Aplicar `schema.sql` solo en una base nueva y aislada. Si ya existen las tablas, aplicar `migrations/001-no-show.sql` y `migrations/002-arrival-time.sql`. Revisar previamente las restricciones SQL.
4. Ejecutar `npm install` y `npm run check`; verificar `/ready` devuelve 200 antes de iniciar pruebas.

## Pruebas de aceptación
- Crear conductor con PIN de cuatro dígitos; confirmar que un PIN incorrecto no inicia sesión.
- Crear viaje pendiente como administrador, aprobar y asignar manualmente.
- Confirmar que el conductor asignado solo ve sus viajes y nunca ve `fare_cents`.
- Aceptar el viaje y registrar llegada. La hora debe provenir del servidor y aparecer en el panel de administración.
- Intentar NO-SHOW sin llegada: debe rechazarse.
- Intentar NO-SHOW antes de 15 minutos: debe rechazarse incluso si se manipula el navegador.
- Al cumplir 15 minutos, declarar NO-SHOW con confirmación; debe quedar auditado y visible para el administrador.
- Confirmar que otro conductor no puede registrar llegada ni NO-SHOW para ese viaje.
- Desactivar conductor con viaje aceptado; confirmar que vuelve a la cola y `arrived_at` se borra.
- Comprobar navegación a recogida/destino en Google Maps, Apple Maps y Waze, cartel de apellido y sesión/logout en iPhone.

## Riesgos aún abiertos
- El botón de llegada confirma la presencia declarada por el conductor; **no comprueba ubicación GPS**.
- No se envían notificaciones instantáneas de NO-SHOW; el administrador lo ve al actualizar.
- La interfaz muestra minutos aproximados y requiere actualizar manualmente.
- No hay cargos automáticos por ausencia.
- No declarar apta para clientes hasta ejecutar las pruebas de aceptación con evidencia.
