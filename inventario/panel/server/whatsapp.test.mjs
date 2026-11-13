import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { whatsappContact } from './whatsapp.mjs';
import { openDatabase } from './db.mjs';
import { createApp } from './app.mjs';
test('HU09: destino bloqueado por defecto; formato no acredita registro real en WhatsApp',()=>{
 assert.equal(whatsappContact({}).destino,null);
 for(const phone of ['5199999999','+51912345678','javascript:alert(1)','123','abc']) assert.equal(whatsappContact({WHATSAPP_BUSINESS_NUMBER:phone,WHATSAPP_DESTINATION_VERIFIED:'true'}).destino,null);
 assert.equal(whatsappContact({WHATSAPP_BUSINESS_NUMBER:'51912345678'}).destino,null);
 const config=whatsappContact({WHATSAPP_BUSINESS_NUMBER:'51912345678',WHATSAPP_DESTINATION_VERIFIED:'true'});
 assert.equal(config.destino,'51912345678');assert.equal(config.modo,'ENLACE_PREPARADO');assert.equal(config.envio_automatico,false);
});
test('HU09: endpoint público solo informa de enlace preparado y no ofrece envío',async()=>{
 const db=openDatabase(':memory:');const config=whatsappContact({});const server=createApp(db,config);
 server.listen(0,'127.0.0.1');await once(server,'listening');
 const base=`http://127.0.0.1:${server.address().port}/api/`;
 try {
  const response=await fetch(base+'whatsapp');assert.equal(response.status,200);assert.deepEqual(await response.json(),config);
  assert.equal((await fetch(base+'whatsapp/enviar',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM pedidos').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM movimientos_inventario').get().n,0);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();}
});
