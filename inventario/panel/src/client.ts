export type Order = { id: string; estado: 'CONFIRMADO' | 'CANCELADO'; lineas: { producto_id: string; cantidad: number }[] };
export type Session = { user: { id: string; email: string } };
export type Product = { producto_id: string; nombre: string; stock_actual: number; reservado: number; disponible: number };
export type Movement = { id: number; cantidad: number; stock_despues: number; actor: string; fecha: string; observacion: string | null };
type Result<T> = { data: T; error: { code?: string; message: string } | null };
const listeners = new Set<(event: string, session: Session | null) => void>();
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('tca-auth') : null;
function emit(session: Session | null) { listeners.forEach(fn => fn(session ? 'SIGNED_IN' : 'SIGNED_OUT', session)); }
async function call<T>(path: string, body?: unknown): Promise<Result<T>> {
  try {
    const response = await fetch(`/api/${path}`, { credentials: 'same-origin', ...(body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
    const value = await response.json();
    if (!response.ok) { if (response.status === 401 && path !== 'login') emit(null); return { data: null as T, error: value }; }
    return { data: value, error: null };
  } catch { return { data: null as T, error: { message: 'No se pudo conectar con el servidor local.' } }; }
}
channel?.addEventListener('message', () => { void call<{ session: Session | null }>('session').then(({ data, error }) => { if (!error) emit(data.session); }); });
export const client = {
  auth: {
    onAuthStateChange(fn: (event: string, session: Session | null) => void) { listeners.add(fn); return { data: { subscription: { unsubscribe() { listeners.delete(fn); } } } }; },
    async getSession() { const result = await call<{ session: Session | null }>('session'); return { data: result.data ?? { session: null }, error: result.error }; },
    async signInWithPassword(credentials: { email: string; password: string }) { const result = await call<{ session: Session }>('login', credentials); if (!result.error) { emit(result.data.session); channel?.postMessage('change'); } return { error: result.error }; },
    async signOut(_options?: { scope: string }) { const result = await call('logout', {}); if (!result.error) { emit(null); channel?.postMessage('change'); } return { error: result.error }; }
  },
  orders: () => call<Order[]>('pedidos'),
  confirmOrder: (params: { id: string; lineas: { producto_id: string; cantidad: number }[] }) => call('pedidos/confirmar', params),
  cancelOrder: (id: string) => call(`pedidos/${encodeURIComponent(id)}/cancelar`, {}),
  products: () => call<Product[]>('inventario'),
  movements: (product: string) => call<Movement[]>(`movimientos?producto=${encodeURIComponent(product)}`),
  registerEntry: (params: object) => call<{ stock_despues: number }>('entradas', params)
};
export type InternalClient = typeof client;
