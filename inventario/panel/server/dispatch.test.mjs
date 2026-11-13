import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase, createUser } from './db.mjs';
test('HU06: despacho único, constancia persistente, rollback y carreras entre sesiones', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tca-hu06-'));
  const path = join(directory, 'test.sqlite');
  const setup = openDatabase(path);
  createUser(setup, 'ventas1@example.test', 'solo-pruebas-ventas-123');
  createUser(setup, 'ventas2@example.test', 'solo-pruebas-ventas-123');
  setup.prepare('UPDATE inventario SET stock_actual=30').run();
  setup.prepare('INSERT INTO inventario VALUES(?,?,?)').run('OTRO', 'Otro producto', 2);
  setup.prepare('UPDATE inventario SET stock_actual=30 WHERE producto_id=?').run('OTRO');
  setup.close();
  const workers = [];
  async function connect(email) {
    const worker = new Worker(new URL('./orders-worker.mjs', import.meta.url), { workerData: path });
    workers.push(worker);
    const [port] = await once(worker, 'message');
    let cookie;
    async function call(route, body, authenticated = true) {
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
    const order = (id, lineas = [{ producto_id: 'PROD-TEST-001', cantidad: 10 }]) => ({ id, lineas });
    const stock = async () => (await (await first('inventario')).json()).find(p => p.producto_id === 'PROD-TEST-001');
    assert.equal((await first('pedidos/test/despachar', {}, false)).status, 401);
    assert.equal((await first('pedidos/test/constancia', undefined, false)).status, 401);
    assert.equal((await first('pedidos/inexistente/despachar', {})).status, 404);
    assert.equal((await first('pedidos/confirmar', order('normal'))).status, 200);
    assert.equal((await first('pedidos/normal/constancia')).status, 404);
    assert.equal((await stock()).stock_actual, 30); assert.equal((await stock()).reservado, 10);
    const parallel = await Promise.all([first('pedidos/normal/despachar', {}), second('pedidos/normal/despachar', {})]);
    assert.ok(parallel.every(r => r.status === 200));
    const outcomes = await Promise.all(parallel.map(r => r.json()));
    assert.deepEqual(outcomes.map(r => r.idempotente).sort(), [false, true]);
    assert.deepEqual(outcomes[0].constancia, outcomes[1].constancia);
    assert.equal((await stock()).stock_actual, 20); assert.equal((await stock()).reservado, 0); assert.equal((await stock()).disponible, 20);
    const receipt = outcomes[0].constancia;
    assert.match(receipt.leyenda, /SIN VALOR TRIBUTARIO/); assert.equal(receipt.lineas[0].cantidad, 10);
    assert.equal(receipt.lineas[0].stock_antes, 30); assert.equal(receipt.lineas[0].stock_despues, 20);
    const again = await (await first('pedidos/normal/despachar', {})).json();
    assert.equal(again.idempotente, true); assert.deepEqual(again.constancia, receipt);
    assert.equal((await first('pedidos/normal/cancelar', {})).status, 409);
    assert.equal((await first('pedidos/confirmar', order('normal'))).status, 409);
    const db = openDatabase(path);
    try {
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM movimientos_inventario WHERE tipo_movimiento='SALIDA' AND pedido_id='normal'").get().n, 1);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM despachos WHERE pedido_id='normal'").get().n, 1);
      assert.equal(db.prepare('PRAGMA foreign_key_check').all().length, 0);
      db.prepare("UPDATE inventario SET nombre='Nombre nuevo' WHERE producto_id='PROD-TEST-001'").run();
      assert.deepEqual(await (await first('pedidos/normal/constancia')).json(), receipt);
      assert.equal((await first('pedidos/confirmar', order('cancelado'))).status, 200);
      assert.equal((await first('pedidos/cancelado/cancelar', {})).status, 200);
      assert.equal((await first('pedidos/cancelado/despachar', {})).status, 409);
      assert.equal((await first('pedidos/confirmar', order('atomic', [{ producto_id: 'OTRO', cantidad: 2 }, { producto_id: 'PROD-TEST-001', cantidad: 3 }]))).status, 200);
      // Falla inducida después de procesar la primera línea: debe deshacer TODO.
      db.exec("CREATE TRIGGER fallo_salida BEFORE INSERT ON movimientos_inventario WHEN NEW.tipo_movimiento='SALIDA' AND NEW.producto_id='PROD-TEST-001' BEGIN SELECT RAISE(ABORT,'fallo de prueba'); END");
      assert.equal((await first('pedidos/atomic/despachar', {})).status, 500);
      assert.equal(db.prepare("SELECT stock_actual FROM inventario WHERE producto_id='OTRO'").get().stock_actual, 30);
      assert.equal(db.prepare("SELECT estado FROM pedidos WHERE id='atomic'").get().estado, 'CONFIRMADO');
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM movimientos_inventario WHERE pedido_id='atomic'").get().n, 0);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM despachos WHERE pedido_id='atomic'").get().n, 0);
      assert.equal((await stock()).reservado, 3);
      db.exec('DROP TRIGGER fallo_salida');
      assert.equal((await first('pedidos/atomic/despachar', {})).status, 200);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM movimientos_inventario WHERE pedido_id='atomic'").get().n, 2);
      assert.equal((await stock()).stock_actual, 17); assert.equal((await stock()).reservado, 0);
      assert.equal((await first('pedidos/confirmar', order('race'))).status, 200);
      const race = await Promise.all([first('pedidos/race/despachar', {}), second('pedidos/race/cancelar', {})]);
      assert.deepEqual(race.map(r => r.status).sort(), [200, 409]);
      const state = db.prepare("SELECT estado FROM pedidos WHERE id='race'").get().estado;
      assert.ok(['DESPACHADO', 'CANCELADO'].includes(state));
      assert.equal((await stock()).stock_actual, state === 'DESPACHADO' ? 7 : 17);
      assert.equal((await stock()).reservado, 0);
      assert.equal(db.prepare("SELECT COUNT(*) AS n FROM despachos WHERE pedido_id='race'").get().n, state === 'DESPACHADO' ? 1 : 0);
    } finally { db.close(); }
  } finally {
    await Promise.all(workers.map(async worker => { const stopped = once(worker, 'exit'); worker.postMessage('stop'); await stopped; }));
    rmSync(directory, { recursive: true });
  }
});
