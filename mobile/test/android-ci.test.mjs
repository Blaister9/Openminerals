import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {spawnSync} from 'node:child_process';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {API,BASELINE,PACKAGE,SECRET_NAMES,apkUrl,sha,otaUpdateId,fixtures,emulatorGuard,publicJunit,manifest,certificate,cleanFixture} from '../e2e/ci-safety.mjs';
import {verifyNativeSnapshot} from '../e2e/ci-result.mjs';
import {flowSelectors,failureDiagnostic} from '../e2e/ci-diagnostics.mjs';
import {createStore} from '../../api/src/store.js';
import {createApiServer} from '../../api/src/server.js';
import {seedState} from '../../api/src/domain.js';

// YAML is already pinned by the Expo toolchain lockfile; no new runtime package.
const yaml=createRequire(import.meta.url)('yaml');
const source=path=>readFile(new URL(path,import.meta.url),'utf8');

test('Android CI: APK URLs reject credentials redirects parameters and normalization tricks',()=>{
  assert.equal(apkUrl(BASELINE.url),BASELINE.url);
  assert.equal(apkUrl('https://expo.dev/artifacts/eas/abc-_123.apk'),'https://expo.dev/artifacts/eas/abc-_123.apk');
  for(const value of ['http://expo.dev/artifacts/eas/abc.apk','https://user:pass@expo.dev/artifacts/eas/abc.apk','https://expo.dev:443/artifacts/eas/abc.apk','https://expo.dev/artifacts/eas/abc.apk?token=x','https://expo.dev/artifacts/eas/abc.apk#x','https://expo.dev/artifacts/eas/abc.apk?','https://expo.dev/artifacts/eas/abc.apk#','https://expo.dev.evil.example/artifacts/eas/abc.apk','https://expo.dev/artifacts/eas/%2F.apk','https://github.com/another/repo/releases/download/v1/app.apk','https://github.com/Blaister9/Openminerals/raw/main/file.apk'])assert.throws(()=>apkUrl(value));
  assert.equal(sha(BASELINE.sha256).length,64);
  for(const value of ['a'.repeat(63),'A'.repeat(64),'z'.repeat(64),' '+BASELINE.sha256])assert.throws(()=>sha(value));
});

test('Android CI: fixtures require six distinct private env values and no admin secret',()=>{
  const env=Object.fromEntries(SECRET_NAMES.map((name,index)=>[name,index%2?'PrivateFixtureOnly_'+index:'qa_fixture_'+index]));
  const result=fixtures(env);assert.equal(result.a.role,'buyer');assert.equal(result.b.role,'buyer');assert.equal(result.op.role,'operator');
  for(const name of SECRET_NAMES){const missing={...env};delete missing[name];assert.throws(()=>fixtures(missing));}
  assert.throws(()=>fixtures({...env,OPENMINERALS_QA_BUYER_B_ALIAS:env.OPENMINERALS_QA_BUYER_A_ALIAS}));
  assert.throws(()=>fixtures({...env,OPENMINERALS_QA_OPERATOR_PASSWORD:'invalid whitespace secret'}));
  assert.equal(SECRET_NAMES.some(name=>name.includes('ADMIN')),false);
});

test('Android CI: optional OTA requires a canonical UUID and rejects executable or ambiguous input',()=>{
  const id='01a1857b-8ead-7eab-bf35-a0850d37caa8';
  assert.equal(otaUpdateId(undefined),null);assert.equal(otaUpdateId(''),null);
  assert.equal(otaUpdateId(id),id);assert.equal(otaUpdateId(randomUUID()).length,36);
  for(const value of [null,0,{},[id],' ',id.toUpperCase(),' '+id,id+'\n',id+'; echo unsafe','$(echo unsafe)','${{ secrets.TOKEN }}','--update-id='+id,'https://example.com/'+id,'00000000-0000-0000-0000-000000000000',id.replace('-bf35-','-7f35-'),id.replace('-7eab-','-0eab-')]){
    assert.throws(()=>otaUpdateId(value),/^Error: Expected an optional canonical lowercase OTA update UUID\.$/);
  }
});

