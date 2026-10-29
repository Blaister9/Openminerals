import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {createStore} from '../src/store.js';
import {createApiServer} from '../src/server.js';

const PASSWORD='Exclusive-profile-demo-password-123',NEXT='New-exclusive-demo-password-456';
const prefs={displayName:'Comprador ficticio Áureo',preferredCurrency:'EUR',jurisdiction:'DEMO_REGIONAL'};
const command=(action,body={})=>({action,...body,requestId:randomUUID()});

test('perfil: preferencias ficticias whitelist para ambos roles sin cambiar cuenta, mina o billetera',async()=>{
  const store=await createStore('');
  try{
    const buyer=await store.createAccount({alias:'1234567890123456789012345678901234567890',password:PASSWORD}),op=await store.createAccount({alias:'profile_operator',password:PASSWORD,role:'operator'});
    const before=await store.getAccountState(buyer.id),initial=await store.getProfile(buyer.id);assert.match(initial.profile.displayName,/^Demo /);assert.ok(initial.profile.displayName.length<=40);
    const profile=await store.updateProfile(buyer.id,prefs);assert.deepEqual(profile.profile,prefs);assert.deepEqual(profile.account,buyer);assert.deepEqual(profile.recovery,{enabled:false,selfService:true});
    const operator=await store.updateProfile(op.id,{...prefs,displayName:'Operador ficticio'});assert.deepEqual(operator.recovery,{enabled:false,selfService:false});assert.equal(operator.account.role,'operator');
    for(const invalid of [{...prefs,role:'operator'},{...prefs,mineId:'another'},{...prefs,walletMinor:{USDT:999}},{...prefs,alias:'new_alias'},{...prefs,displayName:'demo@example.com'},{...prefs,displayName:'300 123 4567'},{...prefs,preferredCurrency:'BTC'},{...prefs,jurisdiction:'REAL_COUNTRY'}])await assert.rejects(store.updateProfile(buyer.id,invalid),{code:'INVALID_PROFILE'});
    assert.deepEqual(await store.getAccountState(buyer.id),before);assert.deepEqual((await store.getProfile(buyer.id)).profile,prefs);
  }finally{await store.close();}
});

test('recuperación: cambio de clave revoca sesiones, conserva sesión legacy, saldos, recibos y preferencias',async()=>{
  const store=await createStore('');
  try{
    const legacy=`recovery-legacy-${randomUUID()}`;await store.mutate(legacy,command('buy',{metal:'XAG',grams:'1.000'}));const original=await store.get(legacy);
    const registered=await store.registerAccount({alias:'recovery_imported',password:PASSWORD,legacySessionId:legacy}),second=await store.loginAccount('recovery_imported',PASSWORD);
    await store.updateProfile(registered.account.id,prefs);const before=await store.getAccountState(registered.account.id);
    await assert.rejects(store.setupRecovery(registered.account.id,'Wrong-exclusive-password'),{status:403,code:'INVALID_RECOVERY_PROOF'});assert.equal((await store.authenticate(registered.token)).account.id,registered.account.id);
    const setup=await store.setupRecovery(registered.account.id,PASSWORD);assert.match(setup.recoveryKey,/^[A-Za-z0-9_-]{43}$/);assert.equal((await store.getProfile(registered.account.id)).recovery.enabled,true);
    const challenge=await store.startRecovery(' RECOVERY_IMPORTED ',setup.recoveryKey);assert.match(challenge.token,/^[A-Za-z0-9_-]{43}$/);assert.ok(Date.parse(challenge.expiresAt)>Date.now());
    const completed=await store.completeRecovery(challenge.token,NEXT);assert.equal(completed.ok,true);assert.equal(completed.sessionsRevoked,true);assert.notEqual(completed.recoveryKey,setup.recoveryKey);
    for(const session of [registered,second])await assert.rejects(store.authenticate(session.token),{status:401});await assert.rejects(store.loginAccount('recovery_imported',PASSWORD),{status:401});
    const login=await store.loginAccount('recovery_imported',NEXT);assert.equal(login.account.id,registered.account.id);assert.deepEqual(await store.getAccountState(login.account.id),before);assert.deepEqual((await store.getProfile(login.account.id)).profile,prefs);
    const archive=await store.get(legacy);assert.equal(archive.legacyReadOnly,true);delete archive.legacyReadOnly;assert.deepEqual(archive,original);
    await assert.rejects(store.completeRecovery(challenge.token,NEXT),{code:'RECOVERY_INVALID'});await assert.rejects(store.startRecovery('recovery_imported',setup.recoveryKey),{code:'RECOVERY_INVALID'});
    assert.ok((await store.startRecovery('recovery_imported',completed.recoveryKey)).token);
    for(const response of [await store.getProfile(login.account.id),await store.getAccountState(login.account.id),await store.authenticate(login.token)]){
      const serialized=JSON.stringify(response);for(const secret of [PASSWORD,NEXT,setup.recoveryKey,completed.recoveryKey,challenge.token])assert.equal(serialized.includes(secret),false);
    }
  }finally{await store.close();}
});

