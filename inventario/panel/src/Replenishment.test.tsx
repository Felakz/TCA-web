// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Replenishment } from './Replenishment';
import type { InternalClient, Proposal } from './client';
afterEach(cleanup);
function setup(propuestas: Proposal[] = []) {
  const client = {
    replenishment: vi.fn().mockResolvedValue({ data: { productos: [{ producto_id: 'P1', nombre: 'Producto', stock_actual: 30, reservado: 10, disponible: 20, minimo: 20, objetivo: 40, habilitado: 1, alerta: 1, sugerido: 20 }], propuestas }, error: null }),
    configureMinimum: vi.fn().mockResolvedValue({ error: null }),
    createProposal: vi.fn().mockResolvedValue({ error: null }),
    reviseProposal: vi.fn().mockResolvedValue({ error: { message: 'Otra sesión modificó la propuesta.' } })
  };
  render(<Replenishment client={client as unknown as InternalClient} revision="0" />);
  return client;
}
it('identifica la alerta con texto, muestra cálculo y crea propuesta sin envío', async () => {
  const client = setup();
  await screen.findByText('AL-MIN-P1: STOCK MÍNIMO ALCANZADO');
  expect(screen.getByText(/Disponible 20 ≤ mínimo 20/)).toBeTruthy();
  expect(screen.getByText(/No se envían automáticamente al proveedor/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Crear propuesta para P1' }));
  await screen.findByText('Propuesta guardada para revisión interna.');
  expect(client.createProposal).toHaveBeenCalledWith({ id: expect.any(String), producto_id: 'P1', cantidad: 20, observacion: '' });
});
it('permite configurar mínimo y objetivo', async () => {
  const client = setup(); await screen.findByLabelText('Mínimo de P1');
  fireEvent.change(screen.getByLabelText('Mínimo de P1'), { target: { value: '15' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Guardar mínimo de P1' }).closest('form')!);
  await screen.findByText('Mínimo guardado.');
  expect(client.configureMinimum).toHaveBeenCalledWith({ producto_id: 'P1', minimo: 15, objetivo: 40, habilitado: true });
});
it('permite revisar cantidad y observación y conserva cambios si hay conflicto', async () => {
  const client = setup([{ id: 'b1', producto_id: 'P1', cantidad: 20, observacion: '', disponible_origen: 20, minimo_origen: 20, objetivo_origen: 40, version: 1, estado: 'BORRADOR' }]);
  await screen.findByLabelText('Cantidad propuesta b1');
  fireEvent.change(screen.getByLabelText('Cantidad propuesta b1'), { target: { value: '25' } });
  fireEvent.change(screen.getByLabelText('Observación b1'), { target: { value: 'Revisar presupuesto' } });
  fireEvent.submit(screen.getByRole('button', { name: 'Guardar revisión b1' }).closest('form')!);
  await screen.findByText('Otra sesión modificó la propuesta.');
  expect(client.reviseProposal).toHaveBeenCalledWith('b1', { cantidad: 25, observacion: 'Revisar presupuesto', version: 1 });
  expect((screen.getByLabelText('Cantidad propuesta b1') as HTMLInputElement).value).toBe('25');
});
