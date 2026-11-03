import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createStore} from '../src/store.js';
import {fixture,quoteService} from './reference-trade-fixture.js';
import {buildCommercialQuote} from '../src/market/quotes.js';

const databaseUrl=process.env.TEST_DATABASE_URL;
test('PostgreSQL references: durable caches/quotes and cross-pool concurrency',{skip:databaseUrl?false:'Requires isolated TEST_DATABASE_URL',timeout:120000},async t=>{
  const {default:pg}=await import('pg'),schema='om_reference_'+randomUUID().replaceAll('-','');
  const admin=new pg.Pool({connectionString:databaseUrl,max:1});const scoped=new URL(databaseUrl);scoped.searchParams.set('options','-c search_path='+schema);
  let a,b;
  try{
    await admin.query(`CREATE SCHEMA "${schema}"`);
    [a,b]=await Promise.all([createStore(scoped.toString()),createStore(scoped.toString())]);
    const [ra,rb]=await Promise.all([a.marketRepository(),b.marketRepository()]);
    await t.test('persistent cache and shared provider budgets work across two pools',async()=>{
      const results=await Promise.all(Array.from({length:30},(_,i)=>(i%2?ra:rb).reserve('test',3,Date.now())));
      assert.equal(results.filter(Boolean).length,3);
      await ra.put('history:XAU:7d',{data:{points:[{date:'2026-10-30',value:100}]},cacheUntil:Date.now()+60000});
      assert.equal((await rb.get('history:XAU:7d')).data.points[0].value,100);
    });
    const {buyer,other,operator,quote}=await fixture(a,'pg'),command={action:'reference_trade',quoteId:quote.id,requestId:randomUUID()};
    await t.test('same quote/request cannot double-spend across pools; quote belongs to its buyer',async()=>{
      await assert.rejects(b.mutateAccount(other.id,command),{code:'QUOTE_NOT_AVAILABLE'});
      const outcomes=await Promise.all([a.mutateAccount(buyer.id,command),b.mutateAccount(buyer.id,command)]);
      assert.equal(outcomes.filter(row=>row.changed).length,1);assert.equal(outcomes[0].receipt.totalMinor,quote.totalMinor);
      const summary=await b.getMineSummary(operator.id);assert.equal(summary.inventoryMg.XAU,250);assert.equal(summary.allocatedMg.XAU,750);assert.equal(summary.reconciled,true);
    });
    await t.test('expired quote rejection rolls back and competing quotes cannot oversell inventory',async()=>{
      const expired=await buildCommercialQuote(quoteService(Date.now()-300000),{action:'buy',metal:'XAU',grams:'0.200'});await a.rememberMarketQuote(buyer.id,expired);
      const before=await a.getAccountState(buyer.id);
      await assert.rejects(b.mutateAccount(buyer.id,{action:'reference_trade',quoteId:expired.id,requestId:randomUUID()}),{code:'QUOTE_EXPIRED'});
      assert.deepEqual(await a.getAccountState(buyer.id),before);
      const quotes=await Promise.all([buyer,other].map(()=>buildCommercialQuote(quoteService(),{action:'buy',metal:'XAU',grams:'0.200'})));
      await a.rememberMarketQuote(buyer.id,quotes[0]);await b.rememberMarketQuote(other.id,quotes[1]);
      const outcomes=await Promise.allSettled([a.mutateAccount(buyer.id,{action:'reference_trade',quoteId:quotes[0].id,requestId:randomUUID()}),b.mutateAccount(other.id,{action:'reference_trade',quoteId:quotes[1].id,requestId:randomUUID()})]);
      assert.equal(outcomes.filter(row=>row.status==='fulfilled').length,1);assert.equal(outcomes.find(row=>row.status==='rejected').reason.code,'INSUFFICIENT_INVENTORY');
      assert.equal((await a.getMineSummary(operator.id)).inventoryMg.XAU,50);
    });
    await t.test('reopening pools retains market history and completed idempotent quotes',async()=>{
      await a.close();await b.close();a=undefined;b=undefined;
      a=await createStore(scoped.toString());assert.equal((await (await a.marketRepository()).get('history:XAU:7d')).data.points.length,1);
      assert.equal((await a.mutateAccount(buyer.id,command)).receipt.replayed,true);
      assert.equal((await a.getMineSummary(operator.id)).reconciled,true);
    });
  }finally{await a?.close();await b?.close();await admin.query(`DROP SCHEMA "${schema}" CASCADE`);await admin.end();}
});
