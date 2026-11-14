# Limpieza y avisos — 14 de noviembre de 2026

## Limpieza ejecutada y comprobada

El propietario pidió eliminar todos los registros ficticios usados en las pruebas. Se seleccionaron IDs y referencias conocidos, sin filtros amplios sobre datos reales.

| Base lógica | Viajes eliminados | Reservas eliminadas | Conductores de prueba eliminados | Avisos eliminados | Eventos de prueba eliminados |
|---|---:|---:|---:|---:|---:|
| pimentel_dispatch_production | 1 | 1 | 0 | 0 | 3 |
| pimentel_dispatch_dev | 4 | 3 | 1 | 6 | 23 |

Tras la operación, ambas bases tienen cero viajes, reservas, conductores, avisos y eventos operativos de pruebas. La bandeja real muestra «No hay reservas todavía» y el panel de administrador no muestra viajes ni avisos. No se cambiaron contraseña, sesiones, tarifas, pagos, acceso de administrador ni planes. No se reiniciaron las secuencias de IDs.

Antes de eliminar se creó un respaldo privado por base en `maintenance.test_cleanup_backups`, ID `1`, con las filas completas seleccionadas. Se restauraron las filas en tablas temporales y se verificó igualdad JSONB exacta antes de los DELETE, dentro de la misma transacción. Cada respaldo quedó marcado `restore_verified=true`. Se revocó acceso público al esquema y a la tabla de respaldo. El respaldo no aparece en el panel ni en la bandeja.

Para recuperar solo esos registros, usar la base correspondiente, leer el payload del respaldo y restaurar en una transacción con `jsonb_populate_recordset`: primero conductores, viajes, reservas y luego auditoría/avisos. Antes comprobar conflictos de IDs o referencias; no sobrescribir registros posteriores. No se borraron bases ni respaldos anteriores.

## Números: causa descartada

| Función | Número conservado |
|---|---|
| Llamadas de clientes | 617-518-8281 |
| WhatsApp y destino de avisos SMS solicitado | 617-785-5657 |

El número de WhatsApp en los enlaces no cambió. El historial identifica `5a2a68ac` como el cambio que ocultó los enlaces de WhatsApp/correo tras un envío automático satisfactorio. El formulario actual regresaba antes de ofrecer esos canales; esto explica la ausencia del botón después de guardar, pero no demuestra que antes hubiera envío automático del servidor.

Se restaura el botón de WhatsApp tras guardar una reserva, dirigido a `16177855657` e incluyendo la referencia persistida para conciliar el aviso. El cliente aún debe abrir WhatsApp y enviar el mensaje. No se presenta ese enlace como una notificación automática.

## SMS: preparado, todavía desactivado

El propietario autorizó SMS como alternativa si WhatsApp automático no está disponible. Se preparó el adaptador de avisos al administrador en `booking/admin-sms.js`, usando la cuenta Brevo ya empleada para correo:

- Desactivado por defecto. Solo se intenta enviar con `BOOKING_SMS_ENABLED=true`.
- Destino fijo del propietario: `16177855657`. Se rechaza usar el número principal de llamadas como destino.
- Requiere credencial con permiso SMS y un remitente registrado en `BOOKING_SMS_SENDER`.
- Aviso corto de referencia/fecha/hora, sin datos personales del pasajero, ASCII y máximo 160 caracteres. No hay reintentos automáticos ante respuestas inciertas.
- Si el aviso falla, se conserva la reserva y sigue el flujo de correo; `adminSmsNoticeSent` no se da por verdadero.

La consulta de cuenta con la conexión actual devolvió HTTP 403. El panel `account.brevo.com` devolvió error de origen SSL 525, también tras un único reintento. No se pudo comprobar saldo, remitente ni condiciones de costo. No se enviaron SMS, no se activó la bandera y no se compraron créditos ni planes. Para activarlo: verificar acceso, permisos, remitente, saldo/costo y después una prueba al teléfono del propietario, sin crear viajes ficticios nuevos.

Documentación oficial consultada: https://developers.brevo.com/reference/get-account y https://developers.brevo.com/docs/transactional-sms-endpoints . La entrega al teléfono requiere confirmación del proveedor o del propietario; un acuse de aceptación por API no demuestra entrega.

## Verificación de código

36 pruebas web/GPS/pagos/reservas/notificaciones aprobadas localmente. Incluyen WhatsApp visible tras éxito, conservación del teléfono principal, destino SMS correcto, configuración desactivada, control de longitud, ausencia de reintentos y persistencia/correo preservados cuando falla SMS. Se reutilizan además las 49 pruebas del despacho en CI. Las pruebas de mensajes son simuladas; no agregan reservas al panel limpio ni generan cargos.
