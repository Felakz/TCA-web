# Verificación HU13 — Permisos de Gerencia, Ventas y Almacén

Fecha: 13 de noviembre de 2026 (America/Lima).
Versión: panel 1.0.0, implementación local HU13 sobre commit base `465123c`.
Revisor técnico: Codex. Revisión manual y aceptación funcional: pendiente de Brenda Paola Zapata Mio.

## Resultado y límites

Permisos aplicados y probados en la API Node.js + SQLite, usando cuentas diferentes de roles fijos. **El criterio específico PostgreSQL/RLS está pendiente**, dado que el proyecto continúa temporalmente con SQLite. Las pruebas locales no acreditan RLS ni Supabase Auth. No se cambió el estado de Jira.

## Casos ejecutados

| Caso | Resultado | Revisor |
|---|---|---|
| Listar inventario y pedidos | Gerencia/Ventas/Almacén 200; Cliente y SIN_ASIGNAR 403; sin sesión 401 | Codex |
| Listar movimientos | Gerencia/Almacén 200; restantes roles 403 | Codex |
| Mínimos, propuestas y usuarios | Solo Gerencia obtiene acceso | Codex |
| Confirmar y cancelar pedidos | Solo Ventas; operaciones válidas comprobadas | Codex |
| Registrar entrada y despachar | Solo Almacén; operaciones válidas comprobadas | Codex |
| Invocar directamente cada mutación con el rol incorrecto | HTTP 403, incluso enviando rol GERENCIA en el cuerpo | Codex |
| Consultar constancia | Solo los tres roles internos; Cliente y SIN_ASIGNAR 403 | Codex |
| Administrar reposición | Gerencia configura mínimo, crea propuesta y guarda revisión válidas | Codex |
| Crear usuario desde Gerencia | Cuenta con rol asignado y hash de contraseña; sin contraseña en respuestas | Codex |
| Listar usuarios | Solo id, email, rol y habilitado; no hash, sal ni sesiones | Codex |
| Cambiar Ventas a Cliente | Revoca token anterior (401); nuevo login de esa identidad no accede al inventario (403) | Codex |
| Deshabilitar Almacén | Revoca sesión e impide nuevo login | Codex |
| Degradar la última Gerencia habilitada | HTTP 409 | Codex |
| Auditoría de usuarios | Registra creación y cambios de permisos | Codex |
| Cuenta antigua al migrar | SIN_ASIGNAR; sin privilegios concedidos automáticamente | Codex |
| Catálogo sin sesión y para Cliente | Solo campos comerciales permitidos; lista blanca por producto | Codex |
| JSON del catálogo estático | Corregido cierre inválido; campos existentes únicamente id, nombre, marca, imagen y descripcion | Codex |
| Interfaz Ventas/Almacén/Gerencia | Muestra controles acordes al rol; pruebas React aprobadas | Codex |
| Guardar rol y habilitación en formulario | Envía el usuario, rol y estado elegidos | Codex |

La matriz HTTP de HU13 mantiene cuentas de roles fijos y no modifica sus roles para sortear restricciones. Las regresiones históricas que atraviesan varios departamentos usan un helper de pruebas para representar el cambio de actor/rol entre etapas; no se consideran evidencia de autorización. La matriz HU13 es la prueba independiente para permitidos y denegados.

Comprobaciones: `npm test`: 18 pruebas React aprobadas; `npm run test:server`: 6 pruebas integrales aprobadas; `npm run build`: TypeScript y Vite aprobados. `git diff --check`: sin errores. Las bases de prueba son temporales o en memoria, sin alterar la base de trabajo.

## Pendientes

Prueba manual de las cuentas y formularios en navegador; asignación de Gerencia en la instalación real; verificación de PostgreSQL/Auth/RLS al migrar a Supabase. Los resultados del Ciclo 1 del Word siguen siendo simulados. El presente documento registra ejecución técnica local real con datos de prueba.

Trazabilidad: Word 3.3.3, backlog 4.4. Sprint 3, una semana. Responsable propuesta: Brenda Paola Zapata Mio. La decisión de migrar al stack moderno del 13 de octubre de 2026 se mantiene como referencia; SQLite es el almacenamiento temporal indicado por el usuario.
