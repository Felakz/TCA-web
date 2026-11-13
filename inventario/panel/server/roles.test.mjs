import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { openDatabase, createUser } from './db.mjs';
import { createApp } from './app.mjs';
test('HU13: matriz de permisos HTTP con cuentas de roles fijos, usuarios y catálogo', async () => {
 const db=openDatabase(':memory:');
 const roles=['GERENCIA','VENTAS','ALMACEN','CLIENTE','SIN_ASIGNAR'];
 for(const role of roles) createUser(db,`${role.toLowerCase()}@example.test`,'prueba-hu13-12345',role);
 const server=createApp(db); server.listen(0,'127.0.0.1');await once(server,'listening');
 const base=`http://127.0.0.1:${server.address().port}/api/`;
 const cookies={};
 async function call(role,path,body) { return fetch(base+path,{headers:{'Content-Type':'application/json',...(cookies[role]?{Cookie:cookies[role]}:{})},...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)})}); }
 async function login(role) { const response=await call(null,'login',{email:`${role.toLowerCase()}@example.test`,password:'prueba-hu13-12345'});assert.equal(response.status,200);cookies[role]=response.headers.get('set-cookie'); }
 try {
  for(const role of roles) await login(role);
  const catalog=await (await call(null,'catalogo')).json(); assert.ok(catalog.length>0);
  const keys=['categoria','descripcion','id','imagen','marca','nombre'];
  for(const product of catalog) assert.ok(Object.keys(product).every(key=>keys.includes(key)));
  const matrix=[
   ['inventario',['GERENCIA','VENTAS','ALMACEN']],['pedidos',['GERENCIA','VENTAS','ALMACEN']],
   ['movimientos',['GERENCIA','ALMACEN']],['reposicion',['GERENCIA']],['usuarios',['GERENCIA']]
  ];
  for(const [path,permitted] of matrix) {
   assert.equal((await call(null,path)).status,401);
   for(const role of roles) assert.equal((await call(role,path)).status,permitted.includes(role)?200:403,`${role}: GET ${path}`);
  }
  const operations=[
   ['entradas','ALMACEN'],['pedidos/confirmar','VENTAS'],['pedidos/test/cancelar','VENTAS'],
   ['pedidos/test/despachar','ALMACEN'],['reposicion/configurar','GERENCIA'],['reposicion/propuestas','GERENCIA'],
   ['reposicion/propuestas/test/revisar','GERENCIA'],['usuarios/crear','GERENCIA'],['usuarios/actualizar','GERENCIA']
  ];
  for(const [path,permitted] of operations) {
   assert.equal((await call(null,path,{})).status,401);
   for(const role of roles) { const response=await call(role,path,{rol:'GERENCIA'}); if(role===permitted) assert.ok([400,404].includes(response.status),`${role}: ${path}`);else assert.equal(response.status,403,`${role}: POST ${path}`); }
  }
  assert.equal((await call('ALMACEN','entradas',{p_producto_id:'PROD-TEST-001',p_cantidad:10,p_idempotency_key:'hu13-entry'})).status,200);
  assert.equal((await call('VENTAS','pedidos/confirmar',{id:'hu13-order',lineas:[{producto_id:'PROD-TEST-001',cantidad:10}]})).status,200);
  assert.equal((await call('ALMACEN','pedidos/hu13-order/despachar',{})).status,200);
  for(const role of roles) assert.equal((await call(role,'pedidos/hu13-order/constancia')).status,['GERENCIA','VENTAS','ALMACEN'].includes(role)?200:403);
  assert.equal((await call('GERENCIA','reposicion/configurar',{producto_id:'PROD-TEST-001',minimo:20,objetivo:30,habilitado:true})).status,200);
  assert.equal((await call('GERENCIA','reposicion/propuestas',{id:'hu13-proposal',producto_id:'PROD-TEST-001',cantidad:10,observacion:''})).status,200);
  assert.equal((await call('GERENCIA','reposicion/propuestas/hu13-proposal/revisar',{cantidad:12,observacion:'Revisado',version:1})).status,200);
  assert.equal((await call('VENTAS','pedidos/confirmar',{id:'cancelable',lineas:[{producto_id:'PROD-TEST-001',cantidad:1}]})).status,200);
  assert.equal((await call('VENTAS','pedidos/cancelable/cancelar',{})).status,200);
  const listing=await (await call('GERENCIA','usuarios')).json();
  assert.ok(listing.every(u=>Object.keys(u).sort().join(',')==='email,habilitado,id,rol'));
  assert.equal((await call('GERENCIA','usuarios/crear',{email:'nuevo@example.test',password:'otra-prueba-123456',rol:'VENTAS'})).status,200);
  const newUser=db.prepare("SELECT * FROM usuarios WHERE email='nuevo@example.test'").get();
  assert.notEqual(newUser.hash,'otra-prueba-123456');assert.equal(newUser.rol,'VENTAS');
  const sales=listing.find(u=>u.rol==='VENTAS');
  assert.equal((await call('GERENCIA','usuarios/actualizar',{id:sales.id,rol:'CLIENTE',habilitado:true})).status,200);
  assert.equal((await call('VENTAS','inventario')).status,401); // Token anterior revocado.
  await login('VENTAS'); // Misma identidad, rol actual CLIENTE.
  assert.equal((await call('VENTAS','inventario')).status,403);
  assert.equal((await call('VENTAS','catalogo')).status,200);
  const manager=listing.find(u=>u.rol==='GERENCIA');
  assert.equal((await call('GERENCIA','usuarios/actualizar',{id:manager.id,rol:'CLIENTE',habilitado:true})).status,409);
  const warehouse=listing.find(u=>u.rol==='ALMACEN');
  assert.equal((await call('GERENCIA','usuarios/actualizar',{id:warehouse.id,rol:'ALMACEN',habilitado:false})).status,200);
  assert.equal((await call('ALMACEN','inventario')).status,401);
  assert.equal((await call(null,'login',{email:'almacen@example.test',password:'prueba-hu13-12345'})).status,401);
  assert.ok(db.prepare('SELECT COUNT(*) AS n FROM auditoria_usuarios').get().n>=3);
 } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));db.close();}
});
