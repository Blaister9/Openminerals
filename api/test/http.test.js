import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {createApiServer} from '../src/server.js';
import {createStore} from '../src/store.js';
test('HTTP: mantiene el estado y protege reset; rechaza llamadas no válidas',async()=>{
  const store=await createStore('');
  const srv=createApiServer(store,{adminToken:'sample-test-secret'});
  srv.listen(0,'127.0.0.1');await once(srv,'listening');
  const url=`http://127.0.0.1:${srv.address().port}`;
  const session='unit-test-session-1234';
  const call=async(path,method='GET',body,headers={})=>{
    const res=await fetch(url+path,{method,headers:{'x-demo-session':session,...headers},body:body===undefined?undefined:JSON.stringify(body)});
    return {status:res.status,data:await res.json()};
  };
  try{
    assert.equal((await call('/health')).data.ok,true);
    const init=await call('/api/demo/state');
    assert.equal(init.data.walletMinor.USDT,25000);
    const buy=await call('/api/demo/buy','POST',{metal:'XAG',grams:'1.000'},{'idempotency-key':'test-idempotency-00001'});
    assert.equal(buy.status,200);
    assert.equal(buy.data.state.holdingsMg.XAG,1000);
    assert.equal((await call('/api/demo/state')).data.holdingsMg.XAG,1000);
    assert.equal((await call('/api/demo/reset','POST',{})).status,403);
    assert.equal((await call('/api/demo/reset','POST',{}, {'x-demo-admin-token':'sample-test-secret'})).status,200);
    assert.equal((await call('/api/demo/state')).data.holdingsMg.XAG,0);
    assert.equal((await call('/api/demo/buy','POST',{metal:'XAG',grams:'1.000'})).status,422);
    assert.equal((await call('/api/demo/state','GET',undefined,{'x-demo-session':'bad'})).status,400);
  } finally {srv.close();await store.close();}
});
