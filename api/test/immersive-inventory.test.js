import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createStore} from '../src/store.js';
import {immersiveInventory,publicCustodyProjection} from './immersive-inventory-fixture.js';

test('inventario: estados, reservas exactas, concurrencia e invariantes',async t=>{
  const store=await createStore('');try{await immersiveInventory(t,store);}finally{await store.close();}
});
test('custodia HTTP: todos los DTO compradores excluyen nombre y textos operativos; operador los conserva',async()=>{
  const store=await createStore('');try{await publicCustodyProjection(store);}finally{await store.close();}
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
