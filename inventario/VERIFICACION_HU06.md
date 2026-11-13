# Verificación HU06 — Despachar pedidos con descuento único

Fecha: 13 de noviembre de 2026 (America/Lima).
Versión: panel 1.0.0, cambios locales HU06 sobre commit base `fddd6a7`.
Revisor técnico de ejecución: Codex. Revisión manual y aceptación funcional por Brenda Paola Zapata Mio: pendientes.

Implementación actual: React + TypeScript + Vite, API Node.js y SQLite. Supabase/PostgreSQL se implementará al migrar el almacenamiento; las pruebas actuales no acreditan RLS ni transacciones PostgreSQL.

| Caso | Resultado ejecutado | Revisor |
|---|---|---|
| Físico 30 y reserva 10; despachar 10 | Físico 20, reservado 0 y disponible 20 | Codex |
| Dos sesiones despachan el mismo pedido simultáneamente | Una ejecución y una respuesta idempotente; una sola salida y una sola constancia | Codex |
| Repetir el despacho después de completarlo | Misma constancia; ningún nuevo descuento | Codex |
| Constancia interna | Identificador, pedido, fecha, responsable, productos y cantidades; leyenda SIN VALOR TRIBUTARIO | Codex |
| Recuperar constancia después de cambiar el nombre de un producto | Conserva el contenido emitido | Codex |
| Constancia antes del despacho o pedido inexistente | HTTP 404 | Codex |
| Despachar o consultar constancia sin sesión | HTTP 401 | Codex |
| Despachar pedido cancelado | HTTP 409 | Codex |
| Cancelar o reconfirmar un pedido despachado | HTTP 409 | Codex |
| Falla inducida al registrar la segunda salida de un pedido | Se revierten descuento de la primera línea, salidas, estado y constancia; la reserva sigue activa | Codex |
| Reintento tras retirar la falla inducida | Despacha todas las líneas correctamente y registra una salida por producto | Codex |
| Despacho y cancelación concurrentes desde dos sesiones | Una transición gana; la otra recibe HTTP 409; stock y reserva coherentes | Codex |
| Migrar base HU05 con pedidos y entradas existentes | Conserva pedidos, reserva y movimientos; entradas previas quedan identificadas como ENTRADA; claves foráneas válidas | Codex |
| Reiniciar sobre la base migrada | No reaplica la migración ni pierde datos | Codex |
| React: despachar y recuperar constancia | Actualiza lista y muestra documento; retira acciones de despacho/cancelación | Codex |
| React: rechazo al despachar | Muestra error, conserva acciones del pedido confirmado y no emite constancia | Codex |

Los casos del servidor usan HTTP real, dos workers con conexiones SQLite independientes y archivos temporales. Las pruebas de componentes usan un cliente simulado. No se modificó la base de trabajo del usuario para ejecutar los casos.

Comandos y resultados:

- `npm test`: 11 pruebas React aprobadas.
- `npm run test:server`: 4 pruebas integrales aprobadas, incluyendo regresiones HU04/HU05/HU10 y migración HU06.
- `npm run build`: TypeScript y compilación Vite aprobados.
- `git diff --check`: sin errores.

La descarga manual del archivo de constancia y la aceptación en navegador quedan pendientes. No se cambió el estado de Jira. Los resultados del Ciclo 1 del Word siguen siendo simulados; este registro documenta la ejecución local actual.

Trazabilidad: H1; T3. Word 3.3.3 y 4.4. Dependencia: HU05. Planificación de referencia conservada: Sprint 2, una semana, 20–27 de octubre de 2026; estimación inicial 5 puntos relativos, sujeta a revisión. Responsable propuesta: Brenda Paola Zapata Mio. La separación fina Almacén/Ventas permanece en HU13.
