// Recuperación administrativa local: requiere acceso al archivo de base, no es una ruta HTTP.
import { openDatabase } from './db.mjs';
const [email, role] = process.argv.slice(2);
if (!email || !['GERENCIA','VENTAS','ALMACEN','CLIENTE','SIN_ASIGNAR'].includes(role)) { console.error('Uso: npm run user:role -- correo GERENCIA|VENTAS|ALMACEN|CLIENTE|SIN_ASIGNAR'); process.exit(1); }
const db = openDatabase();
try {
 db.exec('BEGIN IMMEDIATE');
 const user = db.prepare('SELECT id FROM usuarios WHERE email=?').get(email.toLowerCase());
 if (!user) throw new Error('Cuenta no encontrada.');
 db.prepare('UPDATE usuarios SET rol=?,habilitado=1 WHERE id=?').run(role,user.id);
 db.prepare('DELETE FROM sesiones WHERE usuario_id=?').run(user.id);
 db.prepare('INSERT INTO auditoria_usuarios(actor,usuario_id,accion,fecha) VALUES(?,?,?,?)').run(user.id,user.id,'ASIGNACION_LOCAL:'+role,new Date().toISOString());
 db.exec('COMMIT'); console.log('Rol asignado; sesiones revocadas.');
} catch(error) { db.exec('ROLLBACK'); console.error(error.message); process.exitCode=1; }
finally { db.close(); }
