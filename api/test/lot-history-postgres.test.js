import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createStore} from '../src/store.js';
import {lotFixture,lotJourney,lotCommand,LOT_HISTORY_PASSWORD} from './lot-history-fixture.js';

const databaseUrl=process.env.TEST_DATABASE_URL;
test('PostgreSQL historial de lote: diario durable, migración compatible y transacciones concurrentes',{
  skip:databaseUrl?false:'Falta TEST_DATABASE_URL; historial de lote PostgreSQL no se ha probado',timeout:120000,
},async t=>{
  const {default:pg}=await import('pg'),schema=`om_lot_history_test_${randomUUID().replaceAll('-','')}`;
  const admin=new pg.Pool({connectionString:databaseUrl,max:1,connectionTimeoutMillis:8000}),scoped=new URL(databaseUrl);
  scoped.searchParams.set('options',`-c search_path=${schema}`);
  let a,b,f,commands;
  const mineState=async id=>(await admin.query(`SELECT state FROM "${schema}".demo_mines WHERE id=$1`,[id])).rows[0].state;
  try{
    await admin.query(`CREATE SCHEMA "${schema}"`);a=await createStore(scoped.toString());b=await createStore(scoped.toString());
    f=await lotFixture(a,'pg');commands=await lotJourney(f);
    await t.test('dos asignaciones del mismo lote se transfieren coherentes; historial y saldos sobreviven a reconexión',async()=>{
      const before=await a.getLotHistory(f.op.id,f.lot.id),buyer=await a.getLotHistory(f.b.id,f.lot.id),state=await a.getAccountState(f.b.id);
      assert.equal(before.total,6);assert.equal(before.items.filter(item=>item.kind==='MARKET_TRANSFER').length,1);assert.equal(before.items.find(item=>item.kind==='MARKET_TRANSFER').mg,500);
      const persisted=await mineState(f.mine.id);assert.equal(persisted.custody.history.version,1);assert.equal(persisted.custody.history.movements.filter(item=>item.kind==='DELIVERY').length,1);
      await a.close();a=await createStore(scoped.toString());f.store=a;
      assert.deepEqual(await a.getLotHistory(f.op.id,f.lot.id),before);assert.deepEqual(await b.getLotHistory(f.b.id,f.lot.id),buyer);assert.deepEqual(await a.getAccountState(f.b.id),state);
    });
    await t.test('replay simultáneo por dos pools no duplica diario, stock ni entrega',async()=>{
      const before=await mineState(f.mine.id);
      const markets=await Promise.all([a.mutateAccount(f.b.id,commands.market),b.mutateAccount(f.b.id,commands.market)]);assert.ok(markets.every(item=>item.receipt.replayed));
      const deliveries=await Promise.all([a.mutateDelivery(f.op.id,commands.delivered),b.mutateDelivery(f.op.id,commands.delivered)]);assert.ok(deliveries.every(item=>item.receipt.replayed));
      const stocks=await Promise.all([a.mutateStock(f.op.id,commands.stock),b.mutateStock(f.op.id,commands.stock)]);assert.ok(stocks.every(item=>item.receipt.replayed));
      assert.deepEqual(await mineState(f.mine.id),before);
    });
    await t.test('dos compradores concurrentes tienen un ganador y un único movimiento peer',async()=>{
      const race=await lotFixture(a,'pg_race');await a.mutateAccount(race.a.id,lotCommand('buy',{metal:'XAU',grams:'0.500'}));
      const offer=await a.mutateAccount(race.a.id,lotCommand('offer',{metal:'XAU',grams:'0.300',price:'140.00'}));
      const commands=[race.b,race.other].map(()=>lotCommand('market_buy',{sellerId:race.a.id,offerId:offer.receipt.offer.id}));
      const results=await Promise.allSettled([a.mutateAccount(race.b.id,commands[0]),b.mutateAccount(race.other.id,commands[1])]);
      assert.equal(results.filter(item=>item.status==='fulfilled').length,1);assert.equal(results.find(item=>item.status==='rejected').reason.code,'OFFER_UNAVAILABLE');
      const history=await a.getLotHistory(race.op.id,race.lot.id);assert.equal(history.items.filter(item=>item.kind==='MARKET_TRANSFER').length,1);
      assert.equal((await a.getCustody(race.op.id,'operator')).totals.XAU.allocatedMg,500);
    });
    await t.test('compraventas concurrentes de los cuatro metales conservan diarios y posiciones separados',async()=>{
      const mixed=await lotFixture(a,'pg_four_metals'),metals=['XAU','XAG','XPT','XPD'];
      await Promise.all(metals.map(async metal=>{
        await a.mutateAccount(mixed.a.id,lotCommand('buy',{metal,grams:'0.200'}));
        const offer=await a.mutateAccount(mixed.a.id,lotCommand('offer',{metal,grams:'0.100',price:'10.00'}));
        await b.mutateAccount(mixed.b.id,lotCommand('market_buy',{sellerId:mixed.a.id,offerId:offer.receipt.offer.id}));
      }));
      const seller=await a.getAccountState(mixed.a.id),buyer=await b.getAccountState(mixed.b.id),custody=await a.getCustody(mixed.op.id,'operator'),management=await a.getManagement(mixed.op.id);
      const movementIds=[];
      for(const metal of metals){
        assert.equal(seller.holdingsMg[metal],100);assert.equal(buyer.holdingsMg[metal],100);
        assert.equal(custody.totals[metal].allocatedMg,200);assert.equal(custody.totals[metal].availableMg,metal==='XAU'?2800:800);
        const lot=custody.lots.find(item=>item.metal===metal),history=await b.getLotHistory(mixed.op.id,lot.id),own=await a.getLotHistory(mixed.b.id,lot.id);
        assert.equal(history.lot.metal,metal);assert.equal(history.items.filter(item=>item.kind==='BUY').length,1);assert.equal(history.items.find(item=>item.kind==='BUY').mg,200);
        assert.equal(history.items.filter(item=>item.kind==='MARKET_TRANSFER').length,1);assert.equal(history.items.find(item=>item.kind==='MARKET_TRANSFER').mg,100);
        assert.equal(own.total,1);assert.equal(own.items[0].direction,'IN');assert.equal(own.items[0].mg,100);
        assert.deepEqual(management.kpis.metalVolumesMg[metal],{directBuy:200,directSell:0,marketplace:100});
        movementIds.push(...history.items.map(item=>item.id));
      }
      assert.equal(new Set(movementIds).size,movementIds.length);
    });
    await t.test('importación concurrente registra una vez y conserva sesión anterior',async()=>{
      const legacy=`lot-history-pg-${randomUUID()}`;await a.mutate(legacy,lotCommand('buy',{metal:'XAG',grams:'0.100'}));const before=await a.get(legacy);
      const results=await Promise.allSettled(['a','b'].map((suffix,index)=>[a,b][index].registerAccount({alias:`lot_history_pg_import_${suffix}`,password:LOT_HISTORY_PASSWORD,legacySessionId:legacy})));
      assert.equal(results.filter(item=>item.status==='fulfilled').length,1);const winner=results.find(item=>item.status==='fulfilled').value;
      const lot=(await a.getCustody(winner.account.id)).lots[0],history=await b.getLotHistory(winner.account.id,lot.id);
      assert.equal(history.total,1);assert.equal(history.items[0].kind,'IMPORT');assert.equal(history.items[0].mg,100);
      const archive=await a.get(legacy);delete archive.legacyReadOnly;assert.deepEqual(archive,before);
    });
    await t.test('mina anterior sin diario migra una vez bajo lock sin reescribir cuentas, lotes ni recibos',async()=>{
      await admin.query(`UPDATE "${schema}".demo_mines SET state=state#-'{custody,history}' WHERE id=$1`,[f.mine.id]);
      const before=await mineState(f.mine.id),accounts=(await admin.query(`SELECT id,state FROM "${schema}".demo_accounts ORDER BY id`)).rows;
      const [first,second]=await Promise.all([a.getLotHistory(f.op.id,f.lot.id),b.getLotHistory(f.op.id,f.lot.id)]);
      assert.deepEqual(first,second);assert.equal(first.earlierHistoryUnavailable,true);assert.ok(first.items.every(item=>['OPENING_BALANCE','ALLOCATION_OPENING'].includes(item.kind)));
      const after=await mineState(f.mine.id);delete after.custody.history;assert.deepEqual(after,before);
      assert.deepEqual((await admin.query(`SELECT id,state FROM "${schema}".demo_accounts ORDER BY id`)).rows,accounts);
      const own=await a.getLotHistory(f.b.id,f.lot.id);assert.equal(own.total,1);assert.equal(own.items[0].kind,'ALLOCATION_OPENING');assert.equal(own.items[0].mg,300);
    });
    await t.test('historial inconsistente bloquea y revierte mutación financiera sin borrar evidencia',async()=>{
      await admin.query(`UPDATE "${schema}".demo_mines SET state=jsonb_set(state,'{custody,history,movements,0,balancesAfter,availableMg}','999999'::jsonb) WHERE id=$1`,[f.mine.id]);
      const beforeMine=await mineState(f.mine.id),before=(await admin.query(`SELECT state FROM "${schema}".demo_accounts WHERE id=$1`,[f.b.id])).rows[0].state;
      await assert.rejects(a.mutateAccount(f.b.id,lotCommand('withdraw',{currency:'USDT',amount:'1.00'})),{code:'INVALID_CUSTODY_HISTORY'});
      assert.deepEqual(await mineState(f.mine.id),beforeMine);assert.deepEqual((await admin.query(`SELECT state FROM "${schema}".demo_accounts WHERE id=$1`,[f.b.id])).rows[0].state,before);
    });
  }finally{
    try{if(a)await a.close();if(b)await b.close();}
    finally{try{await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);}finally{await admin.end();}}
  }
});
