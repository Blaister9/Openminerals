import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {request as httpRequest} from 'node:http';
import {createStore} from '../src/store.js';
import {createApiServer} from '../src/server.js';

const PASSWORD='Exclusive-demo-password-123';
const ADMIN='local-test-admin-not-a-real-credential';
async function fixture(config={}){
  const store=await createStore('');
  const server=createApiServer(store,{adminToken:ADMIN,authRateLimit:{limit:200},...config});
  server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  const call=async(path,{token,legacy,admin=false,body,key,method}={})=>{
    const response=await fetch(base+path,{
      method:method||(body?'POST':'GET'),
      headers:{...(token?{Authorization:`Bearer ${token}`}:{}) ,...(legacy?{'x-demo-session':legacy}:{}),...(admin?{'x-demo-admin-token':ADMIN}:{}),...(key?{'Idempotency-Key':key}:{}),'Content-Type':'application/json'},
      body:body?JSON.stringify(body):undefined,
    });
    return {status:response.status,data:await response.json()};
  };
  const mine=async()=>{
    const response=await call('/api/demo/admin/mines',{admin:true,body:{name:'Mina aislada de pruebas',initialInventoryMg:{XAU:1000}}});
    assert.equal(response.status,201);return response.data;
  };
  const account=async(alias,role,mineId)=>{
    const created=await call('/api/demo/admin/accounts',{admin:true,body:{alias,password:PASSWORD,role,mineId}});
    assert.equal(created.status,201);
    const login=await call('/api/demo/accounts/login',{body:{alias,password:PASSWORD}});assert.equal(login.status,200);
    return login.data;
  };
  return {store,base,call,mine,account,async close(){await new Promise(resolve=>server.close(resolve));await store.close();}};
}

test('cuentas HTTP: registro solo comprador, credenciales genéricas y bearer no cae a sesión legacy',async()=>{
  const f=await fixture();
  try{
    const malicious=await f.call('/api/demo/accounts/register',{body:{alias:'buyer_role',password:PASSWORD,role:'operator'}});
    assert.equal(malicious.status,400);
    const created=await f.call('/api/demo/accounts/register',{body:{alias:'buyer_role',password:PASSWORD,importLegacy:false}});
    assert.equal(created.status,201);assert.equal(created.data.account.role,'buyer');
    assert.match(created.data.token,/^[A-Za-z0-9_-]{43}$/);
    assert.ok(new Date(created.data.expiresAt)>Date.now());
    assert.ok(!JSON.stringify(created.data).includes('passwordHash'));
    const me=await f.call('/api/demo/accounts/me',{token:created.data.token});assert.equal(me.data.account.id,created.data.account.id);
    for(const alias of ['buyer_role','unknown_role']){
      const rejected=await f.call('/api/demo/accounts/login',{body:{alias,password:'wrong-password-123'}});
      assert.equal(rejected.status,401);assert.equal(rejected.data.code,'UNAUTHORIZED');
    }
    const invalid=await f.call('/api/demo/state',{token:'x'.repeat(43),legacy:'unrelated-legacy-session'});
    assert.equal(invalid.status,401);
    assert.equal((await f.call('/api/demo/mine/summary',{token:created.data.token})).status,403);
    assert.equal((await f.call('/api/demo/admin/accounts',{token:created.data.token,body:{alias:'operator_bad',password:PASSWORD,role:'operator'}})).status,403);
    assert.equal((await f.call('/api/demo/operator/summary',{token:created.data.token})).status,403);
    assert.equal((await f.call('/api/demo/accounts/logout',{token:created.data.token,method:'POST'})).status,200);
    assert.equal((await f.call('/api/demo/accounts/me',{token:created.data.token})).status,401);
    assert.equal((await f.call('/api/demo/accounts/logout',{token:created.data.token,method:'POST'})).status,200);
    const relog=await f.call('/api/demo/accounts/login',{body:{alias:'buyer_role',password:PASSWORD}});
    assert.equal(relog.status,200);assert.equal(relog.data.account.id,created.data.account.id);
  }finally{await f.close();}
});

