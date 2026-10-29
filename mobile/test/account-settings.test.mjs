import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {createAccountClient,accountAuthStorageKey,validateDemoProfile} from '../lib/account-client.ts';
import {RequestError} from '../lib/demo-client.ts';
import {createStore} from '../../api/src/store.js';
import {createApiServer} from '../../api/src/server.js';

const PASSWORD='Exclusive-settings-demo-password-123',NEW_PASSWORD='New-exclusive-demo-password-456';
function storage(){const data=new Map(),writes=[];return {data,writes,async getItem(key){return data.get(key)??null;},async setItem(key,value){writes.push({key,value});data.set(key,value);},async removeItem(key){data.delete(key);}};}
function defer(){let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};}
async function fixture(){
  const store=await createStore(''),server=createApiServer(store,{authRateLimit:{limit:200}});server.listen(0,'127.0.0.1');await once(server,'listening');
  const api=`http://127.0.0.1:${server.address().port}`,mine=await store.createMine({name:'Mina DEMO cuentas móviles'}),buyer=await store.createAccount({alias:'settings_buyer_demo',password:PASSWORD,mineId:mine.id});
  const data=storage(),auth=storage(),calls=[];let loseBuy=false,loseComplete=false,decorateAuth=false,gateStart,gateComplete;
  const options={api,storage:data,authStorage:auth,uuid:randomUUID,fetchImpl:async(url,init)=>{
    calls.push({path:url.slice(api.length),headers:{...init.headers},body:init.body?JSON.parse(init.body):undefined});
    const response=await fetch(url,init);
    if(loseBuy&&url.endsWith('/buy')){loseBuy=false;assert.equal(response.status,200);await response.json();throw new TypeError('Lost committed buy response');}
    if(loseComplete&&url.endsWith('/recovery/complete')){loseComplete=false;assert.equal(response.status,200);await response.json();throw new TypeError('Lost committed recovery response');}
    if(gateStart&&url.endsWith('/recovery/start')){const data=await response.json();gateStart.entered.resolve();await gateStart.release.promise;return new Response(JSON.stringify(data),{status:response.status});}
    if(gateComplete&&url.endsWith('/recovery/complete')){const data=await response.json();gateComplete.entered.resolve();await gateComplete.release.promise;return new Response(JSON.stringify(data),{status:response.status});}
    if(decorateAuth&&url.endsWith('/accounts/login')){const body=await response.json();return new Response(JSON.stringify({...body,password:'response-password-must-not-save',recoveryKey:'response-key-must-not-save',profile:{displayName:'profile-must-not-save'},account:{...body.account,recoveryKey:'nested-key-must-not-save'},mine:{...body.mine,databaseUrl:'database-must-not-save'}}),{status:response.status});}
    return response;
  }};
  return {store,server,api,mine,buyer,data,auth,calls,options,client:createAccountClient(options),loseBuy(){loseBuy=true;},loseComplete(){loseComplete=true;},decorateAuth(){decorateAuth=true;},gateStart(){gateStart={entered:defer(),release:defer()};return gateStart;},gateComplete(){gateComplete={entered:defer(),release:defer()};return gateComplete;},async close(){await new Promise(resolve=>server.close(resolve));await store.close();}};
}
async function login(f){return f.client.login('settings_buyer_demo',PASSWORD);}
function assertNeverStored(f,secrets){const writes=JSON.stringify([...f.data.writes,...f.auth.writes]);for(const secret of secrets)assert.equal(writes.includes(secret),false,'A secret was persisted');}

test('auth persistence uses an explicit allowlist including account and mine objects',async()=>{
  const f=await fixture();try{
    f.decorateAuth();await login(f);const saved=JSON.parse(f.auth.data.get(accountAuthStorageKey(f.api)));
    assert.deepEqual(Object.keys(saved).sort(),['account','api','demoOnly','expiresAt','mine','token','version']);
    assert.deepEqual(Object.keys(saved.account).sort(),['alias','id','mineId','role']);assert.deepEqual(Object.keys(saved.mine).sort(),['id','name']);
    assertNeverStored(f,['response-password-must-not-save','response-key-must-not-save','nested-key-must-not-save','database-must-not-save','profile-must-not-save',PASSWORD]);
    const restored=createAccountClient(f.options);await restored.initialize();assert.equal('recoveryKey' in restored.getAccount(),false);
  }finally{await f.close();}
});

