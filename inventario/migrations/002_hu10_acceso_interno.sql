-- HU10: acceso interno S1. Aplicar después de 001, en una transacción.
BEGIN;
CREATE TABLE public.equipo_prueba (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  habilitado boolean NOT NULL DEFAULT true
);
ALTER TABLE public.equipo_prueba ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.equipo_prueba FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION public.es_equipo_prueba()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $$ SELECT EXISTS (SELECT 1 FROM public.equipo_prueba WHERE user_id = auth.uid() AND habilitado); $$;
REVOKE ALL ON FUNCTION public.es_equipo_prueba() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.es_equipo_prueba() TO authenticated;
DROP POLICY IF EXISTS inventario_select_auth ON public.inventario;
DROP POLICY IF EXISTS movimientos_select_auth ON public.movimientos_inventario;
CREATE POLICY inventario_select_equipo ON public.inventario FOR SELECT TO authenticated USING ((SELECT public.es_equipo_prueba()));
CREATE POLICY movimientos_select_equipo ON public.movimientos_inventario FOR SELECT TO authenticated USING ((SELECT public.es_equipo_prueba()));
REVOKE ALL ON public.inventario, public.movimientos_inventario FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.inventario, public.movimientos_inventario TO authenticated;
REVOKE ALL ON SEQUENCE public.inventario_id_seq, public.movimientos_inventario_id_seq FROM PUBLIC, anon, authenticated;
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
SET search_path = public, pg_temp
AS $$
DECLARE
    v_inv_id        BIGINT;
    v_stock_antes   INTEGER;
    v_stock_despues INTEGER;
    v_mov_id        BIGINT;
    v_existing_mov  movimientos_inventario%ROWTYPE;
    v_result        JSON;
BEGIN
    IF auth.uid() IS NULL OR NOT public.es_equipo_prueba() THEN
        RAISE EXCEPTION 'ACCESO_DENEGADO: Se requiere una cuenta interna habilitada' USING ERRCODE = '42501';
    END IF;
    p_actor := auth.uid()::text;
    -- Serializa reintentos concurrentes de la misma clave, incluso entre productos.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 0));
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


REVOKE ALL ON FUNCTION public.registrar_entrada(text, integer, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_entrada(text, integer, text, text, text) TO authenticated;
COMMIT;
