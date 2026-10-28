# Render — estado operativo de pruebas

Actualizado el 27 de octubre de 2026 (Boston).
Servicio separado: pimentel-dispatch-test, srv-dbggcu6k1f9s73e81m00.
Workspace autorizado: My Workspace, tea-dbec85m7bikc73fvfb7g.
Rama: feature/driver-dispatch-app, despliegues automáticos desactivados.
Commit desplegado: 04fdc1ba0d838b9433bd353c9b3c2da28b15b91f.
Deploy dep-dbglj1egekts73899660 confirmado live.

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

ENABLE_DISPATCH_BOOKING_INTAKE=true habilita el formulario /solicitar y el guardado
pendiente en /api/booking-request en este servicio separado. El arranque privado
verifica current_database() y añade request_metadata si falta. No borra datos.
El flujo de pruebas no envía correo ni cobra. La producción permanece en main.
Probado en Render: cotización real, persistencia, metadatos y reenvío sin duplicado.

Acceso actualizado: contraseña de administrador elegida desde el panel y persistida
en admin_credentials. DISPATCH_ADMIN_PASSWORD_HASH solo inicializa la cuenta si aún
no existe; reiniciar o actualizar no restablece la clave elegida.
Los conductores usan PIN de cuatro dígitos y bloqueo temporal persistente por cuenta.
El arranque privado agrega pin_configured, failed_pin_attempts y pin_locked_until a
drivers y revoca sesiones de cuentas antiguas sin PIN. Sus PIN los asigna el propietario.
No se realizaron contrataciones ni cambios a planes de pago en esta actualización.

Última preparación de avisos y pagos: los registros de notificación se guardan en dispatch_notifications. Los envíos reales están desactivados mediante ENABLE_DISPATCH_EMAIL_NOTIFICATIONS=false. Los avisos quedan registrados como suppressed en las pruebas.

La conexión checkout-viaje y el webhook firmado están disponibles detrás de ENABLE_DISPATCH_PAYMENTS=false; no se habilitaron cobros. Para probarla, configurar Stripe de pruebas y STRIPE_DISPATCH_WEBHOOK_SECRET por un canal privado, y configurar el endpoint /api/dispatch/stripe/webhook. No se aceptan claves sk_live en el entorno de desarrollo.

Se requieren conexión autorizada de Stripe y una prueba de sandbox antes de activar esta parte. Los pagos de la web pública permanecen separados. No se crearon planes de pago ni se modificó la base de producción.

Despliegue de preparación de pagos confirmado live: 04fdc1ba0d838b9433bd353c9b3c2da28b15b91f, dep-dbglj1egekts73899660. Dieciséis pruebas automatizadas aprobadas. Avisos en Render: solicitud guardada una sola vez, dos avisos persistidos como desactivados y endpoint privado bloqueado sin login. Stripe ya está instalado y conectado a PimentelTransportationLLC; la lista de cuentas solo devuelve livemode=true. Falta acceso al entorno de prueba. No pedir claves por chat.

La versión de preparación aislada con Stripe SDK 23.0.1 quedó live en dep-dbglj1egekts73899660 (commit 04fdc1ba0d838b9433bd353c9b3c2da28b15b91f). Diecisiete pruebas aprobadas; npm audit de dependencias de producción sin vulnerabilidades. Se confirmó en Stripe una sola cuenta: PimentelTransportationLLC, livemode=true. Se entregó enlace de gestión de permisos para habilitar un entorno de prueba; no se cambió el modo de la cuenta ni se ejecutaron cobros. No crear sesiones reales para probar. Esperar confirmación de que el usuario terminó los cambios de permisos antes de volver a sincronizar la lista de cuentas.