test('Android CI: malformed OTA is rejected before runner files or external CLI can be invoked',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'openminerals-ota-validation-'));
  assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep+'openminerals-ota-validation-'));
  try{
    // Absolute Node path plus an empty PATH prevents any CLI/network fallback
    // even if an ordering regression reaches the download implementation.
    const result=spawnSync(process.execPath,[fileURLToPath(new URL('../e2e/ci-android.mjs',import.meta.url)),'download'],{
      encoding:'utf8',timeout:10000,env:{...process.env,PATH:directory,GITHUB_ACTIONS:'true',RUNNER_OS:'Linux',RUNNER_TEMP:directory,APK_INPUT_URL:BASELINE.url,APK_INPUT_SHA256:BASELINE.sha256,OTA_INPUT_UPDATE_ID:'not-a-uuid; echo private_payload'},
    });
    assert.equal(result.error,undefined);assert.equal(result.status,1);
    assert.match(result.stderr,/FAIL native CI stage: configuration/);
    assert.doesNotMatch(result.stderr+result.stdout,/not-a-uuid|private_payload/);
    assert.deepEqual(await readdir(directory),[]);
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('Android CI: adb guard refuses physical offline multiple and local devices before mutation',()=>{
  const env={GITHUB_ACTIONS:'true',RUNNER_OS:'Linux'},device='List of devices attached\nemulator-5554\tdevice\n';
  assert.equal(emulatorGuard(env,device,'1'),'emulator-5554');
  for(const values of [[{},device,'1'],[{...env,RUNNER_OS:'Windows'},device,'1'],[env,device,'0'],[env,'List of devices attached\nphone123\tdevice\n','1'],[env,device+'phone123\toffline\n','1'],[env,device+'emulator-5556\tdevice\n','1'],[env,'List of devices attached\n','1']])assert.throws(()=>emulatorGuard(...values));
});

test('Android CI: required manifest and actual signing digest cannot be skipped',()=>{
  assert.deepEqual(manifest("package: name='"+PACKAGE+"' versionCode='5' versionName='0.2.0'\nsdkVersion:'24'\n"),{package:PACKAGE,code:5,name:'0.2.0',minSdk:24});
  assert.throws(()=>manifest('unparseable manifest'));
  assert.equal(certificate('Signer #1 certificate SHA-256 digest: '+BASELINE.certificate),BASELINE.certificate);
  assert.throws(()=>certificate('Signer unavailable - skipped'));
  assert.throws(()=>certificate('certificate SHA-256 digest: '+'0'.repeat(64)));
});

test('Android CI: public JUnit preserves failures but drops private logs screenshots and XML payloads',()=>{
  const secret='private_fixture_token_abcdefghijklmnop';
  const rows=[{name:'native-registration-no-import',ok:true,seconds:1,raw:secret},{name:'buyer-a-convert-buy-certificate-offer',ok:false,seconds:2,raw:'<system-out>'+secret+'</system-out>'}];
  const text=publicJunit(rows,[secret]);
  assert.match(text,/tests="2" failures="1"/);assert.match(text,/<failure message=/);
  assert.equal(text.includes(secret),false);assert.equal(text.includes('system-out'),false);
  assert.throws(()=>publicJunit([{name:secret,ok:true,seconds:1}],[secret]));
  assert.throws(()=>publicJunit([{name:'invalid<script>',ok:true,seconds:1}]));
  assert.throws(()=>publicJunit([{name:'valid-label',ok:true,seconds:Infinity}]));
});

test('Android CI: failure context contains only fixed flow selectors and closed categories',()=>{
  const secret='never_publish_this_fixture_password';
  const selectors=flowSelectors('- tapOn: ^Cuenta$\n- text: ^Comprobante$\n- inputText: '+secret+'\n- tapOn: '+('$'+'{MAESTRO_LOGIN_ALIAS}')+'\n');
  const diagnostic=failureDiagnostic('✅ Tap on Cuenta\ninputText '+secret+'\n❌ Assertion is false: ^Comprobante$; actual alias '+secret,selectors);
  assert.equal(diagnostic.category,'assertion-failed');assert.deepEqual(diagnostic.expectedSelectorsFromFlow,['^Comprobante$']);
  assert.equal(JSON.stringify(diagnostic).includes(secret),false);assert.equal(JSON.stringify(diagnostic).includes('MAESTRO_LOGIN_ALIAS'),false);
  assert.equal(failureDiagnostic('java.io.IOException: Broken pipe '+secret,selectors).category,'android-driver-or-system');
  assert.equal(failureDiagnostic('Element not found: ^Cuenta$',selectors).category,'selector-not-found');
});

test('Android CI: fixtures reject owner mine imported state previous receipts and shared accounts',()=>{
  const me={demoOnly:true,mine:{id:'mine-isolated-unit',name:'Native QA DEMO unit'}};
  const state=seedState(),summary={inventoryMg:{XAU:5000},totalSupplyMg:{XAU:5000},allocatedMg:{XAU:0},accountCount:2};
  assert.doesNotThrow(()=>cleanFixture(me,state,summary));
  assert.throws(()=>cleanFixture({...me,mine:{id:'openminerals-demo-v1',name:'Native QA DEMO unit'}},state,summary));
  assert.throws(()=>cleanFixture(me,{...state,holdingsMg:{...state.holdingsMg,XAU:100}},summary));
  assert.throws(()=>cleanFixture(me,{...state,receipts:{old:{id:'old'}}},summary));
  assert.throws(()=>cleanFixture(me,state,{...summary,accountCount:3}));
});

test('Android CI: workflow is manual KVM-only bounded public upload and no secret inputs',async()=>{
  const raw=await source('../../.github/workflows/android-ui.yml'),workflow=yaml.parse(raw);
  assert.deepEqual(Object.keys(workflow.on),['workflow_dispatch']);
  assert.deepEqual(Object.keys(workflow.on.workflow_dispatch.inputs),['apk_url','apk_sha256','ota_update_id']);
  assert.deepEqual(workflow.on.workflow_dispatch.inputs.ota_update_id,{description:'Optional full published Android update UUID for runtime 0.2.0 on channel demo',type:'string',required:false,default:''});
  const job=workflow.jobs['android-ui'];assert.equal(job['runs-on'],'ubuntu-24.04');
  assert.equal(job.if,'github.event.repository.private == false');
  assert.equal(workflow.concurrency['cancel-in-progress'],false);
  assert.match(raw,/udevadm trigger --name-match=kvm/);assert.match(raw,/test -r \/dev\/kvm && test -w \/dev\/kvm/);
  const runner=job.steps.find(step=>step.uses?.startsWith('ReactiveCircus/'));
  assert.equal(runner.with['disable-linux-hw-accel'],false);assert.match(runner.with['emulator-options'],/-accel on/);assert.doesNotMatch(raw,/-accel off|software-acceleration fallback/);
  assert.deepEqual(Object.keys(runner.env).sort(),[...SECRET_NAMES,'OTA_INPUT_UPDATE_ID'].sort());
  assert.equal(runner.env.OTA_INPUT_UPDATE_ID,'$'+'{{ inputs.ota_update_id }}');
  const download=job.steps.find(step=>step.run?.endsWith('ci-android.mjs download'));
  assert.equal(download.env.OTA_INPUT_UPDATE_ID,'$'+'{{ inputs.ota_update_id }}');
  for(const step of job.steps)assert.doesNotMatch((step.run??'')+(step.with?.script??''),/inputs\.ota_update_id/);
  const uploader=job.steps.find(step=>step.uses?.startsWith('actions/upload-artifact'));
  assert.equal(uploader.with.path,'$'+'{{ runner.temp }}/openminerals-native/public/');assert.equal(uploader.with['retention-days'],1);
  assert.doesNotMatch(raw,/DEMO_ADMIN_TOKEN|tee .*maestro|debug-output|logcat|hierarchy/);
  assert.match(raw,/a6044a84542f522f434c5dc3d609e60c7446d423f3ed1b2ae513f5c48663ec5e/);
  for(const step of job.steps.filter(step=>step.uses))assert.match(step.uses,/@[a-f0-9]{40}$/);
});

test('Android CI: new Maestro documents preserve data and only anonymous phases capture screenshots',async()=>{
  const folder=new URL('../e2e/native/',import.meta.url),files=await readdir(folder);
  const actions=new Set(['tapOn','scrollUntilVisible','extendedWaitUntil','assertVisible','assertNotVisible','inputText','runFlow','takeScreenshot','swipe']);
  for(const file of files){
    const text=await readFile(new URL(file,folder),'utf8'),documents=yaml.parseAllDocuments(text);
    assert.equal(documents.length,2);assert.ok(documents.every(document=>document.errors.length===0));
    assert.equal(documents[0].toJSON().appId,PACKAGE);
    const commands=documents[1].toJSON();assert.ok(Array.isArray(commands)&&commands.length>0);
    assert.doesNotMatch(JSON.stringify(documents.map(document=>document.toJSON())),/clearState|clearKeychain|pm clear|uninstall|reloadAsync|Generar y mostrar clave/);
    for(const command of commands){
      if(typeof command==='string'){assert.ok(['launchApp','stopApp','eraseText','hideKeyboard'].includes(command));continue;}
      assert.equal(Object.keys(command).length,1);const action=Object.keys(command)[0];assert.ok(actions.has(action));
      if(action==='takeScreenshot'){assert.ok(['preserve.yaml','story.yaml'].includes(file));assert.match(command[action],/^safe-/);}
    }
  }
  const runner=await source('../e2e/ci-android.mjs');
  assert.ok(runner.indexOf("emulatorGuard(process.env")<runner.indexOf("adb('install'"));
  assert.ok(runner.indexOf("'legacy-seed-old-apk'")<runner.indexOf("adb('install','-r'"));
  assert.equal((runner.match(/adb\('install','-r'/g)||[]).length,1);
  assert.doesNotMatch(runner,/pm','clear|adb\('uninstall/);
  assert.match(await source('../e2e/native/story.yaml'),/notVisible: Saltar recorrido/);
});

test('Android CI: optional OTA follows native verification, passes ID only by env and verifies unchanged results again',async()=>{
  const runner=await source('../e2e/ci-android.mjs');
  assert.match(runner,/MAESTRO_EXPECTED_OTA_ID:name==='ota'\?\(expectedOtaId\?\?''\):''/);
  assert.match(runner,/await runStage\('api-verifies-native-wallets-lots-fees',verifyNative\);\s+if\(expectedOtaId\)\{\s+await runStage\('buyer-compatible-ota-cold-launch',\(\)=>maestro\('ota','a'\)\);\s+await runStage\('api-verifies-data-after-compatible-ota',verifyNative\);\s+\}/);
  assert.match(runner,/try\{\s+\/\/[^\n]+\n\s+expectedOtaId=otaUpdateId\(process.env.OTA_INPUT_UPDATE_ID\);\s+const mode=/);
  const cli=runner.slice(runner.indexOf("command('maestro'"),runner.indexOf("async function captureSafeScreens"));
  assert.doesNotMatch(cli,/expectedOtaId|MAESTRO_EXPECTED_OTA_ID/);
  const ota=await source('../e2e/native/ota.yaml');
  assert.equal((ota.match(/MAESTRO_EXPECTED_OTA_ID\.slice\(0,8\)/g)||[]).length,2);
  assert.equal((ota.match(/^- stopApp$/gm)||[]).length,2);
  assert.doesNotMatch(JSON.stringify(yaml.parseAllDocuments(ota).map(document=>document.toJSON())),/clearState|clearKeychain|reloadAsync|inputText|runFlow|takeScreenshot/);
  assert.match(ota,/text: \^USDT 287,89\$/);
});

// Execute the exact intended business amounts against the actual HTTP serializer,
// without an emulator, the public default mine, Railway or real credentials.
test('Android CI: planned native postconditions match real isolated HTTP API DTOs',async t=>{
  const store=await createStore(''),mine=await store.createMine({name:'Native QA DEMO unit-http',initialInventoryMg:{XAU:5000,XAG:5000,XPT:5000,XPD:5000}});
  const accounts={};for(const [name,role] of [['a','buyer'],['b','buyer'],['op','operator']])accounts[name]=await store.createAccount({alias:'qa_http_'+name,password:'QA-exclusive-test-password',mineId:mine.id,role});
  const server=createApiServer(store);server.listen(0,'127.0.0.1');await once(server,'listening');
  t.after(async()=>{await new Promise(resolve=>server.close(resolve));await store.close();});
  const base='http://127.0.0.1:'+server.address().port,tokens={};
  async function http(name,path,body,key=body?randomUUID():undefined){
    const response=await fetch(base+'/api/demo/'+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(tokens[name]?{Authorization:'Bearer '+tokens[name]}:{}),...(key?{'Idempotency-Key':key}:{})},body:body?JSON.stringify(body):undefined});
    assert.equal(response.status,200,'Synthetic HTTP fixture must succeed');return response.json();
  }
  for(const name of ['a','b','op'])tokens[name]=(await http(name,'accounts/login',{alias:accounts[name].alias,password:'QA-exclusive-test-password'})).token;
  cleanFixture(await http('a','accounts/me'),await http('a','state'),await http('op','mine/summary'));
  await http('a','convert',{from:'USD',to:'USDT',amount:'200'});
  await http('a','buy',{metal:'XAU',grams:'2'});
  const offer=(await http('a','offer',{metal:'XAU',grams:'0.5',price:'140'})).receipt.offer;
  await http('b','market_buy',{sellerId:accounts.a.id,offerId:offer.id});
  await http('a','sell',{metal:'XAU',grams:'0.5'});
  const delivery=(await http('a','delivery',{metal:'XAU',grams:'0.5',jurisdiction:'DEMO_LOCAL'})).receipt.delivery;
  const quote=(await http('op','mine/delivery_quote',{buyerId:accounts.a.id,deliveryId:delivery.id,jurisdiction:'DEMO_LOCAL'})).receipt.quote;
  await http('a','delivery_accept',{deliveryId:delivery.id,quoteId:quote.id});
  for(const status of ['PREPARING','DISPATCHED_DEMO','DELIVERED_DEMO'])await http('op','mine/delivery_transition',{buyerId:accounts.a.id,deliveryId:delivery.id,status,reason:'Paso ficticio QA sin transporte real'});
  await http('op','mine/stock',{metal:'XAU',grams:'1',reason:'Lote ficticio QA',purityBps:'9999',location:'DEMO QA sin ubicación real',documentTitle:'Registro ficticio QA',documentContent:'Documento DEMO sin recepción física.'});
  await http('a','accounts/profile',{displayName:'Comprador QA DEMO',preferredCurrency:'EUR',jurisdiction:'DEMO_REGIONAL'});
  const snapshot={
    a:await http('a','state'),b:await http('b','state'),summary:await http('op','mine/summary'),
    ca:await http('a','custody'),cb:await http('b','custody'),cm:await http('op','mine/custody'),
    management:await http('op','mine/management?limit=50'),profile:await http('a','accounts/profile'),history:await http('a','history?limit=50'),
  };
  assert.doesNotThrow(()=>verifyNativeSnapshot(snapshot));
  const extraFee=structuredClone(snapshot);extraFee.management.kpis.tradingFeesMinor+=84;
  assert.throws(()=>verifyNativeSnapshot(extraFee));
  const privateLeak=structuredClone(snapshot);privateLeak.management.walletMinor={USDT:1};
  assert.throws(()=>verifyNativeSnapshot(privateLeak));
});
