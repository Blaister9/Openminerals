import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {createStore} from '../src/store.js';
import {createApiServer} from '../src/server.js';
import {parseManagementQuery} from '../src/management.js';
import {seedManagement,managementCommand as cmd,MANAGEMENT_PASSWORD as PASSWORD} from './management-fixture.js';

test('gerencia: KPIs sin duplicar mercado/comandos y foto conciliada sin billeteras',async()=>{
  const store=await createStore('');
  try{
    const f=await seedManagement(store),view=await store.getManagement(f.op.id);
    assert.equal(view.kpis.directBuys,1);assert.equal(view.kpis.directSells,1);assert.equal(view.kpis.marketplaceTrades,1);assert.equal(view.kpis.tradingFeesMinor,199);
    assert.equal(view.kpis.directBuyVolumeMinor,14500);assert.equal(view.kpis.directSellVolumeMinor,1450);assert.equal(view.kpis.marketplaceVolumeMinor,3000);assert.equal(view.kpis.deliveryCostsCollectedMinor,1000);
    assert.equal(view.kpis.stockEntries,1);assert.equal(view.kpis.stockMg,1000);assert.equal(view.kpis.policyChanges,1);assert.equal(view.history.total,15);
    assert.equal(view.history.items.filter(item=>item.action==='delivery_quote').length,1);assert.equal(view.history.items.filter(item=>item.action==='delivery_transition').length,3);
    assert.equal(new Set(view.history.items.map(item=>item.id)).size,view.history.items.length);
    assert.deepEqual(view.metals.XAU,{originalWeightMg:3000,deliveredMg:100,activeSupplyMg:2900,availableMg:2100,allocatedMg:800,reservedMg:200,reconciled:true});
    assert.equal(view.obligations.offersOpen,1);assert.equal(view.obligations.offersMg.XAU,100);assert.equal(view.obligations.deliveriesActive,1);assert.equal(view.obligations.deliveryMg.XAU,100);
    assert.equal(view.buyers.find(item=>item.id===f.a.id).holdingsMg.XAU,700);assert.equal(view.buyers.find(item=>item.id===f.b.id).reservedMg.XAU,100);
    const serialized=JSON.stringify(view);for(const privateField of ['walletMinor','balancesAfter','passwordHash','passwordSalt','token','DEPOSIT','WITHDRAW','CONVERT'])assert.equal(serialized.includes(privateField),false,privateField);
    for(const action of ['market_buy','market_sell']){const filtered=await store.getManagement(f.op.id,new URLSearchParams({action}));assert.equal(filtered.history.total,1);assert.equal(filtered.kpis.marketplaceTrades,1);assert.equal(filtered.kpis.tradingFeesMinor,36);}
    const own=await store.getManagement(f.op.id,new URLSearchParams({buyer:f.a.id,status:'FILLED'}));assert.equal(own.history.total,1);assert.equal(own.history.items[0].action,'market_sell');
    const delivered=await store.getManagement(f.op.id,new URLSearchParams({action:'delivery_transition',status:'DELIVERED_DEMO'}));assert.equal(delivered.history.total,1);assert.equal(delivered.history.items[0].scope,'command');assert.equal(delivered.history.items[0].ownerId,'mine');
  }finally{await store.close();}
});

test('gerencia: historial completo supera veinte y cursor no repite al insertar nuevos eventos',async()=>{
  const store=await createStore('');
  try{
    const mine=await store.createMine({name:'Paginación gerencial',initialInventoryMg:{XAG:10000}}),buyer=await store.createAccount({alias:'management_pagination',password:PASSWORD,mineId:mine.id}),op=await store.createAccount({alias:'management_pagination_op',password:PASSWORD,mineId:mine.id,role:'operator'});
    for(let i=0;i<45;i++)await store.mutateAccount(buyer.id,cmd('buy',{metal:'XAG',grams:'0.100'}));
    const first=await store.getManagement(op.id);assert.equal(first.history.items.length,20);assert.equal(first.history.total,45);assert.ok(first.history.nextCursor);assert.equal(first.kpis.directBuys,45);
    const seen=[...first.history.items];let cursor=first.history.nextCursor;
    await new Promise(resolve=>setTimeout(resolve,2));const newest=await store.mutateAccount(buyer.id,cmd('buy',{metal:'XAG',grams:'0.100'}));
    while(cursor){const page=await store.getManagement(op.id,new URLSearchParams({before:cursor}));seen.push(...page.history.items);cursor=page.history.nextCursor;assert.equal(page.history.total,46);}
    assert.equal(seen.length,45);assert.equal(new Set(seen.map(item=>item.id)).size,45);assert.equal(seen.some(item=>item.receipt.id===newest.receipt.id),false);
    const from=seen.at(-1).at,to=first.history.items[0].at;const filtered=await store.getManagement(op.id,new URLSearchParams({metal:'XAG',action:'buy',buyer:buyer.id,from,to,limit:'50'}));assert.equal(filtered.history.total,45);
    assert.equal((await store.getManagement(op.id,new URLSearchParams({metal:'XAU'}))).history.total,0);
    await assert.rejects(store.getManagement(op.id,new URLSearchParams({metal:'XAU',before:first.history.nextCursor})),{code:'INVALID_MANAGEMENT_QUERY'});
  }finally{await store.close();}
});

