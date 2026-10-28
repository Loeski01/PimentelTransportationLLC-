# Pimentel App — acceso y operación de pruebas

Estado: habilitada y verificada en Render el 27 de octubre de 2026 (Boston).
Servicio: pimentel-dispatch-test. Rama: feature/driver-dispatch-app.
Commit funcional desplegado: ab28edb373186a249401ea920e994e23502bcacc.
Despliegue: dep-dbglrsec6qcc73c24mag, confirmado live.

Panel administrador: https://pimentel-dispatch-test.onrender.com/despacho
Portal conductores: https://pimentel-dispatch-test.onrender.com/conductores/
Correo administrador: cesarloeski17@gmail.com.
La contraseña generada se entrega al propietario en su archivo privado,
fuera del repositorio. No guardar contraseñas ni hashes en GitHub.

## Uso
1. Entrar al panel con la cuenta administrativa.
2. Agregar un conductor y establecer su PIN inicial de exactamente 4 dígitos.
3. Entregarle su propia cuenta y el enlace del portal de conductores.
4. Crear un viaje, aprobarlo y elegir el conductor.
5. El conductor acepta o rechaza; si rechaza, puede reasignarse.
6. Tras aceptar, el conductor inicia y completa el viaje.
7. El administrador puede liberar la asignación para reasignarla o cancelar
   antes de iniciar. No se retiran viajes en curso mediante estos botones.
8. Suspender una cuenta revoca las sesiones; sus viajes deben revisarse manualmente.

## Verificado
- Veinte pruebas automatizadas locales pasan, con PostgreSQL embebido PGlite.
- En Render: login de administrador y conductores; bloqueo anónimo;
  aislamiento entre conductores; rechazo/reasignación/aceptación/inicio/finalización;
  bloqueo de doble finalización; liberación/cancelación; revocación al suspender;
  cierre de sesión administrativo y carga de páginas, manifest, iconos y service worker.
- Quedaron dos viajes marcados PRUEBA AUTOMÁTICA y dos conductores ficticios suspendidos.
- Dependencias: npm audit y build Render reportaron cero vulnerabilidades conocidas.

## Límites actuales
- Esta es una versión de pruebas; no introducir datos reales de clientes.
- La web pública, pagos, correos y solicitudes existentes siguen separados.
  La recepción automática de pruebas ya funciona en /solicitar. La página pública de producción aún no está conectada a este entorno.
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

## Recepción automática de solicitudes de prueba
Formulario: https://pimentel-dispatch-test.onrender.com/solicitar
La tarifa se verifica de nuevo en el servidor; la solicitud se guarda pendiente.
Pasajeros, notas y pago se guardan en request_metadata; se muestran al administrador.
Un identificador de solicitud evita duplicados si se reenvía el mismo formulario.
Las fechas se interpretan en America/New_York. Se rechazan horas inexistentes o
ambiguas por cambio de horario para evitar desplazar una recogida silenciosamente.
Este flujo de pruebas no envía correos ni procesa cobros. La producción conserva
su flujo existente de Stripe/Brevo sin cambios.
Verificación HTTP real: cotización de Logan a Woburn, recepción, reenvío sin duplicar
y comprobación de una sola solicitud pendiente con notas en la bandeja privada.
Quedó una solicitud PRUEBA WEB pendiente para que el propietario pueda inspeccionarla.
La instalación habilita una columna JSONB de manera aditiva y solo después de
comprobar el nombre de la base interna pimentel_dispatch_dev. No hay ruta pública de migración.

## Mejoras operativas posteriores
- Actualización automática cada 30 segundos mientras la pantalla está visible,
  con sesión activa y conexión. Evita peticiones superpuestas y no reemplaza
  una selección de conductor o una contraseña mientras el administrador escribe.
  Esto no equivale a notificaciones push con la app cerrada.
- Nombre, teléfono, pasajeros y notas visibles al conductor solo mientras su
  asignación está aceptada. Después de cancelar, retirar o completar, se ocultan
  los datos de contacto del pasajero. No se revela el correo al conductor.
- El administrador puede restablecer la contraseña de un conductor. Se guarda
  un hash scrypt, se revocan sus sesiones y queda constancia en auditoría.
- Fechas mostradas en horario de Boston y creación manual con validación de
  cambio de horario. Tarifas visibles en el panel y estados en español.
