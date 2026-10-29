import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createStore} from '../src/store.js';
import {tokenHash} from '../src/account-auth.js';

const databaseUrl=process.env.TEST_DATABASE_URL,PASSWORD='Exclusive-profile-pg-password-123',NEXT='Exclusive-profile-pg-next-456';
test('PostgreSQL perfiles y recuperación: migración aditiva, claves, revocación y carreras de login',{
  skip:databaseUrl?false:'Falta TEST_DATABASE_URL; perfiles y recuperación PostgreSQL no se han probado',timeout:120000,
},async t=>{
  const {default:pg}=await import('pg'),schema=`om_profile_test_${randomUUID().replaceAll('-','')}`;
  const admin=new pg.Pool({connectionString:databaseUrl,max:1,connectionTimeoutMillis:8000});
  const scoped=new URL(databaseUrl);scoped.searchParams.set('options',`-c search_path=${schema}`);
  let a,b,buyer,operator,legacy,legacyBefore,stateBefore,sessionA,sessionB,setup,completed;
  try{
    await admin.query(`CREATE SCHEMA "${schema}"`);a=await createStore(scoped.toString());legacy=`profile-legacy-${randomUUID()}`;
    await a.mutate(legacy,{action:'buy',metal:'XAG',grams:'0.100',requestId:randomUUID()});legacyBefore=await a.get(legacy);
    sessionA=await a.registerAccount({alias:'pg_profile_buyer',password:PASSWORD,legacySessionId:legacy});buyer=sessionA.account;operator=await a.createAccount({alias:'pg_profile_operator',password:PASSWORD,role:'operator'});stateBefore=await a.getAccountState(buyer.id);
    await t.test('tablas nuevas se añaden a cuentas existentes sin reiniciar sus saldos/recibos/minas',async()=>{
      const rows=(await admin.query(`SELECT id,state FROM "${schema}".demo_accounts ORDER BY id`)).rows,mineRows=(await admin.query(`SELECT id,state FROM "${schema}".demo_mines ORDER BY id`)).rows;
      await admin.query(`DROP TABLE "${schema}".demo_account_profiles,"${schema}".demo_recovery_keys,"${schema}".demo_recovery_challenges,"${schema}".demo_recovery_attempts`);
      b=await createStore(scoped.toString());assert.deepEqual((await admin.query(`SELECT id,state FROM "${schema}".demo_accounts ORDER BY id`)).rows,rows);assert.deepEqual((await admin.query(`SELECT id,state FROM "${schema}".demo_mines ORDER BY id`)).rows,mineRows);
      assert.deepEqual(await b.getAccountState(buyer.id),stateBefore);assert.equal((await b.authenticate(sessionA.token)).account.id,buyer.id);
    });
    await t.test('perfiles whitelisted persisten entre pools para comprador y operador',async()=>{
      const profile={displayName:'Perfil ficticio PG',preferredCurrency:'COP',jurisdiction:'DEMO_INTERNATIONAL'};
      await a.updateProfile(buyer.id,profile);assert.deepEqual((await b.getProfile(buyer.id)).profile,profile);assert.deepEqual(await a.getAccountState(buyer.id),stateBefore);
      const opProfile=await b.updateProfile(operator.id,{...profile,displayName:'Operador ficticio PG'});assert.deepEqual(opProfile.recovery,{enabled:false,selfService:false});
      await assert.rejects(a.updateProfile(buyer.id,{...profile,password:PASSWORD}),{code:'INVALID_PROFILE'});await assert.rejects(b.setupRecovery(operator.id,PASSWORD),{code:'RECOVERY_DISABLED'});
      await a.close();a=await createStore(scoped.toString());assert.deepEqual((await a.getProfile(buyer.id)).profile,profile);
    });
    await t.test('reset revoca todas las sesiones y conserva historia/importación; solo persisten hashes',async()=>{
      sessionB=await b.loginAccount(buyer.alias,PASSWORD);setup=await a.setupRecovery(buyer.id,PASSWORD);const challenge=await b.startRecovery(buyer.alias,setup.recoveryKey);
      const key=(await admin.query(`SELECT key_hash FROM "${schema}".demo_recovery_keys WHERE account_id=$1`,[buyer.id])).rows[0].key_hash;assert.equal(key,tokenHash(setup.recoveryKey));assert.notEqual(key,setup.recoveryKey);
      const stored=(await admin.query(`SELECT token_hash FROM "${schema}".demo_recovery_challenges WHERE account_id=$1`,[buyer.id])).rows;assert.ok(stored.some(row=>row.token_hash===tokenHash(challenge.token)));assert.ok(stored.every(row=>row.token_hash!==challenge.token));
      const credentialsBefore=(await admin.query(`SELECT password_salt,password_hash FROM "${schema}".demo_accounts WHERE id=$1`,[buyer.id])).rows[0];completed=await a.completeRecovery(challenge.token,NEXT);
      const credentialsAfter=(await admin.query(`SELECT password_salt,password_hash FROM "${schema}".demo_accounts WHERE id=$1`,[buyer.id])).rows[0];assert.notEqual(credentialsAfter.password_salt,credentialsBefore.password_salt);assert.notEqual(credentialsAfter.password_hash,credentialsBefore.password_hash);assert.notEqual(credentialsAfter.password_hash,NEXT);
      for(const session of [sessionA,sessionB])await assert.rejects(b.authenticate(session.token),{status:401});await assert.rejects(b.loginAccount(buyer.alias,PASSWORD),{status:401});assert.equal((await b.loginAccount(buyer.alias,NEXT)).account.id,buyer.id);
      assert.deepEqual(await b.getAccountState(buyer.id),stateBefore);const archive=await a.get(legacy);assert.equal(archive.legacyReadOnly,true);delete archive.legacyReadOnly;assert.deepEqual(archive,legacyBefore);
      assert.equal((await admin.query(`SELECT count(*)::int AS count FROM "${schema}".demo_recovery_challenges WHERE account_id=$1`,[buyer.id])).rows[0].count,0);
      assert.equal((await a.getProfile(buyer.id)).recovery.enabled,true);
    });
    await t.test('token vencido/consumido y contraseña inválida no cambian credenciales ni perfil',async()=>{
      const challenge=await a.startRecovery(buyer.alias,completed.recoveryKey);await admin.query(`UPDATE "${schema}".demo_recovery_challenges SET expires_at=NOW()-INTERVAL '1 second' WHERE token_hash=$1`,[tokenHash(challenge.token)]);
      const credentials=(await admin.query(`SELECT password_salt,password_hash FROM "${schema}".demo_accounts WHERE id=$1`,[buyer.id])).rows[0],profile=await a.getProfile(buyer.id);
      await assert.rejects(b.completeRecovery(challenge.token,'Another-exclusive-password-789'),{code:'RECOVERY_INVALID'});assert.deepEqual((await admin.query(`SELECT password_salt,password_hash FROM "${schema}".demo_accounts WHERE id=$1`,[buyer.id])).rows[0],credentials);assert.deepEqual(await a.getProfile(buyer.id),profile);
      const fresh=await b.startRecovery(buyer.alias,completed.recoveryKey);await assert.rejects(a.completeRecovery(fresh.token,'short'),{code:'INVALID_PASSWORD'});assert.equal((await b.loginAccount(buyer.alias,NEXT)).account.id,buyer.id);
    });
    await t.test('login concurrente con reset nunca deja válida una sesión con la clave anterior',async()=>{
      const race=await a.createAccount({alias:'pg_profile_login_race',password:PASSWORD}),proof=await a.setupRecovery(race.id,PASSWORD),challenge=await b.startRecovery(race.alias,proof.recoveryKey);
      const results=await Promise.allSettled([a.loginAccount(race.alias,PASSWORD),b.completeRecovery(challenge.token,NEXT)]);assert.equal(results[1].status,'fulfilled');
      if(results[0].status==='fulfilled')await assert.rejects(b.authenticate(results[0].value.token),{status:401});else assert.equal(results[0].reason.status,401);
      await assert.rejects(a.loginAccount(race.alias,PASSWORD),{status:401});assert.equal((await a.loginAccount(race.alias,NEXT)).account.id,race.id);
    });
    await t.test('operador conserva credenciales públicas aunque exista un challenge administrativo ajeno',async()=>{
      const login=await a.loginAccount(operator.alias,PASSWORD),token='A'.repeat(43);
      await admin.query(`INSERT INTO "${schema}".demo_recovery_challenges(token_hash,account_id,expires_at) VALUES($1,$2,NOW()+INTERVAL '10 minutes')`,[tokenHash(token),operator.id]);
      await assert.rejects(b.completeRecovery(token,NEXT),{code:'RECOVERY_INVALID'});await assert.rejects(b.setupRecovery(operator.id,PASSWORD),{code:'RECOVERY_DISABLED'});assert.equal((await a.authenticate(login.token)).account.id,operator.id);assert.equal((await b.loginAccount(operator.alias,PASSWORD)).account.id,operator.id);
      assert.deepEqual((await a.getProfile(operator.id)).recovery,{enabled:false,selfService:false});
    });
  }finally{
    try{if(a)await a.close();if(b)await b.close();}
    finally{try{await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);}finally{await admin.end();}}
  }
});
