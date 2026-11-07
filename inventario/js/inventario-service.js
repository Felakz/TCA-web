/**
 * inventario-service.js
 * HU04 — Registrar entradas con inventario persistente
 *
 * Capa de servicio para interactuar con Supabase.
 * Maneja validación, idempotencia y llamadas RPC.
 *
 * Sprint 1 · 13–20 oct 2026
 * Responsable: Brenda Paola Zapata Mio
 */

'use strict';

// ----------------------------------------------------------------
// Configuración Supabase (reemplazar con valores reales del proyecto)
// ----------------------------------------------------------------
const SUPABASE_URL = window.__ENV__?.SUPABASE_URL || 'https://TU_PROYECTO.supabase.co';
const SUPABASE_ANON_KEY = window.__ENV__?.SUPABASE_ANON_KEY || 'TU_ANON_KEY';

// ----------------------------------------------------------------
// Errores de dominio
// ----------------------------------------------------------------
export class InventarioError extends Error {
    /**
     * @param {string} code   - Código de error (ej. 'CANTIDAD_INVALIDA')
     * @param {string} mensaje
     */
    constructor(code, mensaje) {
        super(mensaje);
        this.code = code;
        this.name = 'InventarioError';
    }
}

// ----------------------------------------------------------------
// Validación de entrada (pura, sin efectos secundarios)
// ----------------------------------------------------------------

/**
 * Valida los parámetros de una entrada de inventario.
 * @param {object} params
 * @param {string} params.productoId
 * @param {number} params.cantidad
 * @param {string} params.actor
 * @param {string} params.idempotencyKey
 * @throws {InventarioError} si algún parámetro es inválido
 */
export function validarEntrada({ productoId, cantidad, actor, idempotencyKey }) {
    if (!productoId || typeof productoId !== 'string' || productoId.trim() === '') {
        throw new InventarioError('PRODUCTO_REQUERIDO', 'El producto es obligatorio.');
    }

    // Cantidad: debe ser un entero positivo
    if (
        cantidad === null ||
        cantidad === undefined ||
        typeof cantidad !== 'number' ||
        !Number.isInteger(cantidad) ||
        cantidad <= 0
    ) {
        throw new InventarioError(
            'CANTIDAD_INVALIDA',
            `La cantidad debe ser un entero positivo (recibido: ${cantidad}).`
        );
    }

    if (!actor || typeof actor !== 'string' || actor.trim() === '') {
        throw new InventarioError('ACTOR_REQUERIDO', 'El actor es obligatorio.');
    }

    if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim() === '') {
        throw new InventarioError('IDEMPOTENCY_KEY_REQUERIDA', 'Se requiere una clave de idempotencia.');
    }
}

// ----------------------------------------------------------------
// Generador de idempotency key
// ----------------------------------------------------------------

/**
 * Genera una clave de idempotencia determinista a partir del contexto
 * o aleatoria (UUID v4-compatible) si no se provee contexto.
 *
 * Para doble envío: el cliente debe reutilizar la MISMA clave
 * al reintentar la misma operación.
 *
 * @param {string} [contexto] - e.g. "PROD-001|almacen@tca.pe|2026-11-05"
 * @returns {string}
 */
export function generarIdempotencyKey(contexto) {
    if (contexto) {
        // Clave legible y reproducible para testing
        return `IK-${contexto.replace(/[^a-z0-9]/gi, '-').toUpperCase()}`;
    }
    // UUID v4 simplificado (suficiente para propósitos de idempotencia)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    });
}

// ----------------------------------------------------------------
// Servicio principal — InventarioService
// ----------------------------------------------------------------

export class InventarioService {
    /**
     * @param {import('@supabase/supabase-js').SupabaseClient} supabaseClient
     */
    constructor(supabaseClient) {
        if (!supabaseClient) {
            throw new Error('Se requiere un cliente Supabase.');
        }
        this._client = supabaseClient;
    }

