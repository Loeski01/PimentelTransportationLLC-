# Estados y avisos de viaje — especificación de implementación
Fecha: 2026-10-31. Entorno: solo dispatch staging. Referencia: issue #7.

## Hallazgo técnico
El backend actual ya ofrece `POST /dispatch/driver/trips/:id/arrive` para registrar llegada, y `POST /dispatch/driver/trips/:id/status` para `started` y `completed`. El esquema almacena `arrived_at` y audita eventos en `dispatch_trip_audit`. No existe todavía evento `on_my_way` ni sistema de notificaciones push. No duplicar los endpoints existentes.

## Secuencia de conductor
1. `assigned -> accepted`: aceptar viaje.
2. `accepted -> en camino`: nuevo evento `on_my_way` único, con hora del servidor. Avisar al administrador.
3. `en camino -> llegué`: usar endpoint `arrive`, mantener `arrived_at` para NO-SHOW de 15 minutos. Avisar al administrador.
4. `llegué -> cliente a bordo`: reutilizar `started`. Registrar hora; SIN alerta.
5. `started -> viaje completado`: reutilizar `completed`. Registrar hora y avisar al administrador.

## Seguridad e integridad
- Rechazar eventos fuera de orden o duplicados, y cambios por un conductor no asignado o inactivo.
- Guardar transición y auditoría en una misma transacción.
- No incluir `fare_cents` en respuestas al conductor.
- Notificaciones al administrador: `on_my_way`, `arrived_at_pickup`, `driver:completed`, únicamente.
- Alerta interna: bandeja consultable por administrador, sin duplicados; push requiere implementación y permiso del dispositivo, por lo que no se declara listo.
- Mantener NO-SHOW tras 15 minutos desde `arrived_at`, sin cobros automáticos.
- Conservar reservas, Stripe y producción intactos.

## Pruebas de aceptación pendientes
- Secuencia válida con hora e historial por viaje y conductor.
- Botón de cada estado visible solo cuando corresponda.
- Tres alertas al administrador, ninguna por cliente a bordo.
- Bloqueo de eventos repetidos, fuera de orden, sin sesión y de otros conductores.
- Regresión de NO-SHOW, panel y ausencia de tarifas.
- Prueba de base de datos y teléfono iPhone antes de publicar.

## Avance de preparación — 31 de octubre (revisión posterior)

- Se añadió `migrations/003-trip-milestones-notifications.sql` con `on_my_way_at` y una bandeja interna `dispatch_admin_notifications` para exactamente tres eventos, con restricción de unicidad por viaje/evento.
- Se actualizó `schema.sql` para nuevas instalaciones aisladas de despacho. La migración 003 **no ha sido aplicada** a PostgreSQL; la tabla creada por `CREATE TABLE IF NOT EXISTS` no actualiza automáticamente las bases existentes.
- Se endureció `canRecordMilestone` para rechazar historiales incompletos, duplicados o desordenados; se agregaron pruebas de regresión y de consistencia de esquema.
- **Todavía no se conectaron** los botones, las rutas HTTP, la escritura transaccional de avisos ni la bandeja del administrador. No hay notificaciones push activas.
- No se ha comprobado el despliegue ni la migración en Render para estos commits. No publicar ni fusionar hasta pruebas de integración y autorización del entorno de Render.
