# Aplicación de conductores — Pimentel Transportation LLC

## Objetivo
Aplicación web instalable (PWA) para iPhone y Android, con control exclusivo del administrador sobre las asignaciones.

## Roles y permisos
- Administrador: crea, suspende y elimina cuentas de conductores; revisa y aprueba reservas; asigna, reasigna y cancela viajes; consulta historial.
- Conductor: inicia sesión; consulta exclusivamente sus viajes asignados; acepta o rechaza asignaciones; actualiza el estado del servicio.
- Cliente: solicita una reserva; nunca puede asignar conductores.

## Flujo
1. Cliente solicita viaje desde la web y calculadora existentes.
2. El servidor registra la solicitud como pendiente y notifica al administrador.
3. Administrador aprueba y asigna un conductor activo.
4. Conductor recibe aviso, acepta o rechaza.
5. Administrador puede reasignar; conductor actualiza: en camino, recogido, completado.
6. Todas las transiciones quedan registradas con fecha, usuario y viaje.

## Seguridad obligatoria antes de publicar
- Autenticación de servidor y contraseñas cifradas con hash robusto; no almacenar contraseñas en GitHub.
- Autorización por rol y por viaje en CADA endpoint, no solo ocultar elementos de la interfaz.
- Base de datos privada y persistente; no guardar datos de clientes en archivos públicos de GitHub Pages.
- Sesiones seguras, HTTPS, protección contra intentos de acceso, validación de entradas y auditoría.
- Invitaciones de conductores gestionadas solo por el administrador.
- Notificaciones sin información sensible en la pantalla bloqueada.

## Instalación
- Manifest web, iconos y service worker para instalar en pantalla de inicio.
- Notificaciones push sujetas a permisos y compatibilidad del navegador; alternativa por correo.
- El sistema actual de Stripe y la web pública deben mantenerse intactos durante el desarrollo.

## Próximas tareas
1. Inspeccionar rutas y servidor existentes para identificar integración segura de reservas.
2. Elegir almacenamiento persistente y esquema de usuarios, viajes y asignaciones.
3. Implementar endpoints con autorización y pruebas.
4. Construir panel administrador y panel conductor.
5. Implementar PWA, notificaciones y pruebas de instalación en iOS y Android.
6. Validar en entorno de prueba antes de publicar.

## Estado actualizado el 27 de octubre de 2026 (Boston)
Primera versión de pruebas activada en Render y verificada contra su PostgreSQL.
Acceso administrativo con sesión HttpOnly, cuentas/suspensión de conductores,
creación/aprobación/asignación, rechazo/reasignación, inicio/finalización,
liberación/cancelación administrativa y auditoría.
PWA con iconos y pantalla sin conexión, preparada para probar en teléfonos.
Siete pruebas locales pasan y el flujo HTTP completo se verificó en Render.

La web y los pagos públicos permanecen separados. La integración automática con
reservas de producción, almacenamiento permanente, recuperación de contraseña,
notificaciones y validación en teléfonos siguen pendientes antes de uso real.
Estado operativo y guía: dispatch/ADMIN_ACCESS.md y dispatch/RENDER_SETUP.md.

Recepción automática de pruebas completada: /solicitar calcula la tarifa y guarda
una solicitud pendiente visible en el panel. Incluye notas, pasajeros, pago e
idempotencia. Desplegada y comprobada en Render, sin correos ni cobros.
La conexión de la página pública y el paso a almacenamiento permanente siguen
pendientes antes de introducir datos reales.
