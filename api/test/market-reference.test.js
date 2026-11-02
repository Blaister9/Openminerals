import test from 'node:test';
import assert from 'node:assert/strict';
import {TROY_OUNCE_GRAMS,pricePerGram,normalizeSpot,normalizeHistory,normalizeFiat,normalizeUsdt} from '../src/market/normalize.js';
import {createProviderHttp} from '../src/market/http.js';
import {createMarketService} from '../src/market/service.js';
import {memoryMarketRepository} from '../src/market/repository.js';
import {metalsDevProvider} from '../src/market/providers.js';
import {referenceRateKey} from '../src/market/rate-limit.js';

const time=Date.parse('2026-11-02T14:00:00Z');
const spot=(overrides={})=>({status:'success',metal:'gold',currency:'USD',unit:'toz',timestamp:new Date(time).toISOString(),rate:{price:3100,bid:3090,ask:3110,high:3150,low:3000,change_percent:1.2,...overrides}});
test('normalizes troy ounces, grams and inverse direction without confusing bid/ask/reference',()=>{
  assert.equal(pricePerGram(TROY_OUNCE_GRAMS),1);assert.equal(pricePerGram(2,'g'),2);
  assert.ok(Math.abs(pricePerGram(1/31.1034768,'toz','metal-per-currency')-1)<1e-12);
  const quote=normalizeSpot('XAU',spot(),time);
  assert.equal(quote.perTroyOunce,3100);assert.ok(quote.bid<quote.reference&&quote.reference<quote.ask);
  assert.equal(quote.changePercent,1.2);assert.equal(quote.marketState,'unknown');
  assert.equal(normalizeSpot('XAU',spot({bid:null,ask:undefined}),time).bid,null);
  for(const rate of [{bid:3200},{price:0},{price:'NaN'},{low:4000},{change_percent:'1.2'}])assert.throws(()=>normalizeSpot('XAU',spot(rate),time));
  assert.throws(()=>normalizeSpot('XAU',{...spot(),unit:'oz'},time));
});
test('daily history preserves absent non-trading dates and does not fabricate closes',()=>{
  const data={status:'success',currency:'USD',unit:'toz',rates:{'2026-10-30':{metals:{gold:3100}},'2026-11-02':{metals:{gold:3110}},'2026-10-31':{metals:{silver:20}}}};
  const result=normalizeHistory('XAU',data,'2026-10-30','2026-11-02',time);
  assert.deepEqual(result.map(row=>row.date),['2026-10-30','2026-11-02']);
  assert.throws(()=>normalizeHistory('XAU',{...data,rates:{'2026-02-30':{metals:{gold:1}}}},'2026-01-01','2026-11-02',time));
});
test('fiat base direction and USDT/USD are validated independently of wallet parity',()=>{
  const rows=[{base:'USD',quote:'EUR',rate:0.9,date:'2026-10-30'},{base:'USD',quote:'COP',rate:4100,date:'2026-10-30'}];
  assert.deepEqual(normalizeFiat(rows,time).map(row=>row.rate),[0.9,4100]);
  const fx=normalizeUsdt({price:'0.998',bid:'0.997',ask:'0.999',time:new Date(time).toISOString()},time);
  assert.equal(fx.rate,0.998);assert.equal(fx.base,'USDT');assert.equal(fx.quote,'USD');
  for(const rate of [0,-1,Infinity,'1e2',null])assert.throws(()=>normalizeFiat([{...rows[0],rate},rows[1]],time));
  assert.throws(()=>normalizeUsdt({price:'1',bid:'2',ask:'1',time:new Date(time).toISOString()},time));
});
test('controlled retries count every attempt and sanitize private upstream errors',async()=>{
  let calls=0,budget=0;
  const http=createProviderHttp({reserve:async()=>{budget++;return true;},sleep:async()=>{},fetchImpl:async()=>++calls===1?new Response('',{status:503}):Response.json({ok:true})});
  assert.deepEqual(await http('test','https://test.invalid?api_key=private'),{ok:true});assert.equal(calls,2);assert.equal(budget,2);
  const rejected=createProviderHttp({fetchImpl:async()=>new Response('PRIVATE-KEY',{status:401})});
  await assert.rejects(rejected('test','https://test.invalid'),error=>error.code==='PROVIDER_CREDENTIALS_REJECTED'&&!error.message.includes('PRIVATE'));
  const limited=createProviderHttp({reserve:async()=>false,fetchImpl:async()=>assert.fail('No upstream request after budget exhaustion')});
  await assert.rejects(limited('test','https://test.invalid'),{code:'PROVIDER_BUDGET_EXHAUSTED'});
  const timeout=createProviderHttp({timeoutMs:5,sleep:async()=>{},fetchImpl:async(_url,{signal})=>new Promise((_resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('PRIVATE-URL'))))});
  await assert.rejects(timeout('test','https://test.invalid'),{code:'PROVIDER_UNAVAILABLE'});
});
test('cache coalesces concurrent callers, reports stale failures, negative caches and guards unavailable credentials',async()=>{
  let now=time,calls=0,fail=false;
  const metals={id:'test',configured:true,async spot(){calls++;if(fail)throw new Error('private provider error');return normalizeSpot('XAU',spot(),now);}};
  const service=createMarketService({env:{MARKET_REFERENCE_ENABLED:'true',MARKET_METALS_DISPLAY_ALLOWED:'true'},now:()=>now,providers:{metals}});
  const results=await Promise.all(Array.from({length:20},()=>service.spot('XAU')));assert.equal(calls,1);assert.ok(results.every(row=>row.status==='current'));
  now+=301_000;fail=true;assert.equal((await service.spot('XAU')).status,'stale');assert.equal(calls,2);
  assert.equal((await service.spot('XAU')).errorCode,'PROVIDER_UNAVAILABLE');assert.equal(calls,2);
  const unavailable=createMarketService({env:{MARKET_REFERENCE_ENABLED:'true',MARKET_METALS_DISPLAY_ALLOWED:'true'},providers:{metals},now:()=>now});
  assert.equal((await unavailable.spot('XAU')).status,'unavailable');assert.equal((await unavailable.spot('XAU')).status,'unavailable');assert.equal(calls,3);
  assert.equal((await createMarketService({env:{}}).spot('XAU')).status,'disabled');
  assert.equal((await createMarketService({env:{MARKET_REFERENCE_ENABLED:'true'}}).spot('XAU')).status,'not-configured');
});
test('one-year history paginates bounded 30-day windows; intraday is explicitly unsupported',async()=>{
  const windows=[];const metals={id:'test',configured:true,async history(_code,a,b){windows.push([a,b]);return [{date:a,value:10}];}};
  const service=createMarketService({env:{MARKET_REFERENCE_ENABLED:'true',MARKET_METALS_DISPLAY_ALLOWED:'true'},now:()=>time,providers:{metals}});
  assert.equal((await service.history('XAU','24h')).status,'unsupported');assert.equal(windows.length,0);
  const history=await service.history('XAU','1y');assert.equal(history.points.length,13);assert.equal(windows.length,13);
  assert.ok(windows.every(([a,b])=>Date.parse(b)-Date.parse(a)<=29*86400000));
  assert.equal(history.data.gaps,'not-filled');await service.history('XAU','1y');assert.equal(windows.length,13);
  await assert.rejects(service.history('XAU','__proto__'),{code:'INVALID_PERIOD'});
});
test('provider budget remains atomic across concurrent calls, daily and monthly buckets stay distinct',async()=>{
  const repo=memoryMarketRepository();
  const results=await Promise.all(Array.from({length:20},()=>repo.reserve('metals.dev',3,time)));
  assert.equal(results.filter(Boolean).length,3);
  assert.equal(await repo.reserve('metals.dev:month',1,Date.parse('2026-11-01')),true);
  assert.equal(await repo.reserve('metals.dev',3,time),false);
  assert.equal(await repo.reserve('metals.dev:month',1,Date.parse('2026-11-01')),false);
});
test('Metals.Dev adapter maps all four symbols and normalizes the documented response contract',async()=>{
  let calls=0;
  const names={XAU:'gold',XAG:'silver',XPT:'platinum',XPD:'palladium'};
  const provider=metalsDevProvider({apiKey:'fixture-key',now:()=>time,http:async(id,url)=>{
    calls++;assert.equal(id,'metals.dev');assert.equal(url.origin,'https://api.metals.dev');assert.equal(url.searchParams.get('api_key'),'fixture-key');
    return {...spot(),metal:url.searchParams.get('metal')};
  }});
  for(const [code,name] of Object.entries(names)){const row=await provider.spot(code);assert.equal(row.metal,code);assert.equal(row.provider,'metals.dev');assert.equal(row.reference,3100/TROY_OUNCE_GRAMS);assert.ok(name);}
  assert.equal(calls,4);
  await assert.rejects(metalsDevProvider({http:()=>assert.fail('No key must cause no request')}).spot('XAU'),{code:'METALS_NOT_CONFIGURED'});
});
test('permission guards do not spend provider quota or expose previously cached restricted data',async()=>{
  let calls=0;
  const service=createMarketService({env:{MARKET_REFERENCE_ENABLED:'true'},providers:{metals:{id:'fixture',configured:true,spot(){calls++;assert.fail('No licensed access');},history(){calls++;assert.fail('No licensed access');}},fiat:{latest:async()=>[]},usdt:{latest:async()=>{calls++;assert.fail('Coinbase permission required');}}}});
  assert.equal((await service.spot('XAU')).status,'permission-required');
  assert.equal((await service.history('XAG','7d')).status,'permission-required');
  const exchange=await service.exchange();assert.equal(exchange.usdt.status,'permission-required');assert.equal(exchange.usdt.data,null);assert.equal(calls,0);
});
test('four metal histories reuse a single all-metals window, including concurrent calls',async()=>{
  let calls=0;
  const provider=metalsDevProvider({apiKey:'fixture-only',now:()=>time,http:async()=>{calls++;return {status:'success',currency:'USD',unit:'toz',rates:{'2026-10-30':{metals:{gold:3100,silver:31,platinum:1550,palladium:1240}}}};}});
  const results=await Promise.all(['XAU','XAG','XPT','XPD'].map(code=>provider.history(code,'2026-10-29','2026-10-30')));
  assert.equal(calls,1);assert.equal(results.length,4);assert.ok(results.every(rows=>rows.length===1));
  await provider.history('XAU','2026-10-29','2026-10-30');assert.equal(calls,1);
});
test('reference rate keys trust a valid edge IP only when deployment explicitly opts in',()=>{
  const req={socket:{remoteAddress:'10.0.0.2'},headers:{'x-real-ip':'192.0.2.4'}};
  assert.equal(referenceRateKey(req),'10.0.0.2');assert.equal(referenceRateKey(req,true),'192.0.2.4');
  assert.equal(referenceRateKey({...req,headers:{'x-real-ip':'192.0.2.4, 192.0.2.5'}},true),'10.0.0.2');
  assert.equal(referenceRateKey({...req,headers:{'x-real-ip':['192.0.2.4']}},true),'10.0.0.2');
});
