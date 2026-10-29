// Recovery secrets are synthetic and never included in assertion diagnostics.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {createStore} from '../src/store.js';
import {createApiServer} from '../src/server.js';

const INITIAL_PASSWORD='Adversarial-only-initial-password-123';
const RESET_PASSWORD_A='Adversarial-only-reset-password-a-123';
const RESET_PASSWORD_B='Adversarial-only-reset-password-b-123';
const recovery='/api/demo/accounts/recovery/';
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'
  ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const digest=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const secret=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
const fixed=(condition,message)=>assert.ok(condition,message);

async function serve(store){
  // The durable recovery limiter remains enabled. A high login limit keeps
  // unrelated process-local authentication throttling out of these scenarios.
  const server=createApiServer(store,{authRateLimit:{limit:1000}});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  return {
    async call(path,{token,legacy,body,key,method}={}){
      const response=await fetch(base+path,{
        method:method||(body===undefined?'GET':'POST'),signal:AbortSignal.timeout(20_000),
        headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{ }),...(legacy?{'x-demo-session':legacy}:{ }),...(key?{'Idempotency-Key':key}:{ })},
        body:body===undefined?undefined:JSON.stringify(body),
      });
      return {status:response.status,data:await response.json()};
    },
    async close(){await new Promise(resolve=>server.close(resolve));},
  };
}
async function success(endpoint,path,options){
  const result=await endpoint.call(path,options);
  assert.equal(result.status,200,'Expected successful synthetic recovery operation.');
  return result.data;
}
async function login(endpoint,alias,password){return success(endpoint,'/api/demo/accounts/login',{body:{alias,password}});}
async function setup(endpoint,token,password=INITIAL_PASSWORD){
  const result=await success(endpoint,recovery+'setup',{token,body:{password}});
  fixed(secret(result.recoveryKey),'Recovery setup must return a 32-byte synthetic secret.');
  return result.recoveryKey;
}
async function start(endpoint,alias,recoveryKey){
  const before=Date.now(),result=await success(endpoint,recovery+'start',{body:{alias,recoveryKey}});
  fixed(secret(result.token),'Recovery challenge must be a 32-byte synthetic token.');
  fixed(Date.parse(result.expiresAt)>before+590_000&&Date.parse(result.expiresAt)<=Date.now()+610_000,'Recovery challenge must expire after ten minutes.');
  fixed(Object.keys(result).every(key=>['token','expiresAt','demoOnly'].includes(key)),'Recovery challenge exposed extra account fields.');
  return result;
}
function noSecrets(value,values,message){
  const serialized=JSON.stringify(value);
  fixed(values.filter(Boolean).every(value=>!serialized.includes(value)),message);
}
async function makeBuyer(store,alias){return store.registerAccount({alias,password:INITIAL_PASSWORD});}

