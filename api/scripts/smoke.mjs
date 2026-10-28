/**
 * Prueba de aceptación no destructiva sobre una sesión demo NUEVA.
 * Uso: node api/scripts/smoke.mjs https://tu-api.up.railway.app
 * No usar contra servicios financieros reales.
 */
import {randomUUID} from 'node:crypto';
import assert from 'node:assert/strict';
const base=(process.argv[2]||'http://localhost:3000').replace(/\/$/,'');
const session=`smoke-${randomUUID()}`;
async function req(path,body,requestId){
 const res=await fetch(base+path,{method:body?'POST':'GET',headers:{'x-demo-session':session,'Content-Type':'application/json',...(requestId?{'Idempotency-Key':requestId}:{})},body:body?JSON.stringify(body):undefined});
 const json=await res.json();
 if(!res.ok)throw new Error(`${res.status} ${path}: ${json.error||'error'}`);
 return json;
}
try {
 const health=await req('/health');assert.equal(health.ok,true);assert.equal(health.demoOnly,true);
 console.log('PASS salud',health.mode);
 const before=await req('/api/demo/state');assert.equal(before.holdingsMg.XAU,0);
 const conversionId=randomUUID();
 const conv=await req('/api/demo/convert',{from:'USD',to:'USDT',amount:'200.00'},conversionId);
 assert.equal(conv.state.walletMinor.USD,before.walletMinor.USD-20000);
 console.log('PASS conversión USD a USDT');
 const buyId=randomUUID();
 const bought=await req('/api/demo/buy',{metal:'XAU',grams:'2.000'},buyId);
 assert.equal(bought.state.holdingsMg.XAU,2000);
 assert.equal(bought.state.inventoryMg.XAU,before.inventoryMg.XAU-2000);
 const replay=await req('/api/demo/buy',{metal:'XAU',grams:'2.000'},buyId);
 assert.equal(replay.receipt.replayed,true);
 assert.equal(replay.state.holdingsMg.XAU,2000);
 console.log('PASS compra 2 gramos + idempotencia');
 const sold=await req('/api/demo/sell',{metal:'XAU',grams:'0.500'},randomUUID());
 assert.equal(sold.state.holdingsMg.XAU,1500);
 console.log('PASS recompra 0.5 gramos');
 const offered=await req('/api/demo/offer',{metal:'XAU',grams:'0.500'},randomUUID());
 assert.equal(offered.state.offers[0].status,'OPEN');
 const delivery=await req('/api/demo/delivery',{metal:'XAU',grams:'0.500'},randomUUID());
 assert.equal(delivery.state.custodyRequests[0].status,'PENDING_QUOTE');
 console.log('PASS oferta + cotización de entrega');
 const state=await req('/api/demo/state');
 assert.equal(state.holdingsMg.XAU,1500);
 assert.equal(state.movements.filter(x=>x.type==='BUY').length,1);
 const sum=await req('/api/demo/operator/summary');
 assert.equal(sum.transactionCount,2);
 assert.equal(sum.offersOpen,1);
 assert.equal(sum.deliveriesPending,1);
 console.log('PASS persistencia por sesión + vista gerencial');
 console.log(`SMOKE EXITOSO · ${base} · modo ${health.mode}`);
} catch (e) {console.error('SMOKE FALLÓ:',e);process.exitCode=1;}
