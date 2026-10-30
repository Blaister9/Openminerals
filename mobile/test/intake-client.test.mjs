import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createStore} from '../../api/src/store.js';
import {createApiServer} from '../../api/src/server.js';
import {createDemoClient} from '../lib/demo-client.ts';
import {parseIntake} from '../lib/intake.ts';
import {randomUUID} from 'node:crypto';
test('recepción: respuesta perdida conserva la misma clave tras reapertura y confirma un único lote',async()=>{
  const store=await createStore(''),password='Only-intake-client-tests-2026';let server;
  try{
    const mine=await store.createMine({name:'Cliente recepción DEMO',initialInventoryMg:{XAU:0,XAG:0,XPT:0,XPD:0}}),op=await store.createAccount({alias:'intake_client_operator',password,mineId:mine.id,role:'operator'}),auth=await store.loginAccount(op.alias,password);
    server=createApiServer(store);server.listen(0,'127.0.0.1');await once(server,'listening');
    const api=`http://127.0.0.1:${server.address().port}`,entries=new Map(),storage={getItem:async key=>entries.get(key)??null,setItem:async(key,value)=>{entries.set(key,value);},removeItem:async key=>{entries.delete(key);}};
    let drop=true;
    const create=()=>createDemoClient({api,storage,accountId:op.id,getToken:()=>auth.token,uuid:randomUUID,fetchImpl:async(url,options)=>{const response=await fetch(url,options);if(drop&&url.endsWith('/intake_receive')){drop=false;throw new TypeError('Simulated lost response');}return response;}});
    const client=create();await client.initialize();
    const produced=await client.submit('mine/intake_produce',{metal:'XAU',grams:'1.000',reason:'Producción solo DEMO'},'Producción DEMO');
    await client.submit('mine/intake_verify',{batchId:produced.receipt.batchId,reason:'Verificación DEMO'},'Verificación DEMO');
    await assert.rejects(client.submit('mine/intake_receive',{batchId:produced.receipt.batchId,reason:'Recepción DEMO'},'Recepción DEMO'));
    const pending=client.getPending();assert.ok(pending);assert.ok(!JSON.stringify([...entries.values()]).includes(auth.token));
    const reopened=create();await reopened.initialize();assert.equal(reopened.getPending().requestId,pending.requestId);
    const result=await reopened.retry();assert.equal(result.receipt.replayed,true);assert.equal(reopened.getPending(),null);
    const view=parseIntake(await store.getIntake(op.id));assert.equal(view.batches.length,1);assert.equal(view.totals.XAU.receivedMg,1000);assert.equal(result.mine.inventoryMg.XAU,1000);
  }finally{if(server)await new Promise(resolve=>server.close(resolve));await store.close();}
});
test('cliente de recepción conserva solo los campos mínimos de la vista',()=>{
  const totals=Object.fromEntries(['XAU','XAG','XPT','XPD'].map(key=>[key,{producedMg:0,pendingVerificationMg:0,receivedMg:0,deliveredMg:0,privateOperationalData:'must-not-retain'}]));
  assert.ok(!JSON.stringify(parseIntake({demoOnly:true,batches:[],totals})).includes('must-not-retain'));
  assert.throws(()=>parseIntake({demoOnly:true,batches:[],totals:{...totals,XAU:{...totals.XAU,receivedMg:-1}}}));
});
