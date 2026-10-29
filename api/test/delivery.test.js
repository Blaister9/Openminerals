import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {createStore} from '../src/store.js';
import {createApiServer} from '../src/server.js';
import {seedMine} from '../src/shared-mine.js';
import {applyBuyerDelivery,ensureDelivery,deliveryQuote} from '../src/delivery.js';

const PASSWORD='Exclusive-delivery-unit-tests-123',cmd=(action,body={})=>({action,...body,requestId:randomUUID()});
const minor=value=>`${Math.floor(value/100)}.${String(value%100).padStart(2,'0')}`;
async function fixture(){
  const store=await createStore(''),mine=await store.createMine({name:'Entrega ficticia aislada',initialInventoryMg:{XAU:1000,XAG:1000,XPT:1000,XPD:1000}});
  const buyer=await store.createAccount({alias:'delivery_buyer',password:PASSWORD,mineId:mine.id}),op=await store.createAccount({alias:'delivery_operator',password:PASSWORD,mineId:mine.id,role:'operator'});
  await store.mutateAccount(buyer.id,cmd('buy',{metal:'XAU',grams:'0.500'}));
  return {store,mine,buyer,op};
}
async function request(f,grams='0.300',metal='XAU'){return (await f.store.mutateAccount(f.buyer.id,cmd('delivery',{metal,grams,jurisdiction:'DEMO_LOCAL'}))).receipt.delivery;}
async function quote(f,delivery,jurisdiction='DEMO_LOCAL'){return f.store.mutateDelivery(f.op.id,cmd('delivery_quote',{buyerId:f.buyer.id,deliveryId:delivery.id,jurisdiction}));}
const transition=(f,delivery,status)=>cmd('delivery_transition',{buyerId:f.buyer.id,deliveryId:delivery.id,status,reason:'Paso exclusivamente ficticio'});
const config=(body={})=>cmd('delivery_config',{jurisdiction:'DEMO_LOCAL',label:'Jurisdicción DEMO configurada',taxBps:'250',service:'1.00',preparation:'2.00',transport:'3.00',insuranceBps:'50',quoteValidityHours:'24',requirements:'Identificador ficticio\nConfirmar condiciones DEMO',reason:'Ajuste ilustrativo de costes',...body});

test('entrega: costes jurisdiccionales enteros y requisitos son snapshots ficticios',()=>{
  const {mine}=ensureDelivery(seedMine());
  const result=deliveryQuote(mine,{metal:'XAU',mg:200},'DEMO_REGIONAL','quote-unit','2026-10-28T00:00:00.000Z');
  assert.equal(result.metalValueMinor,2900);assert.equal(result.insuranceMinor,15);assert.equal(result.subtotalMinor,2015);assert.equal(result.taxMinor,101);assert.equal(result.totalMinor,2116);
  assert.equal(result.expiresAt,'2026-10-29T00:00:00.000Z');assert.equal(result.demoOnly,true);
  const snapshot=structuredClone(result);mine.delivery.jurisdictions[1].taxBps=9999;mine.delivery.jurisdictions[1].requirements[0]='Cambio posterior';assert.deepEqual(result,snapshot);
});

