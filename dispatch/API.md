# Contrato de API — versión de desarrollo

Todas las rutas bajo `/api/dispatch` requieren HTTPS, sesión validada y autorización en el servidor. No están implementadas aún.

| Método | Ruta | Permiso | Acción |
|---|---|---|---|
| POST | /drivers | administrador | Invitar/crear conductor |
| GET | /drivers | administrador | Listar conductores |
| PATCH | /drivers/:id | administrador | Activar/suspender conductor |
| GET | /bookings | administrador | Listar solicitudes |
| POST | /bookings/:id/approve | administrador | Aprobar reserva |
| POST | /bookings/:id/assign | administrador | Asignar conductor |
| POST | /bookings/:id/reassign | administrador | Revocar y reasignar |
| GET | /my-assignments | conductor | Solo viajes propios |
| POST | /my-assignments/:id/accept | conductor asignado | Aceptar |
| POST | /my-assignments/:id/reject | conductor asignado | Rechazar |
| POST | /my-assignments/:id/status | conductor asignado | Actualizar estado permitido |

## Reglas
- Nunca confiar en el identificador de conductor enviado por el cliente para determinar quién inició sesión.
- El servidor obtiene el rol e identidad de una sesión verificada.
- Las asignaciones se hacen mediante transacciones de base de datos.
- Los viajes no pueden asignarse sin aprobación del administrador.
- La creación de reservas debe persistir en la base de datos; actualmente `/api/booking-request` solo envía correos.
- La integración con Stripe existente se mantiene sin cambios.
