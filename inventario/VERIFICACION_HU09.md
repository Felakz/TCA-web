# Verificación HU09 — Consulta por WhatsApp

Fecha: 13 de noviembre de 2026 (America/Lima).
Versión: panel 1.0.0, cambios locales HU09 sobre commit `1cd1d3c`.
Revisor técnico de ejecución: Codex. Revisión y aceptación funcional: pendiente de Brenda Paola Zapata Mio.

| Caso | Resultado | Revisor |
|---|---|---|
| Revisar destino existente | Se encontró 5199999999 en 34 HTML activos/copias; no hay verificación. Navegación deshabilitada | Codex |
| Sin número o sin constancia administrativa de verificación | API informa destino nulo; interfaz no ofrece enlace | Codex |
| Número malformado o placeholder anterior | Se bloquea aun con bandera de verificación | Codex |
| Número de prueba con bandera explícita | Solo valida construcción del enlace, nunca registro real ni entrega | Codex |
| Preparar consulta | Muestra texto editable y aviso «no se ha enviado ningún mensaje» | Codex |
| Destino habilitado en fixture React | Enlace rotulado «Abrir WhatsApp con texto preparado», HTTPS a wa.me y protección de nueva pestaña | Codex |
| Texto con tildes, signos y & | Codificación de URL conserva el contenido | Codex |
| Referencia vacía/inválida/larga | No prepara mensaje; cambiar referencia elimina texto y enlace anterior | Codex |
| Texto vacío o destino no válido | No produce enlace | Codex |
| Endpoint de configuración público | Solo expone modo ENLACE_PREPARADO, destino verificado si procede, aviso y envío automático false | Codex |
| Intento de invocar envío sin sesión | Rechazado; no existe integración de envío | Codex |
| Preparar enlace | No crea pedidos ni movimientos | Codex |
| Regresiones de roles, reservas, despacho y reposición | Aprobadas | Codex |

Resultados: `npm test`: 22 pruebas React aprobadas; `npm run test:server`: 8 pruebas de servidor aprobadas; `npm run build`: TypeScript/Vite aprobados; `git diff --check`: sin errores. Las pruebas utilizan números sintéticos únicamente para construir URLs; no abren WhatsApp ni contactan a nadie. Las pruebas React usan cliente simulado y las de API usan SQLite en memoria/archivos temporales.

## Verificación manual pendiente

- Número oficial del negocio: pendiente de información del usuario.
- Pertenencia del número y cuenta WhatsApp: pendiente.
- Revisor, fecha y evidencia de destino mostrado: pendientes.
- Apertura en móvil/WhatsApp Web: pendiente, sin contacto realizado.
- Envío manual autorizado, recepción y respuesta: pendientes, sin mensajes enviados.
- Asociación cliente-pedido/HU07: pendiente de verificación; no se ofrece consulta automática de estado.
- Integración API real y entrega automática: fuera de alcance del MVP, no implementadas.

El enlace permanece deshabilitado. El Ciclo 1 del Word sigue siendo simulado. Estos resultados son comprobaciones locales y evaluación documental, no acreditan envío ni confirmación por WhatsApp. No se cambió Jira.

Trazabilidad y decisión de viabilidad: `EVALUACION_HU09.md`.
