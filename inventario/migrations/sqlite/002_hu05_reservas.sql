-- HU05: esquema SQLite, aplicado automáticamente al iniciar la API.
BEGIN IMMEDIATE;

    CREATE TABLE IF NOT EXISTS pedidos (
      id TEXT PRIMARY KEY, estado TEXT NOT NULL CHECK(estado IN ('CONFIRMADO','CANCELADO')),
      actor TEXT NOT NULL REFERENCES usuarios(id), creado TEXT NOT NULL, cancelado TEXT,
      cancelado_por TEXT REFERENCES usuarios(id)
    );
    CREATE TABLE IF NOT EXISTS pedido_lineas (
      pedido_id TEXT NOT NULL REFERENCES pedidos(id), producto_id TEXT NOT NULL REFERENCES inventario(producto_id),
      cantidad INTEGER NOT NULL CHECK(cantidad > 0 AND cantidad <= 2147483647), PRIMARY KEY(pedido_id, producto_id)
    );
    CREATE INDEX IF NOT EXISTS idx_lineas_producto ON pedido_lineas(producto_id);
    CREATE VIEW IF NOT EXISTS inventario_disponible AS
      SELECT i.*, COALESCE(r.reservado,0) AS reservado, i.stock_actual-COALESCE(r.reservado,0) AS disponible
      FROM inventario i LEFT JOIN (
        SELECT l.producto_id, SUM(l.cantidad) AS reservado FROM pedido_lineas l
        JOIN pedidos p ON p.id=l.pedido_id WHERE p.estado='CONFIRMADO' GROUP BY l.producto_id
      ) r ON r.producto_id=i.producto_id;
  
COMMIT;
