# Verificación HU05 — Reservar unidades al confirmar pedidos

Fecha de ejecución: 13 de noviembre de 2026 (America/Lima).
Versión: panel 1.0.0, implementación HU05 en cambios locales sobre base `16aa3e1`.
Revisor de ejecución técnica: Codex. Revisión y aceptación funcional: pendiente de Brenda Paola Zapata Mio.

## Alcance implementado

React + TypeScript + Vite; API Node.js y SQLite, según la decisión actual de trabajar localmente antes de migrar a Supabase. La interfaz confirma pedidos de un producto; el servidor soporta pedidos de varias líneas con atomicidad. No se implementó separación fina de roles (HU13), despacho ni edición de pedidos confirmados.

## Resultados ejecutados

| Caso | Resultado observado | Tipo / revisor |
|---|---|---|
| Físico 30 y reserva 10 | Físico 30, reservado 10, disponible 20 | HTTP + SQLite real / Codex |
| Reservar 21 cuando hay 20 disponibles | HTTP 409; reserva permanece en 10 | HTTP + SQLite real / Codex |
| Cantidades cero, negativas, decimales, texto, nulas o fuera de rango | HTTP 400 | HTTP + SQLite real / Codex |
| Pedido sin líneas, producto duplicado o inexistente | HTTP 400/404; no crea reserva | HTTP + SQLite real / Codex |
| Reintentar confirmación con mismo ID y contenido | Devuelve confirmación idempotente, sin nueva reserva | HTTP + SQLite real / Codex |
| Mismo ID con cantidad diferente u otro usuario | HTTP 409 | HTTP + SQLite real / Codex |
| Una línea insuficiente en un pedido con varias líneas | HTTP 409; no crea pedido ni reserva parcial | HTTP + SQLite real / Codex |
| Dos sesiones reservan simultáneamente las últimas 20 unidades | Una obtiene 200 y otra 409; reservado 30, disponible 0 | Dos workers, APIs y conexiones SQLite independientes / Codex |
| Dos sesiones cancelan simultáneamente el pedido ganador | Ambas reciben 200; una transición y un resultado idempotente; disponible vuelve a 20 | HTTP + SQLite real / Codex |
| Reconfirmar un pedido cancelado | HTTP 409; no vuelve a reservar | HTTP + SQLite real / Codex |
| Cancelar pedido inexistente | HTTP 404 | HTTP + SQLite real / Codex |
| Leer datos desde una nueva conexión | Disponible 20 persistido; pedido fallido inexistente | SQLite real / Codex |
| Cancelar la reserva inicial de 10 | Disponible 30, físico intacto | HTTP + SQLite real / Codex |
| Listar, confirmar o cancelar sin sesión | HTTP 401 | HTTP + SQLite real / Codex |
| Formulario muestra físico, reservado y disponible y error del servidor | Aprobado | React con cliente simulado / Codex |
| Reintentar tras fallo de conexión mantiene ID | Aprobado | React con cliente simulado / Codex |
| Cancelar desde formulario actualiza lista y retira botón | Aprobado | React con cliente simulado / Codex |

Ejecución completa: `npm test` (9 pruebas aprobadas), `npm run test:server` (2 pruebas integrales aprobadas, incluyendo la regresión de HU10/HU04), `npm run build` (TypeScript y Vite aprobados). No se usó ni se modificó la base de trabajo del usuario: las pruebas crean y eliminan bases temporales.

## Pendientes y trazabilidad

Revisión manual en navegador y aceptación de Brenda: pendientes. No se cambió el estado de Jira. Los resultados del Ciclo 1 del Word siguen siendo simulados; estos resultados corresponden a la ejecución local descrita.

H2; T2. Word 3.3.3 y 4.4. Dependencia: HU04. Planificación de referencia conservada: Sprint 2, una semana, 20–27 de octubre de 2026; 5 puntos relativos sujetos a revisión. Responsable propuesta: Brenda Paola Zapata Mio.

Al migrar a Supabase deben trasladarse las transacciones y el control de concurrencia a PostgreSQL y comprobar Auth/RLS. Las pruebas actuales no acreditan comportamiento en PostgreSQL. El bloqueo de escritura al comenzar se basa en [BEGIN IMMEDIATE de SQLite](https://www.sqlite.org/lang_transaction.html).
