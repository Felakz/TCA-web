# HU04 — Registrar entradas con inventario persistente

**Sprint 1 · 13–20 oct 2026 · 5 puntos relativos**  
**Responsable técnica:** Brenda Paola Zapata Mio  
**Stack:** React + TypeScript + Vite + Tailwind (sitio) · Supabase PostgreSQL/Auth/RLS

---

## Criterios de aceptación

| # | Criterio | Implementación |
|---|----------|----------------|
| AC1 | Stock 20 + entrada 40 = 60 tras recargar | `registrar_entrada()` suma atómicamente; la recarga relee `inventario.stock_actual` desde PostgreSQL |
| AC2 | Rechazar cantidades inválidas | Validación doble: `validarEntrada()` en cliente + `CHECK (cantidad > 0)` y guard en función PG |
| AC3 | Doble envío no crea movimientos adicionales | `idempotency_key UNIQUE` + retorno `IDEMPOTENT` si la clave ya existe |

---

## Archivos entregados

```
TCA-web/inventario/
├── inventario-entrada.html          ← Página de UI (Almacén)
├── js/
│   ├── inventario-service.js        ← Servicio JS (validación + RPC)
│   └── inventario-service.test.js   ← Tests de aceptación (sin framework)
└── migrations/
    └── 001_inventario_initial.sql   ← Migración Supabase (tablas + función + RLS)
```

---

## Esquema de base de datos

### Tabla `inventario`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | BIGSERIAL PK | Clave primaria |
| `producto_id` | TEXT UNIQUE | Clave de negocio (ej. `PROD-TEST-001`) |
| `nombre` | TEXT | Nombre del producto |
| `stock_actual` | INTEGER ≥ 0 | Saldo actual; actualizado atómicamente |
| `created_at` / `updated_at` | TIMESTAMPTZ | Auditoría automática |

### Tabla `movimientos_inventario`

| Columna | Tipo | Descripción |
|---------|------|-------------|
| `id` | BIGSERIAL PK | Clave primaria |
| `inventario_id` | FK → inventario | Referencia al producto |
| `tipo_movimiento` | ENUM texto | `ENTRADA` / `SALIDA` / `AJUSTE` |
| `cantidad` | INTEGER > 0 | Unidades del movimiento |
| `stock_antes` / `stock_despues` | INTEGER | Saldo pre/post para auditoría |
| `actor` | TEXT | Usuario o rol que registra |
| `idempotency_key` | TEXT UNIQUE | **Clave de idempotencia (AC3)** |
| `observacion` | TEXT nullable | Nota libre |
| `fecha` | TIMESTAMPTZ | Momento del movimiento |

### Función `registrar_entrada()`

Función PL/pgSQL `SECURITY DEFINER` que en una sola transacción:

1. Rechaza cantidades ≤ 0 (AC2)
2. Busca la `idempotency_key`; si existe → devuelve `IDEMPOTENT` sin escribir (AC3)
3. Bloquea la fila del producto (`FOR UPDATE`) para evitar condición de carrera
4. Actualiza `stock_actual` y registra el movimiento (AC1)
5. Devuelve JSON con `status`, `movimiento_id`, `stock_antes`, `stock_despues`, `fecha`

---

## Configuración inicial (Supabase)

### 1. Ejecutar la migración

En el **SQL Editor** del dashboard de Supabase:

```sql
-- Pega el contenido completo de:
-- TCA-web/inventario/migrations/001_inventario_initial.sql
```

### 2. Configurar las credenciales en la UI

Edita `inventario-entrada.html` y reemplaza:

```js
const SUPABASE_URL      = 'https://TU_PROYECTO.supabase.co';
const SUPABASE_ANON_KEY = 'TU_ANON_KEY';
```

Haz lo mismo en `inventario-service.js` si usas el servicio fuera de la página.

### 3. Agregar productos de prueba

```sql
-- Producto para verificar AC1
INSERT INTO inventario (producto_id, nombre, stock_actual)
VALUES ('PROD-TEST-001', 'Producto de prueba HU04', 20)
ON CONFLICT (producto_id) DO NOTHING;
```

---

## Ejecutar los tests de aceptación

Abre `inventario-entrada.html` en el navegador y en la **consola** ejecuta:

```js
import('./js/inventario-service.test.js').then(m => m.ejecutarTests());
```

Salida esperada:

```
📦 AC2 — Rechazar cantidades inválidas
  ✅ Cantidad 0 debe ser rechazada
  ✅ Cantidad negativa (-1) debe ser rechazada
  ✅ Cantidad decimal (3.5) debe ser rechazada
  ✅ Cantidad null debe ser rechazada
  ✅ Cantidad undefined debe ser rechazada
  ✅ Cantidad string ("cuarenta") debe ser rechazada
  ✅ Cantidad válida (40) no debe lanzar excepción
📦 Validación de actor e idempotency key
  ✅ Actor vacío debe ser rechazado
  ✅ IdempotencyKey vacía debe ser rechazada
📦 Generador de idempotency key
  ✅ Dos claves sin contexto deben ser distintas
  ✅ La clave sin contexto debe ser un string no vacío
  ✅ El mismo contexto debe producir la misma clave (determinista)
  ✅ Claves con contexto deben iniciar con "IK-"
📦 AC1 & AC3 — Lógica de negocio (simulada)
  ✅ AC1: stock 20 + entrada 40 = 60
  ✅ AC1: status debe ser CREADO
  ✅ AC3: primer envío → status CREADO
  ✅ AC3: doble envío → status IDEMPOTENT
  ✅ AC3: doble envío no aumenta el nº de movimientos
  ✅ AC3: stock calculado en primer envío es 60
  ✅ AC3: doble envío devuelve el mismo stock (60)
════════════════════════════════════════════════════════════
RESULTADO: 21 pasados, 0 fallidos
```

---

## Flujo de idempotencia (AC3)

```
Cliente                    Supabase RPC
  │                             │
  │── registrar_entrada(...) ──►│
  │   idempotency_key = "IK-X"  │
  │                             │── ¿Existe IK-X? ──► NO
  │                             │── UPDATE inventario + INSERT movimiento
  │◄── { status: "CREADO" } ───│
  │
  │  (doble envío / retry)
  │
  │── registrar_entrada(...) ──►│
  │   idempotency_key = "IK-X"  │
  │                             │── ¿Existe IK-X? ──► SÍ
  │◄── { status: "IDEMPOTENT" }─│  (sin escritura)
```

---

## Trazabilidad

- **Historia:** HU04 · H1; T1
- **Word refs:** 3.3.3 y 4.4
- **Commit base revisado:** `265b7104e9a0dafddd2a6c42ec4f12319efad81b` (TCA-web)
- **Jira Sprint 1:** 13–20 oct 2026
- **Dependencias:** Preparación de datos y alcance acordado

## Equipo Sprint 1

| Rol | Persona |
|-----|---------|
| Líder técnica | Brenda Paola Zapata Mio |
| Scrum Master / UX | Dario Calef Zambrano Leaño |
| Diseño / UI | Joel Jesús Gallo Tume |
| PM / Product Owner | Dylan Fabian Panta Charca |

