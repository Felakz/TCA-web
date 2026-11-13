export type Role = 'GERENCIA' | 'VENTAS' | 'ALMACEN' | 'CLIENTE' | 'SIN_ASIGNAR';
export type ManagedUser = { id: string; email: string; rol: Role; habilitado: number };
export type ReplenishmentProduct = Product & { minimo: number | null; objetivo: number | null; habilitado: number; alerta: number; sugerido: number };
export type Proposal = { id: string; producto_id: string; cantidad: number; observacion: string; disponible_origen: number; minimo_origen: number; objetivo_origen: number; version: number; estado: 'BORRADOR' };
export type ReplenishmentData = { productos: ReplenishmentProduct[]; propuestas: Proposal[] };
export type Receipt = { id: string; pedido_id: string; fecha: string; actor: { id: string; email: string }; leyenda: string; lineas: { producto_id: string; nombre: string; cantidad: number; stock_antes: number; stock_despues: number }[] };
export type Order = { id: string; estado: 'CONFIRMADO' | 'CANCELADO' | 'DESPACHADO'; lineas: { producto_id: string; cantidad: number }[] };
export type Session = { user: { id: string; email: string; rol: Role } };
export type Product = { producto_id: string; nombre: string; stock_actual: number; reservado: number; disponible: number };
export type Movement = { tipo_movimiento: 'ENTRADA' | 'SALIDA'; pedido_id: string | null; id: number; cantidad: number; stock_despues: number; actor: string; fecha: string; observacion: string | null };
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
  users: () => call<ManagedUser[]>('usuarios'),
  createUser: (params: { email: string; password: string; rol: Role }) => call('usuarios/crear', params),
  updateUser: (params: { id: string; rol: Role; habilitado: boolean }) => call('usuarios/actualizar', params),
  catalog: () => call<{ id: number; nombre: string; marca: string; descripcion: string; imagen: string; categoria: string }[]>('catalogo'),
  replenishment: () => call<ReplenishmentData>('reposicion'),
  configureMinimum: (params: { producto_id: string; minimo: number; objetivo: number; habilitado: boolean }) => call('reposicion/configurar', params),
  createProposal: (params: { id: string; producto_id: string; cantidad: number; observacion: string }) => call('reposicion/propuestas', params),
  reviseProposal: (id: string, params: { cantidad: number; observacion: string; version: number }) => call(`reposicion/propuestas/${encodeURIComponent(id)}/revisar`, params),
  orders: () => call<Order[]>('pedidos'),
  confirmOrder: (params: { id: string; lineas: { producto_id: string; cantidad: number }[] }) => call('pedidos/confirmar', params),
  dispatchOrder: (id: string) => call<{ constancia: Receipt }>(`pedidos/${encodeURIComponent(id)}/despachar`, {}),
  receipt: (id: string) => call<Receipt>(`pedidos/${encodeURIComponent(id)}/constancia`),
  cancelOrder: (id: string) => call(`pedidos/${encodeURIComponent(id)}/cancelar`, {}),
  products: () => call<Product[]>('inventario'),
  movements: (product: string) => call<Movement[]>(`movimientos?producto=${encodeURIComponent(product)}`),
  registerEntry: (params: object) => call<{ stock_despues: number }>('entradas', params)
};
export type InternalClient = typeof client;