test('entrega: ciclo completo conserva reservas hasta finalizar y lotes originales después',async()=>{
  const f=await fixture();
  try{
    const original=await f.store.getAccountState(f.buyer.id),certificateId=Object.values(original.receipts).find(receipt=>receipt.action==='buy').certificateIds[0];
    const delivery=await request(f),requested=await f.store.getAccountState(f.buyer.id),q=await quote(f,delivery);
    assert.equal((await f.store.getDeliveries(f.buyer.id)).availableMg.XAU,200);assert.equal(q.receipt.deliveryStatus,'QUOTED');assert.equal(q.receipt.mineId,f.mine.id);assert.equal(q.receipt.actor.id,f.op.id);assert.equal(q.receipt.balancesAfter,undefined);
    const originalQuote=structuredClone(q.receipt);assert.deepEqual(await f.store.getMineCommand(f.op.id,q.receipt.id),originalQuote);
    const accept=cmd('delivery_accept',{deliveryId:delivery.id,quoteId:q.receipt.quote.id}),accepted=await f.store.mutateAccount(f.buyer.id,accept);
    assert.equal(accepted.state.walletMinor.USDT,requested.walletMinor.USDT-q.receipt.quote.totalMinor);assert.equal(accepted.receipt.balancesAfter.reservedMg.XAU,300);
    await assert.rejects(f.store.mutateAccount(f.buyer.id,cmd('cancel_delivery',{deliveryId:delivery.id})));
    await assert.rejects(f.store.mutateAccount(f.buyer.id,cmd('sell',{metal:'XAU',grams:'0.300'})),{code:'INSUFFICIENT_HOLDING'});
    const before=await f.store.getMineSummary(f.op.id);assert.equal(before.reservedMg.XAU,300);assert.equal(before.deliveriesPending,1);
    for(const status of ['PREPARING','DISPATCHED_DEMO','DELIVERED_DEMO']){
      const command=transition(f,delivery,status),changed=await f.store.mutateDelivery(f.op.id,command),snapshot=await f.store.getCustody(f.op.id,'operator');
      const replay=await f.store.mutateDelivery(f.op.id,command);assert.deepEqual(replay.receipt,{...changed.receipt,replayed:true});assert.deepEqual(await f.store.getCustody(f.op.id,'operator'),snapshot);
      assert.equal(changed.receipt.deliveryStatus,status);assert.equal(changed.receipt.balancesAfter,undefined);
      if(status!=='DELIVERED_DEMO')assert.equal(changed.mine.reservedMg.XAU,300);
    }
    const final=await f.store.getAccountState(f.buyer.id),after=await f.store.getMineSummary(f.op.id),custody=await f.store.getCustody(f.op.id,'operator');
    assert.equal(final.custodyRequests[0].status,'DELIVERED_DEMO');assert.equal(final.holdingsMg.XAU,200);assert.equal(after.reservedMg.XAU,0);assert.equal(after.deliveriesPending,0);
    assert.equal(after.inventoryMg.XAU,before.inventoryMg.XAU);assert.equal(after.totalSupplyMg.XAU,before.totalSupplyMg.XAU-300);assert.equal(after.inventoryMg.XAU+after.allocatedMg.XAU,after.totalSupplyMg.XAU);
    assert.equal(custody.totals.XAU.weightMg,1000);assert.equal(custody.totals.XAU.deliveredMg,300);assert.equal(custody.totals.XAU.activeWeightMg,700);
    const lot=custody.lots.find(item=>item.metal==='XAU');assert.equal(lot.originalWeightMg,1000);assert.equal(lot.activeWeightMg,lot.availableMg+lot.allocatedMg);
    const certificate=await f.store.getCertificate(f.buyer.id,certificateId);assert.equal(certificate.issuedMg,500);assert.equal(certificate.allocatedMg,200);assert.equal(certificate.status,'PARTIALLY_RELEASED');
    const replay=await f.store.mutateAccount(f.buyer.id,accept);assert.deepEqual(replay.receipt,{...accepted.receipt,replayed:true});assert.deepEqual(await f.store.getAccountState(f.buyer.id),final);
    assert.deepEqual(await f.store.getMineCommand(f.op.id,q.receipt.id),originalQuote);assert.deepEqual(final.receipts[Object.keys(original.receipts)[0]],Object.values(original.receipts)[0]);
  }finally{await f.store.close();}
});

test('entrega: cotización obsoleta/vencida y costes sin saldo no aplican movimientos parciales',async()=>{
  const f=await fixture();
  try{
    const delivery=await request(f),first=await quote(f,delivery),second=await quote(f,delivery,'DEMO_REGIONAL'),before=await f.store.getAccountState(f.buyer.id);
    await assert.rejects(f.store.mutateAccount(f.buyer.id,cmd('delivery_accept',{deliveryId:delivery.id,quoteId:first.receipt.quote.id})),{code:'STALE_QUOTE'});assert.deepEqual(await f.store.getAccountState(f.buyer.id),before);
    const fakeMine=ensureDelivery(seedMine(f.mine.id)).mine,expiredAt=new Date(Date.parse(second.receipt.quote.expiresAt)+1).toISOString();
    assert.throws(()=>applyBuyerDelivery(fakeMine,{...f.buyer,state:before},cmd('delivery_accept',{deliveryId:delivery.id,quoteId:second.receipt.quote.id}),expiredAt),{code:'QUOTE_EXPIRED'});assert.deepEqual(await f.store.getAccountState(f.buyer.id),before);
    await f.store.mutateAccount(f.buyer.id,cmd('withdraw',{currency:'USDT',amount:minor(before.walletMinor.USDT)}));const empty=await f.store.getAccountState(f.buyer.id);
    await assert.rejects(f.store.mutateAccount(f.buyer.id,cmd('delivery_accept',{deliveryId:delivery.id,quoteId:second.receipt.quote.id})),{code:'INSUFFICIENT_BALANCE'});assert.deepEqual(await f.store.getAccountState(f.buyer.id),empty);
    await f.store.mutateDelivery(f.op.id,config());const still=(await f.store.getDeliveries(f.buyer.id)).requests.find(item=>item.id===delivery.id);assert.deepEqual(still.quote,second.receipt.quote);
    await f.store.mutateAccount(f.buyer.id,cmd('deposit',{currency:'USDT',amount:minor(second.receipt.quote.totalMinor)}));
    await f.store.mutateAccount(f.buyer.id,cmd('delivery_accept',{deliveryId:delivery.id,quoteId:second.receipt.quote.id}));
    const accepted=await f.store.getAccountState(f.buyer.id);assert.equal(accepted.walletMinor.USDT,0);
    await assert.rejects(f.store.mutateAccount(f.buyer.id,cmd('delivery_accept',{deliveryId:delivery.id,quoteId:second.receipt.quote.id})),{code:'INVALID_DELIVERY_STATE'});assert.deepEqual(await f.store.getAccountState(f.buyer.id),accepted);
  }finally{await f.store.close();}
});

