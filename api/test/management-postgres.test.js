import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createStore} from '../src/store.js';
import {seedManagement,managementCommand as cmd,MANAGEMENT_PASSWORD as PASSWORD} from './management-fixture.js';

const databaseUrl=process.env.TEST_DATABASE_URL;
test('PostgreSQL gerencia: KPIs privados, histórico completo, cursores y aislamiento de mina',{
  skip:databaseUrl?false:'Falta TEST_DATABASE_URL; gerencia PostgreSQL no se ha probado',timeout:120000,
},async t=>{
  const {default:pg}=await import('pg'),schema=`om_management_test_${randomUUID().replaceAll('-','')}`;
  const admin=new pg.Pool({connectionString:databaseUrl,max:1,connectionTimeoutMillis:8000});
  const scoped=new URL(databaseUrl);scoped.searchParams.set('options',`-c search_path=${schema}`);
  let a,b,f;
  try{
    await admin.query(`CREATE SCHEMA "${schema}"`);[a,b]=await Promise.all([createStore(scoped.toString()),createStore(scoped.toString())]);f=await seedManagement(a,'pg');
    await t.test('indicadores concilian entrega y mercado sin duplicar comisiones ni comandos',async()=>{
      const view=await b.getManagement(f.op.id);assert.equal(view.history.total,15);assert.equal(view.kpis.tradingFeesMinor,199);assert.equal(view.kpis.marketplaceTrades,1);assert.equal(view.kpis.deliveryCostsCollectedMinor,1000);
      assert.equal(view.metals.XAU.originalWeightMg,3000);assert.equal(view.metals.XAU.deliveredMg,100);assert.equal(view.metals.XAU.activeSupplyMg,2900);assert.equal(view.metals.XAU.availableMg+view.metals.XAU.allocatedMg,2900);assert.equal(view.metals.XAU.reservedMg,200);
      assert.equal(view.history.items.filter(item=>item.action==='delivery_quote').length,1);assert.equal(view.history.items.filter(item=>item.action==='delivery_transition').length,3);
      for(const field of ['walletMinor','balancesAfter','passwordSalt','passwordHash','DEPOSIT','WITHDRAW','CONVERT'])assert.equal(JSON.stringify(view).includes(field),false,field);
      const filtered=await a.getManagement(f.op.id,new URLSearchParams({action:'market_buy',buyer:f.b.id,metal:'XAU',status:'FILLED'}));assert.equal(filtered.history.total,1);assert.equal(filtered.kpis.tradingFeesMinor,36);assert.equal(filtered.kpis.marketplaceVolumeMinor,3000);
    });
    await t.test('dos operadores con igual clave y comprador generan eventos únicos y consultas desambiguadas',async()=>{
      const shared=randomUUID(),command={action:'delivery_quote',buyerId:f.b.id,deliveryId:f.activeDelivery.id,jurisdiction:'DEMO_LOCAL',requestId:shared};
      const results=await Promise.all([a.mutateDelivery(f.op.id,command),b.mutateDelivery(f.op2.id,command)]);assert.ok(results.every(item=>item.changed));
      let before=null;const seen=[];do{const view=await b.getManagement(f.op.id,new URLSearchParams({action:'delivery_quote',buyer:f.b.id,limit:'1',...(before?{before}:{})}));seen.push(...view.history.items);before=view.history.nextCursor;}while(before);
      assert.equal(seen.length,3);assert.equal(new Set(seen.map(item=>item.id)).size,3);
      const matches=seen.filter(item=>item.receipt.id===shared);assert.equal(matches.length,2);assert.notEqual(matches[0].actor.id,matches[1].actor.id);
      for(const item of matches){const retrieved=await b.getMineCommand(f.op2.id,shared,{actorId:item.actor.id,kind:'command'});assert.equal(retrieved.quote.id,item.receipt.quote.id);}
      const stock=await a.mutateStock(f.op.id,{metal:'XAG',grams:'0.100',reason:'Reposición con clave de otro namespace',requestId:shared});
      assert.deepEqual(await b.getMineCommand(f.op2.id,shared,{actorId:f.op.id,kind:'stock'}),stock.receipt);assert.equal((await a.getMineCommand(f.op.id,shared,{actorId:f.op.id,kind:'command'})).action,'delivery_quote');
      await assert.rejects(a.getMineCommand(f.op.id,shared),{status:409});
    });
    await t.test('más de veinte movimientos y nuevos inserts no repiten páginas filtradas',async()=>{
      for(let i=0;i<35;i++)await a.mutateAccount(f.a.id,cmd('buy',{metal:'XAG',grams:'0.100'}));
      const query={metal:'XAG',action:'buy',buyer:f.a.id,limit:'7'},first=await b.getManagement(f.op.id,new URLSearchParams(query));assert.equal(first.history.total,35);assert.equal(first.history.items.length,7);
      const seen=[...first.history.items];let before=first.history.nextCursor;
      await new Promise(resolve=>setTimeout(resolve,2));const inserted=await a.mutateAccount(f.a.id,cmd('buy',{metal:'XAG',grams:'0.100'}));
      while(before){const next=await b.getManagement(f.op.id,new URLSearchParams({...query,before}));seen.push(...next.history.items);before=next.history.nextCursor;assert.equal(next.history.total,36);}
      assert.equal(seen.length,35);assert.equal(new Set(seen.map(item=>item.id)).size,35);assert.equal(seen.some(item=>item.receipt.id===inserted.receipt.id),false);
      const period=await a.getManagement(f.op.id,new URLSearchParams({...query,limit:'50',from:seen.at(-1).at,to:first.history.items[0].at}));assert.equal(period.history.total,35);assert.equal(period.kpis.directBuys,35);assert.equal(period.kpis.tradingFeesMinor,35);
      await assert.rejects(a.getManagement(f.op.id,new URLSearchParams({metal:'XAU',before:first.history.nextCursor})),{code:'INVALID_MANAGEMENT_QUERY'});
      await assert.rejects(b.getManagement(f.op.id,new URLSearchParams('action=deposit')),{code:'INVALID_MANAGEMENT_QUERY'});
      await assert.rejects(b.getManagement(f.op.id,new URLSearchParams('limit=51')),{code:'INVALID_MANAGEMENT_QUERY'});
    });
    await t.test('compradores y operadores de otra mina no acceden a actividad ni comprobantes',async()=>{
      await assert.rejects(a.getManagement(f.a.id),{status:403});
      const otherMine=await a.createMine({name:'Otra mina PG gestión'}),other=await b.createAccount({alias:'management_pg_elsewhere',password:PASSWORD,mineId:otherMine.id,role:'operator'});
      const elsewhere=await b.getManagement(other.id);assert.equal(elsewhere.history.total,0);assert.equal(elsewhere.buyers.length,0);assert.equal(JSON.stringify(elsewhere).includes(f.a.id),false);
      assert.equal((await b.getManagement(other.id,new URLSearchParams({buyer:f.a.id}))).history.total,0);
      await assert.rejects(b.getMineCommand(other.id,f.quoted.receipt.id,{actorId:f.op.id,kind:'command'}),{status:404});await assert.rejects(b.getMineCommand(other.id,f.stock.receipt.id,{actorId:f.op.id,kind:'stock'}),{status:404});
      await assert.rejects(a.getMineCommand(f.op.id,f.quoted.receipt.id,{actorId:f.a.id,kind:'command'}),{status:404});
      const receipt=await a.getMineReceipt(f.op.id,f.a.id,f.bought.receipt.id);assert.equal(receipt.balancesAfter,undefined);assert.equal(receipt.operatorView,true);
    });
    await t.test('reconexión mantiene filtros, indicadores y IDs de eventos sin mutar cuentas',async()=>{
      const params=new URLSearchParams({limit:'50'}),before=await b.getManagement(f.op.id,params),states=await Promise.all([f.a,f.b].map(account=>b.getAccountState(account.id)));
      await a.close();a=await createStore(scoped.toString());assert.deepEqual(await a.getManagement(f.op.id,params),before);assert.deepEqual(await Promise.all([f.a,f.b].map(account=>a.getAccountState(account.id))),states);
      const summary=await a.getMineSummary(f.op.id);assert.equal(before.kpis.tradingFeesMinor,summary.demoFeesCollectedMinor);assert.equal(before.kpis.directBuys+before.kpis.directSells+before.kpis.marketplaceTrades,summary.transactionCount);
    });
  }finally{
    try{if(a)await a.close();if(b)await b.close();}
    finally{try{await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);}finally{await admin.end();}}
  }
});
