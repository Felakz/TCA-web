// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Orders } from './Orders';
import type { InternalClient, Order, Role } from './client';
afterEach(cleanup);
function setup(orders: Order[] = [], role: Role = 'VENTAS') {
  const client = {
    products: vi.fn().mockResolvedValue({ data: [{ producto_id: 'P1', nombre: 'Producto', stock_actual: 30, reservado: 10, disponible: 20 }], error: null }),
    orders: vi.fn().mockResolvedValue({ data: orders, error: null }),
    confirmOrder: vi.fn().mockResolvedValue({ data: null, error: { message: 'Disponibilidad insuficiente. Disponible: 20.' } }),
    dispatchOrder: vi.fn(),
    receipt: vi.fn(),
    cancelOrder: vi.fn().mockResolvedValue({ data: { estado: 'CANCELADO' }, error: null })
  };
  const onChange = vi.fn();
  render(<Orders role={role} client={client as unknown as InternalClient} revision={0} onChange={onChange} />);
  return { client, onChange };
}
it('muestra físico, reservado y disponible e informa el rechazo del servidor', async () => {
  const { client } = setup();
  await screen.findByRole('option', { name: 'Producto — físico 30, reservado 10, disponible 20' });
  fireEvent.change(screen.getByLabelText('Producto a reservar'), { target: { value: 'P1' } });
  fireEvent.change(screen.getByLabelText('Unidades a reservar'), { target: { value: '21' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Confirmar pedido y reservar' }).closest('form')!);
  await screen.findByText('Disponibilidad insuficiente. Disponible: 20.');
  expect(client.confirmOrder).toHaveBeenCalledWith({ id: expect.any(String), lineas: [{ producto_id: 'P1', cantidad: 21 }] });
});
it('un reintento tras error de conexión conserva el identificador del pedido', async () => {
  const { client } = setup();
  client.confirmOrder.mockResolvedValue({ data: null, error: { message: 'Sin conexión' } });
  await screen.findByRole('option', { name: /Producto — físico/ });
  fireEvent.change(screen.getByLabelText('Producto a reservar'), { target: { value: 'P1' } });
  fireEvent.change(screen.getByLabelText('Unidades a reservar'), { target: { value: '10' } });
  const form = screen.getByRole('button', { name: 'Confirmar pedido y reservar' }).closest('form')!;
  fireEvent.submit(form);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Confirmar pedido y reservar' }).closest('fieldset')!.disabled).toBe(false));
  fireEvent.submit(form);
  await waitFor(() => expect(client.confirmOrder).toHaveBeenCalledTimes(2));
  expect(client.confirmOrder.mock.calls[0]).toEqual(client.confirmOrder.mock.calls[1]);
});
it('cancelar actualiza la lista y elimina la acción de cancelación', async () => {
  const order: Order = { id: 'pedido-1', estado: 'CONFIRMADO', lineas: [{ producto_id: 'P1', cantidad: 10 }] };
  const { client, onChange } = setup([order]);
  const cancel = await screen.findByRole('button', { name: 'Cancelar pedido pedido-1' });
  client.orders.mockResolvedValue({ data: [{ ...order, estado: 'CANCELADO' }], error: null });
  fireEvent.click(cancel);
  await screen.findByText('Pedido cancelado. Reserva liberada.');
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Cancelar pedido pedido-1' })).toBeNull());
  expect(client.cancelOrder).toHaveBeenCalledWith('pedido-1');
  expect(onChange).toHaveBeenCalled();
});

it('despachar actualiza el estado y muestra una constancia recuperable', async () => {
  const order: Order = { id: 'pedido-1', estado: 'CONFIRMADO', lineas: [{ producto_id: 'P1', cantidad: 10 }] };
  const { client, onChange } = setup([order], 'ALMACEN');
  const receipt = { id: 'DES-1', pedido_id: 'pedido-1', fecha: '2026-11-13T12:00:00Z', actor: { id: 'user-1', email: 'almacen@example.test' }, leyenda: 'CONSTANCIA INTERNA DE DESPACHO — SIN VALOR TRIBUTARIO', lineas: [{ producto_id: 'P1', nombre: 'Producto', cantidad: 10, stock_antes: 30, stock_despues: 20 }] };
  client.dispatchOrder.mockResolvedValue({ data: { constancia: receipt }, error: null });
  client.receipt.mockResolvedValue({ data: receipt, error: null });
  const dispatch = await screen.findByRole('button', { name: 'Despachar pedido pedido-1' });
  client.orders.mockResolvedValue({ data: [{ ...order, estado: 'DESPACHADO' }], error: null });
  fireEvent.click(dispatch);
  await screen.findByRole('heading', { name: /SIN VALOR TRIBUTARIO/ });
  await waitFor(() => expect(screen.queryByRole('button', { name: 'Despachar pedido pedido-1' })).toBeNull());
  expect(client.dispatchOrder).toHaveBeenCalledWith('pedido-1'); expect(onChange).toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Cancelar pedido pedido-1' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Ver constancia pedido-1' }));
  await screen.findByRole('button', { name: 'Descargar constancia interna' });
  expect(client.receipt).toHaveBeenCalledWith('pedido-1');
});
it('un rechazo al despachar mantiene las acciones de un pedido confirmado', async () => {
  const order: Order = { id: 'pedido-error', estado: 'CONFIRMADO', lineas: [{ producto_id: 'P1', cantidad: 10 }] };
  const { client } = setup([order], 'ALMACEN');
  client.dispatchOrder.mockResolvedValue({ data: null, error: { message: 'Stock físico insuficiente.' } });
  fireEvent.click(await screen.findByRole('button', { name: 'Despachar pedido pedido-error' }));
  await screen.findByText('Stock físico insuficiente.');
  expect(screen.queryByRole('article', { name: 'Constancia de despacho' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Despachar pedido pedido-error' })).toBeTruthy();
});
