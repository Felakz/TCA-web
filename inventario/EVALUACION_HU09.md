# HU09 — Viabilidad de consulta de confirmación por WhatsApp

Fecha de evaluación: 13 de noviembre de 2026 (America/Lima).
Decisión: viable como texto y enlace preparado para consulta manual, condicionado a verificar el destino. No se implementa ni se declara envío automático. No se acredita recepción o confirmación real del pedido.

## Destino encontrado

Las páginas HTML activas y las copias de `backup` usaban `https://wa.me/5199999999`. No hay evidencia de titularidad, registro en WhatsApp ni recepción. Se deshabilitó su navegación y se identificó como destino pendiente de verificación. No se contactó ese número ni se sustituyó por un número supuesto.

Se solicitó el número oficial y la confirmación de pertenencia al negocio. Mientras no exista evidencia, el proyecto permite preparar/copiar texto y mantiene bloqueado el enlace. La validación sintáctica de número no demuestra que exista una cuenta WhatsApp.

## Opción viable para el MVP

La función [click to chat de WhatsApp](https://faq.whatsapp.com/5913398998672934) admite un número internacional y texto precargado. Se implementó un enlace `https://wa.me/<numero>?text=<texto codificado>` únicamente para destinos configurados como verificados. Es un enlace preparado; el cliente debe revisar el destinatario, revisar el texto y pulsar Enviar en WhatsApp. Abrir el enlace no demuestra envío, recepción ni lectura.

El formulario de Cliente permite escribir una referencia y prepara: «Hola, quisiera consultar si mi pedido REFERENCIA está confirmado. Gracias.». Es una pregunta; no emite una confirmación comercial ni consulta automáticamente el estado en SQLite. El texto puede editarse antes de abrir el enlace. No incluye datos de otros clientes ni consulta tablas de pedidos.

La referencia se valida localmente y no se envía a la API de configuración. El mensaje pasa a WhatsApp únicamente cuando el usuario abre voluntariamente el enlace. No se registran eventos de mensaje enviado/entregado ni se cambia el pedido por preparar o abrir el texto.

## Alternativa con API real, fuera del compromiso actual

[WhatsApp Business Platform de Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/overview) ofrece APIs y webhooks para una integración real. La evolución requeriría evaluar y configurar los activos empresariales y el teléfono, credenciales de servidor y permisos, recepción de eventos, correlación segura cliente-pedido, manejo de errores/reintentos y las reglas vigentes de mensajes/plantillas y costos. Estos elementos no están implementados ni verificados en este proyecto. No hay tokens de Meta en el navegador.

HU07 sigue como dependencia de referencia. En el repositorio revisado no se identificó una implementación verificable de HU07 para asociar de forma segura el cliente con sus pedidos. Por ello se usa referencia introducida por el cliente y atención manual; no se expone un buscador público de pedidos ni se elude HU13.

## Verificación del destino antes de habilitar

1. Gerencia proporciona el número internacional oficial y comprueba que pertenece al negocio.
2. Un revisor autorizado comprueba en WhatsApp la cuenta y el destinatario mostrado. Con autorización explícita para contactar, realiza una prueba manual desde móvil y/o WhatsApp Web, diferenciando apertura, envío, recepción y respuesta. No se ha hecho ese contacto desde esta tarea.
3. Registrar número, fecha, revisor y evidencia de recepción, sin publicar datos privados de clientes. Completar el registro en `VERIFICACION_HU09.md`.
4. Solo entonces configurar `.env.whatsapp` según README. Una bandera local documenta la comprobación administrativa; no realiza verificación remota de la cuenta.

## Alcance conservado

F5; H4. Word 3.3.3 y 4.4. Sprint 4, una semana, 3–10 de noviembre de 2026. Estimación inicial: 3 puntos relativos, sujeta a revisión. Responsable propuesta: Brenda Paola Zapata Mio. Dependencia de referencia: HU07. La etapa actual continúa con React/TypeScript/Vite y SQLite; no requiere migrar a Supabase para preparar enlaces. No se cambió el estado de Jira.