test('entrega: rechazo/cancelación antes de aceptar liberan una sola reserva sin cobrar',async()=>{
  const f=await fixture();
  try{
    const before=await f.store.getAccountState(f.buyer.id);
    for(const action of ['cancel_pending','cancel_quoted','reject_buyer','reject_operator']){
      const delivery=await request(f,'0.100');if(action!=='cancel_pending')await quote(f,delivery);
      let command;if(action.startsWith('cancel'))command=cmd('cancel_delivery',{deliveryId:delivery.id});else if(action==='reject_buyer')command=cmd('delivery_reject',{deliveryId:delivery.id});else command=transition(f,delivery,'REJECTED');
      const operation=action==='reject_operator'?()=>f.store.mutateDelivery(f.op.id,command):()=>f.store.mutateAccount(f.buyer.id,command);
      const changed=await operation(),replay=await operation();assert.equal(replay.receipt.replayed,true);
      const after=await f.store.getAccountState(f.buyer.id),summary=await f.store.getMineSummary(f.op.id);assert.equal(summary.reservedMg.XAU,0);assert.equal(after.walletMinor.USDT,before.walletMinor.USDT);assert.equal(after.holdingsMg.XAU,500);
      assert.deepEqual(replay.receipt,{...changed.receipt,replayed:true});
    }
  }finally{await f.store.close();}
});

test('entrega: configuración auditada e idempotente rechaza campos fuera de límites',async()=>{
  const f=await fixture();
  try{
    const command=config(),changed=await f.store.mutateDelivery(f.op.id,command),snapshot=await f.store.getDeliveries(f.op.id,'operator');
    assert.equal(changed.receipt.action,'delivery_config');assert.equal(changed.receipt.accountId,f.op.id);assert.equal(snapshot.audit.length,1);assert.equal(snapshot.policies.version,2);assert.equal(snapshot.audit[0].reason,command.reason);
    const replay=await f.store.mutateDelivery(f.op.id,command);assert.deepEqual(replay.receipt,{...changed.receipt,replayed:true});assert.deepEqual(await f.store.getDeliveries(f.op.id,'operator'),snapshot);
    await assert.rejects(f.store.mutateDelivery(f.op.id,{...command,taxBps:'999'}));
    for(const invalid of [{taxBps:'10001'},{insuranceBps:'1.2'},{quoteValidityHours:'0'},{quoteValidityHours:'169'},{service:'-1.00'},{requirements:''},{reason:'x'},{jurisdiction:'COLOMBIA_REAL'}])await assert.rejects(f.store.mutateDelivery(f.op.id,config(invalid)));
    assert.deepEqual(await f.store.getDeliveries(f.op.id,'operator'),snapshot);assert.deepEqual((await f.store.getDeliveries(f.buyer.id)).audit,[]);
  }finally{await f.store.close();}
});