test('gerencia: filtros estrictos rechazan fechas imposibles, límites, duplicados y campos privados',()=>{
  for(const query of ['wallet=true','metal=BTC','action=deposit','status=PAID','buyer=other','limit=0','limit=51','limit=1.5','limit=','from=2026-02-30T00%3A00%3A00.000Z','from=2026-10-28','from=2026-10-28T00%3A00%3A00%2B05%3A00','from=2026-10-29T00%3A00%3A00Z&to=2026-10-28T00%3A00%3A00Z','metal=XAU&metal=XAG','before=invalid'])assert.throws(()=>parseManagementQuery(new URLSearchParams(query)),{code:'INVALID_MANAGEMENT_QUERY'},query);
  assert.equal(parseManagementQuery(new URLSearchParams('from=2026-10-28T00%3A00%3A00Z')).from,'2026-10-28T00:00:00.000Z');
});

test('gerencia: dos operadores con igual clave no colisionan eventos/cursor; stock y command se consultan',async()=>{
  const store=await createStore('');
  try{
    const f=await seedManagement(store),shared=randomUUID(),body={buyerId:f.b.id,deliveryId:f.activeDelivery.id,jurisdiction:'DEMO_LOCAL',requestId:shared,action:'delivery_quote'};
    const q1=await store.mutateDelivery(f.op.id,body),q2=await store.mutateDelivery(f.op2.id,body);
    const params={action:'delivery_quote',buyer:f.b.id,limit:'1'};let cursor=null;const events=[];
    do{const page=await store.getManagement(f.op.id,new URLSearchParams({...params,...(cursor?{before:cursor}:{})}));events.push(...page.history.items);cursor=page.history.nextCursor;}while(cursor);
    assert.equal(events.length,3);assert.equal(new Set(events.map(item=>item.id)).size,3);
    const sharedEvents=events.filter(item=>item.receipt.id===shared);assert.equal(sharedEvents.length,2);assert.notEqual(sharedEvents[0].id,sharedEvents[1].id);
    for(const entry of sharedEvents){const retrieved=await store.getMineCommand(f.op2.id,entry.receipt.id,{actorId:entry.actor.id,kind:'command'});assert.equal(retrieved.quote.id,entry.receipt.quote.id);}
    const stock=await store.mutateStock(f.op.id,{metal:'XAG',grams:'0.100',reason:'Clave compartida con otro tipo',requestId:shared});
    assert.deepEqual(await store.getMineCommand(f.op2.id,shared,{actorId:f.op.id,kind:'stock'}),stock.receipt);
    assert.deepEqual(await store.getMineCommand(f.op2.id,shared,{actorId:f.op.id,kind:'command'}),q1.receipt);assert.deepEqual(await store.getMineCommand(f.op.id,shared,{actorId:f.op2.id,kind:'command'}),q2.receipt);
    await assert.rejects(store.getMineCommand(f.op.id,shared),{status:409});await assert.rejects(store.getMineCommand(f.op.id,shared,{actorId:f.a.id,kind:'command'}),{status:404});
  }finally{await store.close();}
});

test('gerencia HTTP: solo operador y mina propia; cada fila tiene comprobante consultable sin saldos',async()=>{
  const store=await createStore(''),f=await seedManagement(store),server=createApiServer(store);server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
  const request=async(path,token)=>{const response=await fetch(base+path,{headers:token?{Authorization:`Bearer ${token}`}:{}});return {status:response.status,data:await response.json()};};
  try{
    const op=(await store.loginAccount(f.op.alias,PASSWORD)).token,buyer=(await store.loginAccount(f.a.alias,PASSWORD)).token;
    const another=await store.createMine({name:'Otra mina gerencial'}),other=await store.createAccount({alias:'management_elsewhere',password:PASSWORD,mineId:another.id,role:'operator'}),otherToken=(await store.loginAccount(other.alias,PASSWORD)).token;
    assert.equal((await request('/api/demo/mine/management')).status,401);assert.equal((await request('/api/demo/mine/management',buyer)).status,403);
    const own=await request('/api/demo/mine/management',op),elsewhere=await request('/api/demo/mine/management',otherToken);assert.equal(own.status,200);assert.equal(elsewhere.status,200);assert.equal(elsewhere.data.history.total,0);assert.equal(elsewhere.data.buyers.length,0);
    assert.equal((await request(`/api/demo/mine/management?buyer=${f.a.id}`,otherToken)).data.history.total,0);
    for(const entry of own.data.history.items){const receipt=await request(entry.receiptPath,op);assert.equal(receipt.status,200,entry.receiptPath);assert.equal(receipt.data.id,entry.receipt.id);assert.equal(receipt.data.balancesAfter,undefined);assert.equal((await request(entry.receiptPath,otherToken)).status,404);}
    assert.equal((await request('/api/demo/mine/management?action=deposit',op)).status,400);
    assert.equal((await request(`/api/demo/mine/commands/${f.quoted.receipt.id}?kind=command&actor=${f.op.id}&actor=${f.op2.id}`,op)).status,400);
    assert.equal((await request('/api/demo/mine/management?limit=50',buyer)).status,403);
  }finally{await new Promise(resolve=>server.close(resolve));await store.close();}
});