test('recuperación: intentos fallidos cuentan aunque la prueba se rechace',async()=>{
  const store=await createStore('');
  try{
    const buyer=await store.createAccount({alias:'recovery_limits',password:PASSWORD}),session=await store.loginAccount(buyer.alias,PASSWORD);
    for(let i=0;i<5;i++)await assert.rejects(store.setupRecovery(buyer.id,'Wrong-exclusive-password'),{code:'INVALID_RECOVERY_PROOF'});
    await assert.rejects(store.setupRecovery(buyer.id,PASSWORD),{status:429,code:'RECOVERY_RATE_LIMITED'});assert.equal((await store.getProfile(buyer.id)).recovery.enabled,false);assert.equal((await store.authenticate(session.token)).account.id,buyer.id);
    for(const alias of [buyer.alias,'missing_recovery_alias']){
      for(let i=0;i<5;i++)await assert.rejects(store.startRecovery(alias,'A'.repeat(43)),{status:401,code:'RECOVERY_INVALID'});
      await assert.rejects(store.startRecovery(alias,'A'.repeat(43)),{status:429,code:'RECOVERY_RATE_LIMITED'});
    }
  }finally{await store.close();}
});

test('recuperación HTTP: rutas explícitas, errores genéricos, claves no persistidas y operador protegido',async()=>{
  const store=await createStore(''),buyer=await store.createAccount({alias:'recovery_http_buyer',password:PASSWORD}),op=await store.createAccount({alias:'recovery_http_op',password:PASSWORD,role:'operator'}),server=createApiServer(store,{authRateLimit:{limit:100}});
  server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
  const request=async(path,{token,body}={})=>{const response=await fetch(base+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json(),cache:response.headers.get('cache-control')};};
  try{
    const buyerToken=(await store.loginAccount(buyer.alias,PASSWORD)).token,opToken=(await store.loginAccount(op.alias,PASSWORD)).token;
    assert.equal((await request('/api/demo/accounts/profile')).status,401);assert.equal((await request('/api/demo/accounts/profile',{token:opToken})).data.recovery.selfService,false);
    assert.equal((await request('/api/demo/accounts/profile',{token:buyerToken,body:{...prefs,role:'operator'}})).status,400);
    const wrong=await request('/api/demo/accounts/recovery/setup',{token:buyerToken,body:{password:'Wrong-exclusive-password'}});assert.equal(wrong.status,403);assert.equal(wrong.data.code,'INVALID_RECOVERY_PROOF');
    assert.equal((await request('/api/demo/accounts/me',{token:buyerToken})).status,200);
    const forbidden=await request('/api/demo/accounts/recovery/setup',{token:opToken,body:{password:PASSWORD}});assert.equal(forbidden.status,403);assert.equal(forbidden.data.code,'RECOVERY_DISABLED');
    const setup=await request('/api/demo/accounts/recovery/setup',{token:buyerToken,body:{password:PASSWORD}});assert.equal(setup.status,200);assert.equal(setup.cache,'no-store');
    const known=await request('/api/demo/accounts/recovery/start',{body:{alias:buyer.alias,recoveryKey:'X'.repeat(43)}}),unknown=await request('/api/demo/accounts/recovery/start',{body:{alias:'unknown_recovery_http',recoveryKey:'X'.repeat(43)}});assert.equal(known.status,unknown.status);assert.deepEqual(known.data,unknown.data);
    const challenge=await request('/api/demo/accounts/recovery/start',{body:{alias:buyer.alias,recoveryKey:setup.data.recoveryKey}});assert.equal(challenge.status,200);
    const badPassword=await request('/api/demo/accounts/recovery/complete',{body:{token:challenge.data.token,password:'short'}});assert.equal(badPassword.status,400);
    const completed=await request('/api/demo/accounts/recovery/complete',{body:{token:challenge.data.token,password:NEXT}});assert.equal(completed.status,200);assert.equal(completed.data.ok,true);assert.equal(completed.data.account,undefined);assert.equal(completed.data.token,undefined);
    assert.equal((await request('/api/demo/accounts/me',{token:buyerToken})).status,401);assert.equal((await request('/api/demo/accounts/me',{token:opToken})).status,200);
    const login=await request('/api/demo/accounts/login',{body:{alias:buyer.alias,password:NEXT}});assert.equal(login.status,200);assert.equal(login.data.recoveryKey,undefined);
    for(const path of ['/api/demo/accounts/profile','/api/demo/accounts/me','/api/demo/state']){const result=await request(path,{token:login.data.token});assert.equal(result.status,200);assert.equal(JSON.stringify(result.data).includes(completed.data.recoveryKey),false);}
  }finally{await new Promise(resolve=>server.close(resolve));await store.close();}
});
