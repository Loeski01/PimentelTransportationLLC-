# Pimentel Transportation — prototipo de despacho

Esta carpeta es un prototipo independiente, NO está conectado a reservas reales ni a producción.

## Flujo
1. El administrador crea un viaje y selecciona manualmente un conductor.
2. El conductor ve únicamente los viajes asignados y puede abrir el mapa o el cartel.
3. Las tarifas solo se muestran en la vista administrativa.

## Seguridad pendiente antes de producción
- Autenticación del administrador con contraseña y hash seguro en servidor.
- PIN de 4 dígitos por conductor, almacenado como hash; límites de intentos y bloqueo temporal.
- Autorización en el servidor por rol y por conductor; jamás enviar tarifas en las respuestas a conductores.
- Base de datos, auditoría de asignaciones, notificaciones, HTTPS y pruebas de acceso.
- Integración con reservas solo después de pruebas y aprobación.

Archivos: `cartel.html` (prototipo de cartel) y `despacho-demo.html` (demostración local sin datos reales).
