import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {createStore} from '../src/store.js';
import {createApiServer} from '../src/server.js';
import {seedMine} from '../src/shared-mine.js';
import {seedState} from '../src/domain.js';
import {ensureCustody} from '../src/custody.js';
import {ensureLotHistory,parseLotHistoryQuery,validateLotHistory} from '../src/custody-history.js';
import {lotFixture,lotJourney,lotCommand,LOT_HISTORY_PASSWORD} from './lot-history-fixture.js';

test('historial de lote: baseline aditivo conserva datos anteriores sin inventar operaciones',()=>{
  const mine=seedMine(),state=seedState();state.holdingsMg.XAU=300;mine.inventoryMg.XAU-=300;
  const accounts=[{id:'buyer-existing',alias:'existing',role:'buyer',state}];
  const initialized=ensureCustody(mine,accounts).mine;delete initialized.custody.history;
  const before=structuredClone({mine:initialized,accounts});
  const migrated=ensureCustody(initialized,accounts,'2026-10-29T00:00:00.000Z');
  assert.equal(migrated.changed,true);assert.deepEqual({mine:initialized,accounts},before);
  const without=structuredClone(migrated.mine);delete without.custody.history;assert.deepEqual(without,initialized);
  const events=migrated.mine.custody.history.movements;
  assert.equal(events.filter(event=>event.kind==='OPENING_BALANCE').length,4);
  assert.equal(events.filter(event=>event.kind==='ALLOCATION_OPENING').length,1);
  assert.equal(events.find(event=>event.kind==='ALLOCATION_OPENING').mg,300);
  assert.ok(events.every(event=>!['BUY','SELL','MARKET_TRANSFER'].includes(event.kind)));
  assert.equal(ensureLotHistory(migrated.mine,accounts,'2027-01-01T00:00:00.000Z').changed,false);
  const broken=structuredClone(migrated.mine);broken.custody.history.movements[0].balancesAfter.availableMg++;
  assert.throws(()=>validateLotHistory(broken,accounts),{code:'INVALID_CUSTODY_HISTORY'});
});

test('historial de lote: dos asignaciones del mismo lote transfieren una sola cantidad coherente y replay no duplica',async()=>{
  const store=await createStore('');
  try{
    const f=await lotFixture(store),commands=await lotJourney(f),view=await store.getLotHistory(f.op.id,f.lot.id);
    assert.deepEqual(view.items.map(item=>item.kind),['DELIVERY','SELL','MARKET_TRANSFER','BUY','BUY','OPENING_BALANCE']);
    assert.equal(view.items.find(item=>item.kind==='MARKET_TRANSFER').mg,500);
    const mine=await store.getCustody(f.op.id,'operator');
    assert.equal(mine.totals.XAU.allocatedMg,300);assert.equal(mine.totals.XAU.deliveredMg,200);assert.equal(mine.totals.XAU.availableMg,3500);
    for(const [id,command] of [[f.a.id,commands.first],[f.a.id,commands.second],[f.b.id,commands.market],[f.a.id,commands.sell]])assert.equal((await store.mutateAccount(id,command)).receipt.replayed,true);
    assert.equal((await store.mutateDelivery(f.op.id,commands.delivered)).receipt.replayed,true);
    assert.equal((await store.mutateStock(f.op.id,commands.stock)).receipt.replayed,true);
    assert.deepEqual(await store.getLotHistory(f.op.id,f.lot.id),view);
    const stock=await store.getLotHistory(f.op.id,commands.stockLot);assert.equal(stock.total,1);assert.equal(stock.items[0].kind,'LOT_REGISTERED');
    const before=await store.getLotHistory(f.op.id,f.lot.id);
    await assert.rejects(store.mutateAccount(f.a.id,lotCommand('sell',{metal:'XAU',grams:'0.100'})),{code:'INSUFFICIENT_HOLDING'});
    await assert.rejects(store.mutateAccount(f.b.id,{...commands.market,offerId:'offer-999'}));
    assert.deepEqual(await store.getLotHistory(f.op.id,f.lot.id),before);
  }finally{await store.close();}
});

test('historial de lote: comprador sólo propios, referencias propias y sin cuentas ajenas ni billeteras',async()=>{
  const store=await createStore('');
  try{
    const f=await lotFixture(store),commands=await lotJourney(f),a=await store.getLotHistory(f.a.id,f.lot.id),b=await store.getLotHistory(f.b.id,f.lot.id);
    assert.equal(a.view,'buyer');assert.equal(a.total,4);assert.equal(b.total,2);
    assert.equal(a.items.find(item=>item.kind==='MARKET_TRANSFER').direction,'OUT');assert.equal(b.items.find(item=>item.kind==='MARKET_TRANSFER').direction,'IN');
    assert.equal(b.items.find(item=>item.kind==='MARKET_TRANSFER').referenceId,commands.market.requestId);
    assert.match(a.items.find(item=>item.kind==='MARKET_TRANSFER').referenceId,/^market-sell-/);
    assert.match(b.items.find(item=>item.kind==='DELIVERY').referenceId,/^delivery-command-/);
    for(const [view,foreign] of [[a,f.b],[b,f.a]]){
      const serialized=JSON.stringify(view);assert.equal(serialized.includes(foreign.id),false);assert.equal(serialized.includes(foreign.alias),false);
      assert.ok(view.items.every(item=>item.account?.id===view.items[0].account.id&&!item.counterparty));
      assert.doesNotMatch(serialized,/walletMinor|balancesAfter|password|references|counterparty/);
    }
    await assert.rejects(store.getLotHistory(f.other.id,f.lot.id),{status:404});
    const otherMine=await store.createMine({name:'Historial de otra mina'}),other=await store.createAccount({alias:'lot_foreign_operator',password:LOT_HISTORY_PASSWORD,mineId:otherMine.id,role:'operator'});
    await assert.rejects(store.getLotHistory(other.id,f.lot.id),{status:404});
    assert.equal((await store.getLotHistory(f.op.id,f.lot.id)).items.find(item=>item.kind==='MARKET_TRANSFER').counterparty.id,f.b.id);
  }finally{await store.close();}
});

