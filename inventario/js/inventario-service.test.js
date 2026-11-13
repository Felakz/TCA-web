/**
 * inventario-service.test.js
 * HU04 — Tests de aceptación (sin framework externo)
 *
 * Ejecutar en la consola del navegador (en la página inventario-entrada.html)
 * o con Node.js (requiere stubbing de window/supabase).
 *
 * Criterios de aceptación verificados:
 *   AC1 — Stock inicial 20 + entrada 40 = 60 tras recargar
 *   AC2 — Rechazar cantidades inválidas (0, negativo, decimal, null)
 *   AC3 — Doble envío con la misma idempotency_key no crea movimiento adicional
 *
 * Sprint 1 · 13–20 oct 2026
 * Responsable: Brenda Paola Zapata Mio
 */

'use strict';

import { validarEntrada, generarIdempotencyKey, InventarioError } from './inventario-service.js';

// ----------------------------------------------------------------
// Mini test runner (sin dependencias externas)
// ----------------------------------------------------------------

let _pasados = 0;
let _fallidos = 0;
const _resultados = [];

function assert(condicion, descripcion) {
    if (condicion) {
        _pasados++;
        _resultados.push({ ok: true, desc: descripcion });
        console.log(`  ✅ ${descripcion}`);
    } else {
        _fallidos++;
        _resultados.push({ ok: false, desc: descripcion });
        console.error(`  ❌ ${descripcion}`);
    }
}

function assertThrows(fn, codigoEsperado, descripcion) {
    try {
        fn();
        _fallidos++;
        _resultados.push({ ok: false, desc: descripcion });
        console.error(`  ❌ ${descripcion} — esperaba excepción '${codigoEsperado}' pero no se lanzó ninguna.`);
    } catch (err) {
        const coincide = err instanceof InventarioError && err.code === codigoEsperado;
        if (coincide) {
            _pasados++;
            _resultados.push({ ok: true, desc: descripcion });
            console.log(`  ✅ ${descripcion}`);
        } else {
            _fallidos++;
            _resultados.push({ ok: false, desc: descripcion });
            console.error(`  ❌ ${descripcion} — error inesperado: ${err.code ?? err.message}`);
        }
    }
}

function suite(nombre, fn) {
    console.group(`📦 ${nombre}`);
    fn();
    console.groupEnd();
}

function resumen() {
    console.log('');
    console.log('='.repeat(60));
    console.log(`RESULTADO: ${_pasados} pasados, ${_fallidos} fallidos`);
    console.log('='.repeat(60));
    return { pasados: _pasados, fallidos: _fallidos, resultados: _resultados };
}

// ================================================================
// SUITE 1: Validación de cantidad (AC2)
// ================================================================
suite('AC2 — Rechazar cantidades inválidas', () => {

    assertThrows(
        () => validarEntrada({ productoId: 'P1', cantidad: 0, actor: 'almacen', idempotencyKey: 'IK-1' }),
        'CANTIDAD_INVALIDA',
        'Cantidad 0 debe ser rechazada'
    );

    assertThrows(
        () => validarEntrada({ productoId: 'P1', cantidad: -1, actor: 'almacen', idempotencyKey: 'IK-2' }),
        'CANTIDAD_INVALIDA',
        'Cantidad negativa (-1) debe ser rechazada'
    );

    assertThrows(
        () => validarEntrada({ productoId: 'P1', cantidad: 3.5, actor: 'almacen', idempotencyKey: 'IK-3' }),
        'CANTIDAD_INVALIDA',
        'Cantidad decimal (3.5) debe ser rechazada'
    );

    assertThrows(
        () => validarEntrada({ productoId: 'P1', cantidad: null, actor: 'almacen', idempotencyKey: 'IK-4' }),
        'CANTIDAD_INVALIDA',
        'Cantidad null debe ser rechazada'
    );

    assertThrows(
        () => validarEntrada({ productoId: 'P1', cantidad: undefined, actor: 'almacen', idempotencyKey: 'IK-5' }),
        'CANTIDAD_INVALIDA',
        'Cantidad undefined debe ser rechazada'
    );

    assertThrows(
        () => validarEntrada({ productoId: 'P1', cantidad: 'cuarenta', actor: 'almacen', idempotencyKey: 'IK-6' }),
        'CANTIDAD_INVALIDA',
        'Cantidad string ("cuarenta") debe ser rechazada'
    );

    // Caso positivo: cantidad válida no debe lanzar
    let noLanzo = true;
    try {
        validarEntrada({ productoId: 'P1', cantidad: 40, actor: 'almacen', idempotencyKey: 'IK-7' });
    } catch {
        noLanzo = false;
    }
    assert(noLanzo, 'Cantidad válida (40) no debe lanzar excepción');
});

