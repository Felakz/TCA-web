import { OrderError } from './orders.mjs';
import { createUser } from './db.mjs';
export function allowed(role, method, path) {
  const internal = ['GERENCIA','VENTAS','ALMACEN'].includes(role);
  if (method === 'GET' && ['/api/inventario','/api/pedidos'].includes(path)) return internal;
  if (method === 'GET' && /^\/api\/pedidos\/[a-zA-Z0-9_-]+\/constancia$/.test(path)) return internal;
  if (path === '/api/movimientos') return method === 'GET' && ['GERENCIA','ALMACEN'].includes(role);
  if (path.startsWith('/api/usuarios') || path.startsWith('/api/reposicion')) return role === 'GERENCIA';
  if (method === 'POST' && (path === '/api/pedidos/confirmar' || /^\/api\/pedidos\/[a-zA-Z0-9_-]+\/cancelar$/.test(path))) return role === 'VENTAS';
  if (method === 'POST' && (path === '/api/entradas' || /^\/api\/pedidos\/[a-zA-Z0-9_-]+\/despachar$/.test(path))) return role === 'ALMACEN';
  return false;
}
export const users = db => db.prepare('SELECT id,email,rol,habilitado FROM usuarios ORDER BY email').all();
export function manageUser(db, actor, body) {
  const { id, rol, habilitado } = body;
  if (typeof id !== 'string' || !['SIN_ASIGNAR','GERENCIA','VENTAS','ALMACEN','CLIENTE'].includes(rol) || typeof habilitado !== 'boolean') throw new OrderError(400,'Rol, usuario o habilitación inválidos.');
  db.exec('BEGIN IMMEDIATE');
  try {
    const current = db.prepare('SELECT * FROM usuarios WHERE id=?').get(id);
    if (!current) throw new OrderError(404,'Usuario no encontrado.');
    if (current.rol === 'GERENCIA' && current.habilitado && (rol !== 'GERENCIA' || !habilitado) && db.prepare("SELECT COUNT(*) AS n FROM usuarios WHERE rol='GERENCIA' AND habilitado=1").get().n <= 1) throw new OrderError(409,'Debe conservarse al menos una cuenta de Gerencia habilitada.');
    db.prepare('UPDATE usuarios SET rol=?,habilitado=? WHERE id=?').run(rol,Number(habilitado),id);
    db.prepare('DELETE FROM sesiones WHERE usuario_id=?').run(id);
    db.prepare('INSERT INTO auditoria_usuarios(actor,usuario_id,accion,fecha) VALUES(?,?,?,?)').run(actor.id,id,JSON.stringify({rol,habilitado}),new Date().toISOString());
    db.exec('COMMIT'); return { guardado: true };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function addUser(db, actor, body) {
  if (typeof body.email !== 'string' || typeof body.password !== 'string' || body.password.length > 1024 || !['GERENCIA','VENTAS','ALMACEN','CLIENTE','SIN_ASIGNAR'].includes(body.rol)) throw new OrderError(400,'Datos de usuario inválidos.');
  db.exec('BEGIN IMMEDIATE');
  try {
    try { createUser(db,body.email.trim(),body.password,body.rol); }
    catch (error) { throw new OrderError(error.message.includes('UNIQUE') ? 409 : 400,'No se pudo crear la cuenta. Verifica correo único, rol y contraseña de al menos 12 caracteres.'); }
    const user = db.prepare('SELECT id FROM usuarios WHERE email=?').get(body.email.trim().toLowerCase());
    db.prepare('INSERT INTO auditoria_usuarios(actor,usuario_id,accion,fecha) VALUES(?,?,?,?)').run(actor.id,user.id,'CREAR:'+body.rol,new Date().toISOString());
    db.exec('COMMIT'); return { creado: true };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