test('historial de lote: paginación completa más de20 con inserciones y cursores aislados',async()=>{
  const store=await createStore('');
  try{
    const f=await lotFixture(store);
    for(let index=0;index<11;index++){
      await store.mutateAccount(f.a.id,lotCommand('buy',{metal:'XAU',grams:'0.100'}));
      await store.mutateAccount(f.a.id,lotCommand('sell',{metal:'XAU',grams:'0.100'}));
    }
    const first=await store.getLotHistory(f.a.id,f.lot.id,new URLSearchParams('limit=5')),ids=first.items.map(item=>item.id);let before=first.nextCursor;
    await store.mutateAccount(f.a.id,lotCommand('buy',{metal:'XAU',grams:'0.100'}));
    while(before){const page=await store.getLotHistory(f.a.id,f.lot.id,new URLSearchParams({limit:'5',before}));ids.push(...page.items.map(item=>item.id));before=page.nextCursor;}
    assert.equal(ids.length,22);assert.equal(new Set(ids).size,22);
    assert.equal((await store.getLotHistory(f.a.id,f.lot.id)).total,23);
    const operator=await store.getLotHistory(f.op.id,f.lot.id,new URLSearchParams('limit=50')),opening=operator.items.find(item=>item.kind==='OPENING_BALANCE');
    await assert.rejects(store.getLotHistory(f.a.id,f.lot.id,new URLSearchParams({before:opening.id})),{code:'INVALID_LOT_HISTORY_QUERY'});
    assert.equal((await store.getLotHistory(f.a.id,f.lot.id)).earlierHistoryUnavailable,true);
  }finally{await store.close();}
});

test('historial de lote: importación registra una vez y conserva origen y comprobantes anteriores',async()=>{
  const store=await createStore('');
  try{
    const legacy=`lot-history-legacy-${randomUUID()}`;await store.mutate(legacy,lotCommand('buy',{metal:'XAG',grams:'0.100'}));
    const before=await store.get(legacy),auth=await store.registerAccount({alias:'lot_history_import',password:LOT_HISTORY_PASSWORD,legacySessionId:legacy});
    const lot=(await store.getCustody(auth.account.id)).lots[0],view=await store.getLotHistory(auth.account.id,lot.id);
    assert.equal(view.total,1);assert.equal(view.items[0].kind,'IMPORT');assert.equal(view.items[0].mg,100);assert.equal(view.items[0].referenceId,undefined);
    await assert.rejects(store.registerAccount({alias:'lot_history_duplicate_import',password:LOT_HISTORY_PASSWORD,legacySessionId:legacy}),{code:'LEGACY_CLAIMED'});
    assert.deepEqual(await store.getLotHistory(auth.account.id,lot.id),view);
    const archive=await store.get(legacy);delete archive.legacyReadOnly;assert.deepEqual(archive,before);
  }finally{await store.close();}
});

test('historial de lote HTTP: bearer obligatorio, roles, query estricto y recarga conservada',async()=>{
  const store=await createStore(''),f=await lotFixture(store);await store.mutateAccount(f.a.id,lotCommand('buy',{metal:'XAU',grams:'0.100'}));
  const server=createApiServer(store);server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
  const get=async(path,token)=>{const response=await fetch(base+path,{headers:token?{Authorization:`Bearer ${token}`}:{}});return {status:response.status,data:await response.json()};};
  try{
    const a=(await store.loginAccount(f.a.alias,LOT_HISTORY_PASSWORD)).token,op=(await store.loginAccount(f.op.alias,LOT_HISTORY_PASSWORD)).token,path=`/api/demo/custody/lots/${f.lot.id}/history`;
    assert.equal((await get(path)).status,401);assert.equal((await get(path,'invalid-token')).status,401);
    assert.equal((await get(path,a)).data.view,'buyer');assert.equal((await get(path,op)).data.view,'operator');
    assert.deepEqual((await get(path,a)).data,(await get(path,a)).data);
    for(const query of ['limit=0','limit=51','limit=','limit=1&limit=2','before=','before=bad','accountId=foreign'])assert.equal((await get(path+'?'+query,a)).status,400,query);
    assert.equal((await get('/api/demo/custody/lots/not-a-lot/history',op)).status,400);
    assert.equal((await get('/api/demo/custody/lots/lot-'+'0'.repeat(32)+'/history',op)).status,404);
  }finally{await new Promise(resolve=>server.close(resolve));await store.close();}
  for(const query of ['limit=1.5','limit=-1','before=lot-move-'+'a'.repeat(31)])assert.throws(()=>parseLotHistoryQuery(new URLSearchParams(query)),{code:'INVALID_LOT_HISTORY_QUERY'});
});
