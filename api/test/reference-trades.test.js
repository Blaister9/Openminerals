import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createStore} from '../src/store.js';
import {createApiServer} from '../src/server.js';
import {buildCommercialQuote,resolveCommercialQuote} from '../src/market/quotes.js';
import {createMarketService} from '../src/market/service.js';
import {fixture,quoteService,PASSWORD} from './reference-trade-fixture.js';

test('commercial quote uses metal ask/bid, non-parity USDT, configurable spread and fees',async()=>{
  const service=quoteService();
  const buy=await buildCommercialQuote(service,{action:'buy',metal:'XAU',grams:'1'}),sell=await buildCommercialQuote(service,{action:'sell',metal:'XAU',grams:'1'});
  assert.equal(buy.priceCentsPerGram,Math.ceil(101/0.97*1.01*100));
  assert.equal(sell.priceCentsPerGram,Math.floor(99/0.99*0.99*100));
  assert.equal(buy.reference.side,'ask');assert.equal(sell.reference.side,'bid');assert.equal(buy.exchange.side,'bid');assert.equal(sell.exchange.side,'ask');
  assert.ok(buy.totalMinor>sell.outputMinor);assert.equal(buy.feeBps,100);assert.equal(sell.feeBps,120);
  service.storageAllowed=false;await assert.rejects(buildCommercialQuote(service,{action:'buy',metal:'XAU',grams:'1'}),{code:'MARKET_STORAGE_PERMISSION_REQUIRED'});
  service.storageAllowed=true;service.spot=async()=>({status:'delayed'});
  await assert.rejects(buildCommercialQuote(service,{action:'buy',metal:'XAU',grams:'1'}),{code:'FRESH_MARKET_REFERENCE_REQUIRED'});
  const closed=quoteService();const latest=await closed.spot();latest.data.marketState='closed';closed.spot=async()=>latest;
  await assert.rejects(buildCommercialQuote(closed,{action:'buy',metal:'XAU',grams:'1'}),{code:'FRESH_MARKET_REFERENCE_REQUIRED'});
});
test('quoted trades preserve receipts, custody, reservations, inventory and idempotency under concurrency',async()=>{
  const store=await createStore('');try{
    const {buyer,other,operator,quote}=await fixture(store,'memory'),command={action:'reference_trade',quoteId:quote.id,requestId:randomUUID()};
    const before=await store.getAccountState(buyer.id);
    await assert.rejects(store.mutateAccount(other.id,command),{code:'QUOTE_NOT_AVAILABLE'});
    const outcomes=await Promise.all(Array.from({length:5},()=>store.mutateAccount(buyer.id,command)));
    assert.equal(outcomes.filter(row=>row.changed).length,1);assert.equal(outcomes[0].receipt.totalMinor,quote.totalMinor);assert.ok(outcomes[0].receipt.certificateIds.length);
    await assert.rejects(store.mutateAccount(buyer.id,{...command,requestId:randomUUID()}),{code:'QUOTE_NOT_AVAILABLE'});
    await assert.rejects(store.mutateAccount(buyer.id,{...command,quoteId:'quote-'+randomUUID()}));
    const state=await store.getAccountState(buyer.id),summary=await store.getMineSummary(operator.id);
    assert.deepEqual(state.priceCentsPerGram,before.priceCentsPerGram);assert.deepEqual(state.demoRates,before.demoRates);assert.deepEqual(state.feesBps,before.feesBps);
    assert.equal(state.walletMinor.USDT,before.walletMinor.USDT-quote.totalMinor);assert.equal(summary.inventoryMg.XAU,250);assert.equal(summary.allocatedMg.XAU,750);assert.equal(summary.reconciled,true);
    const offer=await store.mutateAccount(buyer.id,{action:'offer',metal:'XAU',grams:'0.500',requestId:randomUUID()});
    const sell=await buildCommercialQuote(quoteService(),{action:'sell',metal:'XAU',grams:'0.500'});await store.rememberMarketQuote(buyer.id,sell);
    await assert.rejects(store.mutateAccount(buyer.id,{action:'reference_trade',quoteId:sell.id,requestId:randomUUID()}),{code:'INSUFFICIENT_HOLDING'});
    await store.mutateAccount(buyer.id,{action:'cancel_offer',offerId:offer.receipt.offer.id,requestId:randomUUID()});
    await store.mutateAccount(buyer.id,{action:'reference_trade',quoteId:sell.id,requestId:randomUUID()});
    assert.equal((await store.getMineSummary(operator.id)).reconciled,true);
  }finally{await store.close();}
});
test('expired quotes do not mutate balances; committed responses replay after expiry',async()=>{
  const store=await createStore('');try{
    const {buyer,quote}=await fixture(store,'expiry');
    const expired={...quote,id:'quote-'+randomUUID(),expiresAt:new Date(Date.now()-1000).toISOString()};await store.rememberMarketQuote(buyer.id,expired);
    const before=await store.getAccountState(buyer.id);
    await assert.rejects(store.mutateAccount(buyer.id,{action:'reference_trade',quoteId:expired.id,requestId:randomUUID()}),{code:'QUOTE_EXPIRED'});
    assert.deepEqual(await store.getAccountState(buyer.id),before);
    const command={action:'reference_trade',quoteId:quote.id,requestId:randomUUID()};await store.mutateAccount(buyer.id,command);
    // A past-expiry snapshot remains replayable through the immutable completed receipt.
    assert.equal(resolveCommercialQuote(await store.getAccountState(buyer.id),command,Date.now()+86400000).pricing.id,quote.id);
    const replay=await store.mutateAccount(buyer.id,command);assert.equal(replay.changed,false);assert.equal(replay.receipt.replayed,true);
    assert.equal((await store.mutateAccount(buyer.id,command,{marketEnabled:false})).changed,false,'Disabling new trades cannot block reconciliation of an existing receipt.');
  }finally{await store.close();}
});
test('HTTP market endpoints expose missing configuration honestly; quotes require authentication and preserve legacy pricing',async()=>{
  const store=await createStore(''),market=createMarketService({env:{MARKET_REFERENCE_ENABLED:'true'}}),server=createApiServer(store,{market});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const root='http://127.0.0.1:'+server.address().port;
  try{
    const reference=await fetch(root+'/api/demo/market/metals/XAU');assert.equal(reference.status,200);assert.equal((await reference.json()).status,'not-configured');
    assert.equal((await fetch(root+'/api/demo/market/metals/XAU/history?period=7d&period=1y')).status,400);
    assert.equal((await fetch(root+'/api/demo/reference-quotes',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'buy',metal:'XAU',grams:'1'})})).status,401);
    const {buyer}=await fixture(store,'http'),auth=await store.loginAccount(buyer.alias,PASSWORD);
    const operation=await fetch(root+'/api/demo/buy',{method:'POST',headers:{authorization:'Bearer '+auth.token,'content-type':'application/json','idempotency-key':randomUUID()},body:JSON.stringify({metal:'XAU',grams:'0.100',pricing:{priceCentsPerGram:1},priceCentsPerGram:1})});
    assert.equal(operation.status,200);assert.equal((await operation.json()).receipt.priceCentsPerGram,14500);
  }finally{await new Promise(resolve=>server.close(resolve));await store.close();}
});
test('HTTP reference requests are limited before spending provider budget',async()=>{
  const store=await createStore(''),server=createApiServer(store,{market:createMarketService({env:{}}),marketRateLimit:{limit:1,windowMs:60000}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const root='http://127.0.0.1:'+server.address().port;
  try{assert.equal((await fetch(root+'/api/demo/market/metals/XAU')).status,200);assert.equal((await fetch(root+'/api/demo/market/metals/XAG')).status,429);}
  finally{await new Promise(resolve=>server.close(resolve));await store.close();}
});
