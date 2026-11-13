import { randomUUID } from 'node:crypto';
export class OrderError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new OrderError(status, message); };
export function listOrders(db) {
  return db.prepare('SELECT * FROM pedidos ORDER BY creado DESC, id').all().map(order => ({
    ...order, lineas: db.prepare('SELECT producto_id,cantidad FROM pedido_lineas WHERE pedido_id=? ORDER BY producto_id').all(order.id)
  }));
}
export function confirmOrder(db, user, body) {
  const { id, lineas } = body;
  if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id) || !Array.isArray(lineas) || !lineas.length || lineas.length > 100) fail(400, 'Pedido y líneas inválidos.');
  const seen = new Set();
  for (const line of lineas) {
    if (!line || typeof line.producto_id !== 'string' || !line.producto_id || !Number.isInteger(line.cantidad) || line.cantidad <= 0 || line.cantidad > 2147483647 || seen.has(line.producto_id)) fail(400, 'Cada producto debe aparecer una vez con cantidad entera positiva.');
    seen.add(line.producto_id);
  }
  const normalized = lineas.map(({ producto_id, cantidad }) => ({ producto_id, cantidad })).sort((a,b) => a.producto_id < b.producto_id ? -1 : a.producto_id > b.producto_id ? 1 : 0);
  db.exec('BEGIN IMMEDIATE');
  try {
    const existing = db.prepare('SELECT * FROM pedidos WHERE id=?').get(id);
    if (existing) {
      const saved = db.prepare('SELECT producto_id,cantidad FROM pedido_lineas WHERE pedido_id=? ORDER BY producto_id COLLATE BINARY').all(id);
      if (existing.estado !== 'CONFIRMADO' || existing.actor !== user.id || JSON.stringify(saved) !== JSON.stringify(normalized)) fail(409, 'El pedido ya existe con otros datos o está cancelado.');
      db.exec('COMMIT'); return { id, estado: 'CONFIRMADO', idempotente: true };
    }
    for (const line of normalized) {
      const stock = db.prepare('SELECT disponible FROM inventario_disponible WHERE producto_id=?').get(line.producto_id);
      if (!stock) fail(404, `Producto no encontrado: ${line.producto_id}`);
      if (line.cantidad > stock.disponible) fail(409, `Disponibilidad insuficiente para ${line.producto_id}. Disponible: ${stock.disponible}.`);
    }
    db.prepare("INSERT INTO pedidos(id,estado,actor,creado) VALUES(?,'CONFIRMADO',?,?)").run(id, user.id, new Date().toISOString());
    const insert = db.prepare('INSERT INTO pedido_lineas VALUES(?,?,?)');
    for (const line of normalized) insert.run(id, line.producto_id, line.cantidad);
    db.exec('COMMIT'); return { id, estado: 'CONFIRMADO', idempotente: false };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function cancelOrder(db, user, id) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const order = db.prepare('SELECT estado FROM pedidos WHERE id=?').get(id);
    if (!order) fail(404, 'Pedido no encontrado.');
    if (order.estado === 'DESPACHADO') fail(409, 'Un pedido despachado no se puede cancelar.');
    const result = db.prepare("UPDATE pedidos SET estado='CANCELADO',cancelado=?,cancelado_por=? WHERE id=? AND estado='CONFIRMADO'").run(new Date().toISOString(), user.id, id);
    db.exec('COMMIT'); return { id, estado: 'CANCELADO', idempotente: result.changes === 0 };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function getReceipt(db, id) {
  const row = db.prepare('SELECT constancia FROM despachos WHERE pedido_id=?').get(id);
  if (!row) fail(404, 'El pedido no tiene constancia de despacho.');
  return JSON.parse(row.constancia);
}
export function dispatchOrder(db, user, id) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const order = db.prepare('SELECT estado FROM pedidos WHERE id=?').get(id);
    if (!order) fail(404, 'Pedido no encontrado.');
    if (order.estado === 'DESPACHADO') {
      const constancia = getReceipt(db, id);
      db.exec('COMMIT'); return { estado: 'DESPACHADO', idempotente: true, constancia };
    }
    if (order.estado !== 'CONFIRMADO') fail(409, 'Solo se puede despachar un pedido confirmado y reservado.');
    const lines = db.prepare('SELECT l.producto_id,l.cantidad,i.nombre,i.stock_actual FROM pedido_lineas l JOIN inventario i ON i.producto_id=l.producto_id WHERE l.pedido_id=? ORDER BY l.producto_id').all(id);
    if (!lines.length) fail(409, 'El pedido no tiene unidades reservadas.');
    const receipt = { id: `DES-${randomUUID()}`, pedido_id: id, fecha: new Date().toISOString(), actor: { id: user.id, email: user.email }, leyenda: 'CONSTANCIA INTERNA DE DESPACHO — SIN VALOR TRIBUTARIO', lineas: [] };
    for (const line of lines) {
      if (line.stock_actual < line.cantidad) fail(409, `Stock físico insuficiente para ${line.producto_id}.`);
      const after = line.stock_actual - line.cantidad;
      db.prepare('UPDATE inventario SET stock_actual=? WHERE producto_id=?').run(after, line.producto_id);
      db.prepare("INSERT INTO movimientos_inventario(producto_id,cantidad,stock_despues,actor,idempotency_key,observacion,fecha,tipo_movimiento,pedido_id) VALUES(?,?,?,?,?,?,?,'SALIDA',?)").run(line.producto_id, line.cantidad, after, user.id, randomUUID(), receipt.leyenda, receipt.fecha, id);
      receipt.lineas.push({ producto_id: line.producto_id, nombre: line.nombre, cantidad: line.cantidad, stock_antes: line.stock_actual, stock_despues: after });
    }
    db.prepare("UPDATE pedidos SET estado='DESPACHADO' WHERE id=?").run(id);
    db.prepare('INSERT INTO despachos VALUES(?,?,?,?,?)').run(receipt.id, id, user.id, receipt.fecha, JSON.stringify(receipt));
    db.exec('COMMIT'); return { estado: 'DESPACHADO', idempotente: false, constancia: receipt };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
