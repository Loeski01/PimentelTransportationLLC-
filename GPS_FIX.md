# Integración GPS

La calculadora llama únicamente a POST https://pimenteltransportationllc.onrender.com/api/quote con {from,to}. El servidor devuelve millas, minutos, componentes de tarifa y amount en centavos. Stripe usa la misma función de cálculo; nunca acepta precios del navegador. Se conservan las tarifas existentes ($35 base, $3.50/milla, $0.50/minuto, mínimo $65 y $10 por recogida en aeropuerto).

El límite total de mapas en servidor es 10 segundos; el navegador cancela a los 12 segundos, incluyendo la lectura del JSON, y siempre restaura el botón. Direcciones no encontradas y rutas inexistentes devuelven 422; saturación/proveedor no disponible, 503; tiempo agotado, 504; respuestas inesperadas, 502. No hay reintentos automáticos que prolonguen la espera. La caché de cotizaciones dura cinco minutos, con un máximo de 500 entradas en memoria. Nominatim se consulta con identificación y separación mínima de 1.1 segundos entre llamadas por proceso. La cola se rechaza si la espera para comenzar supera tres segundos.

## Aplicación

Revisar y subir juntos server.js, calculadora-gps-pimentel.html e index.html. Desplegar primero el backend en Render y comprobar POST /api/quote; después publicar la calculadora en GitHub Pages. Eliminar la primera línea errónea de index.html forma parte del parche. No se requiere una dependencia adicional; Node >=20, como indica package.json.

Ejecutar: node --test tests/quote.test.cjs

Las pruebas usan proveedores y DOM simulados. No verifican la red real, CORS en un navegador real, Stripe ni el tiempo de arranque de Render. Probar una ruta conocida, una dirección inexistente, desconexión y un proveedor lento antes de dar por completado el despliegue. Si Render está suspendido, el primer intento puede vencer a los 12 segundos: mostrar el error es intencional; se puede reintentar cuando el servicio esté listo.

Centralizar no convierte Nominatim/OSRM públicos en proveedores con garantía de servicio. Para mayor disponibilidad, configurar un proveedor contratado o infraestructura propia. El espaciado y la caché actuales son por proceso: no escalar a varias instancias sin un limitador compartido y revisión de la política del proveedor. La calculadora añade un enlace «Reservar y pagar al finalizar el viaje». Abre el formulario principal con direcciones, nombre, teléfono y preferencia precargados; el cliente completa fecha y hora. La solicitud por WhatsApp o correo incluye la preferencia y el estado «No cobrado». No se guarda una reserva en el servidor ni se confirma automáticamente: el cliente debe enviar el mensaje y la compañía debe responder. No se añade un cobro automático al finalizar ni se modifica Stripe. El formulario también permite coordinar el pago con la compañía.

## Propinas y pago antes o después del viaje

El formulario principal permite indicar 0%, 10%, 15%, 20% u otro monto en USD como preferencia voluntaria, sin cobrar al enviar la solicitud. La preferencia viaja en la solicitud por WhatsApp/correo y en el enlace guardable para pagar después del viaje. Elegir una preferencia no es un pago y no crea una reserva confirmada.

La calculadora muestra tarifa de viaje, propina y total de pago por separado. Permite pagar el viaje más la propina o pagar únicamente la propina si el viaje ya fue pagado. No detecta automáticamente pagos anteriores: el cliente debe seleccionar la opción correcta. El enlace no envía recordatorios ni realiza cargos automáticos; no contiene nombre ni teléfono. En ambos momentos la propina comienza en cero si no viene una preferencia en el enlace.

Stripe recibe el importe de viaje calculado en el servidor, con una línea separada para la propina. Solo acepta 0/10/15/20% o centavos enteros entre 0 y 100000; no permite combinar ambos. Solo propina exige al menos 50 centavos. El servidor compara la tarifa mostrada con la tarifa actual y rechaza cambios para que el cliente la revise de nuevo. El importe GPS no incluye ajustes de peajes, espera u otros cargos: los importes distintos deben coordinarse con la compañía. Los fondos de la propina llegan a la cuenta Stripe de la compañía; no existe reparto automático a conductores.

El navegador limita la apertura del checkout a 25 segundos y Stripe a 12 segundos sin reintentos automáticos. No introducir tarjetas ni efectuar cobros al verificar el flujo. Las pruebas de Stripe usan un mock; una prueba visual del checkout solo crea una sesión sin pagar.

Pruebas incluidas en el repositorio: node --test gps.test.cjs
