import { useEffect, useState } from 'react';
import type { InternalClient } from './client';
export function PublicCatalog({ client }: { client: InternalClient }) {
 const [rows, setRows] = useState<{ id: number; nombre: string; marca: string; descripcion: string; categoria: string }[]>([]);
 const [error, setError] = useState('');
 useEffect(() => { let active = true; void client.catalog().then(result => { if (!active) return; if (result.error) setError(result.error.message); else setRows(result.data); }); return () => { active=false; }; },[client]);
 return <section><h2>Catálogo comercial</h2>{error && <p role="alert">{error}</p>}<ul>{rows.map((p,i) => <li key={`${p.categoria}:${p.id}:${i}`}><h3>{p.nombre}</h3><p>{p.marca}</p><p>{p.descripcion}</p></li>)}</ul></section>;
}
