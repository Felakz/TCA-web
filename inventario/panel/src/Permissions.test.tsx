// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { Panel } from './Panel';
import { Users } from './Users';
import type { InternalClient } from './client';
vi.mock('./Orders', () => ({ Orders: ({role}: {role:string}) => <p>Pedidos para {role}</p> }));
vi.mock('./Replenishment', () => ({ Replenishment: () => <h2>Configuración de reposición</h2> }));
afterEach(cleanup);
function client() {
 return {
 products: vi.fn().mockResolvedValue({data:[],error:null}),
 users: vi.fn().mockResolvedValue({data:[{id:'u1',email:'ventas@example.test',rol:'VENTAS',habilitado:1}],error:null}),
 createUser: vi.fn().mockResolvedValue({error:null}),
 updateUser: vi.fn().mockResolvedValue({error:null})
 };
}
it('Ventas no ve entradas, parámetros ni administración de usuarios', async()=>{
 const api=client();render(<Panel client={api as unknown as InternalClient} role="VENTAS" />);
 await screen.findByText('Pedidos para VENTAS');
 expect(screen.queryByRole('button',{name:'Registrar entrada'})).toBeNull();
 expect(screen.queryByText('Configuración de reposición')).toBeNull();
 expect(screen.queryByText('Usuarios autorizados')).toBeNull();
 expect(api.users).not.toHaveBeenCalled();
});
it('Almacén ve entradas y no administra parámetros ni usuarios',async()=>{
 const api=client();render(<Panel client={api as unknown as InternalClient} role="ALMACEN" />);
 await screen.findByRole('button',{name:'Registrar entrada'});
 expect(screen.queryByText('Configuración de reposición')).toBeNull();expect(api.users).not.toHaveBeenCalled();
});
it('Gerencia ve usuarios y parámetros y no registra entradas',async()=>{
 const api=client();render(<Panel client={api as unknown as InternalClient} role="GERENCIA" />);
 await screen.findByText('Usuarios autorizados');expect(screen.getByText('Configuración de reposición')).toBeTruthy();
 expect(screen.queryByRole('button',{name:'Registrar entrada'})).toBeNull();
});
it('Gerencia puede guardar rol y habilitación desde el formulario',async()=>{
 const api=client();render(<Users client={api as unknown as InternalClient} />);
 await screen.findByLabelText('Rol de ventas@example.test');
 fireEvent.change(screen.getByLabelText('Rol de ventas@example.test'),{target:{value:'ALMACEN'}});
 fireEvent.click(screen.getByLabelText('Habilitar ventas@example.test'));
 fireEvent.submit(screen.getByRole('button',{name:'Guardar permisos de ventas@example.test'}).closest('form')!);
 await screen.findByText('Permisos guardados.');
 expect(api.updateUser).toHaveBeenCalledWith({id:'u1',rol:'ALMACEN',habilitado:false});
});
