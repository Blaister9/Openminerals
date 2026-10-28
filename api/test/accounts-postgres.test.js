import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createStore} from '../src/store.js';
import {tokenHash} from '../src/account-auth.js';

const databaseUrl=process.env.TEST_DATABASE_URL;
const PASSWORD='Exclusive-pg-demo-password-123';
test('PostgreSQL cuentas: inventario compartido, roles, importación y sesiones durables',{
  skip:databaseUrl?false:'Falta TEST_DATABASE_URL; cuentas PostgreSQL no se han probado',timeout:120_000,
},async t=>{
  const {default:pg}=await import('pg');
  const schema=`om_accounts_test_${randomUUID().replaceAll('-','')}`;
  assert.match(schema,/^om_accounts_test_[a-f0-9]{32}$/);
  const admin=new pg.Pool({connectionString:databaseUrl,max:1,connectionTimeoutMillis:8000});
  const scoped=new URL(databaseUrl);scoped.searchParams.set('options',`-c search_path=${schema}`);
  let a,b;
  try{
    await admin.query(`CREATE SCHEMA "${schema}"`);
    [a,b]=await Promise.all([createStore(scoped.toString()),createStore(scoped.toString())]);
    const mine=await a.createMine({name:'Mina concurrente PostgreSQL',initialInventoryMg:{XAU:1000}});
    const buyerA=await a.createAccount({alias:'pg_buyer_a',password:PASSWORD,mineId:mine.id});
    const buyerB=await b.createAccount({alias:'pg_buyer_b',password:PASSWORD,mineId:mine.id});
    const operator=await a.createAccount({alias:'pg_operator',password:PASSWORD,mineId:mine.id,role:'operator'});
    let winner,winnerCommand,firstReceipt;
    await t.test('dos pools de conexiones no venden más existencias de las compartidas',async()=>{
      const commands=[buyerA,buyerB].map(()=>({action:'buy',metal:'XAU',grams:'0.750',requestId:randomUUID()}));
      const outcomes=await Promise.allSettled([a.mutateAccount(buyerA.id,commands[0]),b.mutateAccount(buyerB.id,commands[1])]);
      assert.equal(outcomes.filter(item=>item.status==='fulfilled').length,1);
      assert.equal(outcomes.filter(item=>item.status==='rejected').length,1);
      assert.equal(outcomes.find(item=>item.status==='rejected').reason.code,'INSUFFICIENT_INVENTORY');
      const index=outcomes.findIndex(item=>item.status==='fulfilled');winner=[buyerA,buyerB][index];winnerCommand=commands[index];firstReceipt=outcomes[index].value.receipt;
      const summary=await a.getMineSummary(operator.id);
      assert.equal(summary.inventoryMg.XAU,250);assert.equal(summary.allocatedMg.XAU,750);assert.equal(summary.totalSupplyMg.XAU,1000);assert.equal(summary.transactionCount,1);assert.equal(summary.reconciled,true);
      assert.equal((await b.getAccountState(buyerA.id)).inventoryMg.XAU,250);
      assert.equal((await a.getAccountState(buyerB.id)).inventoryMg.XAU,250);
    });
    await t.test('replays concurrentes no consumen otra vez el inventario ni cambian el snapshot',async()=>{
      const outcomes=await Promise.all([a.mutateAccount(winner.id,winnerCommand),b.mutateAccount(winner.id,winnerCommand)]);
      for(const outcome of outcomes){assert.equal(outcome.changed,false);assert.deepEqual(outcome.receipt,{...firstReceipt,replayed:true});}
      assert.equal((await a.getMineSummary(operator.id)).inventoryMg.XAU,250);
      await assert.rejects(a.mutateAccount(winner.id,{...winnerCommand,grams:'0.100'}));
      assert.equal((await a.getMineSummary(operator.id)).transactionCount,1);
      const inspected=await b.getMineReceipt(operator.id,winner.id,firstReceipt.id);
      const {balancesAfter:privateSnapshot,...operatorExpected}=firstReceipt;
      assert.ok(privateSnapshot);assert.deepEqual(inspected,{...operatorExpected,operatorView:true});
      const other=winner.id===buyerA.id?buyerB:buyerA;
      await assert.rejects(a.getMineReceipt(operator.id,other.id,firstReceipt.id),{status:404});
      const privateReceipt=await a.mutateAccount(winner.id,{action:'deposit',currency:'USD',amount:'1.00',requestId:randomUUID()});
      await assert.rejects(b.getMineReceipt(operator.id,winner.id,privateReceipt.receipt.id),{status:404});
      assert.deepEqual((await b.getAccountState(winner.id)).receipts[firstReceipt.id],firstReceipt);
    });
    await t.test('ingreso de operador y recompra actualizan oferta compartida de forma atómica',async()=>{
      await assert.rejects(a.mutateStock(buyerA.id,{metal:'XAU',grams:'1.000',reason:'No autorizado',requestId:randomUUID()}),{status:403});
      await assert.rejects(a.mutateAccount(operator.id,{action:'buy',metal:'XAU',grams:'0.100',requestId:randomUUID()}),{status:403});
      await assert.rejects(a.getMineSummary(buyerA.id),{status:403});
      const stock={metal:'XAU',grams:'2.000',reason:'Ingreso ficticio PG',requestId:randomUUID()};
      const outcomes=await Promise.all([a.mutateStock(operator.id,stock),b.mutateStock(operator.id,stock)]);
      assert.equal(outcomes.filter(outcome=>outcome.changed).length,1);
      await b.mutateAccount(winner.id,{action:'sell',metal:'XAU',grams:'0.250',requestId:randomUUID()});
      const summary=await a.getMineSummary(operator.id);
      assert.equal(summary.inventoryMg.XAU,2500);assert.equal(summary.allocatedMg.XAU,500);assert.equal(summary.totalSupplyMg.XAU,3000);assert.equal(summary.reconciled,true);
    });
    await t.test('hashes de clave y token se conservan, sin guardar los secretos en texto plano',async()=>{
      const login=await a.loginAccount('pg_buyer_a',PASSWORD);
      const row=(await admin.query(`SELECT password_salt,password_hash FROM "${schema}".demo_accounts WHERE id=$1`,[buyerA.id])).rows[0];
      assert.match(row.password_salt,/^[a-f0-9]{32}$/);assert.match(row.password_hash,/^[a-f0-9]{64}$/);assert.notEqual(row.password_hash,PASSWORD);
      const stored=(await admin.query(`SELECT token_hash FROM "${schema}".demo_auth_sessions WHERE account_id=$1`,[buyerA.id])).rows;
      assert.ok(stored.some(item=>item.token_hash===tokenHash(login.token)));assert.ok(stored.every(item=>item.token_hash!==login.token));
      await a.close();a=await createStore(scoped.toString());
      assert.equal((await a.authenticate(login.token)).account.id,buyerA.id);
      assert.equal((await a.loginAccount('pg_buyer_a',PASSWORD)).account.id,buyerA.id);
      await a.logoutAccount(login.token);await assert.rejects(b.authenticate(login.token),{status:401});
      const expiring=await a.loginAccount('pg_buyer_b',PASSWORD);
      await admin.query(`UPDATE "${schema}".demo_auth_sessions SET expires_at=NOW()-INTERVAL '1 second' WHERE token_hash=$1`,[tokenHash(expiring.token)]);
      await assert.rejects(b.authenticate(expiring.token),{status:401});
    });
    await t.test('vinculación concurrente copia una sola vez y conserva recibos y sesión original',async()=>{
      const legacy=`legacy-${randomUUID()}`;
      const first=await a.mutate(legacy,{action:'buy',metal:'XAG',grams:'1.000',requestId:randomUUID()});
      const before=await a.get(legacy);
      const registrations=await Promise.allSettled([
        a.registerAccount({alias:'pg_import_a',password:PASSWORD,legacySessionId:legacy}),
        b.registerAccount({alias:'pg_import_b',password:PASSWORD,legacySessionId:legacy}),
      ]);
      assert.equal(registrations.filter(item=>item.status==='fulfilled').length,1);
      assert.equal(registrations.filter(item=>item.status==='rejected').length,1);
      const imported=registrations.find(item=>item.status==='fulfilled').value;
      const defaultOperator=await a.createAccount({alias:'pg_import_operator',password:PASSWORD,role:'operator'});
      await assert.rejects(b.getMineReceipt(defaultOperator.id,imported.account.id,first.receipt.id),{status:404});
      const state=await a.getAccountState(imported.account.id);
      assert.deepEqual(state.walletMinor,before.walletMinor);assert.deepEqual(state.holdingsMg,before.holdingsMg);assert.deepEqual(state.receipts,before.receipts);
      assert.deepEqual(state.receipts[first.receipt.id],first.receipt);
      const archived=await a.get(legacy);assert.equal(archived.legacyReadOnly,true);delete archived.legacyReadOnly;assert.deepEqual(archived,before);
      await assert.rejects(b.mutate(legacy,{action:'deposit',currency:'USDT',amount:'1.00',requestId:randomUUID()}),{code:'LEGACY_CLAIMED'});
      await assert.rejects(a.reset(legacy),{code:'LEGACY_CLAIMED'});
    });
    await t.test('un fallo de importación revierte la cuenta y no congela la sesión origen',async()=>{
      const legacy=`legacy-full-${randomUUID()}`;
      await a.mutate(legacy,{action:'buy',metal:'XAU',grams:'1.000',requestId:randomUUID()});
      const before=await a.get(legacy);
      // The default mine is separate from the isolated one above. Consume its
      // complete 200 g with a synthetic buyer so importing another gram fails.
      const exhaust=await a.createAccount({alias:'pg_exhaust_default',password:PASSWORD});
      await a.mutateAccount(exhaust.id,{action:'deposit',currency:'USDT',amount:'50000.00',requestId:randomUUID()});
      await a.mutateAccount(exhaust.id,{action:'buy',metal:'XAU',grams:'200.000',requestId:randomUUID()});
      await assert.rejects(a.registerAccount({alias:'pg_import_no_stock',password:PASSWORD,legacySessionId:legacy}),{code:'INSUFFICIENT_INVENTORY'});
      assert.deepEqual(await b.get(legacy),before);
      await assert.rejects(a.loginAccount('pg_import_no_stock',PASSWORD),{status:401});
      await a.mutate(legacy,{action:'deposit',currency:'USD',amount:'1.00',requestId:randomUUID()});
    });
  }finally{
    try{if(a)await a.close();if(b)await b.close();}
    finally{try{await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);}finally{await admin.end();}}
  }
});
