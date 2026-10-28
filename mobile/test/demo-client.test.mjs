import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createDemoClient,RequestError} from '../lib/demo-client.ts';
import {createStore} from '../../api/src/store.js';
import {createApiServer} from '../../api/src/server.js';

function memoryStorage(){
  const data=new Map();
  return {data,async getItem(k){return data.get(k)??null;},async setItem(k,v){data.set(k,v);},async removeItem(k){data.delete(k);}};
}
const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
const success=()=>response({state:{holdingsMg:{XAG:1000}},receipt:{id:'receipt-1'}});
const options=(storage,extra={})=>({api:'https://demo.example',storage,uuid:()=>crypto.randomUUID(),...extra});

test('persiste el payload y la clave antes del envío; los elimina tras confirmar',async()=>{
  const storage=memoryStorage();
  const client=createDemoClient(options(storage,{fetchImpl:async(url,init)=>{
    const saved=JSON.parse(storage.data.get('openminerals-demo-pending:https://demo.example'));
    assert.equal(saved.requestId,init.headers['Idempotency-Key']);
    assert.deepEqual(saved.body,JSON.parse(init.body));
    return success();
  }}));
  await client.submit('buy',{metal:'XAG',grams:'1.000'},'Comprar plata');
  assert.equal(client.getPending(),null);
  assert.equal(storage.data.size,1); // only the persistent session
});

test('respuesta perdida + relanzamiento: conserva la clave y la API registra una sola compra',async()=>{
  const storage=memoryStorage();
  const store=await createStore('');
  const server=createApiServer(store);
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const api=`http://127.0.0.1:${server.address().port}`;
  try{
    const first=createDemoClient(options(storage,{api,fetchImpl:async(url,init)=>{
      const result=await fetch(url,init);assert.equal(result.status,200);await result.json();
      throw new TypeError('Simulated lost response after server commit');
    }}));
    await assert.rejects(first.submit('buy',{metal:'XAG',grams:'1.000'},'Comprar plata'));
    const original=first.getPending();
    const restarted=createDemoClient(options(storage,{api,uuid:()=>{throw new Error('No debe crear otra clave');}}));
    assert.deepEqual((await restarted.initialize()).pending,original);
    await assert.rejects(restarted.submit('buy',{metal:'XAG',grams:'2.000'},'Otra compra'),/pendiente/);
    const replay=await restarted.retry();
    assert.equal(replay.receipt.replayed,true);
    assert.equal(replay.state.holdingsMg.XAG,1000);
    assert.equal(replay.state.movements.filter(m=>m.type==='BUY').length,1);
    assert.equal(restarted.getPending(),null);
  }finally{await new Promise(resolve=>server.close(resolve));await store.close();}
});

test('timeout conserva el comando y aborta la conexión',async()=>{
  const storage=memoryStorage();let signal;
  const client=createDemoClient(options(storage,{timeoutMs:10,fetchImpl:async(_url,init)=>{
    signal=init.signal;return new Promise(()=>{});
  }}));
  await assert.rejects(client.submit('buy',{metal:'XAG',grams:'1.000'},'Comprar'),e=>e instanceof RequestError&&e.ambiguous);
  assert.equal(signal.aborted,true);assert.ok(client.getPending());
});

test('el timeout también cubre una respuesta cuyo cuerpo nunca termina',async()=>{
  const client=createDemoClient(options(memoryStorage(),{timeoutMs:10,fetchImpl:async()=>({
    ok:true,status:200,json:async()=>new Promise(()=>{}),
  })}));
  await assert.rejects(client.submit('buy',{metal:'XAG',grams:'1.000'},'Comprar'),e=>e instanceof RequestError&&e.ambiguous);
  assert.ok(client.getPending());
});

