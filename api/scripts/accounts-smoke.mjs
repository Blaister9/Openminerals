// Isolated synthetic workspace only. Run remotely with the existing admin token
// in the process environment; never print credentials or copy it into the app.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

const base=(process.argv[2]||'http://127.0.0.1:3000').replace(/\/$/,'');
try{
  const url=new URL(base);
  assert.ok(url.protocol==='https:'||url.protocol==='http:'&&['127.0.0.1','localhost'].includes(url.hostname));
  assert.ok(!url.username&&!url.password&&!url.search&&!url.hash);
  assert.ok(process.env.DEMO_ADMIN_TOKEN,'Falta DEMO_ADMIN_TOKEN en el entorno del proceso.');
  const request=async(path,{token,admin=false,body,key,expected=200,method}={})=>{
    const response=await fetch(base+path,{
      method:method||(body?'POST':'GET'),signal:AbortSignal.timeout(20_000),
      headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{}) ,...(admin?{'x-demo-admin-token':process.env.DEMO_ADMIN_TOKEN}:{}),...(key?{'Idempotency-Key':key}:{})},
      body:body?JSON.stringify(body):undefined,
    });
    const data=await response.json();
    assert.equal(response.status,expected,`${path}: HTTP ${response.status}; expected ${expected}`);
    return data;
  };
  const health=await request('/health');assert.equal(health.ok,true);assert.equal(health.demoOnly,true);
  if(process.env.REQUIRE_POSTGRES==='true')assert.equal(health.mode,'postgres-demo');
  const tag=randomUUID().replaceAll('-','').slice(0,20);
  const mine=await request('/api/demo/admin/mines',{admin:true,body:{name:`Prueba aislada ${tag}`,initialInventoryMg:{XAU:1000,XAG:0,XPT:0,XPD:0}},expected:201});
  const users={};
  for(const [name,role] of [['a','buyer'],['b','buyer'],['op','operator']]){
    const alias=`smoke_${tag}_${name}`,password=`Demo-${randomUUID()}`;
    const created=await request('/api/demo/admin/accounts',{admin:true,body:{alias,password,role,mineId:mine.id},expected:201});
    const login=await request('/api/demo/accounts/login',{body:{alias,password}});
    assert.equal(login.account.id,created.account.id);assert.equal(login.account.role,role);assert.equal(login.mine.id,mine.id);
    users[name]={...login,alias,password};
  }
  console.log('PASS isolated demo mine, two buyer accounts and operator authentication');
  for(const user of [users.a,users.b])await request('/api/demo/mine/summary',{token:user.token,expected:403});
  await request('/api/demo/buy',{token:users.op.token,body:{metal:'XAU',grams:'0.100'},key:randomUUID(),expected:403});
  await request('/api/demo/accounts/register',{body:{alias:`bad_${tag}`,password:`Demo-${randomUUID()}`,role:'operator'},expected:400});
  await request('/api/demo/admin/mines',{token:users.a.token,body:{name:'No autorizado'},expected:403});
  console.log('PASS server-enforced roles and rejection of public operator registration');

  const commands=[users.a,users.b].map(()=>({metal:'XAU',grams:'0.750',key:randomUUID()}));
  const outcomes=await Promise.all([users.a,users.b].map(async(user,index)=>{
    const response=await fetch(base+'/api/demo/buy',{
      method:'POST',signal:AbortSignal.timeout(20_000),headers:{Authorization:`Bearer ${user.token}`,'Content-Type':'application/json','Idempotency-Key':commands[index].key},
      body:JSON.stringify({metal:'XAU',grams:'0.750'}),
    });
    return {status:response.status,data:await response.json()};
  }));
  assert.equal(outcomes.filter(item=>item.status===200).length,1);assert.equal(outcomes.filter(item=>item.status===422).length,1);
  const win=outcomes.findIndex(item=>item.status===200),winner=[users.a,users.b][win],loser=[users.a,users.b][1-win];
  const original=outcomes[win].data.receipt;
  assert.equal(original.totalMinor,10984);assert.equal(original.balancesAfter.walletMinor.USDT,14016);
  const replay=await request('/api/demo/buy',{token:winner.token,body:{metal:'XAU',grams:'0.750'},key:commands[win].key});
  assert.equal(replay.receipt.replayed,true);assert.equal(replay.state.holdingsMg.XAU,750);
  await request(`/api/demo/receipts/${original.id}`,{token:loser.token,expected:404});
  const remaining=await request('/api/demo/buy',{token:loser.token,body:{metal:'XAU',grams:'0.250'},key:randomUUID()});
  assert.equal(remaining.receipt.totalMinor,3662);
  let summary=await request('/api/demo/mine/summary',{token:users.op.token});
  assert.equal(summary.inventoryMg.XAU,0);assert.equal(summary.allocatedMg.XAU,1000);assert.equal(summary.accountCount,2);assert.equal(summary.transactionCount,2);assert.equal(summary.reconciled,true);
  assert.equal(new Set(summary.operations.map(item=>item.account.id)).size,2);
  const inspected=await request(`/api/demo/mine/receipts/${winner.account.id}/${original.id}`,{token:users.op.token});
  const {balancesAfter:privateSnapshot,...operatorExpected}=original;
  assert.ok(privateSnapshot);assert.deepEqual(inspected,{...operatorExpected,operatorView:true});
  await request(`/api/demo/mine/receipts/${loser.account.id}/${original.id}`,{token:users.op.token,expected:404});
  assert.ok(summary.operations.every(item=>item.receipt.operatorView===true&&!Object.hasOwn(item.receipt,'balancesAfter')));
  for(const [action,body] of [['deposit',{currency:'USD',amount:'1.00'}],['convert',{from:'USD',to:'USDT',amount:'1.00'}],['withdraw',{currency:'USD',amount:'1.00'}]]){
    const wallet=await request(`/api/demo/${action}`,{token:winner.token,body,key:randomUUID()});
    await request(`/api/demo/mine/receipts/${winner.account.id}/${wallet.receipt.id}`,{token:users.op.token,expected:404});
    assert.deepEqual(await request(`/api/demo/receipts/${wallet.receipt.id}`,{token:winner.token}),wallet.receipt);
  }
  summary=await request('/api/demo/mine/summary',{token:users.op.token});assert.equal(summary.operations.length,2);
  assert.ok(summary.operations.every(item=>item.receipt.operatorView===true&&!Object.hasOwn(item.receipt,'balancesAfter')));
  // Legacy import runs in the isolated test schemas, since public import would
  // create an account in the owner's default mine during a remote smoke.
  console.log('PASS concurrent stock, idempotency, operator receipt redaction and private wallet receipts');

  const stockBody={metal:'XAU',grams:'2.000',reason:'Ingreso exclusivamente ficticio del smoke'},stockKey=randomUUID();
  const stock=await request('/api/demo/mine/stock',{token:users.op.token,body:stockBody,key:stockKey});
  assert.equal(stock.receipt.action,'stock');assert.equal(stock.mine.totalSupplyMg.XAU,3000);assert.equal(stock.mine.inventoryMg.XAU,2000);
  const sold=await request('/api/demo/sell',{token:winner.token,body:{metal:'XAU',grams:'0.250'},key:randomUUID()});
  assert.equal(sold.receipt.outputMinor,3581);
  summary=await request('/api/demo/mine/summary',{token:users.op.token});
  assert.equal(summary.inventoryMg.XAU,2250);assert.equal(summary.allocatedMg.XAU,750);assert.equal(summary.transactionCount,3);assert.equal(summary.demoFeesCollectedMinor,190);assert.equal(summary.reconciled,true);
  const stockReplay=await request('/api/demo/mine/stock',{token:users.op.token,body:stockBody,key:stockKey});
  assert.equal(stockReplay.receipt.replayed,true);assert.equal(stockReplay.mine.inventoryMg.XAU,2250);assert.deepEqual(stockReplay.receipt.inventoryAfterMg,stock.receipt.inventoryAfterMg);
  console.log('PASS operator stock entry, resale, supply reconciliation and immutable stock receipt');

  await request('/api/demo/accounts/logout',{token:winner.token,method:'POST'});
  await request('/api/demo/accounts/me',{token:winner.token,expected:401});
  const logged=await request('/api/demo/accounts/login',{body:{alias:winner.alias,password:winner.password}});
  const state=await request('/api/demo/state',{token:logged.token});assert.equal(state.holdingsMg.XAU,500);
  const old=await request(`/api/demo/receipts/${original.id}`,{token:logged.token});assert.deepEqual(old,original);
  console.log('PASS logout revocation, account recovery and original historical receipt');
  console.log(`ACCOUNTS SMOKE PASSED · ${base} · ${health.mode} · isolated workspace only`);
}catch(error){
  console.error('ACCOUNTS SMOKE FAILED:',error.message);
  process.exitCode=1;
}
