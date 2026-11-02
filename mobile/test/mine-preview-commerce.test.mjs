import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,readdir,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {SECRET_NAMES,PACKAGE} from '../e2e/ci-safety.mjs';
import {R5_SECRET_NAMES,COMMERCE_PHASES,r5Fixtures,r5BuildRecord,isolatedR5Mine,verifyR5DeliveryPolicy,previewCommerceFlow,observerOnlyRequest,verifyR5CommerceSnapshot} from '../e2e/mine-preview-commerce.mjs';
import {qualityFlow} from '../e2e/network-quality.mjs';
import {embeddedFlow,authenticatedFlow} from '../e2e/release-contract.mjs';
import {createStore} from '../../api/src/store.js';
import {createApiServer} from '../../api/src/server.js';
const yaml=createRequire(import.meta.url)('yaml');
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const record=()=>({demoOnly:true,revision:'r5',status:'FINISHED',versionCode:5,package:'com.openminerals.demo.minepreview',version:'0.4.0',runtime:'0.4.0',channel:'mine-realism',sourceCommit:'a'.repeat(40),apkUrl:'https://expo.dev/artifacts/eas/fixture.apk',apkSha256:'b'.repeat(64),sha256:'b'.repeat(64),certificateSha256:'c'.repeat(64),certificate:'c'.repeat(64)});

