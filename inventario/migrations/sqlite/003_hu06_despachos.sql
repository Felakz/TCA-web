-- Se ejecuta una sola vez por db.mjs, con bloqueo de escritura y FK temporalmente desactivadas.
DROP VIEW inventario_disponible;
CREATE TABLE pedidos_hu06 (
 id TEXT PRIMARY KEY, estado TEXT NOT NULL CHECK(estado IN ('CONFIRMADO','CANCELADO','DESPACHADO')),
 actor TEXT NOT NULL REFERENCES usuarios(id), creado TEXT NOT NULL, cancelado TEXT,
 cancelado_por TEXT REFERENCES usuarios(id)
);
INSERT INTO pedidos_hu06 SELECT id,estado,actor,creado,cancelado,cancelado_por FROM pedidos;
DROP TABLE pedidos;
ALTER TABLE pedidos_hu06 RENAME TO pedidos;
CREATE VIEW inventario_disponible AS
 SELECT i.*, COALESCE(r.reservado,0) AS reservado, i.stock_actual-COALESCE(r.reservado,0) AS disponible
 FROM inventario i LEFT JOIN (
 SELECT l.producto_id, SUM(l.cantidad) AS reservado FROM pedido_lineas l
 JOIN pedidos p ON p.id=l.pedido_id WHERE p.estado='CONFIRMADO' GROUP BY l.producto_id
 ) r ON r.producto_id=i.producto_id;
ALTER TABLE movimientos_inventario ADD COLUMN tipo_movimiento TEXT NOT NULL DEFAULT 'ENTRADA' CHECK(tipo_movimiento IN ('ENTRADA','SALIDA'));
ALTER TABLE movimientos_inventario ADD COLUMN pedido_id TEXT REFERENCES pedidos(id);
CREATE UNIQUE INDEX salida_unica_pedido_producto ON movimientos_inventario(pedido_id,producto_id) WHERE tipo_movimiento='SALIDA';
CREATE TABLE despachos (
 id TEXT PRIMARY KEY, pedido_id TEXT NOT NULL UNIQUE REFERENCES pedidos(id),
 actor TEXT NOT NULL REFERENCES usuarios(id), fecha TEXT NOT NULL, constancia TEXT NOT NULL
);
