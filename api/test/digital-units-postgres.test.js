import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createStore} from '../src/store.js';
import {command,digitalJourney,digitalRaces} from './digital-units-fixture.js';

const databaseUrl=process.env.TEST_DATABASE_URL;
test('PostgreSQL unidades DEMO: transacción compartida, dos pools, persistencia, migración y rollback',{
  skip:databaseUrl?false:'Falta TEST_DATABASE_URL; unidades digitales PostgreSQL no probadas',timeout:120000,
},async t=>{
  const {default:pg}=await import('pg'),schema=`om_digital_test_${randomUUID().replaceAll('-','')}`;
  const admin=new pg.Pool({connectionString:databaseUrl,max:2,connectionTimeoutMillis:8000});
  const scoped=new URL(databaseUrl);scoped.searchParams.set('options',`-c search_path=${schema}`);
  let a,b,disabled;
  try{
    await admin.query(`CREATE SCHEMA "${schema}"`);
    [a,b]=await Promise.all([createStore(scoped.toString(),{digitalUnitsEnabled:true}),createStore(scoped.toString(),{digitalUnitsEnabled:true})]);
    let f,race;
    await t.test('recorrido completo concilia lotes, certificados, reservas y cancelación final de entrega',async()=>{f=await digitalJourney(a,'pg_units');});
    await t.test('dos pools impiden sobreemisión, doble reserva, doble venta y replay concurrente',async()=>{race=await digitalRaces(a,b,'pg_units');});
    await t.test('reinicio conserva hashes, identidad y cantidades; flag off no permite desincronizar un registro existente',async()=>{
      await a.close();a=await createStore(scoped.toString(),{digitalUnitsEnabled:true});
      assert.deepEqual(await a.getDigitalUnits(f.op.id,new URLSearchParams('limit=100')),f.view);
      disabled=await createStore(scoped.toString(),{digitalUnitsEnabled:false});
      await disabled.mutateAccount(race.purchaser.id,command('sell',{metal:'XAU',grams:'0.100'}));
      const result=await b.getDigitalUnits(race.op.id);
      assert.equal(result.reconciliation.metals.XAU.outstandingUnits,300);
      assert.equal(result.reconciliation.ok,true);
    });
    await t.test('apertura concurrente conserva cuentas/recibos y no reconstruye emisiones como compras antiguas',async()=>{
      const mine=await disabled.createMine({name:'Apertura unidades DEMO previa',initialInventoryMg:{XAG:1000}});
      const owner=await disabled.createAccount({alias:'digital_migration_owner',password:'Digital-pg-only-test-pass-123',mineId:mine.id});
      await disabled.mutateAccount(owner.id,command('buy',{metal:'XAG',grams:'0.300'}));
      const old=(await admin.query(`SELECT state FROM "${schema}".demo_accounts WHERE id=$1`,[owner.id])).rows[0].state;
      const [first,second]=await Promise.all([a.getDigitalUnits(owner.id),b.getDigitalUnits(owner.id)]);
      assert.deepEqual(first,second);assert.equal(first.events.length,1);assert.equal(first.events[0].type,'OPENING_ISSUE');
      assert.equal(first.balances[0].units,300);
      assert.deepEqual((await admin.query(`SELECT state FROM "${schema}".demo_accounts WHERE id=$1`,[owner.id])).rows[0].state,old);
    });
    await t.test('inconsistencia de unidades aborta operaciones y no se repara silenciosamente',async()=>{
      const row=(await admin.query(`SELECT state FROM "${schema}".demo_mines WHERE id=$1`,[f.mine.id])).rows[0];
      const broken=structuredClone(row.state);broken.digitalUnits.balances[0].units++;
      await admin.query(`UPDATE "${schema}".demo_mines SET state=$2::jsonb WHERE id=$1`,[f.mine.id,JSON.stringify(broken)]);
      const before=(await admin.query(`SELECT id,state FROM "${schema}".demo_accounts WHERE mine_id=$1 ORDER BY id`,[f.mine.id])).rows;
      await assert.rejects(a.mutateAccount(f.b.id,command('sell',{metal:'XAU',grams:'0.100'})),{code:'INVALID_DIGITAL_UNITS'});
      await assert.rejects(b.getDigitalUnits(f.op.id),{code:'INVALID_DIGITAL_UNITS'});
      assert.deepEqual((await admin.query(`SELECT id,state FROM "${schema}".demo_accounts WHERE mine_id=$1 ORDER BY id`,[f.mine.id])).rows,before);
      assert.deepEqual((await admin.query(`SELECT state FROM "${schema}".demo_mines WHERE id=$1`,[f.mine.id])).rows[0].state,broken);
      await admin.query(`UPDATE "${schema}".demo_mines SET state=$2::jsonb WHERE id=$1`,[f.mine.id,JSON.stringify(row.state)]);
    });
    await t.test('fallo SQL después de preparar emisión revierte cuentas, certificados, unidades e historial',async()=>{
      const beforeMine=(await admin.query(`SELECT state FROM "${schema}".demo_mines WHERE id=$1`,[f.mine.id])).rows[0].state;
      const beforeAccount=(await admin.query(`SELECT state FROM "${schema}".demo_accounts WHERE id=$1`,[f.a.id])).rows[0].state;
      await admin.query(`CREATE FUNCTION "${schema}".reject_units_account_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'digital units rollback fixture'; END $$;
        CREATE TRIGGER reject_units_write BEFORE UPDATE OF state ON "${schema}".demo_accounts FOR EACH ROW EXECUTE FUNCTION "${schema}".reject_units_account_write();`);
      try{await assert.rejects(a.mutateAccount(f.a.id,command('buy',{metal:'XAG',grams:'0.100'})),/digital units rollback fixture/);}
      finally{await admin.query(`DROP TRIGGER reject_units_write ON "${schema}".demo_accounts`);}
      assert.deepEqual((await admin.query(`SELECT state FROM "${schema}".demo_mines WHERE id=$1`,[f.mine.id])).rows[0].state,beforeMine);
      assert.deepEqual((await admin.query(`SELECT state FROM "${schema}".demo_accounts WHERE id=$1`,[f.a.id])).rows[0].state,beforeAccount);
    });
    await t.test('importación legacy una vez: un titular digital; la sesión anterior no puede volver a emitir',async()=>{
      const legacy='digital-legacy-'+randomUUID();await a.mutate(legacy,command('buy',{metal:'XAG',grams:'0.100'}));
      const original=await a.get(legacy);
      const attempts=await Promise.allSettled(['a','b'].map((tag,i)=>(i?a:b).registerAccount({alias:'digital_import_'+tag,password:'Digital-import-test-pass-123',legacySessionId:legacy})));
      assert.equal(attempts.filter(item=>item.status==='fulfilled').length,1);
      const account=attempts.find(item=>item.status==='fulfilled').value.account;
      assert.equal((await a.getDigitalUnits(account.id)).balances.reduce((sum,item)=>sum+item.units,0),100);
      const old=await b.get(legacy);assert.equal(old.legacyReadOnly,true);delete old.legacyReadOnly;assert.deepEqual(old,original);
      await assert.rejects(b.mutate(legacy,command('buy',{metal:'XAG',grams:'0.100'})),{code:'LEGACY_CLAIMED'});
    });
  }finally{
    await Promise.allSettled([a?.close(),b?.close(),disabled?.close()]);
    try{await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);}finally{await admin.end();}
  }
});
