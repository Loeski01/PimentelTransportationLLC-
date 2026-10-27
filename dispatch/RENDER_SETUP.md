# Render — puesta en marcha de Dispatch (desarrollo)

## Estado verificado el 27 de octubre de 2026
- PostgreSQL 18: `pimentel-dispatch-dev` (Render, Oregón), base `pimentel_dispatch_dev`.
- Plan gratuito temporal: expira el 26 de noviembre de 2026; no guardar datos reales de clientes.
- La base bloquea conexiones externas; **no abrir la lista de IP para probarla**.
- Servicio separado `pimentel-dispatch-test`, rama `feature/driver-dispatch-app`, primer despliegue `live`. Despliegue automático desactivado; los commits posteriores requieren despliegue manual.
- El usuario confirmó que el panel Environment muestra `DATABASE_URL` y `ENABLE_DISPATCH`, con este último configurado como `false`. El aviso verde de Render confirma guardado, **no** conectividad a PostgreSQL.
- No se han ejecutado migraciones ni verificación de tablas. La página pública de producción sigue separada y no debe modificarse.

## Procedimiento seguro de verificación (solo servicio de pruebas)
1. Confirmar en Render que el servicio seleccionado es **pimentel-dispatch-test** y la rama `feature/driver-dispatch-app`; nunca usar el servicio público.
2. Mantener `ENABLE_DISPATCH=false` durante toda la preparación. No colocar credenciales ni URL de base en GitHub, logs o chats.
3. Desplegar manualmente la versión revisada de la rama de pruebas, sin activar despacho.
4. Ejecutar desde un entorno privado dentro de Render con acceso a `DATABASE_URL`: `node dispatch/verify-db.js`. Este comando es **solo lectura**; si informa tablas faltantes, aún no se aplicó el esquema.
5. Solo con autorización para modificar la base **de desarrollo** y después de comprobar el nombre `pimentel_dispatch_dev`, ejecutar `DISPATCH_MIGRATION_TARGET=development node dispatch/migrate.js`. Este comando **crea tablas**; nunca ejecutarlo sobre producción.
6. Repetir `node dispatch/verify-db.js` y confirmar `ready: true` con cinco tablas: `drivers`, `bookings`, `assignments`, `dispatch_audit`, `driver_sessions`.
7. Si el plan o panel de Render no permite ejecutar comandos en el servicio, **detenerse** y preparar un mecanismo de migración aislado; no publicar una ruta HTTP de migración ni abrir la base a Internet.
8. No habilitar `ENABLE_DISPATCH=true` hasta completar seguridad, autenticación administrativa y pruebas. El panel `/despacho` permanece deshabilitado por diseño.

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
