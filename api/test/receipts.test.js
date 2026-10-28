import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {applyCommand,seedState} from '../src/domain.js';
import {historyPage,parseHistoryQuery,readReceipt} from '../src/receipt-history.js';
import {createApiServer} from '../src/server.js';
import {createStore} from '../src/store.js';

const at=n=>new Date(Date.UTC(2026,9,28,12,0,n)).toISOString();
const deposit=(state,n)=>applyCommand(state,{
  action:'deposit',currency:'USDT',amount:'0.01',requestId:`receipt-deposit-${String(n).padStart(4,'0')}`,
},at(n));

test('comprobantes conservan precio, importes y saldos del momento, incluso al reintentar',()=>{
  const conversion={action:'convert',from:'USD',to:'USDT',amount:'20.00',requestId:'receipt-convert-20'};
  const converted=applyCommand(seedState(),conversion,at(0));
  assert.equal(converted.receipt.receiptVersion,2);
  assert.equal(converted.receipt.label,'Conversión USD → USDT');
  assert.equal(converted.receipt.feeMinor,0);
  assert.equal(converted.receipt.balancesAfter.walletMinor.USDT,27000);
  const bought=applyCommand(converted.state,{
    action:'buy',metal:'XAU',grams:'0.500',requestId:'receipt-buy-half-gold',
  },at(1));
  assert.equal(bought.receipt.priceCentsPerGram,14500);
  assert.equal(bought.receipt.baseMinor,7250);
  assert.equal(bought.receipt.feeMinor,73);
  assert.equal(bought.receipt.totalMinor,7323);
  assert.equal(bought.receipt.balancesAfter.walletMinor.USDT,19677);
  assert.equal(bought.receipt.balancesAfter.holdingsMg.XAU,500);
  const sold=applyCommand(bought.state,{
    action:'sell',metal:'XAU',grams:'0.500',requestId:'receipt-sell-half-gold',
  },at(2));
  assert.equal(sold.receipt.priceCentsPerGram,14500);
  assert.equal(sold.receipt.outputMinor,7163);
  assert.equal(sold.receipt.balancesAfter.walletMinor.USDT,26840);
  assert.equal(sold.receipt.balancesAfter.holdingsMg.XAU,0);
  const replay=applyCommand(sold.state,conversion,at(3));
  assert.equal(replay.changed,false);
  assert.deepEqual(replay.receipt,{...converted.receipt,replayed:true});
  assert.equal(readReceipt(replay.state,conversion.requestId).balancesAfter.walletMinor.USDT,27000);
  assert.equal(readReceipt(replay.state,'receipt-buy-half-gold').balancesAfter.holdingsMg.XAU,500);
  // Neither live state changes nor a consumer changing the returned view rewrite a snapshot.
  replay.receipt.balancesAfter.walletMinor.USDT=1;
  replay.state.walletMinor.USDT=2;
  assert.equal(readReceipt(replay.state,conversion.requestId).balancesAfter.walletMinor.USDT,27000);
});

test('cancelar reservas no cambia la oferta o entrega guardada en un comprobante anterior',()=>{
  let state=applyCommand(seedState(),{
    action:'buy',metal:'XAG',grams:'5.000',requestId:'receipt-buy-silver-reserve',
  }).state;
  const offer=applyCommand(state,{
    action:'offer',metal:'XAG',grams:'2.000',requestId:'receipt-offer-silver',
  });
  assert.equal(offer.receipt.balancesAfter.reservedMg.XAG,2000);
  const cancelled=applyCommand(offer.state,{
    action:'cancel_offer',offerId:offer.receipt.offer.id,requestId:'receipt-cancel-silver-offer',
  });
  assert.equal(cancelled.receipt.balancesAfter.reservedMg.XAG,0);
  assert.equal(readReceipt(cancelled.state,'receipt-offer-silver').offer.status,'OPEN');
  assert.equal(readReceipt(cancelled.state,'receipt-offer-silver').balancesAfter.reservedMg.XAG,2000);
  const delivery=applyCommand(cancelled.state,{
    action:'delivery',metal:'XAG',grams:'2.000',requestId:'receipt-delivery-silver',
  });
  const released=applyCommand(delivery.state,{
    action:'cancel_delivery',deliveryId:delivery.receipt.delivery.id,requestId:'receipt-cancel-silver-delivery',
  });
  assert.equal(released.receipt.balancesAfter.reservedMg.XAG,0);
  assert.equal(readReceipt(released.state,'receipt-delivery-silver').delivery.status,'PENDING_QUOTE');
});

