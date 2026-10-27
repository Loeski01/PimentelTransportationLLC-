# API de despacho — rama de desarrollo (no desplegada para uso real)

Base: `/api/dispatch`. Esta API solo se monta con `ENABLE_DISPATCH=true`, `DATABASE_URL` y `DISPATCH_ADMIN_TOKEN` configurados. En Render, el servicio separado de pruebas permanece con despacho desactivado. **No utilizar con datos reales antes de pruebas y autenticación administrativa segura.**

## Acceso
- `POST /login`: correo y contraseña de conductor; devuelve token temporal de 12 horas.
- `POST /logout`: conductor autenticado; invalida la sesión.
- Las demás rutas exigen `Authorization: Bearer <token>`; el servidor valida identidad y rol.
- La clave global `DISPATCH_ADMIN_TOKEN` es **solo provisional para llamadas desde un backend de confianza**. No introducirla en el navegador. El panel `/despacho` está bloqueado hasta sustituirla por autenticación segura.

## Endpoints implementados en código (aún sin pruebas de integración)

| Método | Ruta | Permiso | Acción |
|---|---|---|---|
| POST | /drivers | administrador | Crear conductor con contraseña cifrada mediante scrypt |
| GET | /drivers | administrador | Listar conductores |
| PATCH | /drivers/:id | administrador | Activar o desactivar; al desactivar revoca sesiones |
| POST | /bookings | administrador | Crear viaje manual; no modifica las reservas públicas |
| GET | /bookings | administrador | Listar hasta 200 viajes |
| POST | /bookings/:id/approve | administrador | Aprobar viaje pendiente |
| POST | /bookings/:id/assign | administrador | Ofrecer viaje aprobado a conductor activo |
| GET | /my-assignments | conductor | Consultar solo asignaciones propias y estado del viaje |
| POST | /my-assignments/:id/respond | conductor asignado | Responder con `{"status":"accepted"}` o `{"status":"rejected"}` |
| POST | /my-assignments/:id/start | conductor asignado | Iniciar viaje aceptado |
| POST | /my-assignments/:id/complete | conductor asignado | Completar viaje iniciado |
| POST | /logout | conductor | Cerrar sesión actual |

## Transiciones y controles
- Viaje: `pending → approved → assigned → in_progress → completed`.
- Oferta: `offered → accepted → completed` o `offered → rejected`.
- Si el conductor rechaza, el viaje vuelve a `approved` para otra asignación.
- El inicio y la finalización verifican que el conductor sea el titular de una asignación aceptada.
- Las operaciones de asignación, inicio y finalización utilizan transacciones y auditoría.
- El navegador del conductor conserva el token únicamente en memoria; al recargar deberá iniciar sesión otra vez.

## Pendientes antes de activar
1. Autenticación administrativa con sesión segura y cookies HttpOnly; reemplazar el token administrativo introducido en navegador.
2. Conectar la base PostgreSQL **de desarrollo**, aplicar migración protegida y verificar tablas.
3. Probar permisos, aceptación/rechazo, inicio/finalización, revocación de sesiones y errores de concurrencia.
4. Realizar pruebas desde iPhone y validar controles de producción, copias de seguridad y límites de solicitudes.

**No implementado:** reasignación directa mediante `/bookings/:id/reassign`, recuperación de contraseñas y sincronización automática con las reservas públicas. No se ha modificado el sistema existente de reservas, calculadora o Stripe.
