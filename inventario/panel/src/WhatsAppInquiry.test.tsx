// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import { WhatsAppInquiry } from './WhatsAppInquiry';
import { inquiry, preparedLink } from './whatsapp';
import type { InternalClient, WhatsAppContact } from './client';
afterEach(cleanup);
const disabled: WhatsAppContact={modo:'ENLACE_PREPARADO',envio_automatico:false,destino:null,destino_verificado:false,aviso:'Destino pendiente de verificación.'};
// Destino sintético solo para probar construcción de URL, nunca se abre ni se contacta.
const verified: WhatsAppContact={...disabled,destino:'51912345678',destino_verificado:true,aviso:'Enlace preparado.'};
function setup(contact=disabled) {const api={whatsappContact:vi.fn().mockResolvedValue({data:contact,error:null})};render(<WhatsAppInquiry client={api as unknown as InternalClient}/>);return api;}
function prepare() {fireEvent.change(screen.getByLabelText('Referencia de tu pedido'),{target:{value:'PED-001'}});fireEvent.submit(screen.getByRole('button',{name:'Preparar texto de consulta'}).closest('form')!);}
it('sin destino verificado solo prepara texto y no presenta enlace',async()=>{
 const api=setup();await screen.findByText('Destino pendiente de verificación.');prepare();
 expect(screen.getByText('Texto preparado; no se ha enviado ningún mensaje.')).toBeTruthy();
 expect(screen.queryByRole('link')).toBeNull();expect(api.whatsappContact).toHaveBeenCalledOnce();
 expect((screen.getByLabelText('Mensaje preparado, editable antes de enviarlo') as HTMLTextAreaElement).value).toContain('consultar si mi pedido PED-001 está confirmado');
});
it('destino habilitado genera enlace explícito con texto editable, sin envío automático',async()=>{
 setup(verified);await screen.findByText('Enlace preparado.');prepare();
 fireEvent.change(screen.getByLabelText('Mensaje preparado, editable antes de enviarlo'),{target:{value:'Consulta PED-001: ¿confirmación? & revisión'}});
 const link=screen.getByRole('link',{name:'Abrir WhatsApp con texto preparado'}) as HTMLAnchorElement;
 const url=new URL(link.href);expect(url.origin).toBe('https://wa.me');expect(url.pathname).toBe('/51912345678');
 expect(url.searchParams.get('text')).toBe('Consulta PED-001: ¿confirmación? & revisión');expect(link.rel).toBe('noopener noreferrer');
 expect(screen.getByText(/No se envía automáticamente/)).toBeTruthy();
});
it('referencia vacía o inválida no genera mensaje; editar referencia retira el enlace anterior',async()=>{
 setup(verified);await screen.findByText('Enlace preparado.');prepare();
 fireEvent.change(screen.getByLabelText('Referencia de tu pedido'),{target:{value:'<script>'}});
 expect(screen.queryByRole('link')).toBeNull();
 fireEvent.submit(screen.getByRole('button',{name:'Preparar texto de consulta'}).closest('form')!);
 expect(screen.queryByLabelText('Mensaje preparado, editable antes de enviarlo')).toBeNull();
 expect(inquiry('')).toBeNull();expect(inquiry('a'.repeat(101))).toBeNull();
});
it('constructor bloquea número malformado, destino no verificado y texto vacío',()=>{
 expect(preparedLink(disabled,'hola')).toBeNull();
 expect(preparedLink({...verified,destino:'5199999999'},'hola')).toBeNull();
 expect(preparedLink({...verified,destino:'javascript:alert(1)'},'hola')).toBeNull();
 expect(preparedLink(verified,'')).toBeNull();
});
