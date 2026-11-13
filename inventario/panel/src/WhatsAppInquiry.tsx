import { useEffect, useState, type FormEvent } from 'react';
import type { InternalClient, WhatsAppContact } from './client';
import { inquiry, preparedLink } from './whatsapp';
export function WhatsAppInquiry({ client }: { client: InternalClient }) {
 const [contact,setContact]=useState<WhatsAppContact|null>(null);
 const [reference,setReference]=useState(''); const [message,setMessage]=useState(''); const [status,setStatus]=useState('');
 useEffect(()=>{let active=true;void client.whatsappContact().then(result=>{if(!active)return;if(result.error)setStatus('No se pudo consultar el destino de atención.');else setContact(result.data);});return()=>{active=false;};},[client]);
 const link=preparedLink(contact,message);
 function prepare(e:FormEvent<HTMLFormElement>) {e.preventDefault();const text=inquiry(reference);setMessage(text??'');setStatus(text?'Texto preparado; no se ha enviado ningún mensaje.':'Escribe una referencia de hasta 100 letras, números, guiones o guiones bajos.');}
 return <section><h2>Consultar confirmación por WhatsApp</h2><p>Prepara una consulta para atención al cliente. Esta página no comprueba el estado del pedido.</p>
 <p>{contact?.aviso??'Destino de atención sin verificar. Apertura de WhatsApp deshabilitada.'}</p>
 <form onSubmit={prepare}><label>Referencia de tu pedido<input required maxLength={100} value={reference} onChange={e=>{setReference(e.target.value);setMessage('');}} /></label><button>Preparar texto de consulta</button></form><p role="status">{status}</p>
 {message && <><label>Mensaje preparado, editable antes de enviarlo<textarea maxLength={1000} value={message} onChange={e=>setMessage(e.target.value)} /></label><p>No se envía automáticamente. Revisa el texto y el destinatario; el envío lo haces en WhatsApp.</p><p>No incluyas contraseñas ni datos de pago.</p>
 {link?<><p>Destino de atención: +{contact?.destino}</p><a href={link} target="_blank" rel="noopener noreferrer" onClick={()=>setStatus('Apertura del enlace solicitada; esta página no puede comprobar si enviaste el mensaje ni si fue entregado.')}>Abrir WhatsApp con texto preparado</a></>:<p>No hay un enlace disponible. Puedes seleccionar y copiar este texto para una consulta manual.</p>}</>}
 </section>;
}
