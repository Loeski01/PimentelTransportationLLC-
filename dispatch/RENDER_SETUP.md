# Render — puesta en marcha de Dispatch (desarrollo)

## Estado verificado el 27 de octubre de 2026
- PostgreSQL 18: `pimentel-dispatch-dev` (Render, Oregón), estado `available`.
- Plan gratuito temporal, expira el 26 de noviembre de 2026.
- La base bloquea conexiones externas: lista de IP permitidas vacía. No se han ejecutado migraciones.
- Servicio web actual sigue en `main`, no se ha desplegado esta rama.

## Preparación pendiente
1. Servicio web **separado de pruebas** ya creado: `pimentel-dispatch-test`, conectado a `feature/driver-dispatch-app`. El servicio público permanece en `main`. El despliegue de pruebas no es automático.
2. Configurar en el servicio de pruebas `DATABASE_URL` con la URL interna de Render; nunca copiarla a GitHub.
3. Configurar `DISPATCH_ADMIN_TOKEN` con secreto aleatorio de al menos 32 caracteres. No incrustarlo en frontend ni compartirlo con conductores.
4. Ejecutar `dispatch/schema.sql` en la base privada por un canal de administración autorizado.
5. Configurar `ENABLE_DISPATCH=true` **solo** después de migrar y probar permisos. En producción mantenerlo apagado hasta auditoría.
6. Verificar autenticación, errores, sesiones, aislamiento por conductor, asignaciones concurrentes, protección ante intentos de login, revocación y recuperación.
7. Configurar almacenamiento persistente de solicitudes de reserva antes de ofrecer asignaciones reales.

## Riesgos y pendientes antes de uso real
- El login tiene un límite básico de intentos por IP en memoria, pero requiere pruebas y endurecimiento antes de uso real; no hay recuperación de contraseña.
- Existe un prototipo de panel visual en `/despacho`, aún sin probar y no apto para producción.
- La PWA no tiene iconos ni service worker; no se debe prometer instalación completa.
- Los estados de viaje, auditoría y reasignación requieren pruebas y más lógica.
- **Bloqueo de seguridad:** el prototipo `/despacho` solicita el token de administrador en el navegador. Antes de usarlo con datos reales, sustituirlo por autenticación administrativa segura con sesión y cookies HttpOnly; no introducir un token de producción en el prototipo.
- Base gratuita temporal: migrar a almacenamiento persistente con copias de seguridad antes de guardar datos de clientes reales.
