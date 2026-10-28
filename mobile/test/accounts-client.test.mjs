import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountClient,accountAuthStorageKey} from '../lib/account-client.ts';
import {RequestError} from '../lib/demo-client.ts';

const api='https://demo.example';
const ids={alice:'account-alice-0000001',bob:'account-bobby-0000002',operator:'account-operator-0003'};
const mine={id:'fixture-mine-demo',name:'Mina ficticia de prueba'};
const records=()=>({XAU:1000,XAG:2000,XPT:3000,XPD:4000});
function storage(){const data=new Map();return {data,async getItem(key){return data.get(key)??null;},async setItem(key,value){data.set(key,value);},async removeItem(key){data.delete(key);}};}
const response=(data,status=200)=>new Response(JSON.stringify(data),{status});
const defer=()=>{let resolve;const promise=new Promise(done=>{resolve=done;});return {promise,resolve};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

function backend(){
  const tokens=new Map(),receipts=new Map(),calls=[];let sequence=1;
  const account=alias=>({id:ids[alias],alias,role:alias==='operator'?'operator':'buyer',mineId:mine.id});
  const issue=alias=>{
    const token=`demo-token-${alias}-${String(sequence++).padStart(32,'0')}`;
    tokens.set(token,account(alias));
    return {token,account:account(alias),mine,demoOnly:true,expiresAt:'2035-01-01T00:00:00.000Z'};
  };
  const result=(owner,key,action='buy')=>({state:{walletMinor:{USDT:24900}},receipt:{id:key,action,status:'COMPLETED',at:'2026-10-28T10:00:00.000Z',demoOnly:true,accountId:owner.id}});
  let loseNext=false,rejectNext=0,stockIncomplete=false,meRole;
  const fetchImpl=async(url,init)=>{
    const path=url.slice(api.length);const body=init.body?JSON.parse(init.body):undefined;
    const token=init.headers.Authorization?.slice('Bearer '.length);
    calls.push({url,path,headers:{...init.headers},body});
    if(path==='/api/demo/accounts/register'||path==='/api/demo/accounts/login'){
      if(!ids[body.alias])return response({error:'No autorizado'},401);
      return response(issue(body.alias));
    }
    const owner=tokens.get(token);
    if(path==='/api/demo/accounts/me')return owner?response({account:{...owner,...(meRole?{role:meRole}:{})},mine,demoOnly:true}):response({error:'Sesión caducada'},401);
    if(path==='/api/demo/accounts/logout'){
      if(rejectNext){const status=rejectNext;rejectNext=0;return response({error:'No disponible'},status);}
      tokens.delete(token);return response({ok:true,demoOnly:true});
    }
    if(path==='/api/demo/state')return response({owner:owner?.id??'legacy',demoOnly:true});
    if(path==='/api/demo/buy'||path==='/api/demo/mine/stock'){
      if(rejectNext){const status=rejectNext;rejectNext=0;return response({error:'No autorizado'},status);}
      if(!owner)return response({error:'Sesión caducada'},401);
      const key=init.headers['Idempotency-Key'];const compound=owner.id+':'+key;
      const previous=receipts.get(compound);let value;
      if(path.endsWith('/stock')){
        const summary={mine,demoOnly:true,reconciled:true,inventoryMg:records(),totalSupplyMg:records(),allocatedMg:records(),reservedMg:records(),accountCount:2,transactionCount:0,demoFeesCollectedMinor:0,offersOpen:0,deliveriesPending:0,operations:[],pendingOffers:[],pendingDeliveries:[],stockAdjustments:[]};
        value={mine:summary,receipt:{id:key,action:'stock',status:'COMPLETED',at:'2026-10-28T10:00:00.000Z',demoOnly:true,metal:'XAU',mg:1000,reason:'Ingreso ficticio',actor:{id:owner.id,alias:owner.alias},inventoryAfterMg:records(),totalSupplyAfterMg:records()}};
      }else value=result(owner,key);
      if(previous)value={...previous,receipt:{...previous.receipt,replayed:true}};
      else receipts.set(compound,value);
      if(loseNext){loseNext=false;throw new TypeError('Response lost after commit');}
      if(stockIncomplete){const altered=structuredClone(value);delete altered.mine.reservedMg;return response(altered);}
      return response(value);
    }
    return response({error:'No disponible'},404);
  };
  return {fetchImpl,calls,tokens,receipts,issue,account,setLose(){loseNext=true;},setReject(status){rejectNext=status;},setStockIncomplete(value){stockIncomplete=value;},setMeRole(role){meRole=role;}};
}
function fixture(extra={}){
  const data=storage(),auth=storage(),server=backend();
  const options={api,storage:data,authStorage:auth,uuid:()=>crypto.randomUUID(),fetchImpl:server.fetchImpl,...extra};
  return {data,auth,server,options,client:createAccountClient(options)};
}

test('cuenta demo guarda el token aparte, nunca la contraseña, y no mezcla headers legacy',async()=>{
  const f=fixture();const legacy=await f.client.initialize();
  const context=await f.client.register('alice','clave-exclusiva-demo',true);
  assert.equal(context.account.id,ids.alice);assert.equal(context.session,ids.alice);
  assert.equal(f.server.calls[0].headers['x-demo-session'],legacy.session);
  assert.deepEqual(f.server.calls[0].body,{alias:'alice',password:'clave-exclusiva-demo',importLegacy:true});
  assert.match(accountAuthStorageKey(api),/^[A-Za-z0-9._-]+$/);
  assert.notEqual(accountAuthStorageKey(api),accountAuthStorageKey(api+'/otra'));
  assert.ok([...f.auth.data.values()][0].includes('demo-token-'));
  assert.ok(!JSON.stringify([...f.auth.data.values()]).includes('clave-exclusiva-demo'));
  assert.ok(!JSON.stringify([...f.data.data.values()]).includes('demo-token-'));
  assert.equal(f.data.data.get('openminerals-demo-session'),legacy.session);
  assert.equal((await f.client.get('/api/demo/state')).owner,ids.alice);
  const call=f.server.calls.at(-1);assert.ok(call.headers.Authorization);assert.ok(!call.headers['x-demo-session']);
  assert.ok(!call.url.includes('token'));assert.ok(!call.url.includes('clave'));
});

test('restaurar consulta /me y usa el rol autorizado, no el rol alterado en el almacenamiento',async()=>{
  const f=fixture();await f.client.login('alice','demo-password');
  const key=accountAuthStorageKey(api);const saved=JSON.parse(f.auth.data.get(key));
  saved.account.role='operator';f.auth.data.set(key,JSON.stringify(saved));
  const restarted=createAccountClient(f.options);const context=await restarted.initialize();
  assert.equal(context.account.role,'buyer');assert.equal(restarted.getAccount().role,'buyer');
  assert.equal(f.server.calls.at(-1).path,'/api/demo/accounts/me');
});

test('respuesta perdida + token expirado se recuperan en la misma cuenta y con la misma clave',async()=>{
  const f=fixture();await f.client.login('alice','demo-password');f.server.setLose();
  await assert.rejects(f.client.submit('buy',{metal:'XAG',grams:'1.000'},'Comprar'));
  const pending=f.client.getPending();assert.equal(pending.accountId,ids.alice);
  f.server.tokens.clear();
  const restarted=createAccountClient(f.options);const initial=await restarted.initialize();
  assert.equal(initial.authExpired,true);assert.equal(initial.pending.requestId,pending.requestId);
  await assert.rejects(restarted.retry(),error=>error instanceof RequestError&&error.status===401);
  assert.equal(restarted.getPending().requestId,pending.requestId);
  await restarted.login('alice','demo-password');
  const replay=await restarted.retry();assert.equal(replay.receipt.replayed,true);
  assert.equal(f.server.receipts.size,1);assert.equal(restarted.getPending(),null);
  const keys=f.server.calls.filter(c=>c.path==='/api/demo/buy').map(c=>c.headers['Idempotency-Key']);
  assert.deepEqual(keys,[pending.requestId,pending.requestId]);
});

test('una operación pendiente bloquea cambio de cuenta, registro y cierre sin enviar otro login',async()=>{
  const f=fixture();await f.client.login('alice','demo-password');f.server.setLose();
  await assert.rejects(f.client.submit('buy',{metal:'XAG',grams:'1.000'},'Comprar'));
  const calls=f.server.calls.length,pending=f.client.getPending();
  await assert.rejects(f.client.login('bob','demo-password'),/pendiente/);
  await assert.rejects(f.client.register('bob','demo-password'),/Cierra|pendiente/);
  await assert.rejects(f.client.logout(),/pendiente/);
  assert.equal(f.server.calls.length,calls);assert.deepEqual(f.client.getPending(),pending);
  assert.equal(f.client.getAccount().id,ids.alice);
});

test('401 durante una mutación mantiene pendiente y permite reingresar a la misma cuenta',async()=>{
  const f=fixture();await f.client.login('alice','demo-password');f.server.setReject(401);
  await assert.rejects(f.client.submit('buy',{metal:'XAG',grams:'1.000'},'Comprar'),e=>e.status===401);
  assert.ok(f.client.getPending());assert.equal((await f.client.initialize()).authExpired,true);
  await f.client.login('alice','demo-password');await f.client.retry();assert.equal(f.client.getPending(),null);
  f.server.setReject(422);
  await assert.rejects(f.client.submit('buy',{metal:'XAG',grams:'9.000'},'Comprar'),e=>e.status===422);
  assert.equal(f.client.getPending(),null);
});

test('rotar token de la misma cuenta conserva pendientes en RAM ante escritura o borrado ambiguos',async()=>{
  for(const fault of ['write-before-save','delete-after-remove']){
    const f=fixture();await f.client.login('alice','demo-password');
    const originalSet=f.data.setItem,originalRemove=f.data.removeItem;
    let failing=true;
    if(fault==='write-before-save')f.data.setItem=async(key,value)=>{
      if(failing&&key.includes(':account:'))throw new Error('Pending save unavailable');
      return originalSet(key,value);
    };
    else f.data.removeItem=async key=>{
      await originalRemove(key);
      if(failing&&key.includes(':account:'))throw new Error('Pending delete reported failure after removal');
    };
    await assert.rejects(f.client.submit('buy',{metal:'XAG',grams:'1.000'},'Comprar'),/Pending/);
    const pending=f.client.getPending();assert.ok(pending);
    assert.equal(f.data.data.has(`openminerals-demo-pending:${api}:account:${ids.alice}`),false);
    const context=await f.client.login('alice','demo-password');
    assert.deepEqual(context.pending,pending);assert.deepEqual(f.client.getPending(),pending);
    failing=false;
    const recovered=await f.client.retry();
    assert.equal(recovered.receipt.id,pending.requestId);assert.equal(f.server.receipts.size,1);
    assert.equal(f.client.getPending(),null);
    assert.equal(!!recovered.receipt.replayed,fault==='delete-after-remove');
  }
});

test('una respuesta de stock sin wallet es válida; una incompleta conserva la operación',async()=>{
  const f=fixture();await f.client.login('operator','demo-password');f.server.setStockIncomplete(true);
  await assert.rejects(f.client.submit('mine/stock',{metal:'XAU',grams:'1.000',reason:'Ingreso ficticio'},'Ingreso'),/incompleta/);
  const original=f.client.getPending();assert.equal(original.action,'mine/stock');
  f.server.setStockIncomplete(false);const result=await f.client.retry();
  assert.equal(result.state,undefined);assert.ok(result.mine);assert.equal(result.receipt.replayed,true);
  assert.equal(result.receipt.id,original.requestId);assert.equal(f.server.receipts.size,1);assert.equal(f.client.getPending(),null);
});

test('los pendientes de otra cuenta o namespace no se pueden reproducir',async()=>{
  const f=fixture();await f.client.login('bob','demo-password');
  const key=`openminerals-demo-pending:${api}:account:${ids.bob}`;
  const invalid={session:ids.alice,accountId:ids.alice,action:'buy',body:{metal:'XAG',grams:'1.000'},requestId:'original-request-key',title:'Comprar'};
  f.data.data.set(key,JSON.stringify(invalid));const calls=f.server.calls.length;
  const restarted=createAccountClient(f.options);await assert.rejects(restarted.initialize(),/pendiente no es válida/);
  assert.equal(f.server.calls.length,calls);assert.equal(f.data.data.get(key),JSON.stringify(invalid));
});

test('fallar al leer o guardar la identidad nunca degrada a operaciones anónimas',async()=>{
  const f=fixture();const originalGet=f.auth.getItem;let broken=true;
  f.auth.getItem=async key=>{if(broken)throw new Error('Secure storage unavailable');return originalGet(key);};
  await assert.rejects(f.client.get('/api/demo/state'),/Secure storage/);assert.equal(f.server.calls.length,0);
  broken=false;await f.client.initialize();
  const originalSet=f.auth.setItem;
  f.auth.setItem=async(key,value)=>{await originalSet(key,value);throw new Error('Ambiguous secure write');};
  await assert.rejects(f.client.login('alice','demo-password'),/Ambiguous/);
  assert.equal(f.client.isIdentityUncertain(),true);
  const calls=f.server.calls.length;
  await assert.rejects(f.client.submit('buy',{metal:'XAG',grams:'1.000'},'Comprar'),/cuenta quedara guardada/);
  assert.equal(f.server.calls.length,calls);assert.equal(f.client.getAccount(),null);
  f.auth.setItem=originalSet;await f.client.login('alice','demo-password');
  assert.equal(f.client.isIdentityUncertain(),false);
  assert.equal((await f.client.get('/api/demo/state')).owner,ids.alice);
});

test('fallo de red al revocar conserva identidad; fallo al borrar permite reintentar sin otra revocación',async()=>{
  const f=fixture();await f.client.initialize();const originalLegacy=f.data.data.get('openminerals-demo-session');
  await f.client.login('alice','demo-password');f.server.setReject(500);
  await assert.rejects(f.client.logout());assert.equal(f.client.getAccount().id,ids.alice);assert.equal(f.auth.data.size,1);
  const originalRemove=f.auth.removeItem;let failed=false;
  f.auth.removeItem=async key=>{if(!failed){failed=true;throw new Error('Secure delete unavailable');}return originalRemove(key);};
  await assert.rejects(f.client.logout(),/Secure delete/);
  assert.equal(f.client.isIdentityUncertain(),true);
  await assert.rejects(f.client.get('/api/demo/state'),/cuenta quedara guardada/);
  const revocations=f.server.calls.filter(c=>c.path.endsWith('/logout')).length;
  const context=await f.client.logout();assert.equal(context.account,null);
  assert.equal(f.client.isIdentityUncertain(),false);
  assert.equal(f.server.calls.filter(c=>c.path.endsWith('/logout')).length,revocations);
  assert.equal(f.data.data.get('openminerals-demo-session'),originalLegacy);assert.equal(f.auth.data.size,0);
});

test('token ya inválido permite cierre local únicamente cuando no hay pendientes',async()=>{
  const f=fixture();await f.client.login('alice','demo-password');
  f.server.setReject(401);const context=await f.client.logout();assert.equal(context.account,null);
  assert.equal(f.auth.data.size,0);
});

test('no cambia identidad durante envío y descarta una consulta antigua tras cambiar de cuenta',async()=>{
  const f=fixture();await f.client.login('alice','demo-password');
  const started=defer(),finish=defer();const raw=f.server.fetchImpl;
  const options={...f.options,fetchImpl:async(url,init)=>{if(url.endsWith('/state')){started.resolve();await finish.promise;}return raw(url,init);}};
  const client=createAccountClient(options);await client.initialize();
  const stale=client.get('/api/demo/state');await started.promise;
  await client.login('bob','demo-password');finish.resolve();
  await assert.rejects(stale,/cuenta cambió/);assert.equal(client.getAccount().id,ids.bob);
  const sending=defer(),sent=defer();
  const concurrent=createAccountClient({...f.options,fetchImpl:async(url,init)=>{if(url.endsWith('/buy')){sending.resolve();await sent.promise;}return raw(url,init);}});
  await concurrent.initialize();const buy=concurrent.submit('buy',{metal:'XAG',grams:'1.000'},'Comprar');await sending.promise;
  await assert.rejects(concurrent.logout(),/en curso/);await assert.rejects(concurrent.login('alice','demo-password'),/en curso/);
  sent.resolve();await buy;
});

test('un token de otra cuenta guardado por error no puede enviar operaciones con el pendiente equivocado',async()=>{
  const f=fixture();await f.client.login('alice','demo-password');
  const key=accountAuthStorageKey(api),saved=JSON.parse(f.auth.data.get(key));saved.token=f.server.issue('bob').token;
  f.auth.data.set(key,JSON.stringify(saved));
  const restarted=createAccountClient(f.options);assert.equal((await restarted.initialize()).authExpired,true);
  const calls=f.server.calls.length;
  await assert.rejects(restarted.submit('buy',{metal:'XAG',grams:'1.000'},'Comprar'),e=>e.status===401);
  assert.equal(f.server.calls.length,calls);assert.equal(restarted.getAccount().id,ids.alice);
});

test('timeout de acceso cubre el cuerpo HTTP y libera el bloqueo sin guardar la contraseña',async()=>{
  const f=fixture({timeoutMs:10,fetchImpl:async()=>({ok:true,status:200,json:()=>new Promise(()=>{})})});
  await assert.rejects(f.client.login('alice','only-demo-password'),e=>e instanceof RequestError&&e.ambiguous);
  assert.equal(f.client.isSending(),false);assert.equal(f.auth.data.size,0);assert.equal(f.client.getAccount(),null);
});

test('una creación con respuesta perdida exige recuperar la cuenta antes de seguir operando',async()=>{
  const f=fixture();const raw=f.server.fetchImpl;
  const client=createAccountClient({...f.options,fetchImpl:async(url,init)=>{
    const result=await raw(url,init);
    if(url.endsWith('/register'))throw new TypeError('Registration response lost after commit');
    return result;
  }});
  const original=await client.initialize();
  assert.equal(client.isIdentityUncertain(),false);
  await assert.rejects(client.register('alice','demo-password',true),/confirmar la creación/);
  assert.equal(client.isIdentityUncertain(),true);
  const calls=f.server.calls.length;
  await assert.rejects(client.submit('buy',{metal:'XAG',grams:'1.000'},'Comprar'),/cuenta quedara guardada/);
  assert.equal(f.server.calls.length,calls);assert.equal(f.data.data.get('openminerals-demo-session'),original.session);
  await client.login('alice','demo-password');assert.equal(client.getAccount().id,ids.alice);
  assert.equal(client.isIdentityUncertain(),false);
  assert.equal(f.server.calls.filter(c=>c.path.endsWith('/register')).length,1);
});

test('initialize no devuelve una identidad mezclada mientras cambia el acceso',async()=>{
  const f=fixture(),entered=defer(),finish=defer(),raw=f.server.fetchImpl;
  const client=createAccountClient({...f.options,fetchImpl:async(url,init)=>{
    if(url.endsWith('/login')){entered.resolve();await finish.promise;}
    return raw(url,init);
  }});
  const login=client.login('alice','demo-password');await entered.promise;
  await assert.rejects(client.initialize(),/cambio de cuenta/);
  await assert.rejects(client.get('/api/demo/state'),/cambio de cuenta/);
  await assert.rejects(client.submit('buy',{metal:'XAG',grams:'1.000'},'Comprar'),/en curso/);
  finish.resolve();await login;assert.equal((await client.initialize()).account.id,ids.alice);
});
