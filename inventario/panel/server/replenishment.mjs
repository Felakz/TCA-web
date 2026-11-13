import { OrderError } from './orders.mjs';
const fail = (status, message) => { throw new OrderError(status, message); };
const integer = (value, min = 0) => Number.isInteger(value) && value >= min && value <= 2147483647;
const stockSql = `SELECT i.*, c.minimo, c.objetivo, COALESCE(c.habilitado,0) AS habilitado,
 CASE WHEN c.habilitado=1 AND i.disponible<=c.minimo THEN 1 ELSE 0 END AS alerta,
 CASE WHEN c.habilitado=1 AND i.disponible<=c.minimo THEN c.objetivo-i.disponible ELSE 0 END AS sugerido
 FROM inventario_disponible i LEFT JOIN reposicion_config c ON c.producto_id=i.producto_id`;
export function replenishment(db) {
  return { productos: db.prepare(stockSql + ' ORDER BY i.nombre').all(), propuestas: db.prepare('SELECT * FROM propuestas_compra ORDER BY actualizado DESC,id').all() };
}
export function configureMinimum(db, user, body) {
  const { producto_id, minimo, objetivo, habilitado } = body;
  if (typeof producto_id !== 'string' || !integer(minimo) || !integer(objetivo,1) || objetivo <= minimo || typeof habilitado !== 'boolean') fail(400, 'Indica mínimo entero no negativo y objetivo mayor que el mínimo.');
  if (!db.prepare('SELECT 1 FROM inventario WHERE producto_id=?').get(producto_id)) fail(404, 'Producto no encontrado.');
  db.prepare(`INSERT INTO reposicion_config VALUES(?,?,?,?,?,?) ON CONFLICT(producto_id) DO UPDATE SET minimo=excluded.minimo,objetivo=excluded.objetivo,habilitado=excluded.habilitado,actor=excluded.actor,actualizado=excluded.actualizado`).run(producto_id,minimo,objetivo,Number(habilitado),user.id,new Date().toISOString());
  return { guardado: true };
}
function validateDraft(body) {
  if (!integer(body.cantidad,1) || typeof body.observacion !== 'string' || body.observacion.length > 1000) fail(400, 'Cantidad entera positiva y observación de hasta 1000 caracteres requeridas.');
}
export function createProposal(db, user, body) {
  validateDraft(body);
  const { id, producto_id, cantidad, observacion } = body;
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id) || typeof producto_id !== 'string') fail(400, 'Identificador de propuesta o producto inválido.');
  db.exec('BEGIN IMMEDIATE');
  try {
    const previous = db.prepare('SELECT * FROM propuestas_compra WHERE id=?').get(id);
    if (previous) {
      if (previous.producto_id !== producto_id || previous.cantidad !== cantidad || previous.observacion !== observacion || previous.actor !== user.id) fail(409, 'Identificador de propuesta ya utilizado con otros datos.');
      db.exec('COMMIT'); return previous;
    }
    const product = db.prepare(stockSql + ' WHERE i.producto_id=?').get(producto_id);
    if (!product) fail(404, 'Producto no encontrado.');
    if (!product.alerta) fail(409, 'El producto ya no tiene alerta activa. Actualiza la disponibilidad.');
    if (db.prepare('SELECT 1 FROM propuestas_compra WHERE producto_id=?').get(producto_id)) fail(409, 'Ya existe una propuesta revisable para este producto.');
    const now = new Date().toISOString();
    db.prepare('INSERT INTO propuestas_compra(id,producto_id,cantidad,observacion,disponible_origen,minimo_origen,objetivo_origen,actor,creado,revisado_por,actualizado) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,producto_id,cantidad,observacion,product.disponible,product.minimo,product.objetivo,user.id,now,user.id,now);
    const proposal = db.prepare('SELECT * FROM propuestas_compra WHERE id=?').get(id);
    db.exec('COMMIT'); return proposal;
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function reviseProposal(db, user, id, body) {
  validateDraft(body);
  if (!integer(body.version,1)) fail(400, 'Versión de propuesta inválida.');
  const result = db.prepare('UPDATE propuestas_compra SET cantidad=?,observacion=?,revisado_por=?,actualizado=?,version=version+1 WHERE id=? AND version=?').run(body.cantidad,body.observacion,user.id,new Date().toISOString(),id,body.version);
  if (!result.changes) {
    if (!db.prepare('SELECT 1 FROM propuestas_compra WHERE id=?').get(id)) fail(404, 'Propuesta no encontrada.');
    fail(409, 'Otra sesión modificó la propuesta. Actualiza y revisa los cambios.');
  }
  return db.prepare('SELECT * FROM propuestas_compra WHERE id=?').get(id);
}
