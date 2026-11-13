import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, createUser } from './db.mjs';
import { createApp } from './app.mjs';
test('HU08: mínimo inclusivo, reservas, propuestas revisables y persistencia', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tca-hu08-'));
  const path = join(directory, 'test.sqlite');
  const db = openDatabase(path);
  createUser(db, 'test@example.test', 'clave-solo-para-test-123');
  const server = createApp(db); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/`;
  async function request(route, body, cookie) {
    return fetch(base + route, { headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) });
  }
  try {
    assert.equal((await request('reposicion')).status, 401);
    assert.equal((await request('reposicion/configurar', {})).status, 401);
    assert.equal((await request('reposicion/propuestas', {})).status, 401);
    assert.equal((await request('reposicion/propuestas/test/revisar', {})).status, 401);
    const login = await request('login', { email: 'test@example.test', password: 'clave-solo-para-test-123' });
    const cookie = login.headers.get('set-cookie');
    const call = (route, body) => request(route, body, cookie);
    const state = async () => (await (await call('reposicion')).json());
    const product = async () => (await state()).productos[0];
    const config = { producto_id: 'PROD-TEST-001', minimo: 10, objetivo: 30, habilitado: true };
    assert.equal((await product()).habilitado, 0);
    assert.equal((await call('reposicion/configurar', config)).status, 200);
    assert.equal((await product()).alerta, 0);
    for (const minimo of [-1, 0.5, '10', null]) assert.equal((await call('reposicion/configurar', { ...config, minimo })).status, 400);
    assert.equal((await call('reposicion/configurar', { ...config, objetivo: 10 })).status, 400);
    assert.equal((await call('reposicion/configurar', { ...config, producto_id: 'missing' })).status, 404);
    assert.equal((await call('pedidos/confirmar', { id: 'reserva', lineas: [{ producto_id: config.producto_id, cantidad: 10 }] })).status, 200);
    let row = await product();
    assert.equal(row.stock_actual, 20); assert.equal(row.reservado, 10); assert.equal(row.disponible, 10);
    assert.equal(row.alerta, 1); assert.equal(row.sugerido, 20); // La igualdad ya alerta.
    const proposal = { id: 'compra-1', producto_id: config.producto_id, cantidad: row.sugerido, observacion: 'Revisar con gerencia' };
    assert.equal((await call('reposicion/propuestas', proposal)).status, 200);
    assert.equal((await call('reposicion/propuestas', proposal)).status, 200);
    assert.equal((await state()).propuestas.length, 1);
    assert.equal((await call('reposicion/propuestas', { ...proposal, id: 'duplicada' })).status, 409);
    assert.equal((await call('reposicion/propuestas', { ...proposal, cantidad: 0 })).status, 400);
    assert.equal((await call('reposicion/propuestas', { ...proposal, cantidad: 11 })).status, 409);
    const revisions = await Promise.all([
      call('reposicion/propuestas/compra-1/revisar', { cantidad: 25, observacion: 'Revisión A', version: 1 }),
      call('reposicion/propuestas/compra-1/revisar', { cantidad: 26, observacion: 'Revisión B', version: 1 })
    ]);
    assert.deepEqual(revisions.map(r => r.status).sort(), [200, 409]);
    const saved = (await state()).propuestas[0];
    assert.equal(saved.version, 2); assert.ok([25,26].includes(saved.cantidad));
    assert.equal(saved.estado, 'BORRADOR'); assert.equal(saved.disponible_origen, 10);
    assert.equal((await call('reposicion/propuestas/compra-1/enviar', {})).status, 404);
    assert.equal((await call('pedidos/reserva/cancelar', {})).status, 200);
    assert.equal((await product()).alerta, 0);
    assert.equal((await state()).propuestas[0].cantidad, saved.cantidad);
    assert.equal((await call('reposicion/propuestas', { ...proposal, id: 'sin-alerta' })).status, 409);
    assert.equal((await call('reposicion/configurar', { ...config, minimo: 20 })).status, 200);
    assert.equal((await product()).alerta, 1);
    assert.equal((await call('entradas', { p_producto_id: config.producto_id, p_cantidad: 1, p_idempotency_key: 'entrada-hu08' })).status, 200);
    assert.equal((await product()).alerta, 0);
    assert.equal((await call('reposicion/configurar', { ...config, minimo: 25 })).status, 200);
    assert.equal((await product()).alerta, 1); // Debajo del mínimo.
    assert.equal((await call('reposicion/configurar', { ...config, minimo: 25, habilitado: false })).status, 200);
    assert.equal((await product()).alerta, 0);
    const reopened = openDatabase(path);
    assert.equal(reopened.prepare('SELECT COUNT(*) AS n FROM propuestas_compra').get().n, 1);
    assert.equal(reopened.prepare('SELECT version FROM propuestas_compra').get().version, 2);
    assert.equal(reopened.prepare('SELECT minimo FROM reposicion_config').get().minimo, 25);
    assert.equal(reopened.prepare('SELECT stock_actual FROM inventario').get().stock_actual, 21);
    assert.equal(reopened.prepare('PRAGMA foreign_key_check').all().length, 0);
    reopened.close();
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); db.close(); rmSync(directory, { recursive: true }); }
});
