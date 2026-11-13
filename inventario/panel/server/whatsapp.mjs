// Esta configuración solo habilita un enlace preparado, nunca una API de envío.
export function whatsappContact(env = process.env) {
 const phone = env.WHATSAPP_BUSINESS_NUMBER || '';
 const valid = /^[1-9][0-9]{7,14}$/.test(phone) && phone !== '5199999999';
 const verified = valid && env.WHATSAPP_DESTINATION_VERIFIED === 'true';
 return { modo: 'ENLACE_PREPARADO', envio_automatico: false, destino: verified ? phone : null, destino_verificado: verified,
  aviso: verified ? 'Enlace con texto preparado. Revisa el mensaje y pulsa Enviar en WhatsApp.' : 'Destino de atención pendiente de verificación. Apertura de WhatsApp deshabilitada.' };
}