test('recuperación adversarial: respuesta perdida conserva legado, perfil, mina y replay de compra pendiente',async()=>{
  const store=await createStore(''),endpoint=await serve(store);
  try{
    const legacy=`recovery-legacy-${randomUUID()}`;
    await store.mutate(legacy,{action:'buy',metal:'XAG',grams:'0.100',requestId:randomUUID()});
    const buyer=await store.registerAccount({alias:'recovery_lost_response',password:INITIAL_PASSWORD,legacySessionId:legacy});
    const operator=await store.createAccount({alias:'recovery_snapshot_operator',password:INITIAL_PASSWORD,role:'operator',mineId:buyer.account.mineId});
    await success(endpoint,'/api/demo/accounts/profile',{token:buyer.token,body:{displayName:'Buyer DEMO adversarial',preferredCurrency:'EUR',jurisdiction:'DEMO_REGIONAL'}});
    const pending={metal:'XAU',grams:'0.100'},pendingKey=randomUUID();
    const purchase=await success(endpoint,'/api/demo/buy',{token:buyer.token,body:pending,key:pendingKey});
    // The operation was committed, while the client's original key remains pending.
    const recoveryKey=await setup(endpoint,buyer.token),challenge=await start(endpoint,buyer.account.alias,recoveryKey);
    const snapshot=async()=>({state:await store.getAccountState(buyer.account.id),legacy:await store.get(legacy),profile:(await store.getProfile(buyer.account.id)).profile,mine:await store.getMineSummary(operator.id),custody:await store.getCustody(operator.id,'operator')});
    const before=await snapshot();
    let lostResponse;
    await assert.rejects(async()=>{
      lostResponse=await success(endpoint,recovery+'complete',{body:{token:challenge.token,password:RESET_PASSWORD_A}});
      throw new Error('Synthetic network loss after committed password reset');
    },/Synthetic network loss/);
    fixed(lostResponse.ok===true&&lostResponse.sessionsRevoked===true&&secret(lostResponse.recoveryKey),'Reset completion must rotate the recovery key and revoke sessions.');
    fixed(Object.keys(lostResponse).every(key=>['ok','recoveryKey','sessionsRevoked','demoOnly'].includes(key)),'Reset returned an authentication result or private account fields.');
    noSecrets(lostResponse,[INITIAL_PASSWORD,RESET_PASSWORD_A,recoveryKey,challenge.token,buyer.token],'Reset response exposed an old secret or a password.');
    assert.equal((await endpoint.call('/api/demo/accounts/me',{token:buyer.token})).status,401,'Old authentication remained valid after reset.');
    const retry=await endpoint.call(recovery+'complete',{body:{token:challenge.token,password:RESET_PASSWORD_B}});
    assert.equal(retry.status,401,'A consumed reset challenge was accepted a second time.');
    noSecrets(retry.data,[lostResponse.recoveryKey,recoveryKey,challenge.token,RESET_PASSWORD_A,RESET_PASSWORD_B],'Rejected reset response exposed a recovery secret.');
    fixed(digest(await snapshot())===digest(before),'Reset or its rejected retry changed wallet, profile, legacy history, mine or custody.');
    const logged=await login(endpoint,buyer.account.alias,RESET_PASSWORD_A);
    fixed(logged.account.id===buyer.account.id,'New-password login changed the original account identity.');
    const replay=await success(endpoint,'/api/demo/buy',{token:logged.token,body:pending,key:pendingKey});
    const {replayed,...original}=replay.receipt;
    fixed(replayed===true&&digest(original)===digest(purchase.receipt),'Pending trade was duplicated or its original receipt changed after reset.');
    fixed(digest(await snapshot())===digest(before),'Resolving the original pending trade changed persisted state.');
    assert.equal((await endpoint.call(recovery+'start',{body:{alias:buyer.account.alias,recoveryKey}})).status,401,'Old recovery key survived reset.');
    // A user who lost the rotation response can log in with their chosen new
    // password and explicitly obtain another key, without repeating the reset.
    const replacement=await setup(endpoint,logged.token,RESET_PASSWORD_A);
    fixed(replacement!==lostResponse.recoveryKey,'Authenticated re-enrollment did not rotate the recovery key.');
    fixed(digest(await snapshot())===digest(before),'Recovery re-enrollment modified business/demo state.');
  }finally{await endpoint.close();await store.close();}
});

