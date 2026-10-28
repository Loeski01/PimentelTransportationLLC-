# Acceso administrativo — desarrollo

Implementado: login por correo y contraseña con scrypt, cookie de sesión
HttpOnly/Secure/SameSite=Strict, expiración de una hora, verificación de origen,
CSRF, límites de intentos y cierre de sesión con revocación.
El token administrativo anterior ya no concede acceso a la API.

Configurar solo en el servicio separado pimentel-dispatch-test:

- DISPATCH_ADMIN_EMAIL: correo del administrador.
- DISPATCH_ADMIN_PASSWORD_HASH: salt hexadecimal de 16 bytes, dos puntos y
  resultado hexadecimal de scrypt de 64 bytes. Usar contraseña única de 12–128 caracteres.
- DISPATCH_ORIGIN: origen HTTPS exacto del servicio de pruebas, sin barra final.

No guardar contraseñas, hashes ni conexiones privadas en GitHub o en el chat.
DISPATCH_ADMIN_TOKEN deja de ser necesario y debe retirarse de la configuración.
Mantener ENABLE_DISPATCH=false hasta verificar configuración y pruebas de integración.
DISPATCH_SECURITY_REVIEWED sigue siendo una barrera independiente; este cambio
no constituye una auditoría completa ni autoriza uso con clientes reales.

Las sesiones se guardan en memoria del servidor, caducan al reiniciar y requieren
una sola instancia. Antes de escalar, usar un almacén compartido de sesiones.
El límite de intentos también es local a la instancia; no se confía en cabeceras
de IP de proxy proporcionadas por el visitante.

Panel: /despacho. Permite registrar y suspender/reactivar conductores, crear
viajes, aprobarlos y asignarlos. Suspender revoca las sesiones del conductor,
pero no reasigna sus viajes automáticamente; revisar sus asignaciones.

Generar el hash desde entrada estándar privada con node dispatch/hash-admin-password.js; no pasar la contraseña como argumento. El resultado es sensible y se guarda solo en Render.

Validación local: npm ci y npm run test:dispatch. Pruebas HTTP de credenciales,
sesión, origen, CSRF, logout, expiración y límites de intentos.
Flujo de viajes verificado localmente con PostgreSQL embebido PGlite y datos ficticios.
Pendiente: verificar la conexión y el flujo contra PostgreSQL en Render,
probar instalación y operación en iPhone/Android y completar recuperación de contraseña.
PWA: manifest, iconos y service worker preparados. Solo se cachean iconos y pantalla sin conexión; nunca respuestas de la API ni viajes. No hay notificaciones push todavía.
No se ha desplegado ni habilitado este cambio en Render.