test('fallo al guardar no envía la operación; reintento guarda y usa la misma clave',async()=>{
  const storage=memoryStorage();const originalSet=storage.setItem;let failed=false,calls=0;
  storage.setItem=async(k,v)=>{if(k.includes('pending:')&&!failed){failed=true;throw new Error('Storage unavailable');}await originalSet(k,v);};
  const client=createDemoClient(options(storage,{fetchImpl:async(_url,init)=>{
    calls++;assert.equal(init.headers['Idempotency-Key'],originalKey);return success();
  }}));
  await assert.rejects(client.submit('buy',{metal:'XAG',grams:'1.000'},'Comprar'),/Storage/);
  assert.equal(calls,0);const originalKey=client.getPending().requestId;
  await client.retry();assert.equal(calls,1);
});

test('un fallo inicial de almacenamiento se puede recuperar al volver a inicializar',async()=>{
  const storage=memoryStorage();const originalGet=storage.getItem;let failed=false;
  storage.getItem=async k=>{if(!failed){failed=true;throw new Error('Storage unavailable');}return originalGet(k);};
  const client=createDemoClient(options(storage));
  await assert.rejects(client.initialize(),/Storage/);
  assert.ok((await client.initialize()).session);assert.equal(client.getPending(),null);
});

test('rechazo definitivo libera pendiente; error 500 lo conserva',async()=>{
  const client=createDemoClient(options(memoryStorage(),{fetchImpl:async()=>response({error:'Saldo insuficiente'},422)}));
  await assert.rejects(client.submit('buy',{metal:'XAG',grams:'1.000'},'Comprar'),e=>!e.ambiguous&&e.status===422);
  assert.equal(client.getPending(),null);
  const uncertain=createDemoClient(options(memoryStorage(),{fetchImpl:async()=>response({error:'Server error'},500)}));
  await assert.rejects(uncertain.submit('buy',{metal:'XAG',grams:'1.000'},'Comprar'));
  assert.ok(uncertain.getPending());
});

test('bloquea confirmaciones concurrentes antes de cualquier await',async()=>{
  let finish;const client=createDemoClient(options(memoryStorage(),{fetchImpl:async()=>new Promise(resolve=>{finish=resolve;})}));
  const first=client.submit('buy',{metal:'XAG',grams:'1.000'},'Comprar');
  await assert.rejects(client.submit('buy',{metal:'XAG',grams:'1.000'},'Comprar'),/en curso/);
  while(!finish)await new Promise(resolve=>setImmediate(resolve));
  finish(success());await first;
});

test('respuesta incompleta o fallo al borrar conserva pendiente para repetir con seguridad',async()=>{
  const incomplete=createDemoClient(options(memoryStorage(),{fetchImpl:async()=>response({receipt:{id:'x'}})}));
  await assert.rejects(incomplete.submit('buy',{metal:'XAG',grams:'1.000'},'Comprar'),/incompleta/);
  assert.ok(incomplete.getPending());
  const storage=memoryStorage();storage.removeItem=async()=>{throw new Error('Storage unavailable');};
  const client=createDemoClient(options(storage,{fetchImpl:async()=>success()}));
  await assert.rejects(client.submit('buy',{metal:'XAG',grams:'1.000'},'Comprar'),/Storage/);
  assert.ok(client.getPending());
});

test('una operación almacenada inválida bloquea el envío sin borrar la evidencia',async()=>{
  const storage=memoryStorage();let requests=0;
  storage.data.set('openminerals-demo-session','valid-demo-session-0001');
  const key='openminerals-demo-pending:https://demo.example';
  storage.data.set(key,JSON.stringify({session:'otra-sesion',action:'buy',body:{},requestId:'valid-request-id',title:'Comprar'}));
  const saved=storage.data.get(key);
  const client=createDemoClient(options(storage,{fetchImpl:async()=>{requests++;return success();}}));
  await assert.rejects(client.submit('buy',{metal:'XAG',grams:'1.000'},'Comprar'),/pendiente no es válida/);
  assert.equal(requests,0);assert.equal(storage.data.get(key),saved);
});
