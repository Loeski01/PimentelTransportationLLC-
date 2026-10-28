# Render — estado operativo de pruebas

Actualizado el 27 de octubre de 2026 (Boston).
Servicio separado: pimentel-dispatch-test, srv-dbggcu6k1f9s73e81m00.
Workspace autorizado: My Workspace, tea-dbec85m7bikc73fvfb7g.
Rama: feature/driver-dispatch-app, despliegues automáticos desactivados.
Commit desplegado: 029a4553cee618899b5d9a54ffd404ebd0c29e83.
Deploy dep-dbgkeao8v5cc73fuih1g confirmado live.

PostgreSQL interno pimentel_dispatch_dev: esquema de cinco tablas verificado.
La base bloquea conexiones externas; no abrir la lista de IP.
La migración inicial ya se aplicó y el permiso de migración temporal quedó desactivado.
No repetir migraciones ni crear rutas públicas para ejecutarlas.

La configuración de acceso administrativo quedó guardada sin exponer secretos.
ENABLE_DISPATCH=true y DISPATCH_SECURITY_REVIEWED=true están activos en el servicio
separado de pruebas. El servicio de producción sigue en main y no fue modificado.

Pruebas HTTP reales pasaron: administrador, roles, creación y suspensión de conductores,
creación/aprobación/asignación de viajes, aislamiento, rechazo, reasignación,
inicio/finalización, liberación, cancelación y revocación de sesiones.
Páginas y recursos PWA devuelven HTTP 200; API privada anónima devuelve HTTP 401.
Dos viajes y dos cuentas ficticias permanecen identificados como PRUEBA AUTOMÁTICA;
las cuentas ficticias están suspendidas.

No usar datos reales: base gratuita temporal, expira 26 de noviembre de 2026.
Antes de producción: almacenamiento persistente con backups, integración de reservas,
recuperación de contraseñas, revisión operacional y pruebas en teléfonos.
Consultar ADMIN_ACCESS.md para el uso y las limitaciones.
