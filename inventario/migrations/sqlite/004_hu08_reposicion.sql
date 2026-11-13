-- Ejecutado por db.mjs dentro de una transacción versionada.
CREATE TABLE reposicion_config (
 producto_id TEXT PRIMARY KEY REFERENCES inventario(producto_id),
 minimo INTEGER NOT NULL CHECK(minimo>=0 AND minimo<2147483647),
 objetivo INTEGER NOT NULL CHECK(objetivo>minimo AND objetivo<=2147483647),
 habilitado INTEGER NOT NULL CHECK(habilitado IN (0,1)),
 actor TEXT NOT NULL REFERENCES usuarios(id), actualizado TEXT NOT NULL
);
CREATE TABLE propuestas_compra (
 id TEXT PRIMARY KEY, producto_id TEXT NOT NULL REFERENCES inventario(producto_id),
 cantidad INTEGER NOT NULL CHECK(cantidad>0 AND cantidad<=2147483647),
 observacion TEXT NOT NULL, disponible_origen INTEGER NOT NULL, minimo_origen INTEGER NOT NULL,
 objetivo_origen INTEGER NOT NULL, actor TEXT NOT NULL REFERENCES usuarios(id),
 creado TEXT NOT NULL, revisado_por TEXT NOT NULL REFERENCES usuarios(id), actualizado TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1, estado TEXT NOT NULL DEFAULT 'BORRADOR' CHECK(estado='BORRADOR')
);
CREATE UNIQUE INDEX propuesta_borrador_producto ON propuestas_compra(producto_id);
