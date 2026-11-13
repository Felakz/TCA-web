import { openDatabase, createUser } from './db.mjs';
import { Writable } from 'node:stream';
import { createInterface } from 'node:readline/promises';
const email = process.argv[2];
if (!email || !process.stdin.isTTY) { console.error('Ejecuta npm run user:create -- correo@ejemplo.com desde una terminal interactiva.'); process.exit(1); }
let muted = false;
const output = new Writable({ write(chunk, _encoding, callback) { if (!muted) process.stdout.write(chunk); callback(); } });
const rl = createInterface({ input: process.stdin, output, terminal: true });
const answer = rl.question('Contraseña (mínimo 12 caracteres; entrada oculta): ');
muted = true;
const password = await answer;
rl.close();
console.log();
const db = openDatabase();
try { createUser(db, email, password); console.log('Cuenta interna habilitada.'); }
catch (error) { console.error(error.message); process.exitCode = 1; }
finally { db.close(); }
