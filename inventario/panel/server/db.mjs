import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomBytes, scryptSync, randomUUID } from 'node:crypto';
export function openDatabase(path = resolve('data/tca.sqlite')) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path, { timeout: 5000 });
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS usuarios(id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, hash TEXT NOT NULL, habilitado INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS sesiones(token TEXT PRIMARY KEY, usuario_id TEXT NOT NULL REFERENCES usuarios(id), vence INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS inventario(producto_id TEXT PRIMARY KEY, nombre TEXT NOT NULL, stock_actual INTEGER NOT NULL CHECK(stock_actual>=0));
    CREATE TABLE IF NOT EXISTS movimientos_inventario(id INTEGER PRIMARY KEY, producto_id TEXT NOT NULL REFERENCES inventario(producto_id), cantidad INTEGER NOT NULL CHECK(cantidad>0), stock_despues INTEGER NOT NULL, actor TEXT NOT NULL REFERENCES usuarios(id), idempotency_key TEXT NOT NULL UNIQUE, observacion TEXT, fecha TEXT NOT NULL);
    INSERT OR IGNORE INTO inventario VALUES('PROD-TEST-001','Producto de prueba HU04',20);`);
  db.exec(readFileSync(new URL('../../migrations/sqlite/002_hu05_reservas.sql', import.meta.url), 'utf8'));
  db.exec('CREATE TABLE IF NOT EXISTS schema_migrations(version TEXT PRIMARY KEY)');
  db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
  try {
    if (!db.prepare('SELECT 1 FROM schema_migrations WHERE version=?').get('003_hu06')) {
      db.exec(readFileSync(new URL('../../migrations/sqlite/003_hu06_despachos.sql', import.meta.url), 'utf8'));
      db.prepare('INSERT INTO schema_migrations VALUES(?)').run('003_hu06');
    }
    if (db.prepare('PRAGMA foreign_key_check').all().length) throw new Error('Integridad referencial inválida al migrar HU06');
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  db.exec('PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
  try {
    if (!db.prepare('SELECT 1 FROM schema_migrations WHERE version=?').get('004_hu08')) {
      db.exec(readFileSync(new URL('../../migrations/sqlite/004_hu08_reposicion.sql', import.meta.url), 'utf8'));
      db.prepare('INSERT INTO schema_migrations VALUES(?)').run('004_hu08');
    }
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); db.close(); throw error; }
  return db;
}
export function createUser(db, email, password) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || typeof password !== 'string' || password.length < 12) throw new Error('Usa correo válido y contraseña de al menos 12 caracteres.');
  const salt = randomBytes(16).toString('hex');
  db.prepare('INSERT INTO usuarios(id,email,salt,hash) VALUES(?,?,?,?)').run(randomUUID(), email.toLowerCase(), salt, scryptSync(password, salt, 64).toString('hex'));
}
