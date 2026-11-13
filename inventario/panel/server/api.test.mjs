import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase, createUser } from './db.mjs';
import { createApp } from './app.mjs';
test('SQLite: autenticación, autorización, entradas persistentes e invalidación de sesión', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'tca-hu10-'));
  const path = join(directory, 'test.sqlite');
  const db = openDatabase(path);
  createUser(db, 'test@example.test', 'clave-solo-para-test-123');
  const server = createApp(db); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api/`;
  async function request(route, body, cookie) {
    return fetch(base + route, { headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) }, ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }) });
  }
  try {
    assert.equal((await request('inventario')).status, 401);
    assert.equal((await request('movimientos')).status, 401);
    assert.equal((await request('entradas', {})).status, 401);
    assert.equal((await request('login', { email: 'test@example.test', password: 'incorrecta' })).status, 401);
    const login = await request('login', { email: 'test@example.test', password: 'clave-solo-para-test-123' });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie');
    assert.match(cookie, /HttpOnly/); assert.match(cookie, /SameSite=Strict/);
    assert.equal((await (await request('session', undefined, cookie)).json()).session.user.email, 'test@example.test');
    assert.equal((await request('inventario', undefined, cookie)).status, 200);
    const entry = { p_producto_id: 'PROD-TEST-001', p_cantidad: 40, p_idempotency_key: 'test-key', p_actor: 'falsificado' };
    assert.equal((await request('entradas', { ...entry, p_cantidad: -1 }, cookie)).status, 400);
    const created = await (await request('entradas', entry, cookie)).json();
    assert.equal(created.stock_despues, 60);
    const retry = await (await request('entradas', entry, cookie)).json();
    assert.equal(retry.status, 'IDEMPOTENT');
    assert.equal((await request('entradas', { ...entry, p_cantidad: 2 }, cookie)).status, 409);
    const rows = await (await request('movimientos?producto=PROD-TEST-001', undefined, cookie)).json();
    assert.equal(rows.length, 1); assert.notEqual(rows[0].actor, 'falsificado');
    db.prepare('UPDATE usuarios SET habilitado=0').run();
    assert.equal((await request('inventario', undefined, cookie)).status, 401);
    db.prepare('UPDATE usuarios SET habilitado=1').run();
    assert.equal((await request('logout', {}, cookie)).status, 200);
    assert.equal((await request('inventario', undefined, cookie)).status, 401);
    assert.equal((await (await request('session', undefined, cookie)).json()).session, null);
    const saved = openDatabase(path);
    assert.equal(saved.prepare('SELECT stock_actual FROM inventario').get().stock_actual, 60);
    saved.close();
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); db.close(); rmSync(directory, { recursive: true }); }
});
