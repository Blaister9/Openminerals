import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createStore} from '../src/store.js';

const databaseUrl=process.env.TEST_DATABASE_URL,PASSWORD='Exclusive-custody-pg-demo-123';
test('PostgreSQL custodia DEMO: migración aditiva, lotes, concurrencia y rollback',{
  skip:databaseUrl?false:'Falta TEST_DATABASE_URL; custodia PostgreSQL no se ha probado',timeout:120000,
},async t=>{
  const {default:pg}=await import('pg');const schema=`om_custody_test_${randomUUID().replaceAll('-','')}`;
  const admin=new pg.Pool({connectionString:databaseUrl,max:1,connectionTimeoutMillis:8000});
  const scoped=new URL(databaseUrl);scoped.searchParams.set('options',`-c search_path=${schema}`);
  let a,b,mine,buyerA,buyerB,operator,migratedCertificate,login;
  try{
    await admin.query(`CREATE SCHEMA "${schema}"`);[a,b]=await Promise.all([createStore(scoped.toString()),createStore(scoped.toString())]);
    mine=await a.createMine({name:'Custodia PG aislada',initialInventoryMg:{XAU:1000,XAG:1000,XPT:1000,XPD:1000}});
    buyerA=await a.createAccount({alias:'custody_pg_a',password:PASSWORD,mineId:mine.id});buyerB=await b.createAccount({alias:'custody_pg_b',password:PASSWORD,mineId:mine.id});
    operator=await a.createAccount({alias:'custody_pg_op',password:PASSWORD,mineId:mine.id,role:'operator'});
    await a.mutateAccount(buyerA.id,{action:'buy',metal:'XAU',grams:'0.250',requestId:randomUUID()});
    await b.mutateAccount(buyerB.id,{action:'buy',metal:'XAU',grams:'0.250',requestId:randomUUID()});
    await t.test('mina preexistente migra una vez sin modificar cuentas, saldos ni recibos',async()=>{
      const before=(await admin.query(`SELECT id,state FROM "${schema}".demo_accounts ORDER BY id`)).rows;
      await admin.query(`UPDATE "${schema}".demo_mines SET state=state-'custody' WHERE id=$1`,[mine.id]);
      const [first,second]=await Promise.all([a.getCustody(operator.id,'operator'),b.getCustody(operator.id,'operator')]);
      assert.deepEqual(first,second);assert.equal(first.allocations.length,2);assert.equal(first.totals.XAU.allocatedMg,500);
      assert.deepEqual((await admin.query(`SELECT id,state FROM "${schema}".demo_accounts ORDER BY id`)).rows,before);
      const mineState=(await admin.query(`SELECT state FROM "${schema}".demo_mines WHERE id=$1`,[mine.id])).rows[0].state;
      assert.equal(mineState.custody.version,1);assert.equal(mineState.custody.certificates.length,2);
      migratedCertificate=first.allocations.find(item=>item.account.id===buyerA.id).certificateId;
    });
    await t.test('dos pools no sobreasignan capacidad y replay concurrente no duplica certificados',async()=>{
      const commands=[buyerA,buyerB].map(()=>({action:'buy',metal:'XAU',grams:'0.400',requestId:randomUUID()}));
      const outcomes=await Promise.allSettled([a.mutateAccount(buyerA.id,commands[0]),b.mutateAccount(buyerB.id,commands[1])]);
      assert.equal(outcomes.filter(item=>item.status==='fulfilled').length,1);assert.equal(outcomes.find(item=>item.status==='rejected').reason.code,'INSUFFICIENT_INVENTORY');
      const win=outcomes.findIndex(item=>item.status==='fulfilled'),winner=[buyerA,buyerB][win];
      const before=await a.getCustody(operator.id,'operator');
      const replays=await Promise.all([a.mutateAccount(winner.id,commands[win]),b.mutateAccount(winner.id,commands[win])]);
      assert.ok(replays.every(item=>item.receipt.replayed));assert.deepEqual(await b.getCustody(operator.id,'operator'),before);
      assert.equal(before.totals.XAU.allocatedMg,900);assert.equal(before.totals.XAU.availableMg,100);
      assert.ok(before.lots.every(lot=>lot.allocatedMg+lot.availableMg===lot.weightMg&&lot.availableMg>=0));
    });
    await t.test('stock documentado y venta se confirman atómicamente; metadatos distintos rechazan replay',async()=>{
      const stock={metal:'XAU',grams:'2.000',reason:'Ingreso PG ficticio',purityBps:9990,location:'Deposito ficticio PG',documents:[{title:'Documento PG DEMO',kind:'DEMO_RECORD',content:'Contenido exclusivamente simulado.'}],requestId:randomUUID()};
      const added=await a.mutateStock(operator.id,stock);assert.ok(added.receipt.lotId);
      const before=await a.getCustody(operator.id,'operator');
      await assert.rejects(b.mutateStock(operator.id,{...stock,purityBps:9999}));assert.deepEqual(await b.getCustody(operator.id,'operator'),before);
      const replay=await b.mutateStock(operator.id,stock);assert.equal(replay.receipt.replayed,true);
      await a.mutateAccount(buyerA.id,{action:'sell',metal:'XAU',grams:'0.100',requestId:randomUUID()});
      const certificate=await b.getCertificate(buyerA.id,migratedCertificate);assert.equal(certificate.issuedMg,250);assert.equal(certificate.allocatedMg,150);assert.equal(certificate.status,'PARTIALLY_RELEASED');
      await assert.rejects(b.getCertificate(buyerB.id,migratedCertificate),{status:404});
      const otherMine=await a.createMine({name:'Mina PG diferente'}),other=await b.createAccount({alias:'custody_pg_elsewhere',password:PASSWORD,mineId:otherMine.id,role:'operator'});
      await assert.rejects(b.getCertificate(other.id,migratedCertificate),{status:404});
      await assert.rejects(b.getCustody(buyerA.id,'operator'),{status:403});
      login=await a.loginAccount(buyerA.alias,PASSWORD);
      const own=await a.getCustody(buyerA.id);await a.close();a=await createStore(scoped.toString());
      assert.equal((await a.authenticate(login.token)).account.id,buyerA.id);assert.deepEqual(await a.getCustody(buyerA.id),own);
    });
    await t.test('importación concurrente conserva origen y asigna un único certificado',async()=>{
      const legacy=`custody-legacy-${randomUUID()}`;await a.mutate(legacy,{action:'buy',metal:'XAG',grams:'0.100',requestId:randomUUID()});
      const before=await a.get(legacy);
      const outcomes=await Promise.allSettled([a.registerAccount({alias:'custody_pg_import_a',password:PASSWORD,legacySessionId:legacy}),b.registerAccount({alias:'custody_pg_import_b',password:PASSWORD,legacySessionId:legacy})]);
      assert.equal(outcomes.filter(item=>item.status==='fulfilled').length,1);const winner=outcomes.find(item=>item.status==='fulfilled').value;
      const custody=await a.getCustody(winner.account.id);assert.equal(custody.allocations.length,1);assert.equal(custody.totals.XAG.allocatedMg,100);
      const archive=await b.get(legacy);assert.equal(archive.legacyReadOnly,true);delete archive.legacyReadOnly;assert.deepEqual(archive,before);
    });
    await t.test('migración fallida revierte y conserva JSONB de mina y cuenta sin reiniciarlos',async()=>{
      const brokenMine=await a.createMine({name:'Fixture migracion inconsistente',initialInventoryMg:{XAU:1000}});
      const broken=await a.createAccount({alias:'custody_pg_broken',password:PASSWORD,mineId:brokenMine.id});
      await a.mutateAccount(broken.id,{action:'buy',metal:'XAU',grams:'0.100',requestId:randomUUID()});
      await admin.query(`UPDATE "${schema}".demo_mines SET state=state-'custody' WHERE id=$1`,[brokenMine.id]);
      await admin.query(`UPDATE "${schema}".demo_accounts SET state=jsonb_set(state,'{holdingsMg,XAU}','200'::jsonb) WHERE id=$1`,[broken.id]);
      const beforeMine=(await admin.query(`SELECT state FROM "${schema}".demo_mines WHERE id=$1`,[brokenMine.id])).rows[0].state;
      const beforeAccount=(await admin.query(`SELECT state FROM "${schema}".demo_accounts WHERE id=$1`,[broken.id])).rows[0].state;
      await assert.rejects(a.getCustody(broken.id),{code:'INVALID_CUSTODY'});
      await assert.rejects(b.mutateAccount(broken.id,{action:'deposit',currency:'USD',amount:'1.00',requestId:randomUUID()}),{code:'INVALID_CUSTODY'});
      assert.deepEqual((await admin.query(`SELECT state FROM "${schema}".demo_mines WHERE id=$1`,[brokenMine.id])).rows[0].state,beforeMine);
      assert.deepEqual((await admin.query(`SELECT state FROM "${schema}".demo_accounts WHERE id=$1`,[broken.id])).rows[0].state,beforeAccount);
      assert.equal(Object.hasOwn(beforeMine,'custody'),false);
    });
  }finally{
    try{if(a)await a.close();if(b)await b.close();}
    finally{try{await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);}finally{await admin.end();}}
  }
});