test('profile reads and saves fictitious preferences without modifying identity, balances or durable queue',async()=>{
  const f=await fixture();try{
    await login(f);const before=await f.store.getAccountState(f.buyer.id),profile=await f.client.getProfile();assert.equal(profile.recovery.enabled,false);assert.equal(profile.recovery.selfService,true);
    const result=await f.client.updateProfile({displayName:' Mina ficticia Ω ',preferredCurrency:'EUR',jurisdiction:'DEMO_REGIONAL',role:'operator',password:'must-not-send'});
    assert.deepEqual(result.profile,{displayName:'Mina ficticia Ω',preferredCurrency:'EUR',jurisdiction:'DEMO_REGIONAL'});assert.equal(result.account.id,f.buyer.id);assert.equal(result.account.role,'buyer');
    assert.deepEqual((await f.store.getAccountState(f.buyer.id)).walletMinor,before.walletMinor);assert.equal(f.client.getPending(),null);
    const call=f.calls.find(call=>call.path==='/api/demo/accounts/profile'&&call.body);assert.deepEqual(Object.keys(call.body).sort(),['displayName','jurisdiction','preferredCurrency']);assert.ok(call.headers.Authorization);assert.equal('Idempotency-Key' in call.headers,false);
    assertNeverStored(f,['Mina ficticia Ω','must-not-send']);
  }finally{await f.close();}
});

test('profile rejects personal contact formats and invalid preference fields locally',()=>{
  const base={displayName:'Nombre DEMO',preferredCurrency:'USDT',jurisdiction:'DEMO_LOCAL'};
  for(const change of [{displayName:'demo@example.test'},{displayName:'https://example.test'},{displayName:'3001234567'},{displayName:'ab'},{preferredCurrency:'BTC'},{jurisdiction:'REAL_COUNTRY'}])assert.throws(()=>validateDemoProfile({...base,...change}));
  assert.deepEqual(validateDemoProfile(base),base);
});

test('operator may edit fictitious profile but recovery setup is blocked before sending a request',async()=>{
  const f=await fixture();try{
    await f.store.createAccount({alias:'settings_operator_demo',password:PASSWORD,role:'operator',mineId:f.mine.id});await f.client.login('settings_operator_demo',PASSWORD);
    const profile=await f.client.getProfile();assert.deepEqual(profile.recovery,{enabled:false,selfService:false});
    assert.equal((await f.client.updateProfile({displayName:'Operador ficticio',preferredCurrency:'COP',jurisdiction:'DEMO_LOCAL'})).profile.preferredCurrency,'COP');
    const calls=f.calls.length;await assert.rejects(f.client.setupRecovery(PASSWORD),/administra por separado/);assert.equal(f.calls.length,calls);
  }finally{await f.close();}
});

test('wrong setup proof (403) and invalid recovery proof (401) do not expire a valid bearer',async()=>{
  const f=await fixture();try{
    await login(f);await assert.rejects(f.client.setupRecovery('Incorrect-demo-password-123'),error=>error instanceof RequestError&&error.status===403);
    assert.equal((await f.client.initialize()).authExpired,false);assert.equal((await f.client.get('/api/demo/state')).account.id,f.buyer.id);
    await assert.rejects(f.client.startRecovery('settings_buyer_demo','Z'.repeat(43)),error=>error instanceof RequestError&&error.status===401);
    assert.equal((await f.client.initialize()).authExpired,false);assert.equal((await f.client.get('/api/demo/state')).account.id,f.buyer.id);
  }finally{await f.close();}
});