- El formulario del sitio público queda preparado en esta rama para enviar
  un requestId estable en reintentos; main no fue modificado. La solicitud
  heredada de seis o más pasajeros se conserva como tal para revisión manual.

La verificación HTTP posterior también confirmó contacto tras aceptar y restablecimiento de contraseña con revocación de sesiones. Las cuentas ficticias de esa verificación quedaron suspendidas.

## Contraseñas elegidas por el propietario y PIN de conductores
Administrador: entrar al panel y usar Mi contraseña de administrador. Se verifica
la contraseña actual y se pide la nueva dos veces (12–128 caracteres). El hash se
guarda en admin_credentials, no en el navegador. Cambiarla revoca las sesiones.
La inicialización no sustituye una contraseña ya elegida aunque se vuelva a desplegar.
La contraseña inicial del archivo privado deja de ser válida después del cambio.
No pedir la nueva contraseña al propietario por el chat ni introducirla por él.

Conductores: correo más PIN de exactamente cuatro dígitos, incluidos ceros iniciales.
Se guardan hashes scrypt con sal única, nunca PIN en texto. Cinco intentos fallidos
bloquean temporalmente esa cuenta durante 15 minutos; el bloqueo persiste al reiniciar.
El administrador puede restablecer el PIN y desbloquear la cuenta.
Las cuentas anteriores sin PIN configurado requieren asignarlo desde el panel;
no se les asigna un PIN por defecto. Sus sesiones anteriores quedan revocadas.
La contraseña administrativa mantiene requisitos independientes del PIN del chofer.

La tabla privada admin_credentials se añade al esquema de pruebas durante el arranque,
comprobando el nombre real de la base antes de crearla. No hay migración pública.

Verificación real en Render: administrador puede entrar, formulario de clave propia disponible, PIN 0123 conserva el cero inicial, PIN corto rechazado y restablecimiento a otro PIN invalida el anterior y sus sesiones. La cuenta ficticia fue suspendida. No se cambió la contraseña personal del propietario durante las pruebas. Solo conductores activos con PIN configurado pueden recibir nuevas asignaciones.

## Navegación del conductor
Después de aceptar un viaje activo aparecen Ir a recoger al pasajero e Ir al destino, con selección de Google Maps, Apple Maps o Waze. Los enlaces se abren solo al pulsarlos y llevan únicamente la dirección de esa etapa; no incluyen precio, propina, referencia ni datos del pasajero. No se solicita geolocalización desde Pimentel: el mapa elegido maneja la ubicación y los permisos. Se ocultan en asignaciones rechazadas, retiradas, canceladas o completadas. La actualización automática no interrumpe la selección de mapa.

Pruebas: enlaces codificados para las dos etapas y los tres proveedores, estados sin navegación y lista cerrada de campos del API de conductores sin datos financieros. La apertura nativa de cada aplicación requiere prueba física en el teléfono del propietario.

## Avisos duraderos por correo
La solicitud web y sus avisos al administrador/cliente se guardan en la misma transacción; la asignación guarda su aviso al chofer en su propia transacción. Cada aviso tiene una clave única para no crearlo dos veces. El panel incluye estado y reintento administrativo con auditoría.

En esta beta ENABLE_DISPATCH_EMAIL_NOTIFICATIONS=false: se registran como desactivados, no se envían correos y los reintentos están bloqueados. Antes de activar envíos reales se requieren configuración privada de Brevo y prueba de entrega autorizada. La confirmación del proveedor no equivale a entrega en la bandeja del destinatario.

El proceso retoma avisos pendientes tras reiniciar y reintenta rechazos temporales. Una aceptación incierta, un fallo de guardado después de aceptar el proveedor o una interrupción antigua requieren revisar el registro de Brevo antes de reenviar. Los avisos de asignaciones retiradas, aceptadas o canceladas se omiten. El correo al chofer solo anuncia la asignación y enlaza al portal: no contiene ruta, datos del pasajero, precio ni propina.

La retención de la clave de idempotencia de Brevo es limitada; no se promete entrega exactamente una vez. Los errores no se registran con datos personales ni credenciales. En servidor gratuito, los reintentos pueden demorarse si el servicio se suspende por inactividad.

