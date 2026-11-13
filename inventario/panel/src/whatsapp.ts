import type { WhatsAppContact } from './client';
export function inquiry(reference: string) {
 const value = reference.trim();
 if (!/^[a-zA-Z0-9_-]{1,100}$/.test(value)) return null;
 return `Hola, quisiera consultar si mi pedido ${value} está confirmado. Gracias.`;
}
export function preparedLink(contact: WhatsAppContact | null, message: string) {
 if (!contact?.destino_verificado || !contact.destino || !/^[1-9][0-9]{7,14}$/.test(contact.destino) || contact.destino === '5199999999' || !message.trim() || message.length > 1000) return null;
 const url = new URL(`https://wa.me/${contact.destino}`);
 url.searchParams.set('text',message);
 return url.toString();
}