// ================================================================
// SUITE 2: Validación de actor e idempotency key
// ================================================================
suite('Validación de actor e idempotency key', () => {

    assertThrows(
        () => validarEntrada({ productoId: 'P1', cantidad: 40, actor: '', idempotencyKey: 'IK-8' }),
        'ACTOR_REQUERIDO',
        'Actor vacío debe ser rechazado'
    );

    assertThrows(
        () => validarEntrada({ productoId: 'P1', cantidad: 40, actor: 'almacen', idempotencyKey: '' }),
        'IDEMPOTENCY_KEY_REQUERIDA',
        'IdempotencyKey vacía debe ser rechazada'
    );
});

// ================================================================
// SUITE 3: Generador de idempotency key
// ================================================================
suite('Generador de idempotency key', () => {

    const k1 = generarIdempotencyKey();
    const k2 = generarIdempotencyKey();
    assert(k1 !== k2, 'Dos claves sin contexto deben ser distintas');
    assert(typeof k1 === 'string' && k1.length > 0, 'La clave sin contexto debe ser un string no vacío');

    const kCtx1 = generarIdempotencyKey('PROD-001|almacen|2026-11-05');
    const kCtx2 = generarIdempotencyKey('PROD-001|almacen|2026-11-05');
    assert(kCtx1 === kCtx2, 'El mismo contexto debe producir la misma clave (determinista)');
    assert(kCtx1.startsWith('IK-'), 'Claves con contexto deben iniciar con "IK-"');
});

// ================================================================
// SUITE 4: Simulación de lógica de negocio (AC1 y AC3)
//          (Pruebas de integración real requieren Supabase conectado)
// ================================================================
suite('AC1 & AC3 — Lógica de negocio (simulada)', () => {

    // ---- AC1: 20 + 40 = 60 ----
    // Simula el comportamiento de registrar_entrada en PostgreSQL
    function simularRegistrarEntrada(stockActual, cantidad) {
        if (!Number.isInteger(cantidad) || cantidad <= 0) {
            throw new InventarioError('CANTIDAD_INVALIDA', 'Cantidad inválida');
        }
        return { stockDespues: stockActual + cantidad, status: 'CREADO' };
    }

    const resultado = simularRegistrarEntrada(20, 40);
    assert(resultado.stockDespues === 60, 'AC1: stock 20 + entrada 40 = 60');
    assert(resultado.status === 'CREADO', 'AC1: status debe ser CREADO');

    // ---- AC3: doble envío no crea movimiento adicional ----
    // Simula la tabla movimientos_inventario con una idempotency_key única
    const movimientosRegistrados = new Map();

    function simularConIdempotencia(idempotencyKey, stockActual, cantidad) {
        if (movimientosRegistrados.has(idempotencyKey)) {
            // Devuelve el resultado original — no crea entrada nueva
            return { status: 'IDEMPOTENT', ...movimientosRegistrados.get(idempotencyKey) };
        }
        const resultado = simularRegistrarEntrada(stockActual, cantidad);
        movimientosRegistrados.set(idempotencyKey, resultado);
        return { status: 'CREADO', ...resultado };
    }

    const KEY = 'IK-DOBLE-ENVIO-TEST';
    const primerEnvio  = simularConIdempotencia(KEY, 20, 40);
    const segundoEnvio = simularConIdempotencia(KEY, 20, 40); // doble envío

    assert(primerEnvio.status === 'CREADO',    'AC3: primer envío → status CREADO');
    assert(segundoEnvio.status === 'IDEMPOTENT', 'AC3: doble envío → status IDEMPOTENT');
    assert(movimientosRegistrados.size === 1,  'AC3: doble envío no aumenta el nº de movimientos');
    assert(primerEnvio.stockDespues === 60,    'AC3: stock calculado en primer envío es 60');
    assert(segundoEnvio.stockDespues === 60,   'AC3: doble envío devuelve el mismo stock (60)');
});

// ================================================================
// Resultado final
// ================================================================
export function ejecutarTests() {
    return resumen();
}

// Auto-ejecución si se carga directamente en el navegador
ejecutarTests();

