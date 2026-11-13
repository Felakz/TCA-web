import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { InternalClient, Order, Product } from './client';
export function Orders({ client, onChange, revision }: { client: InternalClient; revision: number; onChange: () => void }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [id, setId] = useState(() => crypto.randomUUID());
  const [product, setProduct] = useState('');
  const [quantity, setQuantity] = useState('');
  const [message, setMessage] = useState('');
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
  return <section><h2>Pedidos y reservas</h2><p role="status">{message}</p>
    <button disabled={busy} onClick={() => { void refresh(); onChange(); }}>Actualizar disponibilidad</button>
    <form onSubmit={confirm}><fieldset disabled={busy}><p>Pedido: {id}</p><label>Producto a reservar<select required value={product} onChange={e => setProduct(e.target.value)}><option value="">Selecciona un producto</option>{products.map(p => <option key={p.producto_id} value={p.producto_id}>{p.nombre} — físico {p.stock_actual}, reservado {p.reservado}, disponible {p.disponible}</option>)}</select></label>
    <label>Unidades a reservar<input required type="number" min="1" max="2147483647" step="1" value={quantity} onChange={e => setQuantity(e.target.value)} /></label><button>Confirmar pedido y reservar</button></fieldset></form>
    <h3>Pedidos registrados</h3>{orders.length === 0 && <p>No hay pedidos registrados.</p>}
    <ul>{orders.map(order => <li key={order.id}><p>{order.id} — {order.estado}: {order.lineas.map(l => `${l.producto_id} × ${l.cantidad}`).join(', ')}</p>{order.estado === 'CONFIRMADO' && <button disabled={busy} onClick={() => { void cancel(order.id); }}>Cancelar pedido {order.id}</button>}</li>)}</ul>
  </section>;
}
