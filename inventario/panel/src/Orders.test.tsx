// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Orders } from './Orders';
import type { InternalClient, Order } from './client';
afterEach(cleanup);
function setup(orders: Order[] = []) {
  const client = {
    products: vi.fn().mockResolvedValue({ data: [{ producto_id: 'P1', nombre: 'Producto', stock_actual: 30, reservado: 10, disponible: 20 }], error: null }),
    orders: vi.fn().mockResolvedValue({ data: orders, error: null }),
    confirmOrder: vi.fn().mockResolvedValue({ data: null, error: { message: 'Disponibilidad insuficiente. Disponible: 20.' } }),
    cancelOrder: vi.fn().mockResolvedValue({ data: { estado: 'CANCELADO' }, error: null })
  };
  const onChange = vi.fn();
  render(<Orders client={client as unknown as InternalClient} revision={0} onChange={onChange} />);
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
