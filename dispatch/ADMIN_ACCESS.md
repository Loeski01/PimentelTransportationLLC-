# Pimentel App — acceso y operación de pruebas

Estado: habilitada y verificada en Render el 27 de octubre de 2026 (Boston).
Servicio: pimentel-dispatch-test. Rama: feature/driver-dispatch-app.
Commit funcional desplegado: 029a4553cee618899b5d9a54ffd404ebd0c29e83.
Despliegue: dep-dbgkeao8v5cc73fuih1g, confirmado live.

Panel administrador: https://pimentel-dispatch-test.onrender.com/despacho
Portal conductores: https://pimentel-dispatch-test.onrender.com/conductores/
Correo administrador: cesarloeski17@gmail.com.
La contraseña generada se entrega al propietario en su archivo privado,
fuera del repositorio. No guardar contraseñas ni hashes en GitHub.

## Uso
1. Entrar al panel con la cuenta administrativa.
2. Agregar un conductor y establecer su contraseña inicial (mínimo 12 caracteres).
3. Entregarle su propia cuenta y el enlace del portal de conductores.
4. Crear un viaje, aprobarlo y elegir el conductor.
5. El conductor acepta o rechaza; si rechaza, puede reasignarse.
6. Tras aceptar, el conductor inicia y completa el viaje.
7. El administrador puede liberar la asignación para reasignarla o cancelar
   antes de iniciar. No se retiran viajes en curso mediante estos botones.
8. Suspender una cuenta revoca las sesiones; sus viajes deben revisarse manualmente.

## Verificado
- Cinco pruebas automatizadas locales pasan, con PostgreSQL embebido PGlite.
- En Render: login de administrador y conductores; bloqueo anónimo;
  aislamiento entre conductores; rechazo/reasignación/aceptación/inicio/finalización;
  bloqueo de doble finalización; liberación/cancelación; revocación al suspender;
  cierre de sesión administrativo y carga de páginas, manifest, iconos y service worker.
- Quedaron dos viajes marcados PRUEBA AUTOMÁTICA y dos conductores ficticios suspendidos.
- Dependencias: npm audit y build Render reportaron cero vulnerabilidades conocidas.

## Límites actuales
- Esta es una versión de pruebas; no introducir datos reales de clientes.
- La web pública, pagos, correos y solicitudes existentes siguen separados.
  La importación automática de reservas de producción aún no está conectada.
- La base gratuita temporal pimentel-dispatch-dev vence el 26 de noviembre de 2026.
  Antes de producción se requiere almacenamiento persistente con copias de seguridad.
- Sesiones administrativas y límites de intentos en memoria: una sola instancia;
  reiniciar el servicio cierra las sesiones administrativas.
- Recuperación de contraseña y notificaciones push pendientes.
- Instalación física en iPhone/Android pendiente de prueba por el propietario.
  El service worker solo almacena iconos y pantalla sin conexión; nunca viajes ni API.

## Configuración privada
DISPATCH_ADMIN_EMAIL, DISPATCH_ADMIN_PASSWORD_HASH (scrypt salt:hash),
DISPATCH_ORIGIN y DATABASE_URL se administran en Render.
ENABLE_DISPATCH=true y DISPATCH_SECURITY_REVIEWED=true habilitan solo este entorno
verificado; el código exige la base pimentel_dispatch_dev.
DISPATCH_ADMIN_TOKEN está vacío y ya no autentica.
