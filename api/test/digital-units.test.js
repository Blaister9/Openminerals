import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createStore} from '../src/store.js';
import {createApiServer} from '../src/server.js';
import {seedMine} from '../src/shared-mine.js';
import {seedState} from '../src/domain.js';
import {ensureCustody} from '../src/custody.js';
import {syncReservations} from '../src/custody-reservations.js';
import {syncDigitalUnits,validateDigitalUnits} from '../src/digital-units.js';
import {disconnectedDemoBlockchainPort} from '../src/blockchain-port.js';
import {lotFixture} from './lot-history-fixture.js';
import {command,digitalJourney,digitalRaces} from './digital-units-fixture.js';

test('unidades DEMO: recorrido compra/venta, marketplace, reservas, entrega y certificados',async()=>{
  const store=await createStore('',{digitalUnitsEnabled:true});
  try{await digitalJourney(store,'units_journey');}finally{await store.close();}
});
test('unidades DEMO: carreras de emisión, reservas, marketplace y cancelación idempotente',async()=>{
  const store=await createStore('',{digitalUnitsEnabled:true});
  try{await digitalRaces(store,store,'memory');}finally{await store.close();}
});
test('unidades DEMO: los cuatro metales usan miligramos enteros de masa bruta, sin descontar pureza dos veces',async()=>{
  const store=await createStore('',{digitalUnitsEnabled:true});
  try{
    const f=await lotFixture(store,'all_metals');
    for(const metal of ['XAU','XAG','XPT','XPD'])await store.mutateAccount(f.a.id,command('buy',{metal,grams:'0.101'}));
    const view=await store.getDigitalUnits(f.a.id);
    assert.ok(Object.values(view.reconciliation.metals).every(item=>item.outstandingUnits===101));
    assert.ok(view.series.every(item=>Number.isInteger(item.purityBps)&&item.purityBps<10000&&item.massBasis==='gross-lot-mass'));
    assert.ok(view.balances.every(item=>Number.isSafeInteger(item.units)&&item.units===101));
  }finally{await store.close();}
});
test('unidades DEMO: producción/verificación pendientes no respaldan emisión; recepción crea serie una vez',async()=>{
  const store=await createStore('',{digitalUnitsEnabled:true});
  try{
    const mine=await store.createMine({name:'Recepción de unidades DEMO vacía'});
    const op=await store.createAccount({alias:'units_intake_op',password:'Units-test-only-pass-123',role:'operator',mineId:mine.id});
    const buyer=await store.createAccount({alias:'units_intake_buyer',password:'Units-test-only-pass-123',mineId:mine.id});
    const batch=(await store.mutateIntake(op.id,command('intake_produce',{metal:'XAG',grams:'1.000',reason:'Producción exclusivamente DEMO'}))).receipt.batchId;
    await store.mutateIntake(op.id,command('intake_verify',{batchId:batch,reason:'Verificación exclusivamente DEMO'}));
    assert.equal((await store.getDigitalUnits(op.id)).series.length,0);
    await assert.rejects(store.mutateAccount(buyer.id,command('buy',{metal:'XAG',grams:'0.100'})),{code:'INSUFFICIENT_INVENTORY'});
    const receive=command('intake_receive',{batchId:batch,reason:'Recepción exclusivamente DEMO'});
    await Promise.all([store.mutateIntake(op.id,receive),store.mutateIntake(op.id,receive)]);
    const ready=await store.getDigitalUnits(op.id);assert.equal(ready.series.length,1);assert.equal(ready.events.length,0);
    await store.mutateAccount(buyer.id,command('buy',{metal:'XAG',grams:'1.000'}));
    assert.equal((await store.getDigitalUnits(op.id)).reconciliation.metals.XAG.outstandingUnits,1000);
  }finally{await store.close();}
});
test('unidades DEMO: cancelación/rechazo de reservas libera unidades, sin cancelar la posición',async()=>{
  const store=await createStore('',{digitalUnitsEnabled:true});
  try{
    const f=await lotFixture(store,'releases');await store.mutateAccount(f.a.id,command('buy',{metal:'XAU',grams:'0.300'}));
    for(const mode of ['cancel_offer','cancel_delivery','delivery_reject','operator_reject']){
      const offer=mode==='cancel_offer';
      const result=await store.mutateAccount(f.a.id,command(offer?'offer':'delivery',{metal:'XAU',grams:'0.200',...(offer?{price:'140.00'}:{})}));
      assert.equal((await store.getDigitalUnits(f.a.id)).reconciliation.metals.XAU.reservedUnits,200);
      const before=await store.getDigitalUnits(f.a.id);
      await assert.rejects(store.mutateAccount(f.a.id,command('sell',{metal:'XAU',grams:'0.200'})),{code:'INSUFFICIENT_HOLDING'});
      assert.deepEqual(await store.getDigitalUnits(f.a.id),before);
      if(mode==='operator_reject')await store.mutateDelivery(f.op.id,command('delivery_transition',{buyerId:f.a.id,deliveryId:result.receipt.delivery.id,status:'REJECTED',reason:'Rechazo exclusivamente DEMO'}));
      else await store.mutateAccount(f.a.id,command(mode,offer?{offerId:result.receipt.offer.id}:{deliveryId:result.receipt.delivery.id}));
      const after=await store.getDigitalUnits(f.a.id);assert.equal(after.reconciliation.metals.XAU.reservedUnits,0);assert.equal(after.reconciliation.metals.XAU.outstandingUnits,300);
      assert.ok(!after.events.some(item=>item.type==='CANCEL'));
    }
  }finally{await store.close();}
});
test('unidades DEMO: reemisión tras venta limita suministro vigente, no la suma histórica de emisiones',async()=>{
  const store=await createStore('',{digitalUnitsEnabled:true});
  try{
    const mine=await store.createMine({name:'Reemisión limitada exclusivamente DEMO',initialInventoryMg:{XAU:250}});
    const buyer=await store.createAccount({alias:'units_remint',password:'Units-remint-only-test-123',mineId:mine.id});
    for(let i=0;i<3;i++){
      await store.mutateAccount(buyer.id,command('buy',{metal:'XAU',grams:'0.200'}));
      assert.equal((await store.getDigitalUnits(buyer.id)).reconciliation.metals.XAU.outstandingUnits,200);
      await store.mutateAccount(buyer.id,command('sell',{metal:'XAU',grams:'0.200'}));
    }
    const view=await store.getDigitalUnits(buyer.id,new URLSearchParams('limit=100'));
    assert.equal(view.reconciliation.metals.XAU.outstandingUnits,0);
    assert.equal(view.events.filter(item=>item.type==='ISSUE').reduce((sum,item)=>sum+item.units,0),600);
    assert.equal(view.events.filter(item=>item.type==='CANCEL').reduce((sum,item)=>sum+item.units,0),600);
  }finally{await store.close();}
});
test('unidades DEMO: transferencia parcial entre lotes conserva series, pureza y respaldo de origen',async()=>{
  const store=await createStore('',{digitalUnitsEnabled:true});
  try{
    const mine=await store.createMine({name:'Series de lotes exclusivamente DEMO',initialInventoryMg:{XAU:150}}),users=[];
    for(const [alias,role] of [['units_lots_a','buyer'],['units_lots_b','buyer'],['units_lots_op','operator']])users.push(await store.createAccount({alias,password:'Units-lots-test-only-123',role,mineId:mine.id}));
    const [a,b,op]=users;
    await store.mutateAccount(a.id,command('buy',{metal:'XAU',grams:'0.100'}));
    await store.mutateStock(op.id,{metal:'XAU',grams:'0.200',reason:'Otro lote simulado',purityBps:9900,requestId:command('stock').requestId});
    await store.mutateAccount(a.id,command('buy',{metal:'XAU',grams:'0.200'}));
    const before=await store.getDigitalUnits(a.id),offer=(await store.mutateAccount(a.id,command('offer',{metal:'XAU',grams:'0.200',price:'140.00'}))).receipt.offer;
    await store.mutateAccount(b.id,command('market_buy',{sellerId:a.id,offerId:offer.id}));
    const view=await store.getDigitalUnits(b.id);
    assert.equal(view.series.length,2);assert.deepEqual(view.series.map(item=>item.id).sort(),before.series.map(item=>item.id).sort());
    assert.deepEqual(view.balances.map(item=>item.units).sort((x,y)=>x-y),[50,50,100]);
    assert.deepEqual(view.series.map(item=>item.purityBps).sort(),[9900,9999]);
    const all=await store.getDigitalUnits(op.id);assert.equal(all.reconciliation.metals.XAU.outstandingUnits,300);assert.equal(all.reconciliation.metals.XAU.inventoryMg,50);
  }finally{await store.close();}
});
test('unidades DEMO: apertura no reescribe saldos ni inventa una fecha de emisión histórica',()=>{
  let mine=seedMine();const state=seedState();state.holdingsMg.XAU=300;mine.inventoryMg.XAU-=300;
  const accounts=[{id:'existing-owner-demo',role:'buyer',alias:'opening_demo',state}];
  mine=ensureCustody(mine,accounts).mine;mine=syncReservations(mine,accounts).mine;
  const before=structuredClone({mine,accounts}),at='2026-11-02T20:00:00.000Z';
  const result=syncDigitalUnits(mine,accounts,{at});
  assert.deepEqual({mine,accounts},before);assert.equal(result.mine.digitalUnits.events[0].type,'OPENING_ISSUE');
  assert.equal(result.mine.digitalUnits.events[0].at,at);assert.equal(result.mine.digitalUnits.events[0].units,300);
  assert.equal(syncDigitalUnits(result.mine,accounts).changed,false);
  for(const corrupt of [value=>value.digitalUnits.balances[0].units++,value=>value.digitalUnits.events[0].units++,value=>value.digitalUnits.events.pop(),value=>value.digitalUnits.series[0].purityBps--]){
    const broken=structuredClone(result.mine);corrupt(broken);assert.throws(()=>validateDigitalUnits(broken,accounts),{code:'INVALID_DIGITAL_UNITS'});
  }
});
test('unidades DEMO: API autenticada, privacidad, paginación, exportación y puerto blockchain cerrado',async()=>{
  const store=await createStore('',{digitalUnitsEnabled:true}),server=createApiServer(store);
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  const call=async(path,token,options={})=>{const response=await fetch(base+path,{...options,headers:{...(token?{Authorization:`Bearer ${token}`}:{})}});return {status:response.status,data:await response.json()};};
  try{
    const f=await digitalJourney(store,'http_units');
    const buyer=await store.loginAccount(f.b.alias,'Exclusive-lot-history-tests-123'),other=await store.loginAccount(f.other.alias,'Exclusive-lot-history-tests-123'),op=await store.loginAccount(f.op.alias,'Exclusive-lot-history-tests-123');
    assert.equal((await call('/api/demo/digital-units')).status,401);
    assert.equal((await call('/api/demo/digital-units','invalid')).status,401);
    assert.equal((await call('/api/demo/mine/digital-units',buyer.token)).status,403);
    assert.equal((await call('/api/demo/mine/digital-units/intents',buyer.token)).status,403);
    const empty=(await call('/api/demo/digital-units',other.token)).data;
    assert.deepEqual(empty.balances,[]);assert.deepEqual(empty.events,[]);assert.deepEqual(empty.series,[]);assert.equal(empty.headHash,undefined);
    const own=(await call('/api/demo/digital-units',buyer.token)).data;assert.ok(own.balances.every(item=>item.ownerId===f.b.id));
    assert.ok(own.events.every(item=>item.to?.ownerId===f.b.id||item.from?.ownerId===f.b.id||item.reservation?.ownerId===f.b.id));
    const first=(await call('/api/demo/mine/digital-units?limit=2',op.token)).data;
    const next=(await call(`/api/demo/mine/digital-units?limit=2&after=${first.nextAfter}`,op.token)).data;
    assert.equal(first.events.length,2);assert.ok(first.hasMore);assert.ok(next.events.every(item=>item.sequence>first.nextAfter));
    for(const query of ['limit=0','limit=101','after=-1','limit=1&limit=2','ownerId=other'])assert.equal((await call('/api/demo/digital-units?'+query,buyer.token)).status,400);
    const exported=(await call('/api/demo/mine/digital-units/intents?limit=100',op.token)).data;
    assert.equal(exported.status,'NOT_SUBMITTED');assert.ok(exported.intents.length>0);assert.ok(exported.intents.every(item=>item.demoOnly&&item.status==='NOT_SUBMITTED'&&/^\d+$/.test(item.quantity)));
    assert.deepEqual((await call('/api/demo/mine/digital-units/intents?limit=100',op.token)).data,exported);
    assert.equal((await call('/api/demo/digital-units/mint',buyer.token,{method:'POST',body:'{}'})).status,404);
    const port=disconnectedDemoBlockchainPort();await assert.rejects(port.submitIntent(exported.intents[0]),{code:'BLOCKCHAIN_NOT_CONNECTED'});await assert.rejects(port.getReceipt('fake-demo'),{code:'BLOCKCHAIN_NOT_CONNECTED'});
  }finally{server.close();await once(server,'close');await store.close();}
});
test('unidades DEMO: desactivadas por defecto, comercio anterior disponible sin crear registro',async()=>{
  const store=await createStore('',{digitalUnitsEnabled:false});
  try{
    const f=await lotFixture(store,'disabled_units');
    await store.mutateAccount(f.a.id,command('buy',{metal:'XAU',grams:'0.100'}));
    await assert.rejects(store.getDigitalUnits(f.a.id),{code:'DIGITAL_UNITS_DISABLED'});
    assert.equal((await store.getAccountState(f.a.id)).holdingsMg.XAU,100);
  }finally{await store.close();}
});
