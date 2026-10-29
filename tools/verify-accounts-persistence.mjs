// Isolated DEMO acceptance only. Usage: node tools/verify-accounts-persistence.mjs
// prepare|verify HTTPS_API SNAPSHOT_OUTSIDE_GIT. Prepare needs DEMO_ADMIN_TOKEN.
// Restart the API separately between phases and verify its new Railway startup.
// Snapshots contain private synthetic tokens; never publish them.
import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {readFile,writeFile,stat,realpath} from 'node:fs/promises';
import {resolve,dirname,parse} from 'node:path';
const [phase,rawBase,snapshotPath]=process.argv.slice(2);
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const hash=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
const stateFields=['walletMinor','holdingsMg','inventoryMg','offers','custodyRequests','movements','receipts','signatures','sequence','priceCentsPerGram','demoRates','feesBps'];
const mineFields=['mine','inventoryMg','totalSupplyMg','allocatedMg','reservedMg','accountCount','transactionCount','demoFeesCollectedMinor','operations','offersOpen','deliveriesPending','pendingOffers','pendingDeliveries','stockAdjustments','reconciled'];
const project=(data,fields)=>Object.fromEntries(fields.map(key=>[key,data[key]]));
async function outsideGit(file){let directory=await realpath(dirname(resolve(file)));while(true){try{await stat(resolve(directory,'.git'));throw new Error('Snapshot must stay outside Git');}catch(error){if(error.code!=='ENOENT')throw error;}if(directory===parse(directory).root)return;directory=dirname(directory);}}
try{
 assert.ok(['prepare','verify'].includes(phase)&&rawBase&&snapshotPath,'Usage: node SCRIPT prepare|verify HTTPS_URL SNAPSHOT_OUTSIDE_GIT');
 const base=rawBase.replace(/\/$/,'');const url=new URL(base);
 assert.ok(url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash,'HTTPS API URL without credentials required');
 await outsideGit(snapshotPath);
 let snapshot=phase==='verify'?JSON.parse(await readFile(snapshotPath,'utf8')):{version:1,base,users:{},commands:{},receipts:{}};
 assert.ok(snapshot.version===1&&snapshot.base===base,'Snapshot/API mismatch');
 const req=async(path,{token,admin=false,body,key,expected=200}={})=>{
  const response=await fetch(base+path,{method:body?'POST':'GET',signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{}) ,...(admin?{'x-demo-admin-token':process.env.DEMO_ADMIN_TOKEN}:{}),...(key?{'Idempotency-Key':key}:{})},body:body?JSON.stringify(body):undefined});
  assert.ok(response.status===expected,`Unexpected HTTP ${response.status} for ${path}; expected ${expected}`);
  return response.json();
 };
 const health=await req('/health');assert.ok(health.ok===true&&health.demoOnly===true&&health.mode==='postgres-demo','PostgreSQL demo health required');
 if(phase==='prepare'){
  assert.ok(process.env.DEMO_ADMIN_TOKEN,'DEMO_ADMIN_TOKEN required only for prepare');
  try{await stat(snapshotPath);throw new Error('Refusing to overwrite existing snapshot');}catch(error){if(error.code!=='ENOENT')throw error;}
  const tag=randomUUID().replaceAll('-','').slice(0,18);
  const mine=await req('/api/demo/admin/mines',{admin:true,body:{name:`Auditoria reinicio aislada ${tag}`,initialInventoryMg:{XAU:1000,XAG:0,XPT:0,XPD:0}},expected:201});snapshot.mineId=mine.id;
  for(const [name,role] of [['a','buyer'],['b','buyer'],['op','operator']]){
   const alias=`restart_${tag}_${name}`,password=`Demo-${randomBytes(20).toString('hex')}`;
   const created=await req('/api/demo/admin/accounts',{admin:true,body:{alias,password,role,mineId:mine.id},expected:201});
   const login=await req('/api/demo/accounts/login',{body:{alias,password}});
   assert.ok(login.account.id===created.account.id&&login.account.role===role&&login.mine.id===mine.id,'Account provisioning mismatch');
   snapshot.users[name]={token:login.token,accountId:login.account.id,role};
  }
  const command=async(name,action,body)=>{const key=randomUUID();snapshot.commands[name]={action,body,key};const result=await req(`/api/demo/${action}`,{token:snapshot.users[name==='stock'?'op':name==='b'?'b':'a'].token,body,key});snapshot.receipts[name]=result.receipt;return result;};
  await command('a','buy',{metal:'XAU',grams:'0.750'});
  await command('b','buy',{metal:'XAU',grams:'0.250'});
  await command('offer','offer',{metal:'XAU',grams:'0.250'});
  await command('stock','mine/stock',{metal:'XAU',grams:'2.000',reason:'Ingreso ficticio auditoria de reinicio'});
  snapshot.stateHashes={};
  for(const name of ['a','b'])snapshot.stateHashes[name]=hash(project(await req('/api/demo/state',{token:snapshot.users[name].token}),stateFields));
  const summary=await req('/api/demo/mine/summary',{token:snapshot.users.op.token});
  assert.ok(summary.inventoryMg.XAU===2000&&summary.allocatedMg.XAU===1000&&summary.reservedMg.XAU===250&&summary.totalSupplyMg.XAU===3000&&summary.reconciled,'Unexpected isolated stock totals');
  snapshot.mineHash=hash(project(summary,mineFields));snapshot.preparedAt=new Date().toISOString();
  await writeFile(snapshotPath,JSON.stringify(snapshot,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log('PASS prepare: isolated mine, two buyers, operator, purchases, reservation and stock saved. Snapshot contains private test tokens; do not publish.');
 }else{
  for(const name of ['a','b','op']){
   const me=await req('/api/demo/accounts/me',{token:snapshot.users[name].token});
   assert.ok(me.account.id===snapshot.users[name].accountId&&me.account.role===snapshot.users[name].role&&me.mine.id===snapshot.mineId,'Original token identity did not survive restart');
  }
  const checkState=async()=>{
   for(const name of ['a','b'])assert.equal(hash(project(await req('/api/demo/state',{token:snapshot.users[name].token}),stateFields)),snapshot.stateHashes[name],`Buyer ${name} state changed`);
   const summary=await req('/api/demo/mine/summary',{token:snapshot.users.op.token});assert.equal(hash(project(summary,mineFields)),snapshot.mineHash,'Mine inventory or operations changed');
   for(const metal of ['XAU','XAG','XPT','XPD'])assert.ok(summary.inventoryMg[metal]+summary.allocatedMg[metal]===summary.totalSupplyMg[metal]&&summary.reservedMg[metal]<=summary.allocatedMg[metal],'Inventory reconciliation failed');
  };
  await checkState();
  for(const name of ['a','b','offer']){
   const user=name==='b'?'b':'a';const receipt=await req(`/api/demo/receipts/${snapshot.receipts[name].id}`,{token:snapshot.users[user].token});assert.equal(hash(receipt),hash(snapshot.receipts[name]),'Historical buyer receipt changed');
  }
  for(const [name,command] of Object.entries(snapshot.commands)){
   const user=name==='stock'?'op':name==='b'?'b':'a';const replay=await req(`/api/demo/${command.action}`,{token:snapshot.users[user].token,body:command.body,key:command.key});
   assert.ok(replay.receipt.replayed===true,'Replay was not recognized');const {replayed,...receipt}=replay.receipt;assert.equal(hash(receipt),hash(snapshot.receipts[name]),'Replay changed original receipt');
  }
  await checkState();
  for(const name of ['a','b'])await req('/api/demo/mine/summary',{token:snapshot.users[name].token,expected:403});
  await req('/api/demo/buy',{token:snapshot.users.op.token,body:{metal:'XAU',grams:'0.100'},key:randomUUID(),expected:403});
  const inspected=await req(`/api/demo/mine/receipts/${snapshot.users.a.accountId}/${snapshot.receipts.a.id}`,{token:snapshot.users.op.token});assert.ok(inspected.operatorView===true&&!Object.hasOwn(inspected,'balancesAfter'),'Operator private-balance redaction failed');
  await req(`/api/demo/receipts/${snapshot.receipts.a.id}`,{token:snapshot.users.b.token,expected:404});
  console.log('PASS verify: original tokens survived; buyer/mine canonical hashes, receipts, all replays, stock reconciliation, 403 roles, receipt redaction and buyer isolation passed.');
  console.log('This script does not restart Railway or independently prove a restart occurred.');
 }
}catch(error){console.error(`ACCOUNTS PERSISTENCE ${phase||''} FAILED:`,error.message);process.exitCode=1;}