test('historial supera los 100 movimientos y el cursor no repite filas al insertar operaciones nuevas',()=>{
  let state=seedState();
  for(let i=0;i<125;i++)state=deposit(state,i).state;
  assert.equal(state.movements.length,100);
  assert.equal(Object.keys(state.receipts).length,125);
  const oldest=readReceipt(state,'receipt-deposit-0000');
  assert.equal(oldest.amountMinor,1);
  assert.equal(oldest.balancesAfter.walletMinor.USDT,25001);
  const first=historyPage(state,{limit:20});
  assert.equal(first.total,125);
  const seen=[...first.items];
  let cursor=first.nextCursor;
  state=deposit(state,500).state;
  while(cursor){
    const page=historyPage(state,{limit:20,before:cursor});
    seen.push(...page.items);
    cursor=page.nextCursor;
  }
  assert.equal(seen.length,125);
  assert.equal(new Set(seen.map(item=>item.id)).size,125);
  assert.ok(!seen.some(item=>item.id==='receipt-deposit-0500'));
  assert.equal(seen.at(-1).id,oldest.id);
  assert.equal(historyPage(state).total,126);
});

test('legacy conserva sus datos sin fabricar snapshots y fechas iguales tienen orden estable',()=>{
  let state=deposit(seedState(),1).state;
  state=deposit(state,2).state;
  const original=state.receipts['receipt-deposit-0001'];
  delete original.receiptVersion;
  delete original.balancesAfter;
  delete original.label;
  state.receipts['receipt-deposit-0002'].at=original.at;
  const legacy=readReceipt(state,original.id);
  assert.equal(legacy.label,'Ingreso simulado USDT');
  assert.equal(legacy.amountMinor,original.amountMinor);
  assert.ok(!Object.hasOwn(legacy,'balancesAfter'));
  assert.ok(!Object.hasOwn(legacy,'receiptVersion'));
  assert.equal(historyPage(state,{limit:1}).items[0].id,'receipt-deposit-0002');
  assert.equal(historyPage(state,{before:'receipt-deposit-0002'}).items[0].id,original.id);
});

test('HTTP: historial y comprobantes están aislados por sesión, validan cursores y siguen disponibles tras recargar',async()=>{
  const store=await createStore('');
  const server=createApiServer(store);
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  const session='receipt-http-session-a';
  const call=async(path,{other=false,body,key}={})=>{
    const response=await fetch(base+path,{
      method:body?'POST':'GET',
      headers:{'x-demo-session':other?'receipt-http-session-b':session,...(key?{'Idempotency-Key':key}:{})},
      body:body?JSON.stringify(body):undefined,
    });
    return {status:response.status,data:await response.json()};
  };
  try{
    assert.deepEqual((await call('/api/demo/history')).data,{items:[],nextCursor:null,total:0,demoOnly:true});
    const bought=await call('/api/demo/buy',{body:{metal:'XAG',grams:'1.000'},key:'http-receipt-00001'});
    const list=await call('/api/demo/history?limit=1');
    assert.equal(list.status,200);
    assert.equal(list.data.total,1);
    assert.deepEqual(list.data.items[0],bought.data.receipt);
    assert.deepEqual((await call('/api/demo/receipts/http-receipt-00001')).data,bought.data.receipt);
    assert.equal((await call('/api/demo/receipts/http-receipt-00001',{other:true})).status,404);
    assert.equal((await call('/api/demo/history',{other:true})).data.total,0);
    for(const query of ['limit=0','limit=51','limit=2.5','limit=-1','limit=01','limit=1&limit=2','before=','before=bad','offset=1']){
      assert.equal((await call(`/api/demo/history?${query}`)).status,400,query);
    }
    assert.equal((await call('/api/demo/history?before=missing-receipt')).status,404);
    assert.equal((await call('/api/demo/receipts/__proto__')).status,404);
    assert.equal((await call('/api/demo/receipts/invalid/id')).status,400);
    assert.equal((await call('/api/demo/buy',{body:{metal:'XAG',grams:'1.000'},key:'__proto__'})).status,422);
    assert.deepEqual((await call('/api/demo/receipts/http-receipt-00001')).data,bought.data.receipt);
  }finally{await new Promise(resolve=>server.close(resolve));await store.close();}
});

test('parámetros de historial no permiten saltos inválidos o límites arbitrarios',()=>{
  assert.deepEqual(parseHistoryQuery(new URLSearchParams()),{limit:20,before:undefined});
  assert.throws(()=>historyPage(seedState(),{limit:0}),{status:400});
  assert.throws(()=>historyPage(seedState(),{before:'missing-receipt'}),{status:404});
});
