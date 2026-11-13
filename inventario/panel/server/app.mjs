import { confirmOrder, cancelOrder, listOrders, OrderError } from './orders.mjs';
import { createServer } from 'node:http';
import { randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');
export function createApp(db) {
  const attempts = new Map();
  return createServer(async (req, res) => {
    const send = (status, data, cookie) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(cookie ? { 'Set-Cookie': cookie } : {}) });
      res.end(JSON.stringify(data));
    };
    const cookie = token => `tca_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${token ? 28800 : 0}`;
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (!['GET', 'POST'].includes(req.method)) return send(405, { message: 'Método no permitido' });
      let body = {};
      if (req.method === 'POST') {
        if (!req.headers['content-type']?.startsWith('application/json') || req.headers['sec-fetch-site'] === 'cross-site') return send(403, { message: 'Solicitud no permitida' });
        let text = '';
        for await (const chunk of req) { text += chunk; if (text.length > 8192) return send(413, { message: 'Solicitud demasiado grande' }); }
        try { body = JSON.parse(text); } catch { return send(400, { message: 'JSON inválido' }); }
        if (!body || Array.isArray(body) || typeof body !== 'object') return send(400, { message: 'Solicitud inválida' });
      }
      const token = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('tca_session='))?.slice(12) || '';
      const user = db.prepare('SELECT u.id,u.email FROM sesiones s JOIN usuarios u ON u.id=s.usuario_id WHERE s.token=? AND s.vence>? AND u.habilitado=1').get(hash(token), Date.now());
      if (url.pathname === '/api/session' && req.method === 'GET') return send(200, { session: user ? { user } : null });
      if (url.pathname === '/api/login' && req.method === 'POST') {
        const ip = req.socket.remoteAddress;
        const now = Date.now();
        for (const [key, item] of attempts) if (item.until <= now) attempts.delete(key);
        const limit = attempts.get(ip) || { count: 0, until: now + 60000 };
        if (limit.count >= 10) return send(429, { message: 'Demasiados intentos. Espera un minuto.' });
        limit.count++; attempts.set(ip, limit);
        const { email, password } = body;
        if (typeof email !== 'string' || typeof password !== 'string' || password.length > 1024) return send(400, { message: 'Credenciales inválidas' });
        const account = db.prepare('SELECT * FROM usuarios WHERE email=?').get(email.trim().toLowerCase());
        const derived = scryptSync(password, account?.salt || 'invalid-account-salt', 64);
        if (!account || !account.habilitado || !timingSafeEqual(derived, Buffer.from(account.hash, 'hex'))) return send(401, { code: 'invalid_credentials', message: 'Correo o contraseña incorrectos.' });
        const next = randomBytes(32).toString('hex');
        db.prepare('DELETE FROM sesiones WHERE vence<=? OR token=?').run(now, hash(token));
        db.prepare('INSERT INTO sesiones VALUES(?,?,?)').run(hash(next), account.id, now + 28800000);
        attempts.delete(ip);
        return send(200, { session: { user: { id: account.id, email: account.email } } }, cookie(next));
      }
      if (!user) return send(401, { message: 'Se requiere una sesión habilitada.' });
      if (url.pathname === '/api/logout' && req.method === 'POST') {
        db.prepare('DELETE FROM sesiones WHERE token=?').run(hash(token));
        return send(200, {}, cookie(''));
      }
      if (url.pathname === '/api/inventario' && req.method === 'GET') return send(200, db.prepare('SELECT * FROM inventario_disponible ORDER BY nombre').all());
      if (url.pathname === '/api/movimientos' && req.method === 'GET') return send(200, db.prepare('SELECT * FROM movimientos_inventario WHERE producto_id=? ORDER BY id DESC LIMIT 20').all(url.searchParams.get('producto') || ''));
      if (url.pathname === '/api/pedidos' && req.method === 'GET') return send(200, listOrders(db));
      if (url.pathname === '/api/pedidos/confirmar' && req.method === 'POST') return send(200, confirmOrder(db, user, body));
      const cancel = url.pathname.match(/^\/api\/pedidos\/([a-zA-Z0-9_-]{1,100})\/cancelar$/);
      if (cancel && req.method === 'POST') return send(200, cancelOrder(db, user, cancel[1]));
      if (url.pathname === '/api/entradas' && req.method === 'POST') {
        const { p_producto_id: product, p_cantidad: quantity, p_idempotency_key: key, p_observacion: note = null } = body;
        if (typeof product !== 'string' || !Number.isInteger(quantity) || quantity <= 0 || quantity > 2147483647 || typeof key !== 'string' || !key.trim() || key.length > 200 || (note !== null && (typeof note !== 'string' || note.length > 500))) return send(400, { message: 'Datos de entrada inválidos.' });
        db.exec('BEGIN IMMEDIATE');
        try {
          const previous = db.prepare('SELECT * FROM movimientos_inventario WHERE idempotency_key=?').get(key);
          if (previous) {
            if (previous.actor !== user.id || previous.producto_id !== product || previous.cantidad !== quantity || previous.observacion !== note) { db.exec('ROLLBACK'); return send(409, { message: 'Clave ya utilizada con otros datos.' }); }
            db.exec('COMMIT'); return send(200, { status: 'IDEMPOTENT', stock_despues: previous.stock_despues });
          }
          const row = db.prepare('SELECT * FROM inventario WHERE producto_id=?').get(product);
          if (!row) { db.exec('ROLLBACK'); return send(404, { message: 'Producto no encontrado.' }); }
          const stock = row.stock_actual + quantity;
          if (stock > 2147483647) { db.exec('ROLLBACK'); return send(400, { message: 'Stock fuera de rango.' }); }
          db.prepare('UPDATE inventario SET stock_actual=? WHERE producto_id=?').run(stock, product);
          db.prepare('INSERT INTO movimientos_inventario(producto_id,cantidad,stock_despues,actor,idempotency_key,observacion,fecha) VALUES(?,?,?,?,?,?,?)').run(product, quantity, stock, user.id, key, note, new Date().toISOString());
          db.exec('COMMIT'); return send(200, { status: 'CREADO', stock_despues: stock });
        } catch (error) { db.exec('ROLLBACK'); throw error; }
      }
      return send(404, { message: 'Ruta no encontrada.' });
    } catch (error) { if (error instanceof OrderError) return send(error.status, { message: error.message }); if (!res.headersSent) send(500, { message: 'Error interno del servidor.' }); }
  });
}
