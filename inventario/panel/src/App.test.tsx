// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { InternalClient, Session } from './client';
import { App } from './App';
vi.mock('./Panel', () => ({ Panel: () => <div>Operaciones privadas</div> }));
afterEach(cleanup);
function setup(initial: Session | null = null) {
  let listener: (event: string, session: Session | null) => void = () => {};
  const unsubscribe = vi.fn();
  const auth = {
    onAuthStateChange: vi.fn(callback => { listener = callback; return { data: { subscription: { unsubscribe } } }; }),
    getSession: vi.fn().mockResolvedValue({ data: { session: initial }, error: null }),
    signInWithPassword: vi.fn().mockResolvedValue({ error: { code: 'invalid_credentials' } }),
    signOut: vi.fn().mockResolvedValue({ error: null })
  };
  const client = { auth } as unknown as InternalClient;
  const result = render(<App client={client} />);
  return { ...result, auth, unsubscribe, emit: (session: Session | null) => act(() => listener(session ? 'SIGNED_IN' : 'SIGNED_OUT', session)) };
}
const session = { user: { id: 'test-id', email: 'equipo@example.test' } } as Session;
it('sin sesión oculta las operaciones internas', async () => {
  setup(); await screen.findByRole('button', { name: 'Ingresar' });
  expect(screen.queryByText('Operaciones privadas')).toBeNull();
});
it('muestra un error claro por credenciales inválidas y limpia la contraseña', async () => {
  const { auth } = setup(); await screen.findByRole('button', { name: 'Ingresar' });
  fireEvent.change(screen.getByLabelText('Correo'), { target: { value: 'equipo@example.test' } });
  fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'invalid-test-value' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Ingresar' }).closest('form')!);
  expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'Correo o contraseña incorrectos.');
  expect(auth.signInWithPassword).toHaveBeenCalledOnce();
  expect((screen.getByLabelText('Contraseña') as HTMLInputElement).value).toBe('');
});
it('identifica la sesión y la elimina al cerrar sesión', async () => {
  const { auth } = setup(session);
  await screen.findByText('Operaciones privadas');
  expect(screen.getByText('Sesión: equipo@example.test')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
  await screen.findByRole('button', { name: 'Ingresar' });
  expect(auth.signOut).toHaveBeenCalledWith({ scope: 'local' });
  expect(screen.queryByText('Operaciones privadas')).toBeNull();
});
it('responde al ingreso y cierre desde otra pestaña y cancela la suscripción', async () => {
  const { emit, unmount, unsubscribe } = setup();
  await screen.findByRole('button', { name: 'Ingresar' }); emit(session);
  expect(screen.getByText('Operaciones privadas')).toBeTruthy(); emit(null);
  expect(screen.queryByText('Operaciones privadas')).toBeNull();
  unmount(); expect(unsubscribe).toHaveBeenCalledOnce();
});
it('si falla el cierre permite reintentar sin darlo por exitoso', async () => {
  const { auth } = setup(session); await screen.findByText('Operaciones privadas');
  auth.signOut.mockResolvedValueOnce({ error: { message: 'network' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('No se pudo cerrar sesión'));
  expect(screen.getByText('Operaciones privadas')).toBeTruthy();
});
it('sin configuración muestra instrucciones y no habilita el formulario', () => {
  render(<App client={null} />); expect(screen.getByRole('alert').textContent).toContain('servidor local');
  expect(screen.queryByRole('button')).toBeNull();
});
