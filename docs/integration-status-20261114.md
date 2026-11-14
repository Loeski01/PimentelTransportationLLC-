# Pimentel — integración publicada el 14 de noviembre de 2026

## Resultado real verificado

La web pública de reservas y el despacho independiente están conectados en producción. PR #14 fusionado en main, commit `4f0522482b2c74b3d8bf2008f62f257628b1f990`. El propietario confirmó expresamente continuar la publicación después de que la revisión automática pidiera confirmación específica.

- Web: https://loeski01.github.io/PimentelTransportationLLC-/
- Administrador/conductores: https://pimentel-dispatch-oregon-staging.onrender.com/panel
- Bandeja: https://pimentel-dispatch-oregon-staging.onrender.com/booking-admin

El host del despacho conserva su nombre histórico para no cambiar los enlaces instalados. Su entorno y base ahora son de producción, verificados mediante comprobación autenticada; no se toma el nombre del host como prueba de entorno.

## Flujo confirmado

1. El cliente calcula la ruta y envía una solicitud con pago al finalizar o coordinación.
2. La solicitud se guarda con referencia única en la base de producción del despacho. La web envía aviso al administrador y correo de solicitud recibida al cliente, indicando que requiere aprobación.
3. En la bandeja, el administrador pulsa «Aceptar y notificar al cliente». El viaje se transfiere y aprueba; el servidor envía correo bilingüe de aceptación y registra el acuse del proveedor.
4. El conductor se asigna manualmente por el administrador. Entrar al panel no aprueba ni asigna reservas automáticamente. Los endpoints del conductor siguen excluyendo tarifas y pagos.

## Prueba sin cobro en las plataformas reales

Referencia: `PT-ED120008DB91F020`.
Nombre ficticio: `PRUEBA SISTEMA - NO ES RESERVA REAL`.
Ruta: Boston Logan Airport, Boston, MA → Cambridge, MA; 20 de noviembre de 2026, 14:00 Boston. Estimado $82.02, sin propina y sin cobro.

Se envió desde la web pública usando como correo del pasajero la dirección empresarial del propietario, para que ningún pasajero real recibiera mensajes de prueba. La web confirmó solicitud recibida y aviso al cliente. La bandeja mostró exactamente la misma referencia y estado inicial pendiente.

Se pulsó el botón de aceptación en el administrador autenticado. Resultado visible: «Reserva aprobada. Correo de aceptación enviado al proveedor; la entrega al buzón del cliente aún puede demorar». Botón posterior: «Aceptación enviada», desactivado para evitar duplicados. Esto demuestra aceptación por el proveedor, no lectura ni entrega final en el buzón.

Se comprobó que el viaje quedó aprobado y sin conductor. Después se canceló el viaje ficticio para que no quedara como trabajo operativo. Se conservan registro y trazabilidad; no se borraron datos.

Producción comienza sin conductores reales registrados. El administrador debe registrar sus conductores y PIN antes de asignar viajes reales. Los viajes y conductores ficticios anteriores siguen conservados en la base de desarrollo separada.

## Despliegues y comprobaciones

- Despacho: servicio existente `srv-dbhq0dui0phs73f11i60`, código `6a77a888193991aaa079bddf642ded8f26d0dd2a`, despliegue `dep-dbs7lb67bikc73er4u40`, live.
- Comprobación privada: `/ready` = 200; `/booking/environment` autenticado = `{mode:'production',databaseVerified:true}`; intake sin credencial = 403; correo y remitente configurados.
- Web: servicio existente `srv-dbecuku7bikc7381p180`; despliegue `dep-dbs7nhqfngtc73bvcuk0`, live, reenvío activado después de verificar primer despliegue con reenvío apagado.
- Preflight público: configuración presente y `forwardingEnabled:true`. La prueba real anterior valida recepción y persistencia más allá de ese preflight.
- 27 pruebas web/GPS/pagos/transporte y 49 de despacho aprobadas localmente. GitHub Actions success, ejecución 43608203209.

## Datos, costos y recuperación

Se creó la base lógica `pimentel_dispatch_production` dentro de la instancia permanente existente `dpg-dbggc7ei0phs73du2q10-a`. No se contrató otra instancia, no se creó otro servicio ni se cambiaron planes, almacenamiento, autoscaling o accesos externos. La base temporal de restauración no recibe reservas reales.

Se generó una exportación lógica en Recovery de Render, archivo de fecha `2026-11-14T15:18Z`. Se descargó para inspección y se confirmó que incluye la base lógica de producción. El archivo permanece disponible en Recovery según su retención; no se realizó una restauración nueva de producción. La exportación precede a la reserva ficticia y la recuperación continua de la instancia debe seguir monitorizándose. No se creó una instancia facturable de recuperación.

Se conservaron fotos Suburban 2027, calculadora GPS, categorías, WhatsApp/mailto y Stripe. WhatsApp/correo manual, servicios por horas y Checkout mantienen el flujo anterior; no generan viajes automáticamente. La integración automática verificada cubre `/api/booking-request` con pago al finalizar o coordinación.

## Pendiente específico: aviso automático a WhatsApp del administrador

El propietario precisó que desea avisos de nuevas reservas tanto por correo como por WhatsApp. El aviso por correo está activo. No se encontró conexión ni configuración de envío automático por WhatsApp en las herramientas disponibles o en la configuración revisada de la aplicación. Los enlaces actuales de WhatsApp preparan mensajes para envío manual y no sustituyen una integración de notificaciones del servidor.

No se ha contratado un proveedor, conectado una API de WhatsApp ni autorizado una tarifa nueva para mensajes. Antes de activar ese canal hay que resolver acceso a la conexión oficial y verificar sus costos. No afirmar que el aviso automático por WhatsApp funciona.

## Reversión

Apagar `BOOKING_DISPATCH_PRODUCTION_ENABLED` en la web y aplicar ese cambio detiene los nuevos reenvíos. No elimina solicitudes ya guardadas; conciliar por referencia antes de reintentar envíos inciertos. La contraseña del administrador no se cambió. La asignación sigue siendo exclusivamente manual.
