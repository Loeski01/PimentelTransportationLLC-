# Paso de pruebas a operación real

Estado al 27 de octubre de 2026 (Boston): beta funcional separada de producción.
Diecisiete pruebas locales y verificaciones HTTP en Render aprobadas.

## Preparado
- Administrador con cookie HttpOnly, origen, CSRF, límites de login y logout.
- Conductores con roles, suspensión, restablecimiento de contraseña y revocación.
- Solicitudes pendientes, aprobación, asignación, rechazo, liberación, cancelación,
  inicio y finalización con auditoría y transacciones.
- Ingesta web con tarifa verificada, metadatos, horario de Boston e idempotencia.
- Navegación a recogida y destino mediante el mapa elegido, con enlaces sin datos financieros.
- Portal con actualización automática mientras está abierto, contacto del pasajero
  restringido a asignaciones aceptadas y recursos PWA sin cachear viajes.

## Próxima decisión de infraestructura
La base gratuita actual expira el 26 de noviembre de 2026.
Propuesta: una base de producción Render Postgres mínima de 256 MB y 1 GB,
en Oregón, separada de la base de pruebas, sin réplicas ni crecimiento automático.
Presupuesto que debe autorizar el propietario: hasta USD 7 al mes para esa base,
antes de impuestos. Comprobar el precio final en Render antes de contratar.
No se ha creado ni contratado la base de pago.

Referencias consultadas:
- https://render.com/pricing
- https://render.com/articles/heroku-vs-vercel
- https://render.com/docs/postgresql-backups

El servidor web se mantiene en su plan actual por ahora. Una mejora de servidor
o cargos variables no quedan incluidos en la propuesta de presupuesto de la base.

## Antes de conectar la página pública
- Crear/configurar la base permanente con acceso externo bloqueado y verificar backups.
- Preparar configuración y esquema de producción separados; no mover clientes a la base de prueba.
- Cola de correo y reintentos implementados y probados con proveedor simulado. Falta activar configuración de Brevo y comprobar entrega autorizada; los envíos reales siguen desactivados en pruebas.
- Conexión checkout-viaje y confirmación firmada preparada y probada con Stripe simulado. Stripe está conectado a la cuenta real; falta autorizar el sandbox, probarlo y configurar su webhook. Revisar también los pagos rápidos y propinas antes de conectar la web pública.
- Probar con el propietario instalación y operación en iPhone/Android.
- Revisar despliegue y reversión, y entonces conectar la web de producción.

Main, Stripe, Brevo y el sitio público siguen sin cambios de esta beta.
