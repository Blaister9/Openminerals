import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createReferenceReader,historyPlot,parseReferenceEnvelope,isMetalReference,parseExchangeReference,parseCommercialQuote,quoteCanConfirm,displayedStatus,referenceConversion} from '../lib/market-reference.ts';
import {receiptDetails} from '../lib/receipt-presentation.ts';
import {createDemoClient} from '../lib/demo-client.ts';
import {createAccountClient} from '../lib/account-client.ts';
import {createStore} from '../../api/src/store.js';
import {createApiServer} from '../../api/src/server.js';
import {fixture,quoteService,PASSWORD} from '../../api/test/reference-trade-fixture.js';

test('reference parser refuses absent prices, inverted FX and false availability; aged data becomes delayed',()=>{
  const quote={id:'test',metal:'XAU',provider:'fixture',asOf:new Date(0).toISOString(),currency:'USD',unit:'g',reference:100,perTroyOunce:3110.34768,bid:99,ask:101,high:102,low:98,changePercent:null};
  assert.equal(parseReferenceEnvelope({status:'current',data:quote},isMetalReference).data.bid,99);
  assert.throws(()=>parseReferenceEnvelope({status:'current',data:null},isMetalReference));
  assert.throws(()=>parseReferenceEnvelope({status:'current',data:{...quote,reference:0}},isMetalReference));
  assert.throws(()=>parseExchangeReference({fiat:{status:'current',data:[]},usdt:{status:'current',data:{base:'USD',quote:'USDT',rate:1}}}));
  assert.equal(displayedStatus({status:'current',data:quote},300001,300000),'delayed');
  assert.equal(displayedStatus({status:'stale',data:quote},300001,300000),'stale');
});
test('history plot preserves actual spacing and gaps without fabricating weekend prices',()=>{
  const plot=historyPlot([{date:'2026-10-29',value:100},{date:'2026-10-30',value:105},{date:'2026-11-02',value:110}],400,100);
  assert.equal(plot.dots.length,3);assert.equal(plot.segments.length,1);assert.equal(plot.dots[1].x,100);assert.equal(plot.dots[2].x,400);
  assert.deepEqual(historyPlot([],100,100),{dots:[],segments:[]});
  assert.deepEqual(historyPlot([{date:'2026-11-02',value:100}],100,100).dots,[{x:50,y:50}]);
});
test('reader caches public references and cancels work when screen/background cleanup runs',async()=>{
  let calls=0,now=0;
  const reader=createReferenceReader('https://reference.example',async(_url,init)=>{calls++;assert.equal(init.headers,undefined);return Response.json({status:'disabled',data:null});},()=>now);
  await reader.get('/api/demo/market/metals/XAU');await reader.get('/api/demo/market/metals/XAU');assert.equal(calls,1);
  now=60001;await reader.get('/api/demo/market/metals/XAU');assert.equal(calls,2);
  let signal;
  const pendingReader=createReferenceReader('https://reference.example',async(_url,init)=>{signal=init.signal;return new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('aborted'))));});
  const pending=pendingReader.get('/api/demo/market/exchange');pendingReader.cancel();await assert.rejects(pending,/aborted/);assert.equal(signal.aborted,true);
});
test('durable reference trade survives response loss, screen reopen and feature disable with one receipt',async()=>{
  const store=await createStore(''),market=quoteService(),server=createApiServer(store,{market});
  server.listen(0,'127.0.0.1');await once(server,'listening');const api=`http://127.0.0.1:${server.address().port}`;
  const data=new Map(),storage={async getItem(k){return data.get(k)??null;},async setItem(k,v){data.set(k,v);},async removeItem(k){data.delete(k);}};
  try{
    const {buyer}=await fixture(store,'mobile'),auth=await store.loginAccount(buyer.alias,PASSWORD);
    const secrets=new Map(),authStorage={async getItem(k){return secrets.get(k)??null;},async setItem(k,v){secrets.set(k,v);},async removeItem(k){secrets.delete(k);}};
    const accountClient=createAccountClient({api,storage,authStorage,uuid:()=>crypto.randomUUID()});await accountClient.login(buyer.alias,PASSWORD);
    const quote=await accountClient.quoteTrade({action:'buy',metal:'XAU',grams:'0.750'});
    parseCommercialQuote(quote);assert.equal(quoteCanConfirm(quote,Date.parse(quote.expiresAt)),false);assert.equal(quoteCanConfirm(quote,Date.parse(quote.issuedAt)),true);assert.equal(quoteCanConfirm(quote,Date.parse(quote.issuedAt),true),false);
    const options={api,accountId:buyer.id,getToken:()=>auth.token,storage,uuid:()=>crypto.randomUUID()};
    const first=createDemoClient({...options,fetchImpl:async(url,init)=>{const response=await fetch(url,init);assert.equal(response.status,200);await response.json();throw new Error('Lost response after commit');}});
    await assert.rejects(first.submit('reference_trade',{quoteId:quote.id},'Compra DEMO'));
    const original=first.getPending();assert.equal(original.body.quoteId,quote.id);market.enabled=false;
    const reopened=createDemoClient(options);assert.deepEqual((await reopened.initialize()).pending,original);
    const replay=await reopened.retry();assert.equal(replay.receipt.replayed,true);assert.equal(replay.receipt.marketQuote.id,quote.id);assert.equal(reopened.getPending(),null);
    assert.ok(receiptDetails(replay.receipt).some(row=>row.label==='Cotización comercial DEMO'&&row.value===quote.id));
    assert.equal((await store.getAccountState(buyer.id)).movements.filter(row=>row.type==='BUY').length,1);
  }finally{await new Promise(resolve=>server.close(resolve));await store.close();}
});
test('incomplete reference-trade receipt preserves the original durable quote/key',async()=>{
  const data=new Map(),storage={async getItem(k){return data.get(k)??null;},async setItem(k,v){data.set(k,v);},async removeItem(k){data.delete(k);}},id=crypto.randomUUID();
  const client=createDemoClient({api:'https://reference.example',accountId:crypto.randomUUID(),getToken:()=> 'demo-token',storage,uuid:()=>id,fetchImpl:async()=>Response.json({receipt:{id,action:'buy',status:'COMPLETED',demoOnly:true},state:{}})});
  await assert.rejects(client.submit('reference_trade',{quoteId:'quote-'+crypto.randomUUID()},'Compra DEMO'),/incompleta/);
  assert.equal(client.getPending().requestId,id);
});
test('reference calculator crosses dated rates and never substitutes USD/USDT parity',()=>{
  const now=Date.now(),asOf=new Date(now).toISOString();
  const exchange={fiat:{status:'current',data:[{base:'USD',quote:'EUR',rate:0.9,asOf,provider:'fixture-fiat'},{base:'USD',quote:'COP',rate:4000,asOf,provider:'fixture-fiat'}]},usdt:{status:'current',data:{base:'USDT',quote:'USD',rate:0.98,asOf,provider:'fixture-usdt'}}};
  assert.ok(Math.abs(referenceConversion(exchange,'4000','COP','EUR',now).output-0.9)<1e-10);
  assert.equal(referenceConversion(exchange,'1','USDT','USD',now).output,0.98);
  assert.equal(referenceConversion(exchange,'1','USD','USDT',now).output,1/0.98);
  assert.equal(referenceConversion(exchange,'1','USD','USDT',now+120001),null);
  assert.equal(referenceConversion({...exchange,usdt:{status:'permission-required',data:null}},'1','USD','USDT',now),null);
  assert.equal(referenceConversion(exchange,'-1','USD','EUR',now),null);
  assert.equal(referenceConversion({...exchange,fiat:{status:'stale',data:exchange.fiat.data}},'1','EUR','COP',now),null);
});