test('mina HTTP: dos compradores comparten stock, no pueden sobregirarlo y operador ve ambas posiciones',async()=>{
  const f=await fixture();
  try{
    const mine=await f.mine();
    const a=await f.account('buyer_stock_a','buyer',mine.id);
    const b=await f.account('buyer_stock_b','buyer',mine.id);
    const op=await f.account('operator_stock','operator',mine.id);
    const buys=await Promise.all([a,b].map(user=>f.call('/api/demo/buy',{token:user.token,body:{metal:'XAU',grams:'0.750'},key:'same-key-per-account'})));
    assert.equal(buys.filter(result=>result.status===200).length,1);
    assert.equal(buys.filter(result=>result.status===422).length,1);
    const winIndex=buys.findIndex(result=>result.status===200),winner=[a,b][winIndex],loser=[a,b][1-winIndex];
    const accepted=buys[winIndex];assert.equal(accepted.data.state.inventoryMg.XAU,250);
    const second=await f.call('/api/demo/buy',{token:loser.token,body:{metal:'XAU',grams:'0.250'},key:'remaining-quarter-key'});assert.equal(second.status,200);
    assert.equal((await f.call('/api/demo/state',{token:winner.token})).data.inventoryMg.XAU,0);
    const replay=await f.call('/api/demo/buy',{token:winner.token,body:{metal:'XAU',grams:'0.750'},key:'same-key-per-account'});
    assert.equal(replay.data.receipt.replayed,true);
    assert.equal((await f.call(`/api/demo/receipts/${accepted.data.receipt.id}`,{token:loser.token})).status,404);
    const summary=(await f.call('/api/demo/mine/summary',{token:op.token})).data;
    assert.equal(summary.inventoryMg.XAU,0);assert.equal(summary.allocatedMg.XAU,1000);assert.equal(summary.transactionCount,2);assert.equal(summary.accountCount,2);
    assert.equal(new Set(summary.operations.map(item=>item.account.id)).size,2);
    assert.equal((await f.call('/api/demo/buy',{token:op.token,body:{metal:'XAU',grams:'0.100'},key:'operator-cannot-buy'})).status,403);
    assert.equal((await f.call('/api/demo/mine/stock',{token:a.token,body:{metal:'XAU',grams:'1.000',reason:'Ingreso demo'},key:'buyer-cannot-stock'})).status,403);
    const inspect=await f.call(`/api/demo/mine/receipts/${winner.account.id}/${accepted.data.receipt.id}`,{token:op.token});assert.equal(inspect.status,200);
    assert.equal(inspect.data.operatorView,true);assert.ok(!Object.hasOwn(inspect.data,'balancesAfter'));
    const {balancesAfter:privateSnapshot,...operatorExpected}=accepted.data.receipt;
    assert.ok(privateSnapshot);assert.deepEqual(inspect.data,{...operatorExpected,operatorView:true});
    assert.equal((await f.call(`/api/demo/mine/receipts/${loser.account.id}/${accepted.data.receipt.id}`,{token:op.token})).status,404);
    for(const [action,body] of [['deposit',{currency:'USD',amount:'1.00'}],['convert',{from:'USD',to:'USDT',amount:'1.00'}],['withdraw',{currency:'USD',amount:'1.00'}]]){
      const wallet=await f.call(`/api/demo/${action}`,{token:winner.token,body,key:`private-wallet-${action}`});assert.equal(wallet.status,200);
      assert.equal((await f.call(`/api/demo/mine/receipts/${winner.account.id}/${wallet.data.receipt.id}`,{token:op.token})).status,404);
      assert.equal((await f.call(`/api/demo/receipts/${wallet.data.receipt.id}`,{token:winner.token})).status,200);
    }
    const privateSummary=(await f.call('/api/demo/mine/summary',{token:op.token})).data;
    assert.equal(privateSummary.operations.length,2);
    assert.ok(privateSummary.operations.every(item=>item.receipt.operatorView===true&&!Object.hasOwn(item.receipt,'balancesAfter')));
    const buyerOriginal=(await f.call(`/api/demo/receipts/${accepted.data.receipt.id}`,{token:winner.token})).data;
    assert.deepEqual(buyerOriginal,accepted.data.receipt);
    const stock=await f.call('/api/demo/mine/stock',{token:op.token,body:{metal:'XAU',grams:'2.000',reason:'Reposición ficticia'},key:'operator-restock-key'});
    assert.equal(stock.status,200);assert.equal(stock.data.receipt.action,'stock');assert.equal(stock.data.mine.totalSupplyMg.XAU,3000);assert.equal(stock.data.mine.inventoryMg.XAU,2000);
    assert.ok(!Object.hasOwn(stock.data,'state'));
    const stockReplay=await f.call('/api/demo/mine/stock',{token:op.token,body:{metal:'XAU',grams:'2.000',reason:'Reposición ficticia'},key:'operator-restock-key'});
    assert.equal(stockReplay.data.receipt.replayed,true);assert.equal(stockReplay.data.mine.inventoryMg.XAU,2000);
    const sold=await f.call('/api/demo/sell',{token:winner.token,body:{metal:'XAU',grams:'0.250'},key:'return-quarter-key'});assert.equal(sold.status,200);
    const after=(await f.call('/api/demo/mine/summary',{token:op.token})).data;
    assert.equal(after.inventoryMg.XAU,2250);assert.equal(after.allocatedMg.XAU,750);assert.equal(after.totalSupplyMg.XAU,3000);assert.equal(after.reconciled,true);
    const anotherMine=await f.mine();const otherOp=await f.account('operator_elsewhere','operator',anotherMine.id);
    assert.equal((await f.call(`/api/demo/mine/receipts/${winner.account.id}/${accepted.data.receipt.id}`,{token:otherOp.token})).status,404);
  }finally{await f.close();}
});

