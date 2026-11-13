import { useEffect, useState } from 'react';
import type { InternalClient } from './client';
type Movement = { id: number; cantidad: number; stock_despues: number; actor: string; fecha: string; observacion: string | null };
export function History({ client, product }: { client: InternalClient; product: string }) {
  const [rows, setRows] = useState<Movement[]>([]);
  const [status, setStatus] = useState('Cargando historial…');
  useEffect(() => {
    let active = true;
    client.movements(product)
      .then(({ data, error }) => {
        if (!active) return;
        setRows(data ?? []);
        setStatus(error ? 'No se pudo cargar el historial.' : data?.length ? '' : 'Sin movimientos registrados.');
      });
    return () => { active = false; };
  }, [client, product]);
  return <><h3>Últimos movimientos</h3><p role="status">{status}</p><div className="table-scroll"><table><thead><tr><th>Fecha</th><th>Cantidad</th><th>Stock final</th><th>Usuario</th><th>Observación</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{new Date(row.fecha).toLocaleString('es-PE')}</td><td>{row.cantidad}</td><td>{row.stock_despues}</td><td>{row.actor}</td><td>{row.observacion}</td></tr>)}</tbody></table></div></>;
}