    /**
     * Registra una entrada de inventario de forma atómica.
     * Un doble envío con la misma idempotency_key devuelve el
     * resultado original sin crear movimientos adicionales.
     *
     * @param {object} params
     * @param {string}  params.productoId      - ID de negocio del producto
     * @param {number}  params.cantidad        - Entero positivo
     * @param {string}  params.actor           - Usuario/rol que registra
     * @param {string}  params.idempotencyKey  - Clave única de idempotencia
     * @param {string}  [params.observacion]   - Nota opcional
     *
     * @returns {Promise<{
     *   status: 'CREADO' | 'IDEMPOTENT',
     *   mensaje: string,
     *   movimientoId: number,
     *   stockDespues: number,
     *   fecha: string
     * }>}
     * @throws {InventarioError}
     */
    async registrarEntrada(params) {
        const { productoId, cantidad, actor, idempotencyKey, observacion } = params;

        // Validación en cliente (falla rápida antes de llamar a la DB)
        validarEntrada({ productoId, cantidad, actor, idempotencyKey });

        const { data, error } = await this._client.rpc('registrar_entrada', {
            p_producto_id:      productoId,
            p_cantidad:         cantidad,
            p_actor:            actor,
            p_idempotency_key:  idempotencyKey,
            p_observacion:      observacion ?? null
        });

        if (error) {
            // Mapear errores de PostgreSQL a InventarioError
            const msg = error.message ?? '';
            if (msg.includes('CANTIDAD_INVALIDA'))       throw new InventarioError('CANTIDAD_INVALIDA', msg);
            if (msg.includes('ACTOR_REQUERIDO'))         throw new InventarioError('ACTOR_REQUERIDO', msg);
            if (msg.includes('IDEMPOTENCY_KEY_REQUERIDA')) throw new InventarioError('IDEMPOTENCY_KEY_REQUERIDA', msg);
            if (msg.includes('PRODUCTO_NO_ENCONTRADO'))  throw new InventarioError('PRODUCTO_NO_ENCONTRADO', msg);
            throw new InventarioError('ERROR_DB', error.message);
        }

        return {
            status:       data.status,
            mensaje:      data.mensaje,
            movimientoId: data.movimiento_id,
            stockDespues: data.stock_despues,
            fecha:        data.fecha
        };
    }

    /**
     * Obtiene el stock actual de un producto.
     * @param {string} productoId
     * @returns {Promise<{productoId:string, nombre:string, stockActual:number}>}
     */
    async obtenerStock(productoId) {
        const { data, error } = await this._client
            .from('inventario')
            .select('producto_id, nombre, stock_actual')
            .eq('producto_id', productoId)
            .single();

        if (error || !data) {
            throw new InventarioError('PRODUCTO_NO_ENCONTRADO', `No se encontró el producto: ${productoId}`);
        }

        return {
            productoId:   data.producto_id,
            nombre:       data.nombre,
            stockActual:  data.stock_actual
        };
    }

    /**
     * Obtiene el historial de movimientos de un producto.
     * @param {string}  productoId
     * @param {number}  [limite=20]
     * @returns {Promise<Array>}
     */
    async obtenerMovimientos(productoId, limite = 20) {
        const { data, error } = await this._client
            .from('movimientos_inventario')
            .select(`
                id,
                tipo_movimiento,
                cantidad,
                stock_antes,
                stock_despues,
                actor,
                observacion,
                fecha,
                inventario!inner(producto_id)
            `)
            .eq('inventario.producto_id', productoId)
            .order('fecha', { ascending: false })
            .limit(limite);

        if (error) throw new InventarioError('ERROR_DB', error.message);
        return data ?? [];
    }
}

// ----------------------------------------------------------------
// Factory: crea el servicio con el cliente Supabase global
// ----------------------------------------------------------------

/** @type {InventarioService | null} */
let _servicioSingleton = null;

/**
 * Devuelve (o crea) el singleton de InventarioService.
 * Requiere que `window.supabase` esté inicializado.
 */
export function getInventarioService() {
    if (!_servicioSingleton) {
        if (!window.supabaseClient) {
            throw new Error(
                'Supabase no está inicializado. ' +
                'Asegúrate de llamar a initSupabase() antes de usar el servicio.'
            );
        }
        _servicioSingleton = new InventarioService(window.supabaseClient);
    }
    return _servicioSingleton;
}

/**
 * Inicializa el cliente Supabase y lo almacena en window.
 * Llamar antes de cualquier operación de inventario.
 */
export function initSupabase() {
    if (window.supabaseClient) return window.supabaseClient;
    // La librería de Supabase expone `supabase` globalmente desde el CDN
    window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return window.supabaseClient;
}

