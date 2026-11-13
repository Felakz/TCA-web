-- Ejecutar como administrador en un proyecto de prueba, después de 001 y 002.
-- Todas las comprobaciones se revierten. Cualquier excepción inesperada indica fallo.
BEGIN;
DO $$
BEGIN
  IF has_table_privilege('anon', 'public.inventario', 'SELECT') OR
     has_table_privilege('anon', 'public.movimientos_inventario', 'SELECT') THEN
    RAISE EXCEPTION 'FALLO: anon puede leer tablas privadas';
  END IF;
  IF has_function_privilege('anon', 'public.registrar_entrada(text,integer,text,text,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'FALLO: anon puede ejecutar registrar_entrada';
  END IF;
  IF has_table_privilege('authenticated', 'public.equipo_prueba', 'INSERT') OR
     has_table_privilege('authenticated', 'public.inventario', 'UPDATE') OR
     has_table_privilege('authenticated', 'public.movimientos_inventario', 'INSERT') THEN
    RAISE EXCEPTION 'FALLO: escritura directa permitida';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE oid IN ('public.inventario'::regclass,
    'public.movimientos_inventario'::regclass, 'public.equipo_prueba'::regclass) AND NOT relrowsecurity) THEN
    RAISE EXCEPTION 'FALLO: falta RLS';
  END IF;
END $$;
SELECT set_config('request.jwt.claims', '{}', true);
SELECT set_config('request.jwt.claim.sub', '', true);
DO $$
BEGIN
  BEGIN
    PERFORM public.registrar_entrada('PROD-TEST-001', 40, 'actor-falso', 'HU10-SIN-SESION', NULL);
    RAISE EXCEPTION 'FALLO: operación sin sesión aceptada';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK: guardia SQL rechaza operación sin sesión';
  END;
END $$;
SET LOCAL ROLE anon;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.inventario LIMIT 1;
    RAISE EXCEPTION 'FALLO: lectura anónima aceptada';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK: permisos rechazan lectura anónima';
  END;
END $$;
ROLLBACK;
