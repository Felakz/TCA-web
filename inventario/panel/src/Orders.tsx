import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { InternalClient, Order, Product, Receipt, Role } from './client';
export function Orders({ client, onChange, revision, role }: { role: Role; client: InternalClient; revision: number; onChange: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [id, setId] = useState(() => crypto.randomUUID());
  const [product, setProduct] = useState('');
  const [quantity, setQuantity] = useState('');
  const [message, setMessage] = useState('');
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const active = useRef(false);
  async function refresh() {
    const [stock, list] = await Promise.all([client.products(), client.orders()]);
    if (!active.current) return;
    if (stock.error || list.error) { setMessage('No se pudieron actualizar los pedidos y la disponibilidad.'); return; }
    setProducts(stock.data); setOrders(list.data);
  }
  useEffect(() => { active.current = true; void refresh(); return () => { active.current = false; }; }, [client, revision]);
  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (locked.current) return;
    const amount = Number(quantity);
    if (!product || !Number.isInteger(amount) || amount <= 0) { setMessage('Selecciona un producto y una cantidad entera positiva.'); return; }
    locked.current = true; setBusy(true);
    try {
      const { error } = await client.confirmOrder({ id, lineas: [{ producto_id: product, cantidad: amount }] });
      if (!active.current) return;
      setMessage(error?.message ?? 'Pedido confirmado. Unidades reservadas.');
      if (!error) { setId(crypto.randomUUID()); setQuantity(''); }
      await refresh(); if (active.current) onChange();
    } finally { locked.current = false; if (active.current) setBusy(false); }
  }
  async function cancel(orderId: string) {
    if (locked.current) return; locked.current = true; setBusy(true);
    try {
      const { error } = await client.cancelOrder(orderId);
      if (!active.current) return;
      setMessage(error?.message ?? 'Pedido cancelado. Reserva liberada.');
      await refresh(); if (active.current) onChange();
    } finally { locked.current = false; if (active.current) setBusy(false); }
  }
  async function dispatch(orderId: string) {
    if (locked.current) return; locked.current = true; setBusy(true);
    try {
      const { data, error } = await client.dispatchOrder(orderId);
      if (!active.current) return;
      setMessage(error?.message ?? 'Pedido despachado. Stock descontado y reserva liberada.');
      if (!error) setReceipt(data.constancia);
      await refresh(); if (active.current) onChange();
    } finally { locked.current = false; if (active.current) setBusy(false); }
  }
  async function showReceipt(orderId: string) {
    setReceipt(null);
    const { data, error } = await client.receipt(orderId);
    if (!active.current) return;
    if (error) setMessage(error.message); else setReceipt(data);
  }
  function downloadReceipt() {
    if (!receipt) return;
    const text = [receipt.leyenda, `Constancia: ${receipt.id}`, `Pedido: ${receipt.pedido_id}`, `Fecha: ${receipt.fecha}`, `Responsable: ${receipt.actor.email} (${receipt.actor.id})`, ...receipt.lineas.map(l => `${l.producto_id} | ${l.nombre} | Unidades: ${l.cantidad} | Físico: ${l.stock_antes} → ${l.stock_despues}`)].join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `${receipt.id}.txt`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section><h2>Pedidos y reservas</h2><p role="status">{message}</p>
    <button disabled={busy} onClick={() => { void refresh(); onChange(); }}>Actualizar disponibilidad</button>
    {role === 'VENTAS' && <form onSubmit={confirm}><fieldset disabled={busy}><p>Pedido: {id}</p><label>Producto a reservar<select required value={product} onChange={e => setProduct(e.target.value)}><option value="">Selecciona un producto</option>{products.map(p => <option key={p.producto_id} value={p.producto_id}>{p.nombre} — físico {p.stock_actual}, reservado {p.reservado}, disponible {p.disponible}</option>)}</select></label>
    <label>Unidades a reservar<input required type="number" min="1" max="2147483647" step="1" value={quantity} onChange={e => setQuantity(e.target.value)} /></label><button>Confirmar pedido y reservar</button></fieldset></form>}
    <h3>Pedidos registrados</h3>{orders.length === 0 && <p>No hay pedidos registrados.</p>}
    <ul>{orders.map(order => <li key={order.id}><p>{order.id} — {order.estado}: {order.lineas.map(l => `${l.producto_id} × ${l.cantidad}`).join(', ')}</p>{order.estado === 'CONFIRMADO' && <>{role === 'ALMACEN' && <button disabled={busy} onClick={() => { void dispatch(order.id); }}>Despachar pedido {order.id}</button>}{role === 'VENTAS' && <button disabled={busy} onClick={() => { void cancel(order.id); }}>Cancelar pedido {order.id}</button>}</>}{order.estado === 'DESPACHADO' && <button disabled={busy} onClick={() => { void showReceipt(order.id); }}>Ver constancia {order.id}</button>}</li>)}</ul>
    {receipt && <article aria-label="Constancia de despacho"><h3>{receipt.leyenda}</h3><p>Constancia: {receipt.id}</p><p>Pedido: {receipt.pedido_id}</p><p>Fecha: {new Date(receipt.fecha).toLocaleString('es-PE')}</p><p>Responsable: {receipt.actor.email}</p><ul>{receipt.lineas.map(l => <li key={l.producto_id}>{l.nombre} ({l.producto_id}): {l.cantidad} unidades</li>)}</ul><button onClick={downloadReceipt}>Descargar constancia interna</button></article>}
  </section>;
}