test('recovery credentials and temporary token exist only in RAM; completion rotates key and revokes sessions',async()=>{
  const f=await fixture();try{
    await login(f);const second=createAccountClient({...f.options,authStorage:storage(),storage:storage()});await second.login('settings_buyer_demo',PASSWORD);
    const setup=await f.client.setupRecovery(PASSWORD);assert.match(setup.recoveryKey,/^[A-Za-z0-9_-]{43}$/);assert.equal((await f.client.getProfile()).recovery.enabled,true);
    const challenge=await f.client.startRecovery(' settings_buyer_demo ',setup.recoveryKey);assert.deepEqual(Object.keys(challenge).sort(),['alias','demoOnly','expiresAt']);assert.ok(Date.parse(challenge.expiresAt)>Date.now()+590000);
    await assert.rejects(f.client.submit('deposit',{currency:'USD',amount:'1'},'Ingresar'),/recuperación/);
    const result=await f.client.completeRecovery(NEW_PASSWORD),token=f.calls.find(call=>call.path.endsWith('/recovery/complete')).body.token;
    assert.equal(result.sessionsRevoked,true);assert.notEqual(result.recoveryKey,setup.recoveryKey);assert.equal((await f.client.initialize()).authExpired,true);
    await assert.rejects(second.get('/api/demo/state'),error=>error instanceof RequestError&&error.status===401);
    const calls=f.calls.length;await assert.rejects(f.client.completeRecovery(NEW_PASSWORD),/venció o se cerró/);assert.equal(f.calls.length,calls);
    await assert.rejects(f.client.login('settings_buyer_demo',PASSWORD),error=>error instanceof RequestError&&error.status===401);
    await f.client.login('settings_buyer_demo',NEW_PASSWORD);assert.equal((await f.client.initialize()).authExpired,false);
    assertNeverStored(f,[PASSWORD,NEW_PASSWORD,setup.recoveryKey,result.recoveryKey,token]);assert.equal(f.client.getPending(),null);
  }finally{await f.close();}
});

test('pending command blocks profile/setup and another recovery alias before HTTP; same expired alias recovers without losing replay',async()=>{
  const f=await fixture();try{
    await login(f);const setup=await f.client.setupRecovery(PASSWORD);f.loseBuy();await assert.rejects(f.client.submit('buy',{metal:'XAU',grams:'0.1'},'Compra pendiente'));
    const pending=structuredClone(f.client.getPending()),calls=f.calls.length;
    await assert.rejects(f.client.updateProfile({displayName:'Demo nuevo',preferredCurrency:'USDT',jurisdiction:'DEMO_LOCAL'}),/pendiente/);
    await assert.rejects(f.client.setupRecovery(PASSWORD),/pendiente/);await assert.rejects(f.client.startRecovery('other_demo_alias',setup.recoveryKey),/pendiente/);
    await assert.rejects(f.client.startRecovery('settings_buyer_demo',setup.recoveryKey),/pendiente/);assert.equal(f.calls.length,calls);
    const auth=JSON.parse(f.auth.data.get(accountAuthStorageKey(f.api)));await f.store.logoutAccount(auth.token);
    const restarted=createAccountClient(f.options);assert.equal((await restarted.initialize()).authExpired,true);
    await restarted.startRecovery('settings_buyer_demo',setup.recoveryKey);assert.deepEqual(restarted.getPending(),pending);assert.equal(restarted.getAccount().id,f.buyer.id);
    await restarted.completeRecovery(NEW_PASSWORD);assert.equal(restarted.getAccount().id,f.buyer.id);
    assert.deepEqual(restarted.getPending(),pending);await assert.rejects(restarted.logout(),/pendiente/);
    await restarted.login('settings_buyer_demo',NEW_PASSWORD);assert.deepEqual(restarted.getPending(),pending);
    const replay=await restarted.retry();assert.equal(replay.receipt.replayed,true);assert.equal(replay.receipt.id,pending.requestId);assert.equal(restarted.getPending(),null);
    assert.equal((await f.store.getAccountState(f.buyer.id)).movements.filter(move=>move.type==='BUY').length,1);
    assertNeverStored(f,[PASSWORD,NEW_PASSWORD,setup.recoveryKey]);
  }finally{await f.close();}
});

test('a cancelled recovery never retains a late temporary token or permits completion',async()=>{
  const f=await fixture();try{
    await login(f);const setup=await f.client.setupRecovery(PASSWORD),gate=f.gateStart();const start=f.client.startRecovery('settings_buyer_demo',setup.recoveryKey);
    await gate.entered.promise;f.client.cancelRecovery();gate.release.resolve();await assert.rejects(start,/cerró/);
    const calls=f.calls.length;await assert.rejects(f.client.completeRecovery(NEW_PASSWORD),/venció o se cerró/);assert.equal(f.calls.length,calls);
    assert.equal((await f.client.initialize()).authExpired,false);assertNeverStored(f,[setup.recoveryKey]);
  }finally{await f.close();}
});