## Enlace de pagos y viajes preparado (desactivado en esta beta)
ENABLE_DISPATCH_PAYMENTS=false mantiene la nueva conexión apagada. Para probarla
se necesitan una clave Stripe de prueba y STRIPE_DISPATCH_WEBHOOK_SECRET guardadas
privadamente en Render. El arranque rechaza claves reales en este entorno.
La ruta /api/dispatch/stripe/webhook verifica el cuerpo original con la firma Stripe;
no usa la redirección del navegador como prueba de pago.

El formulario unificado queda preparado en esta rama para enviar el viaje completo
al abrir Stripe. El nuevo flujo guarda la solicitud primero, usa una clave estable
al reintentar el checkout y verifica importe, moneda y sesión al confirmar el pago.
El importe se calcula en el servidor. Un evento repetido no duplica el registro de
pago y una caducidad tardía no revierte un pago confirmado. El viaje continúa
pendiente de aprobación; el precio, la propina y el estado de pago no se exponen al
conductor. La aprobación de una solicitud marcada para pago con tarjeta exige pago
confirmado por el servidor.

Se probaron eventos firmados con el SDK y checkout simulado, sin solicitudes a la
API de Stripe ni cobros. Falta una prueba real en el sandbox de Stripe y configurar
su endpoint de eventos. El checkout anterior de la web pública sigue separado y
no se alteró su configuración. Los pagos rápidos de la calculadora y las propinas
conservan el flujo previo; deben revisarse antes de conectar la web a producción.

### Configuración independiente de Stripe para el nuevo flujo
La integración nueva usa stripe-dispatch (alias de Stripe SDK 23.0.1) y API
2026-09-30.endive, versión estable comprobada con Stripe CLI 1.55.3 en
/api/versioning. La dependencia stripe 20.4.1 y el cliente que utiliza la web
existente se mantienen separados. No se cambia la versión predeterminada de la
cuenta Stripe ni sus endpoints de producción.

STRIPE_DISPATCH_TEST_KEY permite una clave restringida rk_test_ (recomendada) o
sk_test_ guardada privadamente en Render. El entorno rechaza claves de modo real.
La etiqueta de integración es estable, para que reintentar una sesión no cambie
los parámetros de la clave de idempotencia. No almacenar claves en GitHub ni chat.

Stripe está conectado: cuenta PimentelTransportationLLC, actualmente solo acceso
livemode. Falta habilitar el sandbox o modo de prueba en la autorización de Stripe
antes de realizar pruebas contra la API. La autorización general del usuario no
cambia por sí sola el entorno o los permisos que devuelve Stripe.

## Portal y recorrido del conductor
Los viajes se organizan en Nuevas asignaciones, En servicio, Próximos viajes e Historial. Los próximos se ordenan por hora de recogida y los activos tienen prioridad en la lista del servidor para no quedar ocultos por el historial. El aviso de nuevas asignaciones y la hora de actualización permanecen visibles dentro de la app. No son notificaciones push con la app cerrada.

Después de aceptar: Voy a recoger al pasajero, Llegué al punto de recogida, Pasajero a bordo y Finalizar viaje. Los pasos se validan en servidor, se guardan en la misma transacción que su auditoría y no permiten actualizar viajes ajenos ni omitir etapas. El administrador puede ver el nombre del conductor y su progreso. Los estados en pantalla se muestran en horario de Boston; el conductor sigue sin recibir precios ni propinas.

Se registra la etapa en assignments.trip_stage mediante migración privada y aditiva. Los viajes anteriores en curso continúan en En camino y el historial completado se conserva; repetir la migración no restablece etapas ya registradas. También se contempla un cliente anterior que inicie un viaje durante el cambio de versión.

Sin conexión se pueden consultar los datos que ya están en pantalla, pero no se envían cambios ni se simula que quedaron guardados. Solo se ofrece el siguiente paso válido. Una actualización en segundo plano no interrumpe la selección del mapa y las solicitudes no se superponen. El botón Llamar a despacho abre el teléfono del negocio únicamente cuando el conductor lo pulsa.

El recorrido por etapas también se comprobó en Render con un conductor y viaje ficticios. La cuenta de prueba quedó suspendida al terminar. La prueba cubrió bloqueo de pasos omitidos y visibilidad del progreso en el panel administrativo. La apertura nativa de los mapas y la instalación en un teléfono físico siguen pendientes de comprobación por el propietario.
