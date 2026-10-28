# Render — puesta en marcha de Dispatch (desarrollo)

## Avance posterior: acceso administrativo y pruebas locales
- Implementado login administrativo con cookie HttpOnly, scrypt, origen y CSRF.
- Configuración nueva y límites: consultar ADMIN_ACCESS.md. El token administrativo antiguo ya no autentica.
- Panel de pruebas permite agregar, suspender/reactivar conductores y gestionar asignaciones.
- Pruebas locales pasan con PostgreSQL embebido PGlite: aislamiento, rechazo, reasignación, aceptación, inicio, finalización, auditoría y revocación de sesiones al suspender.
- Esto no confirma un despliegue en Render ni una prueba contra su PostgreSQL.
- Se retiró nodemailer: el servidor utiliza Brevo HTTPS y no lo importa. Se añadió lockfile y dependencia de desarrollo para las pruebas.
- Mantener ENABLE_DISPATCH=false hasta completar revisión y configuración del entorno de pruebas.

## Historial verificado el 27 de octubre de 2026
- PostgreSQL 18: `pimentel-dispatch-dev` (Render, Oregón), base `pimentel_dispatch_dev`.
- Plan gratuito temporal: expira el 26 de noviembre de 2026; no guardar datos reales de clientes.
- La base bloquea conexiones externas; **no abrir la lista de IP para probarla**.
- Servicio separado `pimentel-dispatch-test`, rama `feature/driver-dispatch-app`, primer despliegue `live`. Despliegue automático desactivado; los commits posteriores requieren despliegue manual.
- Render confirmó por logs `DATABASE_URL` configurada, conexión a PostgreSQL correcta y `ENABLE_DISPATCH=false`.
- La migración de desarrollo se ejecutó y verificó; la página pública de producción sigue separada y no debe modificarse.

## Resultado comprobado de la base de pruebas
- 27 de octubre de 2026: conexión interna PostgreSQL confirmada con nombre `pimentel_dispatch_dev`.
- Migración de desarrollo ejecutada correctamente; verificación posterior `ready: true`, cinco tablas encontradas, ninguna faltante.
- Se deshabilitó el permiso temporal de migración cambiando `DISPATCH_MIGRATION_TARGET` a `disabled`; reinicio posterior completado sin ejecutar migración.
- `ENABLE_DISPATCH=false` permanece vigente; el despacho no está habilitado para clientes reales.
- En ese momento seguía pendiente la autenticación administrativa; ver avance posterior arriba.
- Ese despliegue reportó una vulnerabilidad alta; nodemailer se retiró posteriormente de esta rama.
- Las operaciones de creación y aprobación de reservas guardan auditoría en la misma transacción; aún falta probarlas con datos ficticios.
- Se añadió una barrera `DISPATCH_SECURITY_REVIEWED=true` obligatoria antes de activar el despacho, además de la configuración administrativa y la validación del nombre de la base.
- El portal de conductores mantiene el token solo en memoria; no se persiste en `localStorage`.
- La última instalación del 27 de octubre está pendiente de confirmación; verificar estado de Render antes de declarar la versión instalada.

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
3. Configurar DISPATCH_ADMIN_EMAIL, DISPATCH_ADMIN_PASSWORD_HASH y DISPATCH_ORIGIN según ADMIN_ACCESS.md; retirar DISPATCH_ADMIN_TOKEN.
4. Ejecutar `dispatch/schema.sql` en la base privada por un canal de administración autorizado.
5. Configurar `ENABLE_DISPATCH=true` **solo** después de migrar y probar permisos. En producción mantenerlo apagado hasta auditoría.
6. Verificar autenticación, errores, sesiones, aislamiento por conductor, asignaciones concurrentes, protección ante intentos de login, revocación y recuperación.
7. Configurar almacenamiento persistente de solicitudes de reserva antes de ofrecer asignaciones reales.

## Riesgos y pendientes antes de uso real
- El login tiene un límite básico de intentos por IP en memoria, pero requiere pruebas y endurecimiento antes de uso real; no hay recuperación de contraseña.
- Existe un prototipo de panel visual en `/despacho`, aún sin probar y no apto para producción.
- La PWA ahora tiene manifest, iconos, service worker y pantalla sin conexión. Instalación en dispositivos pendiente de prueba tras desplegar.
- Los estados de viaje, auditoría y reasignación requieren pruebas y más lógica.
- `/despacho` ahora utiliza sesión HttpOnly; falta configurar y validar la versión en el entorno de pruebas. No utilizar datos reales todavía.
- Base gratuita temporal: migrar a almacenamiento persistente con copias de seguridad antes de guardar datos de clientes reales.

