# Verificación HU08 — Alertar por stock mínimo y proponer reposición

Fecha: 13 de noviembre de 2026 (America/Lima).
Versión: panel 1.0.0, cambios HU08 sobre commit base `e29c6ff`.
Revisor técnico de ejecución: Codex. Revisión manual y aceptación funcional por Brenda Paola Zapata Mio: pendientes.

Implementación actual: React + TypeScript + Vite, API Node.js y SQLite. La migración futura a Supabase requiere verificar PostgreSQL/Auth/RLS por separado.

| Caso | Resultado ejecutado | Revisor |
|---|---|---|
| Producto sin configuración | Alertas deshabilitadas; permite configurar mínimo y objetivo | Codex |
| Disponible por encima del mínimo | Sin alerta | Codex |
| Físico 20 y reserva 10, mínimo 10 | Disponible 10; alerta activa por igualdad | Codex |
| Disponible por debajo del mínimo | Alerta activa | Codex |
| Objetivo 30 y disponible 10 | Sugerencia de 20 unidades | Codex |
| Identificación textual y aviso de uso interno | React muestra AL-MIN-P1, STOCK MÍNIMO ALCANZADO y ausencia de envío automático | Codex |
| Configurar mínimo negativo, decimal, texto o nulo; objetivo no superior al mínimo | HTTP 400 | Codex |
| Configurar producto inexistente | HTTP 404 | Codex |
| Crear propuesta al alcanzar el umbral | Borrador con cantidad e instantánea de disponible/mínimo/objetivo | Codex |
| Reintentar misma propuesta | No se duplica | Codex |
| Crear segundo borrador para el mismo producto | HTTP 409; conserva propuesta existente | Codex |
| Cantidad inválida o reutilización de identificador con otros datos | HTTP 400/409 | Codex |
| Revisar cantidad y observación | React envía cambios y versión al servidor | Codex |
| Dos revisiones simultáneas con la misma versión | Una obtiene 200 y otra 409; versión pasa de 1 a 2 | Codex |
| Conflicto de revisión en React | Muestra error y conserva cantidad introducida sin guardar | Codex |
| Cancelar reserva o registrar entrada que supera el mínimo | Desaparece la alerta | Codex |
| Alerta desaparece después de guardar propuesta | Propuesta y cantidad revisada permanecen | Codex |
| Crear nueva propuesta cuando ya no hay alerta | HTTP 409 | Codex |
| Deshabilitar alerta | Deja de alertar incluso por debajo del mínimo | Codex |
| Solicitar envío al proveedor | HTTP 404; no existe flujo de envío | Codex |
| Configuración, listado, creación o revisión sin sesión | HTTP 401 | Codex |
| Reabrir base | Configuración y propuesta revisada persistidas; stock intacto; integridad referencial válida | Codex |

Ejecución: `npm test` (14 pruebas React aprobadas), `npm run test:server` (5 pruebas integrales aprobadas, incluyendo regresiones HU04/HU05/HU06/HU10 y migración), `npm run build` (TypeScript/Vite aprobados). Las pruebas del servidor usan HTTP y SQLite temporales reales; React usa cliente simulado. No se modificó la base de trabajo para preparar casos.

Pendientes: revisión visual en navegador y aceptación funcional. No se cambió el estado de Jira. El Ciclo 1 del Word sigue siendo simulado; este registro corresponde a la ejecución local actual.

Trazabilidad: H3; T5. Word 3.3.3 y 4.4. Dependencias de referencia HU02 y HU04; usa disponibilidad de HU05. Planificación conservada: Sprint 3, una semana, 27 de octubre al 3 de noviembre de 2026; estimación inicial 3 puntos relativos sujeta a revisión. Responsable propuesta: Brenda Paola Zapata Mio. Separación fina del rol Gerente: HU13.
