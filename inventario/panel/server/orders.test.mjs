import { fixtureRole } from './test-access.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase, createUser } from './db.mjs';
test('HU05: reservas atómicas entre dos sesiones y conexiones SQLite independientes', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tca-hu05-'));
  const path = join(directory, 'test.sqlite');
  const setup = openDatabase(path);
  createUser(setup, 'ventas1@example.test', 'solo-pruebas-ventas-123');
  createUser(setup, 'ventas2@example.test', 'solo-pruebas-ventas-123');
  setup.prepare('UPDATE inventario SET stock_actual=30').run();
  setup.prepare('INSERT INTO inventario VALUES(?,?,?)').run('OTRO', 'Otro producto', 2);
  setup.close();
  const workers = [];
  async function connect(email) {
    const worker = new Worker(new URL('./orders-worker.mjs', import.meta.url), { workerData: path });
    workers.push(worker);
    const [port] = await once(worker, 'message');
    let cookie;
    async function call(route, body, authenticated = true) {
      if (authenticated && cookie) { const access = openDatabase(path); access.prepare('UPDATE usuarios SET rol=? WHERE email=?').run(fixtureRole(route),email); access.close(); }
      return fetch(`http://127.0.0.1:${port}/api/${route}`, {
        headers: { 'Content-Type': 'application/json', ...(authenticated && cookie ? { Cookie: cookie } : {}) },
        ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) })
      });
    }
    const response = await call('login', { email, password: 'solo-pruebas-ventas-123' });
    assert.equal(response.status, 200); cookie = response.headers.get('set-cookie');
    return call;
  }
  try {
    const first = await connect('ventas1@example.test');
    const second = await connect('ventas2@example.test');
    const order = (id, cantidad, producto_id = 'PROD-TEST-001') => ({ id, lineas: [{ producto_id, cantidad }] });
    const inventory = async () => (await (await first('inventario')).json()).find(p => p.producto_id === 'PROD-TEST-001');
    assert.equal((await first('pedidos', undefined, false)).status, 401);
    assert.equal((await first('pedidos/confirmar', order('anon', 1), false)).status, 401);
    assert.equal((await first('pedidos/anon/cancelar', {}, false)).status, 401);
    for (const amount of [0, -1, 1.5, '10', null, 2147483648]) assert.equal((await first('pedidos/confirmar', order('invalid', amount))).status, 400);
    assert.equal((await first('pedidos/confirmar', { id: 'empty', lineas: [] })).status, 400);
    assert.equal((await first('pedidos/confirmar', { id: 'duplicate', lineas: [{ producto_id: 'PROD-TEST-001', cantidad: 1 }, { producto_id: 'PROD-TEST-001', cantidad: 1 }] })).status, 400);
    assert.equal((await first('pedidos/confirmar', order('missing', 1, 'INEXISTENTE'))).status, 404);
    assert.equal((await first('pedidos/confirmar', order('base', 10))).status, 200);
    assert.deepEqual(await inventory(), { producto_id: 'PROD-TEST-001', nombre: 'Producto de prueba HU04', stock_actual: 30, reservado: 10, disponible: 20 });
    assert.equal((await (await first('pedidos/confirmar', order('base', 10))).json()).idempotente, true);
    assert.equal((await first('pedidos/confirmar', order('base', 11))).status, 409);
    assert.equal((await second('pedidos/confirmar', order('base', 10))).status, 409);
    assert.equal((await first('pedidos/confirmar', order('excess', 21))).status, 409);
    // Ninguna línea queda reservada cuando falla otra en la misma transacción.
    assert.equal((await first('pedidos/confirmar', { id: 'atomic', lineas: [{ producto_id: 'PROD-TEST-001', cantidad: 1 }, { producto_id: 'OTRO', cantidad: 3 }] })).status, 409);
    assert.equal((await inventory()).reservado, 10);
    const competing = await Promise.all([first('pedidos/confirmar', order('race1', 20)), second('pedidos/confirmar', order('race2', 20))]);
    assert.deepEqual(competing.map(r => r.status).sort(), [200, 409]);
    assert.equal((await inventory()).reservado, 30); assert.equal((await inventory()).disponible, 0);
    const winningId = competing[0].status === 200 ? 'race1' : 'race2';
    const canceled = await Promise.all([first(`pedidos/${winningId}/cancelar`, {}), second(`pedidos/${winningId}/cancelar`, {})]);
    assert.ok(canceled.every(r => r.status === 200));
    const outcomes = await Promise.all(canceled.map(r => r.json()));
    assert.deepEqual(outcomes.map(r => r.idempotente).sort(), [false, true]);
    assert.equal((await inventory()).reservado, 10); assert.equal((await inventory()).disponible, 20);
    assert.equal((await first('pedidos/confirmar', order(winningId, 20))).status, 409);
    assert.equal((await first('pedidos/not-found/cancelar', {})).status, 404);
    const persisted = openDatabase(path);
    assert.equal(persisted.prepare("SELECT disponible FROM inventario_disponible WHERE producto_id='PROD-TEST-001'").get().disponible, 20);
    assert.equal(persisted.prepare("SELECT COUNT(*) AS n FROM pedidos WHERE id='atomic'").get().n, 0);
    persisted.close();
    assert.equal((await first('pedidos/base/cancelar', {})).status, 200);
    assert.equal((await inventory()).disponible, 30);
  } finally {
    await Promise.all(workers.map(async worker => { const stopped = once(worker, 'exit'); worker.postMessage('stop'); await stopped; }));
    rmSync(directory, { recursive: true });
  }
});