test('closing during committed recovery discards the returned key and requires the new password login',async()=>{
  const f=await fixture();try{
    await login(f);const setup=await f.client.setupRecovery(PASSWORD);await f.client.startRecovery('settings_buyer_demo',setup.recoveryKey);
    const gate=f.gateComplete(),complete=f.client.completeRecovery(NEW_PASSWORD);await gate.entered.promise;f.client.cancelRecovery();gate.release.resolve();await assert.rejects(complete,/cerró/);
    assert.equal((await f.client.initialize()).authExpired,true);await f.client.login('settings_buyer_demo',NEW_PASSWORD);assert.equal((await f.client.setupRecovery(NEW_PASSWORD)).recoveryEnabled,true);
    assertNeverStored(f,[PASSWORD,NEW_PASSWORD,setup.recoveryKey]);
  }finally{await f.close();}
});

test('lost completion response preserves account namespace and allows login with the already-changed password',async()=>{
  const f=await fixture();try{
    await login(f);const setup=await f.client.setupRecovery(PASSWORD);await f.client.startRecovery('settings_buyer_demo',setup.recoveryKey);f.loseComplete();
    await assert.rejects(f.client.completeRecovery(NEW_PASSWORD),/Lost committed/);const context=await f.client.initialize();assert.equal(context.account.id,f.buyer.id);assert.equal(context.authExpired,true);assert.equal(context.pending,null);
    await f.client.login('settings_buyer_demo',NEW_PASSWORD);assert.equal((await f.client.setupRecovery(NEW_PASSWORD)).recoveryEnabled,true);
    assertNeverStored(f,[PASSWORD,NEW_PASSWORD,setup.recoveryKey]);
  }finally{await f.close();}
});

test('settings and recovery requests never use a legacy identity or the durable financial queue',async()=>{
  const f=await fixture();try{
    await login(f);await f.client.getProfile();await f.client.updateProfile({displayName:'Comprador DEMO',preferredCurrency:'USD',jurisdiction:'DEMO_INTERNATIONAL'});const setup=await f.client.setupRecovery(PASSWORD);await f.client.startRecovery('settings_buyer_demo',setup.recoveryKey);await f.client.completeRecovery(NEW_PASSWORD);
    for(const call of f.calls.filter(call=>/profile|recovery/.test(call.path))){assert.equal('x-demo-session' in call.headers,false);assert.equal('Idempotency-Key' in call.headers,false);assert.equal(call.path.includes('token='),false);assert.equal(call.path.includes('password='),false);}
    assert.equal(f.data.writes.some(write=>write.key.includes('pending:')),false);
  }finally{await f.close();}
});

test('recovering another buyer without pending commands does not silently switch the signed-in identity',async()=>{
  const f=await fixture();try{
    await login(f);const target=await f.store.createAccount({alias:'settings_target_demo',password:PASSWORD,mineId:f.mine.id});
    const second=createAccountClient({...f.options,storage:storage(),authStorage:storage()});await second.login('settings_target_demo',PASSWORD);const setup=await second.setupRecovery(PASSWORD);
    await f.client.startRecovery('settings_target_demo',setup.recoveryKey);assert.equal(f.client.getAccount().id,f.buyer.id);
    const result=await f.client.completeRecovery(NEW_PASSWORD);assert.equal(result.alias,'settings_target_demo');assert.equal(f.client.getAccount().id,f.buyer.id);
    assert.equal((await f.client.initialize()).authExpired,false);assert.equal((await f.client.get('/api/demo/state')).account.id,f.buyer.id);assert.notEqual(f.buyer.id,target.id);
    await assert.rejects(second.get('/api/demo/state'),error=>error instanceof RequestError&&error.status===401);
    assertNeverStored(f,[setup.recoveryKey,result.recoveryKey,PASSWORD,NEW_PASSWORD]);
  }finally{await f.close();}
});
