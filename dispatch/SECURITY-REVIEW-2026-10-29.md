# Revisión de seguridad — 29 octubre 2026

## Estado comprobado
- Render `pimentel-dispatch-test` está LIVE, pero ejecuta `node server.js` en `feature/driver-dispatch-app`; **no es el backend nuevo** de `dispatch/`.
- PostgreSQL `pimentel-dispatch-dev` está disponible. Los logs de la versión antigua comprueban sus tablas antiguas, **no** `dispatch_trips`, `dispatch_drivers` y `dispatch_audit`.
- No modificar servicio principal, cobros, reservas, ni permitir IP externas a PostgreSQL.

## Antes de desplegar
1. Revisar y probar `dispatch/` aislado, con `npm run check` y pruebas de autorización.
2. Añadir bloqueo por conductor después de intentos fallidos (el limitador global de 5 intentos/15 minutos no sustituye un bloqueo individual). Evitar que un atacante bloquee indiscriminadamente otros usuarios.
3. Configurar secretos de sesión y hash de contraseña de administrador únicamente en Render; nunca compartir contraseña en chat ni guardar secretos en GitHub.
4. Aplicar `dispatch/schema.sql` solamente a `pimentel-dispatch-dev` por conexión interna protegida.
5. Cambiar la configuración de **pruebas** para usar rama revisada, root `dispatch`, build `npm install`, start `npm start`; nunca desplegar la rama antigua como si fuera la nueva app.
6. Comprobar `/ready`, login, expiración, permisos por rol, auditoría, cancelaciones y aislamiento entre conductores.
7. Verificar que ninguna respuesta de conductor contenga `fare_cents` ni datos de pago.
8. No conectar reservas ni pagos reales hasta completar pruebas y aprobación del propietario.

## Problemas encontrados en interfaz
- La interfaz solo ofrece enlace a Google Maps para recogida; añadir opciones Apple Maps/Waze y navegación al destino.
- El cartel abre una ventana nueva: verificar en Safari iPhone y evitar bloqueo de ventanas emergentes.
- Los cambios de estado del conductor requieren etiquetas españolas y confirmaciones de acciones irreversibles.
- El sistema todavía no envía confirmaciones automáticas al cliente.

**Resultado:** revisión preparatoria; NO se declara lista para producción.
