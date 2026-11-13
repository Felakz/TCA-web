import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase } from './db.mjs';
test('HU06 migra una base HU05 existente sin perder pedidos, reservas ni entradas', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tca-hu06-migration-'));
  const path = join(directory, 'old.sqlite');
  try {
    const old = new DatabaseSync(path);
    old.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE usuarios(id TEXT PRIMARY KEY,email TEXT NOT NULL UNIQUE,salt TEXT NOT NULL,hash TEXT NOT NULL,habilitado INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE inventario(producto_id TEXT PRIMARY KEY,nombre TEXT NOT NULL,stock_actual INTEGER NOT NULL CHECK(stock_actual>=0));
      CREATE TABLE movimientos_inventario(id INTEGER PRIMARY KEY,producto_id TEXT NOT NULL REFERENCES inventario(producto_id),cantidad INTEGER NOT NULL CHECK(cantidad>0),stock_despues INTEGER NOT NULL,actor TEXT NOT NULL REFERENCES usuarios(id),idempotency_key TEXT NOT NULL UNIQUE,observacion TEXT,fecha TEXT NOT NULL);
      INSERT INTO usuarios VALUES('u','test@example.test','salt','hash',1);
      INSERT INTO inventario VALUES('P','Producto previo',30);
      INSERT INTO movimientos_inventario VALUES(1,'P',30,30,'u','anterior',NULL,'2026-11-12');`);
    old.exec(readFileSync(new URL('../../migrations/sqlite/002_hu05_reservas.sql', import.meta.url), 'utf8'));
    old.exec("INSERT INTO pedidos VALUES('previo','CONFIRMADO','u','2026-11-12',NULL,NULL); INSERT INTO pedido_lineas VALUES('previo','P',10)");
    old.close();
    const migrated = openDatabase(path);
    assert.equal(migrated.prepare("SELECT estado FROM pedidos WHERE id='previo'").get().estado, 'CONFIRMADO');
    assert.equal(migrated.prepare("SELECT disponible FROM inventario_disponible WHERE producto_id='P'").get().disponible, 20);
    assert.equal(migrated.prepare('SELECT tipo_movimiento FROM movimientos_inventario WHERE id=1').get().tipo_movimiento, 'ENTRADA');
    assert.equal(migrated.prepare('PRAGMA foreign_key_check').all().length, 0);
    assert.equal(migrated.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
    migrated.close();
    const restarted = openDatabase(path);
    assert.equal(restarted.prepare("SELECT COUNT(*) AS n FROM schema_migrations WHERE version='003_hu06'").get().n, 1);
    assert.equal(restarted.prepare("SELECT cantidad FROM pedido_lineas WHERE pedido_id='previo'").get().cantidad, 10);
    restarted.close();
  } finally { rmSync(directory, { recursive: true }); }
});
