import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {createStore} from '../src/store.js';
import {createApiServer} from '../src/server.js';
import {immersiveInventory} from './immersive-inventory-fixture.js';

test('inventario: estados, reservas exactas, concurrencia e invariantes',async t=>{
  const store=await createStore('');try{await immersiveInventory(t,store);}finally{await store.close();}
});
test('custodia HTTP: proyección pública excluye textos operativos de lotes y certificados',async()=>{
  const store=await createStore(''),password='Only-public-projection-tests-2026';let server;
  try{
    const mine=await store.createMine({name:'Proyección de custodia',initialInventoryMg:{XAU:0,XAG:0,XPT:0,XPD:0}});
    const a=await store.createAccount({alias:'projection_buyer',password,mineId:mine.id}),op=await store.createAccount({alias:'projection_operator',password,mineId:mine.id,role:'operator'});
    const canary='PRIVATE_OPERATIONAL_SENTINEL';
    const stock=await store.mutateStock(op.id,{metal:'XAU',grams:'1.000',reason:'Entrada DEMO',location:canary,documentTitle:canary,documentContent:canary,requestId:randomUUID()});
    const purchase=await store.mutateAccount(a.id,{action:'buy',metal:'XAU',grams:'0.100',requestId:randomUUID()});
    server=createApiServer(store);server.listen(0,'127.0.0.1');await once(server,'listening');
    const base=`http://127.0.0.1:${server.address().port}`,buyer=(await store.loginAccount(a.alias,password)).token;
    for(const path of ['/api/demo/custody',`/api/demo/certificates/${purchase.receipt.certificateIds[0]}`,`/api/demo/custody/lots/${stock.receipt.lotId}/history`]){
      const response=await fetch(base+path,{headers:{Authorization:'Bearer '+buyer}});assert.equal(response.status,200);assert.ok(!(await response.text()).includes(canary));
    }
    for(const path of ['/api/demo/mine/intake','/api/demo/mine/custody']){
      assert.equal((await fetch(base+path,{headers:{Authorization:'Bearer '+buyer}})).status,403);
      assert.equal((await fetch(base+path,{headers:{Authorization:'Bearer invalid','x-demo-session':'legacy-public-projection-test'}})).status,401);
    }
    assert.equal((await fetch(base+'/api/demo/mine/intake_produce',{method:'POST',headers:{Authorization:'Bearer '+buyer,'Content-Type':'application/json','Idempotency-Key':randomUUID()},body:JSON.stringify({metal:'XAU',grams:'0.100',reason:'No permite comprador'})})).status,403);
    assert.ok(JSON.stringify(await store.getCustody(op.id,'operator')).includes(canary));
  }finally{if(server)await new Promise(resolve=>server.close(resolve));await store.close();}
});
test('custodia: motivos y textos operativos de entrega no salen por estado, comprobantes o políticas del comprador',async()=>{
  const store=await createStore(''),password='Only-delivery-privacy-tests-2026',canary='PRIVATE_CUSTODY_OPERATIONS_SENTINEL';
  const command=(action,body)=>({action,...body,requestId:randomUUID()});
  try{
    const mine=await store.createMine({name:'Mina privacidad de entrega',initialInventoryMg:{XAU:1000,XAG:0,XPT:0,XPD:0}}),a=await store.createAccount({alias:'delivery_projection_a',password,mineId:mine.id}),op=await store.createAccount({alias:'delivery_projection_op',password,mineId:mine.id,role:'operator'});
    await store.mutateAccount(a.id,command('buy',{metal:'XAU',grams:'0.100'}));
    const request=(await store.mutateAccount(a.id,command('delivery',{metal:'XAU',grams:'0.100'}))).receipt.delivery;
    await store.mutateDelivery(op.id,command('delivery_config',{jurisdiction:'DEMO_LOCAL',label:canary,taxBps:'0',service:'1.00',preparation:'1.00',transport:'1.00',insuranceBps:'0',quoteValidityHours:'24',requirements:canary,reason:canary}));
    const quote=(await store.mutateDelivery(op.id,command('delivery_quote',{buyerId:a.id,deliveryId:request.id,jurisdiction:'DEMO_LOCAL'}))).receipt.quote;
    const accepted=await store.mutateAccount(a.id,command('delivery_accept',{deliveryId:request.id,quoteId:quote.id,requirementsAcknowledged:true}));
    assert.ok(!JSON.stringify(accepted).includes(canary));
    await store.mutateDelivery(op.id,command('delivery_transition',{buyerId:a.id,deliveryId:request.id,status:'PREPARING',reason:canary}));
    const state=await store.getAccountState(a.id),view=await store.getDeliveries(a.id);
    assert.ok(!JSON.stringify(state).includes(canary));assert.ok(!JSON.stringify(view).includes(canary));
    assert.equal(view.requests[0].quote.totalMinor,quote.totalMinor);assert.equal(view.requests[0].status,'PREPARING');
    const summary=await store.getMineSummary(op.id);assert.equal(summary.deliveryCommittedMg.XAU,100);assert.equal(summary.reservedMg.XAU,100);
    assert.ok(JSON.stringify(await store.getDeliveries(op.id,'operator')).includes(canary));
  }finally{await store.close();}
});