test('R5 accepts only its exact finished preview APK and consistent source/hash record',()=>{
  assert.equal(r5BuildRecord(record()).digest,'b'.repeat(64));
  for(const patch of [{revision:'r4'},{versionCode:4},{status:'IN_PROGRESS'},{package:PACKAGE},{channel:'demo'},{runtime:'0.3.0'},{sourceCommit:'unknown'},{sha256:'d'.repeat(64)},{certificate:'e'.repeat(64)},{apkUrl:'https://foreign.example/app.apk'}])assert.throws(()=>r5BuildRecord({...record(),...patch}));
});
test('R5 never falls back to the six stable QA secrets',()=>{
  const values=R5_SECRET_NAMES.map((key,index)=>[key,index%2?'R5_private_fixture_password_'+index:'r5_private_alias_'+index]);
  assert.equal(r5Fixtures(Object.fromEntries(values)).op.role,'operator');
  assert.throws(()=>r5Fixtures(Object.fromEntries(SECRET_NAMES.map((key,index)=>[key,values[index][1]]))));
  for(const key of R5_SECRET_NAMES){const env=Object.fromEntries(values);delete env[key];assert.throws(()=>r5Fixtures(env));}
  assert.ok(R5_SECRET_NAMES.every(value=>value.startsWith('OPENMINERALS_MINE_R5_QA_')));
});
test('R5 rejects old, public, cross-mine, or non-isolated fixture identities',()=>{
  const users={};for(const [key,role] of [['a','buyer'],['b','buyer'],['op','operator']])users[key]={me:{demoOnly:true,account:{id:key,role,mineId:'mine-r5-fixture'},mine:{id:'mine-r5-fixture',name:role==='operator'?'Native QA DEMO r5-native-unit':'Mina virtual ficticia DEMO'}}};
  assert.doesNotThrow(()=>isolatedR5Mine(users));
  for(const change of [value=>value.op.me.mine.name='Native QA DEMO old-rc',value=>value.a.me.mine.id='mine-other',value=>value.b.me.account.id='a',value=>value.op.me.demoOnly=false]){const next=structuredClone(users);change(next);assert.throws(()=>isolatedR5Mine(next));}
});
test('R5 rejects changed requirement text or delivery costs before UI can mutate a fixture',()=>{
  const policy={id:'DEMO_LOCAL',serviceMinor:200,preparationMinor:300,transportMinor:500,insuranceBps:0,taxBps:0,requirements:['Usar exclusivamente alias e identificadores ficticios','Confirmar que no se enviará metal ni se aportará una dirección real']};
  assert.doesNotThrow(()=>verifyR5DeliveryPolicy({policies:{jurisdictions:[policy]}}));
  for(const patch of [{requirements:['Different requirement','Another requirement']},{transportMinor:501},{taxBps:1},{requirements:[...policy.requirements].reverse()},{id:'DEMO_REGIONAL'}])assert.throws(()=>verifyR5DeliveryPolicy({policies:{jurisdictions:[{...policy,...patch}]}}));
});
test('R5 adapts every commercial and child flow to preview while retaining business checks',async()=>{
  const names=['login','wallet-balance-rail',...COMMERCE_PHASES.map(value=>value[1])];
  for(const name of names){
    const source=await read('../e2e/native/'+name+'.yaml'),text=previewCommerceFlow(name,source),documents=yaml.parseAllDocuments(text);
    assert.equal(documents.length,2);assert.ok(documents.every(value=>value.errors.length===0),name);
    assert.equal(documents[0].toJSON().appId,'com.openminerals.demo.minepreview');
    assert.doesNotMatch(text,/clearState|clearKeychain|takeScreenshot|startRecording|openLink/);
    for(const match of source.matchAll(/^\s*(?:visible|assertVisible): (.+)$/gm))assert.ok(text.includes(match[1]),name+' retained assertion '+match[1]);
  }
  const text=previewCommerceFlow('buyer-a-buy',await read('../e2e/native/buyer-a-buy.yaml'));
  assert.match(text,/USDT 157,10/);assert.match(text,/Ver certificado demo/);assert.match(text,/Historial del lote DEMO/);
  assert.match(previewCommerceFlow('operator',await read('../e2e/native/operator.yaml')),/assertNotVisible: \^Saldo USDT después\$/);
});
test('R5 allows the reviewed JSON network/source flows and refuses unapproved actions or targets',async()=>{
  const cases=[...['login','insufficient','prepare','offline','resolve'].map(name=>['quality-'+name,qualityFlow(name)]),['embedded',embeddedFlow('0.4.0')],['authenticated',authenticatedFlow()]];
  for(const [name,source] of cases){const text=previewCommerceFlow(name,source),docs=yaml.parseAllDocuments(text);assert.ok(docs.every(value=>value.errors.length===0));assert.equal(docs[0].toJSON().appId,'com.openminerals.demo.minepreview');}
  for(const source of ['appId: foreign.app\n---\n- launchApp\n','appId: '+PACKAGE+'\n---\n- launchApp:\n    clearState: true\n','appId: '+PACKAGE+'\n---\n- runFlow:\n    file: foreign.yaml\n','appId: '+PACKAGE+'\n---\n- takeScreenshot: private\n'])assert.throws(()=>previewCommerceFlow('login',source));
  assert.throws(()=>previewCommerceFlow('unreviewed','appId: '+PACKAGE+'\n---\n- launchApp\n'));
});
test('R5 API observer allows auth and GET inspection but refuses any business mutation',async()=>{
  const calls=[],request=observerOnlyRequest(async(...args)=>{calls.push(args);return {ok:true};});
  await request('/health');await request('/api/demo/state','token');await request('/api/demo/accounts/login',null,{alias:'fictitious',password:'private-demo-only'});await request('/api/demo/accounts/logout','token',{});
  for(const path of ['/api/demo/buy','/api/demo/mine/stock','/api/demo/admin/mines','/api/demo/delivery_accept','https://foreign.example'])assert.throws(()=>request(path,'token',{}));
  assert.equal(calls.length,4);
});
test('R5 rejects local execution before external commands or cleanup of an existing directory',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'openminerals-r5-guard-'));assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep+'openminerals-r5-guard-'));
  try{
    const privateRoot=join(directory,'openminerals-mine-r5-commerce','private');await mkdir(privateRoot,{recursive:true});await writeFile(join(privateRoot,'preserve.txt'),'owned-by-previous-session');
    const value=spawnSync(process.execPath,[fileURLToPath(new URL('../e2e/mine-preview-commerce.mjs',import.meta.url)),'run'],{encoding:'utf8',timeout:10000,env:{...process.env,PATH:directory,RUNNER_TEMP:directory,GITHUB_ACTIONS:'false',RUNNER_OS:'Windows'}});
    assert.equal(value.error,undefined);assert.equal(value.status,1);assert.match(value.stderr,/FAIL R5 authenticated acceptance stage: configuration/);assert.equal(await readFile(join(privateRoot,'preserve.txt'),'utf8'),'owned-by-previous-session');assert.deepEqual(await readdir(join(directory,'openminerals-mine-r5-commerce')),['private']);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('R5 offline compensating entries compose with the full real HTTP commercial DTOs without changing expected stock or money',async t=>{
  const store=await createStore(''),mine=await store.createMine({name:'Native QA DEMO r5-native-unit',initialInventoryMg:{XAU:5000,XAG:5000,XPT:5000,XPD:5000}}),accounts={};
  for(const [key,role] of [['a','buyer'],['b','buyer'],['op','operator']])accounts[key]=await store.createAccount({alias:'qa_r5_unit_'+key,password:'R5-private-unit-password',mineId:mine.id,role});
  const server=createApiServer(store);server.listen(0,'127.0.0.1');await once(server,'listening');t.after(async()=>{await new Promise(resolve=>server.close(resolve));await store.close();});
  const base='http://127.0.0.1:'+server.address().port,tokens={};
  async function http(name,path,body,key=body?randomUUID():undefined){const response=await fetch(base+'/api/demo/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(tokens[name]?{Authorization:'Bearer '+tokens[name]}:{}),...(key?{'Idempotency-Key':key}:{})},body:body?JSON.stringify(body):undefined});assert.equal(response.status,200);return response.json();}
  for(const name of ['a','b','op'])tokens[name]=(await http(name,'accounts/login',{alias:accounts[name].alias,password:'R5-private-unit-password'})).token;
  const withdrawKey=randomUUID();await http('a','withdraw',{currency:'USD',amount:'0.01'},withdrawKey);await http('a','withdraw',{currency:'USD',amount:'0.01'},withdrawKey);await http('a','deposit',{currency:'USD',amount:'0.01'});
  await http('a','convert',{from:'USD',to:'USDT',amount:'200'});await http('a','buy',{metal:'XAU',grams:'2'});
  const offer=(await http('a','offer',{metal:'XAU',grams:'0.5',price:'140'})).receipt.offer;await http('b','market_buy',{sellerId:accounts.a.id,offerId:offer.id});await http('a','sell',{metal:'XAU',grams:'0.5'});
  const delivery=(await http('a','delivery',{metal:'XAU',grams:'0.5',jurisdiction:'DEMO_LOCAL'})).receipt.delivery,quote=(await http('op','mine/delivery_quote',{buyerId:accounts.a.id,deliveryId:delivery.id,jurisdiction:'DEMO_LOCAL'})).receipt.quote;
  await http('a','delivery_accept',{deliveryId:delivery.id,quoteId:quote.id});
  for(const status of ['PREPARING','DISPATCHED_DEMO','DELIVERED_DEMO'])await http('op','mine/delivery_transition',{buyerId:accounts.a.id,deliveryId:delivery.id,status,reason:'Paso R5 ficticio sin transporte real'});
  const batch=(await http('op','mine/intake_produce',{metal:'XAU',grams:'1',reason:'Producción para presentación DEMO'})).receipt.batchId;
  assert.equal((await http('op','mine/summary')).inventoryMg.XAU,3500,'Production must not create sellable stock');
  await http('op','mine/intake_verify',{batchId:batch,reason:'Paso a verificación DEMO'});
  assert.equal((await http('op','mine/summary')).inventoryMg.XAU,3500,'Verification must not create sellable stock');
  await http('op','mine/intake_receive',{batchId:batch,reason:'Recepción confirmada exclusivamente DEMO'});
  await http('a','accounts/profile',{displayName:'Comprador QA DEMO',preferredCurrency:'EUR',jurisdiction:'DEMO_REGIONAL'});
  const snapshot={a:await http('a','state'),b:await http('b','state'),summary:await http('op','mine/summary'),ca:await http('a','custody'),cb:await http('b','custody'),cm:await http('op','mine/custody'),management:await http('op','mine/management?limit=50'),profile:await http('a','accounts/profile'),history:await http('a','history?limit=50')};
  const lot=snapshot.ca.allocations.find(value=>value.mg>0).lotId,path='custody/lots/'+lot+'/history?limit=20';snapshot.ha=await http('a',path);snapshot.hb=await http('b',path);snapshot.hm=await http('op',path);
  assert.doesNotThrow(()=>verifyR5CommerceSnapshot(snapshot));assert.equal(snapshot.a.walletMinor.USDT,28789);assert.equal(snapshot.summary.inventoryMg.XAU,4500);
  const duplicate=structuredClone(snapshot),withdraw=Object.values(duplicate.a.receipts).find(value=>value.action==='withdraw');duplicate.a.receipts['duplicate-test']=withdraw;assert.throws(()=>verifyR5CommerceSnapshot(duplicate));
  const lost=structuredClone(snapshot);for(const [key,value] of Object.entries(lost.a.receipts))if(value.action==='deposit')delete lost.a.receipts[key];assert.throws(()=>verifyR5CommerceSnapshot(lost));
});

test('R5 workflow keeps fixture namespaces, stable workflows and private artifacts separate',async()=>{
  const source=await read('../../.github/workflows/android-mine-preview-commerce.yml'),doc=yaml.parseDocument(source);assert.equal(doc.errors.length,0);
  const workflow=doc.toJSON(),job=workflow.jobs['authenticated-commerce'];assert.equal(job['runs-on'],'ubuntu-24.04');assert.equal(job.concurrency['cancel-in-progress'],false);assert.match(job.if,/head\.repo\.full_name == github\.repository/);
  assert.doesNotMatch(source,/pull_request_target|secrets\.OPENMINERALS_QA_|DEMO_ADMIN_TOKEN|DATABASE_URL|EXPO_TOKEN/);
  const upload=job.steps.find(value=>value.uses?.startsWith('actions/upload-artifact@'));assert.equal(upload.with.path,'${{ runner.temp }}/openminerals-mine-r5-commerce/public/');assert.equal(job.steps.find(value=>value.uses?.startsWith('ReactiveCircus/')).with['api-level'],29);
  const harness=await read('../e2e/mine-preview-commerce.mjs');assert.doesNotMatch(harness,/adb\('uninstall'|pm','clear|install','-r/);assert.match(harness,/await rm\(privateRoot/);
});
