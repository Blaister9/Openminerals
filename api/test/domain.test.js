import test from 'node:test';
import assert from 'node:assert/strict';
import {seedState,applyCommand,availableHoldingMg,parseGrams,parseMoney,operatorSummary,DomainError} from '../src/domain.js';
const id=(n)=>`test-request-${n.toString().padStart(6,'0')}`;
const op=(s,action,props={},n=1)=>applyCommand(s,{action,requestId:id(n),...props});
const fails=(fn,code)=>assert.throws(fn,e=>e instanceof DomainError&&(!code||e.code===code));
test('cantidades exactas en centésimas y miligramos',()=>{
  assert.equal(parseMoney('200.05'),20005);
  assert.equal(parseGrams('2.125'),2125);
  fails(()=>parseGrams('0.099'));
  fails(()=>parseMoney('1e3'));
  fails(()=>parseMoney('-2.00'));
});
test('USD a USDT no crea ni destruye saldo USD fuera de lo esperado',()=>{
  const s=seedState();
  const {state,receipt}=op(s,'convert',{from:'USD',to:'USDT',amount:'200.00'});
  assert.equal(state.walletMinor.USD,s.walletMinor.USD-20000);
  assert.equal(state.walletMinor.USDT,s.walletMinor.USDT+20000);
  assert.equal(receipt.rateDemo,1000000);
  assert.equal(s.walletMinor.USD,60000);
});
test('compraventa atómica simulada: compra 2g, vende 0.5g',()=>{
  const seed=seedState();
  const converted=op(seed,'convert',{from:'USD',to:'USDT',amount:'200.00'},10).state;
  const first=op(converted,'buy',{metal:'XAU',grams:'2.000'},1);
  assert.equal(first.state.holdingsMg.XAU,2000);
  assert.equal(first.state.inventoryMg.XAU,seed.inventoryMg.XAU-2000);
  assert.equal(first.state.walletMinor.USDT,converted.walletMinor.USDT-first.receipt.totalMinor);
  const state=op(first.state,'sell',{metal:'XAU',grams:'0.500'},2).state;
  assert.equal(state.holdingsMg.XAU,1500);
  assert.equal(state.inventoryMg.XAU,seed.inventoryMg.XAU-1500);
  assert.equal(operatorSummary(state).transactionCount,2);
});
test('rechaza compra sin saldo y no modifica el estado original',()=>{
  const s=seedState();
  fails(()=>op(s,'buy',{metal:'XAU',grams:'9.000'}),'INSUFFICIENT_BALANCE');
  assert.deepEqual(s,seedState());
});
test('rechaza vender más metal del disponible',()=>{
  const s=seedState();
  fails(()=>op(s,'sell',{metal:'XAU',grams:'0.100'}),'INSUFFICIENT_HOLDING');
});
test('oferta y entrega reservan gramos y se pueden cancelar',()=>{
  let s=op(seedState(),'buy',{metal:'XAG',grams:'5.000'},1).state;
  const offer=op(s,'offer',{metal:'XAG',grams:'2.000'},2);s=offer.state;
  const delivery=op(s,'delivery',{metal:'XAG',grams:'2.000'},3);s=delivery.state;
  assert.equal(availableHoldingMg(s,'XAG'),1000);
  fails(()=>op(s,'sell',{metal:'XAG',grams:'2.000'},4),'INSUFFICIENT_HOLDING');
  s=op(s,'cancel_offer',{offerId:offer.receipt.offer.id},5).state;
  assert.equal(availableHoldingMg(s,'XAG'),3000);
  s=op(s,'cancel_delivery',{deliveryId:delivery.receipt.delivery.id},6).state;
  assert.equal(availableHoldingMg(s,'XAG'),5000);
});
test('repetir identificador devuelve recibo sin repetir la compra',()=>{
  const s=seedState();
  const args={metal:'XAG',grams:'1.000'};
  const once=op(s,'buy',args,11);
  const twice=op(once.state,'buy',args,11);
  assert.equal(twice.changed,false);
  assert.deepEqual(twice.state,once.state);
  assert.equal(twice.receipt.replayed,true);
});
test('no se puede reutilizar un idempotency-key para otra acción',()=>{
  const first=op(seedState(),'buy',{metal:'XAG',grams:'1.000'},13);
  fails(()=>op(first.state,'sell',{metal:'XAG',grams:'1.000'},13));
});
test('todas las conversiones entre COP EUR USD USDT tienen tasa',()=>{
  const s=seedState();
  for(const a of ['COP','EUR','USD','USDT']) for(const b of ['COP','EUR','USD','USDT'])
   if(a!==b) assert.ok(s.demoRates[a][b]>0,`${a}/${b}`);
});

test('ingresos y retiros simulados conservan saldo y rechazan negativos',()=>{
  const s=seedState();
  const d=op(s,'deposit',{currency:'EUR',amount:'125.50'},21);
  assert.equal(d.state.walletMinor.EUR,s.walletMinor.EUR+12550);
  const w=op(d.state,'withdraw',{currency:'EUR',amount:'125.50'},22);
  assert.equal(w.state.walletMinor.EUR,s.walletMinor.EUR);
  fails(()=>op(s,'withdraw',{currency:'USDT',amount:'1000.00'},23),'INSUFFICIENT_BALANCE');
});

test('no permite reutilizar idempotency key para un importe diferente',()=>{
  const first=op(seedState(),'buy',{metal:'XAG',grams:'1.000'},30);
  fails(()=>op(first.state,'buy',{metal:'XAG',grams:'2.000'},30));
});