test('recuperación adversarial PostgreSQL: intentos durables, doble consumo y carreras de reautenticación',{
  skip:process.env.TEST_DATABASE_URL?false:'Falta TEST_DATABASE_URL; adversariales PostgreSQL no ejecutados',timeout:180_000,
},async t=>{
  const {default:pg}=await import('pg');
  const databaseUrl=process.env.TEST_DATABASE_URL,schema=`om_recovery_adversarial_${randomUUID().replaceAll('-','')}`;
  const admin=new pg.Pool({connectionString:databaseUrl,max:1,connectionTimeoutMillis:8000});
  const scoped=new URL(databaseUrl);scoped.searchParams.set('options',`-c search_path=${schema}`);
  let stores=[],endpoints=[];
  const open=async()=>{
    stores=await Promise.all([createStore(scoped.toString()),createStore(scoped.toString())]);
    endpoints=await Promise.all(stores.map(serve));
  };
  const close=async()=>{
    await Promise.all(endpoints.map(endpoint=>endpoint.close()));endpoints=[];
    await Promise.all(stores.map(store=>store.close()));stores=[];
  };
  const attemptCounts=async()=>(await admin.query(`SELECT count FROM "${schema}".demo_recovery_attempts ORDER BY count`)).rows.map(row=>Number(row.count));
  try{
    await admin.query(`CREATE SCHEMA "${schema}"`);await open();
    await t.test('errores de alias existente e inexistente confirman contadores entre pools y reinicio',async()=>{
      const buyer=await makeBuyer(stores[0],'adversarial_durable_buyer'),recoveryKey=await setup(endpoints[0],buyer.token);
      const missingAlias='adversarial_missing_alias',wrongKey='Z'.repeat(43);
      const initial=(await attemptCounts()).reduce((sum,value)=>sum+value,0);
      let knownError,missingError;
      for(let i=0;i<3;i++){
        knownError=await endpoints[i%2].call(recovery+'start',{body:{alias:buyer.account.alias,recoveryKey:wrongKey}});
        missingError=await endpoints[(i+1)%2].call(recovery+'start',{body:{alias:missingAlias,recoveryKey:wrongKey}});
        assert.equal(knownError.status,401);assert.equal(missingError.status,401);
        fixed(digest(knownError.data)===digest(missingError.data),'Recovery errors reveal whether an alias exists.');
      }
      const before=await attemptCounts();
      fixed(before.reduce((sum,value)=>sum+value,0)===initial+6,'Failed recovery requests rolled back their attempt counters.');
      await close();await open();
      fixed(digest(await attemptCounts())===digest(before),'Attempt counters did not survive store/server restart.');
      for(let i=0;i<2;i++)for(const alias of [buyer.account.alias,missingAlias]){
        const result=await endpoints[i%2].call(recovery+'start',{body:{alias,recoveryKey:wrongKey}});
        assert.equal(result.status,401,'The first five invalid proofs must have the same generic response.');
      }
      for(const alias of [buyer.account.alias,missingAlias]){
        const result=await endpoints[1].call(recovery+'start',{body:{alias,recoveryKey:wrongKey}});
        assert.equal(result.status,429,'A second process bypassed the durable attempt limit.');
      }
      fixed((await attemptCounts()).filter(count=>count>=5).length>=2,'Existing and nonexistent aliases did not both retain their limits.');
      await admin.query(`UPDATE "${schema}".demo_recovery_attempts SET reset_at=NOW()-INTERVAL '1 second'`);
      const challenge=await start(endpoints[0],buyer.account.alias,recoveryKey);
      const keyRows=(await admin.query(`SELECT account_id,key_hash FROM "${schema}".demo_recovery_keys`)).rows;
      const challengeRows=(await admin.query(`SELECT account_id,token_hash,expires_at FROM "${schema}".demo_recovery_challenges`)).rows;
      fixed(keyRows.every(row=>/^[a-f0-9]{64}$/.test(row.key_hash))&&challengeRows.every(row=>/^[a-f0-9]{64}$/.test(row.token_hash)),'Recovery secrets were not stored as hashes.');
      noSecrets({keyRows,challengeRows},[recoveryKey,challenge.token,INITIAL_PASSWORD],'A raw recovery key, challenge or password reached PostgreSQL records.');
    });

    await t.test('dos pools consumen un challenge una vez, purgan otros challenges y revocan todas las sesiones propias',async()=>{
      const buyer=await makeBuyer(stores[0],'adversarial_concurrent_buyer'),other=await makeBuyer(stores[1],'adversarial_unrelated_buyer');
      const secondLogin=await login(endpoints[1],buyer.account.alias,INITIAL_PASSWORD);
      const pendingKey=randomUUID(),body={metal:'XAU',grams:'0.100'};
      const purchase=await success(endpoints[0],'/api/demo/buy',{token:buyer.token,body,key:pendingKey});
      const recoveryKey=await setup(endpoints[0],buyer.token);
      const first=await start(endpoints[0],buyer.account.alias,recoveryKey),otherChallenge=await start(endpoints[1],buyer.account.alias,recoveryKey);
      const before=await stores[0].getAccountState(buyer.account.id),otherBefore=await stores[1].getAccountState(other.account.id);
      const outcomes=await Promise.all([RESET_PASSWORD_A,RESET_PASSWORD_B].map((password,index)=>endpoints[index].call(recovery+'complete',{body:{token:first.token,password}})));
      fixed(outcomes.filter(result=>result.status===200).length===1&&outcomes.filter(result=>result.status===401).length===1,'Concurrent resets did not consume the challenge exactly once.');
      const winner=outcomes.findIndex(result=>result.status===200),newPassword=[RESET_PASSWORD_A,RESET_PASSWORD_B][winner],completed=outcomes[winner].data;
      fixed(secret(completed.recoveryKey)&&completed.sessionsRevoked===true&&!Object.hasOwn(completed,'token'),'Reset returned an invalid rotation result or automatic login token.');
      assert.equal((await endpoints[0].call(recovery+'complete',{body:{token:otherChallenge.token,password:INITIAL_PASSWORD}})).status,401,'Reset failed to invalidate the account\'s other challenges.');
      for(const token of [buyer.token,secondLogin.token])assert.equal((await endpoints[1].call('/api/demo/accounts/me',{token})).status,401,'An old account session survived reset.');
      assert.equal((await endpoints[0].call('/api/demo/accounts/me',{token:other.token})).status,200,'Reset revoked another account\'s session.');
      fixed(digest(await stores[0].getAccountState(buyer.account.id))===digest(before)&&digest(await stores[1].getAccountState(other.account.id))===digest(otherBefore),'Concurrent reset changed buyer or unrelated demo state.');
      const logged=await login(endpoints[1],buyer.account.alias,newPassword);
      const replay=await success(endpoints[1],'/api/demo/buy',{token:logged.token,body,key:pendingKey});
      const {replayed,...receipt}=replay.receipt;
      fixed(replayed===true&&digest(receipt)===digest(purchase.receipt),'Pending purchase replay changed after concurrent recovery.');
      const keys=(await admin.query(`SELECT key_hash FROM "${schema}".demo_recovery_keys WHERE account_id=$1`,[buyer.account.id])).rows;
      const challenges=(await admin.query(`SELECT token_hash FROM "${schema}".demo_recovery_challenges WHERE account_id=$1`,[buyer.account.id])).rows;
      fixed(keys.length===1&&challenges.length===0,'Reset left multiple keys or active challenges.');
      noSecrets({keys,challenges},[completed.recoveryKey,recoveryKey,first.token,otherChallenge.token,newPassword],'Reset persisted a raw synthetic secret.');
    });

    await t.test('rotar recovery key y completar challenge antiguo en carrera no pueden triunfar ambos',async()=>{
      const buyer=await makeBuyer(stores[0],'adversarial_setup_reset_race'),key=await setup(endpoints[0],buyer.token),challenge=await start(endpoints[1],buyer.account.alias,key);
      const before=await stores[0].getAccountState(buyer.account.id);
      const outcomes=await Promise.all([
        endpoints[0].call(recovery+'setup',{token:buyer.token,body:{password:INITIAL_PASSWORD}}),
        endpoints[1].call(recovery+'complete',{body:{token:challenge.token,password:RESET_PASSWORD_A}}),
      ]);
      fixed(outcomes.filter(result=>result.status===200).length===1,'A recovery-key rotation and reset with its stale challenge both succeeded.');
      fixed(outcomes.every(result=>[200,401,403].includes(result.status)),'The setup/reset race caused an internal failure.');
      const resetWon=outcomes[1].status===200;
      const logged=await login(endpoints[0],buyer.account.alias,resetWon?RESET_PASSWORD_A:INITIAL_PASSWORD);
      fixed(logged.account.id===buyer.account.id,'The race changed the account identity or selected password.');
      if(resetWon){
        const oldProof=await endpoints[0].call(recovery+'setup',{token:logged.token,body:{password:INITIAL_PASSWORD}});
        assert.equal(oldProof.status,403,'Setup accepted the old password after recovery won.');
      }else{
        const stale=await endpoints[1].call(recovery+'complete',{body:{token:challenge.token,password:RESET_PASSWORD_B}});
        assert.equal(stale.status,401,'Authenticated recovery-key rotation did not invalidate old challenges.');
      }
      fixed(digest(await stores[0].getAccountState(buyer.account.id))===digest(before),'The setup/reset race modified holdings, wallet or receipts.');
    });
  }finally{
    try{await close();}finally{try{await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);}finally{await admin.end();}}
  }
});