test('entrega HTTP: roles, minas, recibos op sin saldos y saltos de estado protegidos',async()=>{
  const f=await fixture(),server=createApiServer(f.store);server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
  const request=async(path,token,body,key)=>{const response=await fetch(base+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(body?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()};};
  try{
    const buyer=(await f.store.loginAccount(f.buyer.alias,PASSWORD)).token,op=(await f.store.loginAccount(f.op.alias,PASSWORD)).token;
    const otherMine=await f.store.createMine({name:'Otra mina entregas'}),other=await f.store.createAccount({alias:'other_delivery_op',password:PASSWORD,mineId:otherMine.id,role:'operator'}),otherToken=(await f.store.loginAccount(other.alias,PASSWORD)).token;
    assert.equal((await request('/api/demo/deliveries')).status,401);assert.equal((await request('/api/demo/mine/deliveries',buyer)).status,403);assert.equal((await request('/api/demo/deliveries',op)).status,403);
    const requested=await request('/api/demo/delivery',buyer,{metal:'XAU',grams:'0.100',jurisdiction:'DEMO_LOCAL'},randomUUID()),deliveryId=requested.data.receipt.delivery.id;
    const quoteBody={buyerId:f.buyer.id,deliveryId,jurisdiction:'DEMO_LOCAL'},key=randomUUID();
    assert.equal((await request('/api/demo/mine/delivery_quote',buyer,quoteBody,key)).status,403);assert.equal((await request('/api/demo/mine/delivery_quote',otherToken,quoteBody,key)).status,404);
    const q=await request('/api/demo/mine/delivery_quote',op,quoteBody,key);assert.equal(q.status,200);assert.equal(q.data.receipt.balancesAfter,undefined);
    assert.deepEqual((await request(`/api/demo/mine/commands/${key}`,op)).data,q.data.receipt);assert.equal((await request(`/api/demo/mine/commands/${key}`,buyer)).status,403);assert.equal((await request(`/api/demo/mine/commands/${key}`,otherToken)).status,404);
    const skipped=await request('/api/demo/mine/delivery_transition',op,{buyerId:f.buyer.id,deliveryId,status:'DELIVERED_DEMO',reason:'Intento inválido DEMO'},randomUUID());assert.equal(skipped.status,422);
    const accept=await request('/api/demo/delivery_accept',buyer,{deliveryId,quoteId:q.data.receipt.quote.id},randomUUID());assert.equal(accept.status,200);assert.equal(accept.data.receipt.deliveryStatus,'APPROVED');
    const history=(await request('/api/demo/history?limit=20',buyer)).data;assert.ok(history.items.some(item=>item.action==='delivery_quote'&&item.balancesAfter));
    assert.equal(JSON.stringify((await request('/api/demo/mine/deliveries',op)).data).includes('walletMinor'),false);
    assert.equal((await request('/api/demo/delivery_accept',buyer,{deliveryId,quoteId:q.data.receipt.quote.id,totalMinor:'0'},randomUUID())).status,400);
  }finally{await new Promise(resolve=>server.close(resolve));await f.store.close();}
});

test('entrega: aceptación concurrente y cancelación no cobran ni liberan dos veces',async()=>{
  const f=await fixture();
  try{
    const delivery=await request(f,'0.100'),q=await quote(f,delivery),accept=cmd('delivery_accept',{deliveryId:delivery.id,quoteId:q.receipt.quote.id}),before=await f.store.getAccountState(f.buyer.id);
    const results=await Promise.all([f.store.mutateAccount(f.buyer.id,accept),f.store.mutateAccount(f.buyer.id,accept)]);assert.equal(results.filter(result=>result.changed).length,1);assert.equal(results.filter(result=>result.receipt.replayed).length,1);
    await assert.rejects(f.store.mutateAccount(f.buyer.id,cmd('cancel_delivery',{deliveryId:delivery.id})));
    const after=await f.store.getAccountState(f.buyer.id);assert.equal(after.walletMinor.USDT,before.walletMinor.USDT-q.receipt.quote.totalMinor);assert.equal((await f.store.getMineSummary(f.op.id)).reservedMg.XAU,100);
  }finally{await f.store.close();}
});

test('entrega: colisión de recibo derivado rechaza y conserva recibos, solicitud y lotes',async()=>{
  const f=await fixture();
  try{
    const delivery=await request(f,'0.100'),operatorKey=randomUUID();
    const derived=`delivery-command-${createHash('sha256').update(JSON.stringify([f.op.id,operatorKey])).digest('hex').slice(0,32)}`;
    const deposit=await f.store.mutateAccount(f.buyer.id,{action:'deposit',currency:'USD',amount:'0.01',requestId:derived});
    const state=await f.store.getAccountState(f.buyer.id),custody=await f.store.getCustody(f.op.id,'operator'),summary=await f.store.getMineSummary(f.op.id);
    await assert.rejects(f.store.mutateDelivery(f.op.id,{action:'delivery_quote',buyerId:f.buyer.id,deliveryId:delivery.id,jurisdiction:'DEMO_LOCAL',requestId:operatorKey}),{code:'RECEIPT_CONFLICT'});
    assert.deepEqual(await f.store.getAccountState(f.buyer.id),state);assert.deepEqual(await f.store.getCustody(f.op.id,'operator'),custody);assert.deepEqual(await f.store.getMineSummary(f.op.id),summary);
    assert.deepEqual((await f.store.getAccountState(f.buyer.id)).receipts[derived],deposit.receipt);await assert.rejects(f.store.getMineCommand(f.op.id,operatorKey),{status:404});
  }finally{await f.store.close();}
});
