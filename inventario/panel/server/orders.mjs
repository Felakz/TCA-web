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
    const result = db.prepare("UPDATE pedidos SET estado='CANCELADO',cancelado=?,cancelado_por=? WHERE id=? AND estado='CONFIRMADO'").run(new Date().toISOString(), user.id, id);
    db.exec('COMMIT'); return { id, estado: 'CANCELADO', idempotente: result.changes === 0 };
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}