test('vinculación conserva la sesión anterior, asigna sus metales una sola vez y bloquea escrituras legacy',async()=>{
  const f=await fixture();
  try{
    const legacy='legacy-owner-import-test';
    await f.call('/api/demo/buy',{legacy,body:{metal:'XAG',grams:'2.000'},key:'legacy-silver-receipt'});
    const before=(await f.call('/api/demo/state',{legacy})).data;
    const registered=await f.call('/api/demo/accounts/register',{legacy,body:{alias:'buyer_imported',password:PASSWORD,importLegacy:true}});
    assert.equal(registered.status,201);
    const current=(await f.call('/api/demo/state',{token:registered.data.token})).data;
    assert.deepEqual(current.walletMinor,before.walletMinor);assert.deepEqual(current.holdingsMg,before.holdingsMg);assert.deepEqual(current.receipts,before.receipts);
    assert.equal(current.inventoryMg.XAG,1500000-2000);
    const op=await f.account('operator_imported','operator',registered.data.mine.id);
    const oldId=Object.keys(before.receipts)[0];
    assert.equal((await f.call(`/api/demo/mine/receipts/${registered.data.account.id}/${oldId}`,{token:op.token})).status,404);
    assert.deepEqual((await f.call(`/api/demo/receipts/${oldId}`,{token:registered.data.token})).data,before.receipts[oldId]);
    const archive=(await f.call('/api/demo/state',{legacy})).data;
    assert.equal(archive.legacyReadOnly,true);delete archive.legacyReadOnly;assert.deepEqual(archive,before);
    assert.equal((await f.call('/api/demo/deposit',{legacy,body:{currency:'USDT',amount:'1.00'},key:'claimed-write-refused'})).status,409);
    assert.equal((await f.call('/api/demo/reset',{legacy,admin:true,body:{}})).status,409);
    assert.equal((await f.call('/api/demo/accounts/register',{legacy,body:{alias:'buyer_second_claim',password:PASSWORD,importLegacy:true}})).status,409);
    const recovered=await f.call('/api/demo/accounts/login',{body:{alias:'buyer_imported',password:PASSWORD}});assert.equal(recovered.status,200);
    const restored=(await f.call('/api/demo/state',{token:recovered.data.token})).data;
    assert.deepEqual(restored.walletMinor,current.walletMinor);assert.deepEqual(restored.receipts,current.receipts);
  }finally{await f.close();}
});

test('fallos de registro y autenticación no conceden roles ni consumen inventario',async()=>{
  const store=await createStore('');
  try{
    const mine=await store.createMine({name:'Sin existencias',initialInventoryMg:{XAU:0,XAG:0,XPT:0,XPD:0}});
    const op=await store.createAccount({alias:'operator_empty',password:PASSWORD,role:'operator',mineId:mine.id});
    await assert.rejects(store.createAccount({alias:'fake_mail@example.com',password:PASSWORD}),{status:400});
    await assert.rejects(store.createAccount({alias:'operator_import',password:PASSWORD,role:'operator',legacySessionId:'legacy-operator-invalid'}),{status:400});
    const before=await store.getMineSummary(op.id);
    const a=await store.createAccount({alias:'buyer_empty',password:PASSWORD,mineId:mine.id});
    await assert.rejects(store.mutateAccount(a.id,{action:'buy',metal:'XAU',grams:'0.100',requestId:randomUUID()}),{code:'INSUFFICIENT_INVENTORY'});
    const after=await store.getMineSummary(op.id);
    assert.deepEqual(after.inventoryMg,before.inventoryMg);assert.equal(after.transactionCount,0);
  }finally{await store.close();}
});

test('el límite de autenticación devuelve 429 sin abrir una ruta de permisos alternativa',async()=>{
  const f=await fixture({authRateLimit:{limit:2}});
  try{
    for(let i=0;i<2;i++)assert.equal((await f.call('/api/demo/accounts/login',{body:{alias:'missing_alias',password:PASSWORD}})).status,401);
    assert.equal((await f.call('/api/demo/accounts/login',{body:{alias:'missing_alias',password:PASSWORD}})).status,429);
    assert.equal((await f.call('/api/demo/mine/summary',{legacy:'legacy-not-an-operator'})).status,401);
  }finally{await f.close();}
});

test('una URL malformada devuelve 400 y la API permanece disponible',async()=>{
  const f=await fixture();
  try{
    const result=await new Promise((resolve,reject)=>{
      const req=httpRequest(f.base,{path:'http://[',method:'GET'},res=>{
        let body='';res.on('data',chunk=>{body+=chunk;});res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(body)}));
      });
      req.on('error',reject);req.end();
    });
    assert.equal(result.status,400);assert.equal(result.data.code,'INVALID_URL');
    assert.equal((await f.call('/health')).status,200);
  }finally{await f.close();}
});
