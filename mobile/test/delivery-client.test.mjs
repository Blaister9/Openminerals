import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {createAccountClient} from '../lib/account-client.ts';
import {createStore} from '../../api/src/store.js';
import {createApiServer} from '../../api/src/server.js';

function storage(){const data=new Map();return {async getItem(k){return data.get(k)??null;},async setItem(k,v){data.set(k,v);},async removeItem(k){data.delete(k);}};}
test('entrega: operador recupera cotización perdida y completa el ciclo sin duplicar costes ni salida',async()=>{
  const store=await createStore(''),server=createApiServer(store);server.listen(0,'127.0.0.1');await once(server,'listening');
  const api=`http://127.0.0.1:${server.address().port}`,password='Exclusive-delivery-client-fixture-123';
  try{
    const mine=await store.createMine({name:'Mina DEMO cliente entrega',initialInventoryMg:{XAU:1000}});
    const buyer=await store.createAccount({alias:'delivery_client_buyer',password,mineId:mine.id});
    await store.createAccount({alias:'delivery_client_operator',password,mineId:mine.id,role:'operator'});
    await store.mutateAccount(buyer.id,{action:'buy',metal:'XAU',grams:'0.500',requestId:randomUUID()});
    const requested=await store.mutateAccount(buyer.id,{action:'delivery',metal:'XAU',grams:'0.200',jurisdiction:'DEMO_LOCAL',requestId:randomUUID()});
    const deliveryId=requested.receipt.delivery.id;
    const data=storage(),auth=storage(),options={api,storage:data,authStorage:auth,uuid:randomUUID};let lose=true;
    const operator=createAccountClient({...options,fetchImpl:async(url,init)=>{
      const response=await fetch(url,init);
      if(lose&&url.endsWith('/mine/delivery_quote')){lose=false;assert.equal(response.status,200);await response.json();throw new TypeError('Lost quote response after commit');}
      return response;
    }});
    await operator.login('delivery_client_operator',password);
    await assert.rejects(operator.submit('mine/delivery_quote',{buyerId:buyer.id,deliveryId,jurisdiction:'DEMO_LOCAL'},'Cotizar entrega DEMO'));
    const original=operator.getPending(),restarted=createAccountClient(options);
    assert.deepEqual((await restarted.initialize()).pending,original);
    const quoted=await restarted.retry();assert.equal(quoted.receipt.replayed,true);assert.equal(quoted.receipt.id,original.requestId);
    assert.ok(!Object.hasOwn(quoted.receipt,'balancesAfter'));assert.equal(restarted.getPending(),null);
    const customer=createAccountClient({api,storage:storage(),authStorage:storage(),uuid:randomUUID});await customer.login('delivery_client_buyer',password);
    const quote=quoted.receipt.quote,before=(await customer.get('/api/demo/state')).walletMinor.USDT;
    const accepted=await customer.submit('delivery_accept',{deliveryId,quoteId:quote.id},'Aceptar cotización DEMO');
    assert.equal(accepted.state.walletMinor.USDT,before-quote.totalMinor);
    let last;
    for(const status of ['PREPARING','DISPATCHED_DEMO','DELIVERED_DEMO'])last=await restarted.submit('mine/delivery_transition',{buyerId:buyer.id,deliveryId,status,reason:'Avance exclusivamente ficticio'},'Avanzar entrega DEMO');
    assert.equal(last.mine.totalSupplyMg.XAU,800);assert.equal(last.mine.inventoryMg.XAU,500);assert.equal(last.mine.allocatedMg.XAU,300);
    const after=await customer.get('/api/demo/state');assert.equal(after.holdingsMg.XAU,300);assert.equal(after.walletMinor.USDT,before-quote.totalMinor);
    const custody=await customer.get('/api/demo/custody');assert.equal(custody.lots[0].deliveredMg,200);
    const requests=await customer.get('/api/demo/deliveries');assert.equal(requests.requests[0].status,'DELIVERED_DEMO');
  }finally{await new Promise(resolve=>server.close(resolve));await store.close();}
});
