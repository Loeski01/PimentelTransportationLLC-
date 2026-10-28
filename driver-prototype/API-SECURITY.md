# Contrato API de despacho (borrador, no implementado)

## Reglas obligatorias
- Toda solicitud requiere sesión autenticada en el servidor.
- Rol `admin`: crear/aprobar viajes, asignar/reasignar conductor y consultar tarifas.
- Rol `driver`: solo consultar viajes con `assigned_driver_id = session.driver_id`, aceptar y actualizar estado permitido.
- Nunca incluir `fare`, `total`, `payment`, `price` ni datos de pago en ninguna respuesta de conductor; usar una lista positiva de campos autorizados.
- Nunca confiar en `driver_id` enviado por el navegador para determinar el usuario.
- PIN de cuatro dígitos con hash robusto y sal, limitación de intentos, bloqueo temporal, revocación de sesiones y HTTPS.
- Registrar auditoría de creación, aprobación, asignación y cambios de estado.

## Endpoints propuestos
- `POST /api/admin/trips` — crea reserva pendiente.
- `POST /api/admin/trips/:id/approve` — aprobación previa a confirmación.
- `POST /api/admin/trips/:id/assign` — `{driverId}`; solo admin.
- `GET /api/driver/trips` — filtra por conductor autenticado.
- `POST /api/driver/trips/:id/accept` — solo conductor asignado.
- `PATCH /api/driver/trips/:id/status` — solo conductor asignado, transiciones permitidas.

## Ejemplo de respuesta permitida para conductor
```json
{"id":"trip-123","passengerSurname":"Smith","pickup":"Logan Airport","destination":"Woburn, MA","status":"assigned"}
```

## Criterios de aceptación
1. Conductor A no puede consultar viaje asignado a B, ni cambiando URL o parámetros.
2. Ningún endpoint de conductor devuelve tarifa ni datos de pago.
3. Sin sesión válida se devuelve 401; sin permisos 403.
4. Solo admin puede asignar o reasignar.
5. Reservas sin aprobar no envían confirmación definitiva.
6. El cartel muestra solo apellido; compañía amarilla, apellido blanco, fondo negro.

Estado: especificación solamente. No hay API de producción ni autenticación implementada.
