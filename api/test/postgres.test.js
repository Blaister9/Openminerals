import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createStore} from '../src/store.js';
import {seedState} from '../src/domain.js';

// Never infer a database from DATABASE_URL: opt in with a dedicated test URL.
// Every run uses its own schema; existing demo_sessions and sessions are untouched.
const databaseUrl=process.env.TEST_DATABASE_URL;
test('PostgreSQL: aislamiento, atomicidad, concurrencia y persistencia',{
  skip:databaseUrl?false:'Falta TEST_DATABASE_URL; PostgreSQL no se ha probado',
  timeout:90_000,
},async t=>{
  const {default:pg}=await import('pg');
  const schema=`om_test_${randomUUID().replaceAll('-','')}`;
  assert.match(schema,/^om_test_[a-f0-9]{32}$/);
  const admin=new pg.Pool({connectionString:databaseUrl,max:1,connectionTimeoutMillis:8000});
  const scopedUrl=new URL(databaseUrl);
  scopedUrl.searchParams.set('options',`-c search_path=${schema}`);
  let store;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    store=await createStore(scopedUrl.toString());
    assert.equal(store.mode,'postgres-demo');
    assert.equal(await store.ping(),true);

    await t.test('sesiones separadas no comparten saldos ni movimientos',async()=>{
      const a=`isolated-a-${randomUUID()}`;
      const b=`isolated-b-${randomUUID()}`;
      await store.mutate(a,{action:'buy',metal:'XAG',grams:'1.000',requestId:randomUUID()});
      assert.equal((await store.get(a)).holdingsMg.XAG,1000);
      assert.deepEqual(await store.get(b),seedState());
    });

    await t.test('12 solicitudes concurrentes con la misma clave compran una sola vez',async()=>{
      const session=`duplicate-${randomUUID()}`;
      const command={action:'buy',metal:'XAG',grams:'1.000',requestId:randomUUID()};
      const results=await Promise.all(Array.from({length:12},()=>store.mutate(session,command)));
      assert.equal(results.filter(r=>r.changed).length,1);
      assert.equal(results.filter(r=>r.receipt.replayed).length,11);
      const state=await store.get(session);
      assert.equal(state.holdingsMg.XAG,1000);
      assert.equal(state.movements.filter(m=>m.type==='BUY').length,1);
      assert.equal(Object.keys(state.receipts).length,1);
      assert.equal(state.walletMinor.USDT,seedState().walletMinor.USDT-results[0].receipt.totalMinor);
    });

    await t.test('solicitudes distintas concurrentes no permiten sobregiro',async()=>{
      const session=`overspend-${randomUUID()}`;
      const results=await Promise.allSettled(Array.from({length:12},()=>store.mutate(session,{
        action:'withdraw',currency:'USDT',amount:'100.00',requestId:randomUUID(),
      })));
      assert.equal(results.filter(r=>r.status==='fulfilled').length,2);
      const rejected=results.filter(r=>r.status==='rejected');
      assert.equal(rejected.length,10);
      for(const result of rejected)assert.equal(result.reason.code,'INSUFFICIENT_BALANCE');
      const state=await store.get(session);
      assert.equal(state.walletMinor.USDT,5000);
      assert.equal(state.movements.length,2);
      assert.equal(Object.keys(state.receipts).length,2);
    });

    await t.test('una operación rechazada revierte y la conexión sigue utilizable',async()=>{
      const session=`rollback-${randomUUID()}`;
      const before=await store.get(session);
      await assert.rejects(store.mutate(session,{
        action:'buy',metal:'XAU',grams:'9.000',requestId:randomUUID(),
      }),{code:'INSUFFICIENT_BALANCE'});
      assert.deepEqual(await store.get(session),before);
      const accepted=await store.mutate(session,{
        action:'deposit',currency:'USD',amount:'1.00',requestId:randomUUID(),
      });
      assert.equal(accepted.state.walletMinor.USD,before.walletMinor.USD+100);
    });

    await t.test('cerrar y recrear store conserva estado y recibos idempotentes',async()=>{
      const session=`reopen-${randomUUID()}`;
      const command={action:'buy',metal:'XAG',grams:'2.000',requestId:randomUUID()};
      const first=await store.mutate(session,command);
      await store.close();
      store=await createStore(scopedUrl.toString());
      assert.deepEqual(await store.get(session),first.state);
      const replay=await store.mutate(session,command);
      assert.equal(replay.changed,false);
      assert.equal(replay.receipt.replayed,true);
      assert.deepEqual(replay.state,first.state);
    });
  } finally {
    try {if(store)await store.close();}
    finally {
      try {await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);}
      finally {await admin.end();}
    }
  }
});
