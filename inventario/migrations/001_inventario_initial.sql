-- ============================================================
-- HU04: Registrar entradas con inventario persistente
-- Migración 001 — Esquema inicial de inventario
-- Sprint 1 · 13–20 oct 2026
-- Responsable técnica: Brenda Paola Zapata Mio
-- ============================================================

-- ----------------------------------------------------------------
-- 1. Tabla de productos con saldo de stock
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventario (
    id              BIGSERIAL PRIMARY KEY,
    producto_id     TEXT        NOT NULL UNIQUE,   -- clave de negocio (ej. "029085")
    nombre          TEXT        NOT NULL,
    stock_actual    INTEGER     NOT NULL DEFAULT 0 CHECK (stock_actual >= 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger: mantiene updated_at automáticamente
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_inventario_updated_at ON inventario;
CREATE TRIGGER trg_inventario_updated_at
    BEFORE UPDATE ON inventario
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ----------------------------------------------------------------
-- 2. Tabla de movimientos (trazabilidad de entradas y salidas)
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS movimientos_inventario (
    id                  BIGSERIAL PRIMARY KEY,
    inventario_id       BIGINT      NOT NULL REFERENCES inventario(id) ON DELETE RESTRICT,
    tipo_movimiento     TEXT        NOT NULL CHECK (tipo_movimiento IN ('ENTRADA', 'SALIDA', 'AJUSTE')),
    cantidad            INTEGER     NOT NULL CHECK (cantidad > 0),
    stock_antes         INTEGER     NOT NULL,
    stock_despues       INTEGER     NOT NULL,
    actor               TEXT        NOT NULL,          -- usuario/rol que registra
    idempotency_key     TEXT        NOT NULL UNIQUE,   -- previene doble envío
    observacion         TEXT,
    fecha               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice para consultas frecuentes por producto
CREATE INDEX IF NOT EXISTS idx_mov_inventario_id  ON movimientos_inventario(inventario_id);
CREATE INDEX IF NOT EXISTS idx_mov_fecha          ON movimientos_inventario(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_mov_idempotency    ON movimientos_inventario(idempotency_key);

-- ----------------------------------------------------------------
-- 3. Función atómica: registrar_entrada
--    Registra la entrada y actualiza el saldo en una sola TX.
--    Si la idempotency_key ya existe, devuelve el movimiento
--    original sin crear uno nuevo (doble envío seguro).
-- ----------------------------------------------------------------
CREATE OR REPLACE FUNCTION registrar_entrada(
    p_producto_id       TEXT,
    p_cantidad          INTEGER,
    p_actor             TEXT,
    p_idempotency_key   TEXT,
    p_observacion       TEXT DEFAULT NULL
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_inv_id        BIGINT;
    v_stock_antes   INTEGER;
    v_stock_despues INTEGER;
    v_mov_id        BIGINT;
    v_existing_mov  movimientos_inventario%ROWTYPE;
    v_result        JSON;
BEGIN
    -- Guard: cantidad debe ser positiva
    IF p_cantidad IS NULL OR p_cantidad <= 0 THEN
        RAISE EXCEPTION 'CANTIDAD_INVALIDA: La cantidad debe ser un entero positivo (recibido: %)', p_cantidad
            USING ERRCODE = 'P0001';
    END IF;

    -- Guard: actor requerido
    IF p_actor IS NULL OR TRIM(p_actor) = '' THEN
        RAISE EXCEPTION 'ACTOR_REQUERIDO: El campo actor no puede estar vacío'
            USING ERRCODE = 'P0002';
    END IF;

    -- Guard: idempotency_key requerida
    IF p_idempotency_key IS NULL OR TRIM(p_idempotency_key) = '' THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUERIDA: Se requiere una clave de idempotencia'
            USING ERRCODE = 'P0003';
    END IF;

    -- Idempotencia: si la clave ya existe, devolver el movimiento existente
    SELECT * INTO v_existing_mov
    FROM movimientos_inventario
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
        RETURN json_build_object(
            'status',           'IDEMPOTENT',
            'mensaje',          'Movimiento ya registrado anteriormente; se devuelve el resultado original.',
            'movimiento_id',    v_existing_mov.id,
            'stock_despues',    v_existing_mov.stock_despues,
            'fecha',            v_existing_mov.fecha
        );
    END IF;

    -- Bloquear la fila del producto para evitar condición de carrera
    SELECT id, stock_actual INTO v_inv_id, v_stock_antes
    FROM inventario
    WHERE producto_id = p_producto_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PRODUCTO_NO_ENCONTRADO: No existe un producto con producto_id = %', p_producto_id
            USING ERRCODE = 'P0004';
    END IF;

    v_stock_despues := v_stock_antes + p_cantidad;

    -- Actualizar saldo
    UPDATE inventario
    SET stock_actual = v_stock_despues
    WHERE id = v_inv_id;

    -- Registrar movimiento
    INSERT INTO movimientos_inventario (
        inventario_id,
        tipo_movimiento,
        cantidad,
        stock_antes,
        stock_despues,
        actor,
        idempotency_key,
        observacion
    ) VALUES (
        v_inv_id,
        'ENTRADA',
        p_cantidad,
        v_stock_antes,
        v_stock_despues,
        p_actor,
        p_idempotency_key,
        p_observacion
    )
    RETURNING id INTO v_mov_id;

    RETURN json_build_object(
        'status',           'CREADO',
        'mensaje',          'Entrada registrada correctamente.',
        'movimiento_id',    v_mov_id,
        'stock_antes',      v_stock_antes,
        'stock_despues',    v_stock_despues,
        'fecha',            NOW()
    );
END;
$$;

-- ----------------------------------------------------------------
-- 4. Row-Level Security (RLS) — Supabase Auth
-- ----------------------------------------------------------------
ALTER TABLE inventario ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_inventario ENABLE ROW LEVEL SECURITY;

-- Solo usuarios autenticados pueden leer inventario
CREATE POLICY "inventario_select_auth"
    ON inventario FOR SELECT
    TO authenticated
    USING (true);

-- Solo usuarios autenticados pueden leer movimientos
CREATE POLICY "movimientos_select_auth"
    ON movimientos_inventario FOR SELECT
    TO authenticated
    USING (true);

-- INSERT/UPDATE del inventario solo vía la función SECURITY DEFINER
-- (Los clients no deben modificar directamente las tablas)
CREATE POLICY "inventario_no_direct_insert"
    ON inventario FOR INSERT
    TO authenticated
    WITH CHECK (false);

CREATE POLICY "movimientos_no_direct_insert"
    ON movimientos_inventario FOR INSERT
    TO authenticated
    WITH CHECK (false);

-- ----------------------------------------------------------------
-- 5. Datos de ejemplo para las pruebas de aceptación
--    stock inicial = 20 (criterio HU04)
-- ----------------------------------------------------------------
INSERT INTO inventario (producto_id, nombre, stock_actual)
VALUES ('PROD-TEST-001', 'Producto de prueba HU04', 20)
ON CONFLICT (producto_id) DO NOTHING;

-- ----------------------------------------------------------------
-- 6. Comentarios de trazabilidad
-- ----------------------------------------------------------------
COMMENT ON TABLE inventario IS
    'HU04 · Stock actual de cada producto. Actualizado atómicamente por registrar_entrada().';
COMMENT ON TABLE movimientos_inventario IS
    'HU04 · Historial de movimientos. idempotency_key garantiza que dobles envíos no generen filas duplicadas.';
COMMENT ON FUNCTION registrar_entrada IS
    'HU04 · Función atómica: valida cantidad, verifica idempotencia, actualiza saldo y registra movimiento en una sola transacción.';

