import { useEffect, useRef, useState, type FormEvent } from 'react';
import { History } from './History';
import type { InternalClient } from './client';
type Product = { producto_id: string; nombre: string; stock_actual: number };
export function Panel({ client }: { client: InternalClient }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [product, setProduct] = useState('');
  const [quantity, setQuantity] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [revision, setRevision] = useState(0);
  const [note, setNote] = useState('');
  const locked = useRef(false);
  const request = useRef<{ payload: string; key: string } | null>(null);
  const mounted = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    client.products().then(({ data, error }) => {
      if (!active) return;
      if (error) setMessage('Acceso no habilitado o no se pudo leer el inventario. Contacta a la responsable técnica.');
      else { setProducts(data ?? []); setReady(true); }
    });
    return () => { active = false; mounted.current = false; };
  }, [client]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (locked.current) return;
    const amount = Number(quantity);
    if (!product || !Number.isInteger(amount) || amount <= 0 || amount > 2147483647) { setMessage('Selecciona un producto y una cantidad entera positiva válida.'); return; }
    const payload = JSON.stringify([product, amount, note]);
    if (request.current?.payload !== payload) request.current = { payload, key: crypto.randomUUID() };
    locked.current = true; setBusy(true); setMessage('');
    try {
      const { data, error } = await client.registerEntry( { p_producto_id: product, p_cantidad: amount, p_actor: 'sesion', p_observacion: note || null, p_idempotency_key: request.current.key });
      if (!mounted.current) return;
      if (error) { setMessage('No se pudo registrar la entrada. Verifica tu acceso y reintenta.'); return; }
      request.current = null;
      setProducts(rows => rows.map(row => row.producto_id === product ? { ...row, stock_actual: data.stock_despues } : row));
      setRevision(value => value + 1); setNote(''); setQuantity(''); setMessage('Entrada registrada correctamente.');
    } catch { if (mounted.current) setMessage('Error de conexión. Reintenta con los mismos datos.'); }
    finally { locked.current = false; if (mounted.current) setBusy(false); }
  }
  return <section><h2>Inventario</h2><p role="status">{message}</p>
    {ready && <form onSubmit={submit}><fieldset disabled={busy}><label>Producto<select required value={product} onChange={e => setProduct(e.target.value)}><option value="">Selecciona un producto</option>{products.map(row => <option key={row.producto_id} value={row.producto_id}>{row.nombre} — stock: {row.stock_actual}</option>)}</select></label>
    <label>Cantidad<input type="number" required min="1" max="2147483647" step="1" value={quantity} onChange={e => setQuantity(e.target.value)} /></label><label>Observación<input maxLength={500} value={note} onChange={e => setNote(e.target.value)} /></label><button disabled={busy}>{busy ? 'Registrando…' : 'Registrar entrada'}</button></fieldset></form>}
    {product && <History key={`${product}:${revision}`} client={client} product={product} />}
  </section>;
}
