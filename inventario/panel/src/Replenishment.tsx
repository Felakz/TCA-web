import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { InternalClient, ReplenishmentData, ReplenishmentProduct, Proposal } from './client';
export function Replenishment({ client, revision }: { client: InternalClient; revision: string }) {
  const [data, setData] = useState<ReplenishmentData>({ productos: [], propuestas: [] });
  const [message, setMessage] = useState('');
  const active = useRef(false);
  const generation = useRef(0);
  async function refresh() {
    const request = ++generation.current;
    const result = await client.replenishment();
    if (!active.current || request !== generation.current) return;
    if (result.error) setMessage(result.error.message); else setData(result.data);
  }
  useEffect(() => {
    active.current = true; void refresh();
    const timer = setInterval(() => { void refresh(); }, 30000);
    const focus = () => { void refresh(); }; window.addEventListener('focus', focus);
    return () => { active.current = false; generation.current++; clearInterval(timer); window.removeEventListener('focus', focus); };
  }, [client, revision]);
  const alerts = data.productos.filter(p => p.alerta);
  return <section><h2>Alertas de stock mínimo y reposición</h2>
    <p>Las propuestas son borradores internos revisables. No se envían automáticamente al proveedor.</p>
    <button onClick={() => { void refresh(); }}>Actualizar alertas</button><p role="status">{message}</p>
    <p role="status">{alerts.length ? `${alerts.length} alerta(s) de stock mínimo.` : 'Sin alertas activas. Configura los mínimos por producto.'}</p>
    {data.productos.map(product => <MinimumRow key={`${product.producto_id}:${product.minimo}:${product.objetivo}:${product.habilitado}`} product={product} client={client} proposal={data.propuestas.find(p => p.producto_id === product.producto_id)} refresh={refresh} />)}
    <h3>Propuestas de compra para revisión</h3><p>Comprueba la disponibilidad actual antes de usar una propuesta: la cantidad guardada no cambia automáticamente.</p>
    {data.propuestas.length === 0 && <p>No hay propuestas guardadas.</p>}
    {data.propuestas.map(proposal => <ProposalEditor key={`${proposal.id}:${proposal.version}`} proposal={proposal} client={client} refresh={refresh} />)}
  </section>;
}
function MinimumRow({ product: p, client, proposal, refresh }: { product: ReplenishmentProduct; client: InternalClient; proposal?: Proposal; refresh: () => Promise<void> }) {
  const [minimum, setMinimum] = useState(String(p.minimo ?? 0));
  const [target, setTarget] = useState(String(p.objetivo ?? 1));
  const [enabled, setEnabled] = useState(Boolean(p.habilitado));
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const proposalId = useRef(crypto.randomUUID());
  async function configure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (locked.current) return;
    locked.current = true; setBusy(true);
    try {
      const { error } = await client.configureMinimum({ producto_id: p.producto_id, minimo: Number(minimum), objetivo: Number(target), habilitado: enabled });
      setMessage(error?.message ?? 'Mínimo guardado.'); await refresh();
    } finally { locked.current = false; setBusy(false); }
  }
  async function create() {
    if (locked.current) return; locked.current = true; setBusy(true);
    try {
      const { error } = await client.createProposal({ id: proposalId.current, producto_id: p.producto_id, cantidad: p.sugerido, observacion: '' });
      setMessage(error?.message ?? 'Propuesta guardada para revisión interna.'); await refresh();
    } finally { locked.current = false; setBusy(false); }
  }
  return <article><h3>{p.nombre} ({p.producto_id})</h3><p>Físico: {p.stock_actual}. Reservado: {p.reservado}. Disponible: {p.disponible}.</p>
    {!!p.alerta && <div role="alert" className="minimum-alert"><strong>AL-MIN-{p.producto_id}: STOCK MÍNIMO ALCANZADO</strong><p>Disponible {p.disponible} ≤ mínimo {p.minimo}. Propuesta sugerida: {p.sugerido} unidades para alcanzar el objetivo {p.objetivo}.</p>{!proposal && <button disabled={busy} onClick={() => { void create(); }}>Crear propuesta para {p.producto_id}</button>}</div>}
    {!p.habilitado && <p>Alerta por mínimo sin habilitar.</p>}
    <form onSubmit={configure}><fieldset disabled={busy}><label>Mínimo de {p.producto_id}<input required type="number" min="0" max="2147483646" step="1" value={minimum} onChange={e => setMinimum(e.target.value)} /></label><label>Objetivo de {p.producto_id}<input required type="number" min={Number(minimum) + 1} max="2147483647" step="1" value={target} onChange={e => setTarget(e.target.value)} /></label><label><input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} />Habilitar alerta de {p.producto_id}</label><button>Guardar mínimo de {p.producto_id}</button></fieldset></form><p role="status">{message}</p>
  </article>;
}
function ProposalEditor({ proposal: p, client, refresh }: { proposal: Proposal; client: InternalClient; refresh: () => Promise<void> }) {
  const [quantity, setQuantity] = useState(String(p.cantidad));
  const [note, setNote] = useState(p.observacion);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (locked.current) return;
    locked.current = true; setBusy(true);
    try {
      const { error } = await client.reviseProposal(p.id, { cantidad: Number(quantity), observacion: note, version: p.version });
      setMessage(error?.message ?? 'Revisión guardada. Borrador interno sin enviar.');
      if (!error) await refresh();
    } finally { locked.current = false; setBusy(false); }
  }
  return <article><h4>Propuesta {p.id} — {p.producto_id} — BORRADOR SIN ENVIAR</h4><p>Al crear: disponible {p.disponible_origen}, mínimo {p.minimo_origen}, objetivo {p.objetivo_origen}.</p>
    <form onSubmit={save}><fieldset disabled={busy}><label>Cantidad propuesta {p.id}<input required type="number" min="1" max="2147483647" step="1" value={quantity} onChange={e => setQuantity(e.target.value)} /></label><label>Observación {p.id}<textarea maxLength={1000} value={note} onChange={e => setNote(e.target.value)} /></label><button>Guardar revisión {p.id}</button></fieldset></form><p role="status">{message}</p></article>;
}
