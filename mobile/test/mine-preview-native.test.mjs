import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {PRESENTED,PREVIEW,previewInputs,previewFlow,gestureTrace,executeTrace,metadataValue,verifyArtifact,installedIdentity,assertStablePreserved,legacyCommerceFlow,publicFailureReason,anonymousSceneFlags,authorizedAuthFlow,authorizedPublicOperator,publicOperatorPreflight} from '../e2e/mine-preview.mjs';
import {API,PACKAGE} from '../e2e/ci-safety.mjs';
import {embeddedFlow} from '../e2e/release-contract.mjs';
const yaml=createRequire(import.meta.url)('yaml');
const read=path=>readFile(new URL(path,import.meta.url),'utf8');
const meta=(name,value)=>'  E: meta-data (line=20)\n    A: android:name(0x01010003)='+JSON.stringify('expo.modules.updates.'+name)+'\n    A: android:value(0x01010024)='+value+'\n';
function artifact(kind='after'){
  const app=kind==='before'?PRESENTED:PREVIEW,cert=kind==='before'?PRESENTED.certificate:'a'.repeat(64);
  return {kind,info:{package:app.package,name:app.version,code:app.code,minSdk:24},badging:'',files:'lib/arm64-v8a/libexpo-gl.so\nlib/x86_64/libexpo-gl.so\n',
    xml:meta('EXPO_RUNTIME_VERSION',JSON.stringify(app.runtime))+meta('ENABLED','(type 0x12)0xffffffff')+meta('EXPO_UPDATE_URL',JSON.stringify('https://u.expo.dev/c3985e04-43dd-4896-9f8a-09366b6a3579'))+meta('UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY',JSON.stringify(JSON.stringify({'expo-channel-name':app.channel}))),resources:'',bundle:Buffer.from(API+'x'.repeat(2000)),signature:'Signer #1 certificate SHA-256 digest: '+cert,expectedCertificate:cert};
}

test('preview QA pins the presented 0.3.0 bytes and separates Android package/runtime/channel',()=>{
  assert.equal(PRESENTED.sha256,'d99e8af9617f56d7862a849ebd057025cb9d6adc164b97496a5532f7b29ad29e');
  assert.equal(PRESENTED.source,'eae7f6ad57f5a667c2bf40775a4cb30f1c0dd8b6');
  assert.equal(PRESENTED.package,PACKAGE);assert.equal(PRESENTED.version,'0.3.0');assert.equal(PRESENTED.code,6);
  assert.equal(PREVIEW.package,'com.openminerals.demo.minepreview');assert.equal(PREVIEW.version,'0.4.0');assert.equal(PREVIEW.code,1);
  assert.notEqual(PREVIEW.runtime,PRESENTED.runtime);assert.notEqual(PREVIEW.channel,PRESENTED.channel);
});

test('preview QA permits public release mirrors but never changes the presented APK digest',()=>{
  const record={apkUrl:'https://github.com/Blaister9/Openminerals/releases/download/mine-preview/candidate.apk',apkSha256:'a'.repeat(64),certificateSha256:'b'.repeat(64),baselineApkUrl:'https://github.com/Blaister9/Openminerals/releases/download/mine-preview/presented-030.apk'};
  assert.deepEqual(previewInputs({},record),{url:record.apkUrl,digest:record.apkSha256,certificate:record.certificateSha256,baselineUrl:record.baselineApkUrl});
  const manual={APK_INPUT_URL:'https://expo.dev/artifacts/eas/candidate.apk',APK_INPUT_SHA256:'c'.repeat(64),APK_INPUT_CERT_SHA256:'d'.repeat(64)};
  assert.equal(previewInputs(manual,record).url,manual.APK_INPUT_URL);assert.equal(previewInputs(manual,record).baselineUrl,record.baselineApkUrl);
  for(const invalid of [{...record,baselineApkSha256:'f'.repeat(64)},{...record,baselineApkUrl:'https://example.com/baseline.apk'},{...record,apkUrl:'https://github.com/foreign/repo/releases/download/test/candidate.apk'}])assert.throws(()=>previewInputs({},invalid));
  assert.throws(()=>previewInputs({APK_INPUT_URL:record.apkUrl},record));assert.throws(()=>previewInputs({},{}));
});

test('preview QA changes only the explicit application header in existing anonymous chapter flows',async()=>{
  for(const name of ['story','story-clean','story-video-prepare','story-exit','story-resume-position','story-resume-check','wallet-balance-rail']){
    const source=(await read('../e2e/native/'+name+'.yaml')).replaceAll('\r\n','\n'),result=previewFlow(source,PREVIEW.package);
    assert.equal(result,source.replace('appId: '+PACKAGE+'\n','appId: '+PREVIEW.package+'\n'));
    const documents=yaml.parseAllDocuments(result);assert.ok(documents.every(document=>document.errors.length===0));assert.equal(documents[0].toJSON().appId,PREVIEW.package);
  }
  const original=embeddedFlow('0.4.0'),result=previewFlow(original,PREVIEW.package);
  assert.deepEqual(yaml.parseAllDocuments(result)[1].toJSON(),yaml.parseAllDocuments(original)[1].toJSON());
  assert.match(result,/Versión incluida en el APK/);assert.doesNotMatch(result,/Buscar actualización|inputText|clearState/);
});

test('preview QA rejects foreign targets reset/login/OTA and unapproved child flows',()=>{
  const source='appId: '+PACKAGE+'\nname: Anonymous\n---\n[]\n';
  for(const target of ['com.foreign.app','',undefined])assert.throws(()=>previewFlow(source,target));
  for(const body of ['- launchApp:\n    clearState: true','- runFlow:\n    file: login.yaml','[{"runFlow":{"file":"../private.yaml"}}]','[{"tapOn":"Buscar actualización"}]','MAESTRO_LOGIN_PASSWORD'])assert.throws(()=>previewFlow(source.replace('[]',body),PREVIEW.package));
  assert.throws(()=>previewFlow(source.replace(PACKAGE,'foreign.app'),PREVIEW.package));
  assert.throws(()=>previewFlow(source+'\n---\n[]',PREVIEW.package));
});

test('preview QA uses all 15 identical bounded gestures including reversal without early exits',async()=>{
  const trace=gestureTrace('Physical size: 1080x1920\nOverride size: 720x1280');
  assert.deepEqual(trace.display,{width:720,height:1280});assert.equal(trace.gestureCount,15);assert.equal(trace.plannedDurationMs,30750);
  assert.deepEqual(trace.gestures.map(item=>item.direction),[...Array(3).fill('UP'),...Array(4).fill('DOWN'),...Array(8).fill('UP')]);
  assert.equal(trace.specificationSha256,gestureTrace('Physical size: 1080x1920').specificationSha256);
  const calls=[],pauses=[];let clock=0;
  const result=await executeTrace({trace,adb:(...args)=>{calls.push(args);clock+=1800;},wait:ms=>{pauses.push(ms);clock+=ms;},now:()=>clock});
  assert.equal(result.observedDurationMs,30750);assert.equal(result.events.length,15);assert.deepEqual(calls,trace.gestures.map(item=>item.args));assert.deepEqual(pauses,Array(15).fill(250));
  for(const invalid of ['',null,'Physical size: 1920x1080','Physical size: 200x400','Physical size: 9000x18000'])assert.throws(()=>gestureTrace(invalid));
});

test('preview QA validates independently pinned signatures native identity HTTPS and update isolation',()=>{
  for(const kind of ['before','after']){
    const fixture=artifact(kind),result=verifyArtifact(fixture);assert.equal(result.kind,kind);assert.equal(result.embeddedHttpsApi,true);
    for(const info of [{...fixture.info,package:kind==='after'?PACKAGE:PREVIEW.package},{...fixture.info,code:999},{...fixture.info,name:'9.9.9'},{...fixture.info,minSdk:30}])assert.throws(()=>verifyArtifact({...fixture,info}));
    for(const changed of [{badging:'application-debuggable'},{files:'lib/arm64-v8a/libexpo-gl.so\n'},{signature:'Signer #1 certificate SHA-256 digest: '+'b'.repeat(64)},{bundle:Buffer.from('x'.repeat(2000))},{bundle:Buffer.from(API+'http://10.0.2.2:3000'+'x'.repeat(2000))}])assert.throws(()=>verifyArtifact({...fixture,...changed}));
    for(const xml of [fixture.xml.replace('expo-channel-name','foreign-channel-name'),fixture.xml.replace('0xffffffff','0x0'),fixture.xml+meta('DISABLE_ANTI_BRICKING_MEASURES','(type 0x12)0xffffffff'),fixture.xml+meta('HAS_EMBEDDED_UPDATE','(type 0x12)0x0'),fixture.xml+meta('ENABLED','(type 0x12)0xffffffff')])assert.throws(()=>verifyArtifact({...fixture,xml}));
  }
  assert.throws(()=>verifyArtifact({...artifact(),expectedCertificate:''}));
});

test('preview QA resolves escaped native metadata and fails closed for unresolved or duplicate resources',()=>{
  const name='expo.modules.updates.UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY',value='{"expo-channel-name":"mine-realism"}';
  const xml=meta('UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY','@0x7f120123');
  const resources=' resource 0x7f120123 com.openminerals.demo.minepreview:string/expo_updates_request_headers:\n   (string8) '+JSON.stringify(value)+'\n';
  assert.equal(metadataValue(xml,resources,name),value);assert.equal(metadataValue(meta('ENABLED','(type 0x12)0x0'),'','expo.modules.updates.ENABLED'),false);
  assert.equal(metadataValue('','','absent',{optional:true}),null);
  for(const [text,dump] of [[xml,''],[xml+meta('UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY','@0x7f120123'),resources],[xml,resources+' resource 0x7f120123 duplicate:\n (string8) "foreign"\n']])assert.throws(()=>metadataValue(text,dump,name));
});

test('preview QA detects stable UID and version changes after side-by-side install',()=>{
  const before=installedIdentity('userId=10234\n versionCode=6 minSdk=24\n versionName=0.3.0\n',PRESENTED);
  assert.equal(assertStablePreserved(before,structuredClone(before)),true);
  for(const after of [{...before,uid:'9999'},{...before,version:'0.4.0'},{...before,versionCode:7}])assert.throws(()=>assertStablePreserved(before,after));
  for(const text of ['versionCode=6 versionName=0.3.0','userId=10234 versionCode=1 versionName=0.4.0'])assert.throws(()=>installedIdentity(text,PRESENTED));
});

test('preview native legacy regression uses fresh demo balances and never enters account credentials or captures commerce UI',()=>{
  const source=legacyCommerceFlow(),commands=yaml.parseAllDocuments(source)[1].toJSON();
  for(const balance of ['250,00','450,00','157,10','228,73'])assert.ok(source.includes('USDT '+balance));
  assert.ok(commands.some(command=>command.assertVisible?.enabled===false));assert.ok(commands.some(command=>command.inputText==='2'));
  assert.doesNotMatch(source,/login|password|register|takeScreenshot|clearState|clearKeychain|uninstall/i);
  assert.doesNotThrow(()=>previewFlow(source,PREVIEW.package));
});

test('preview public failures accept only static known reasons and redact unrecognized exception text',()=>{
  assert.equal(publicFailureReason(Error('Unexpected native update channel.')),'Unexpected native update channel.');
  for(const value of [Error('secret-token-value'),{message:'command stdout with account alias'},null])assert.equal(publicFailureReason(value),'Unclassified assertion or infrastructure failure; raw diagnostics withheld.');
});

test('preview metrics observe the adaptive accessibility tier without inferring resolution or GPU FPS',()=>{
  for(const [label,tier] of [['Calidad 3D alta','high'],['Calidad 3D equilibrada','balanced'],['Vista ligera','light'],['Preparando 3D','unknown'],['','unknown'],['Calidad 3D alta Calidad 3D equilibrada','unknown']])assert.deepEqual(anonymousSceneFlags('<node content-desc="'+label+'"/>'),{automaticLightObserved:false,qualityTierObserved:tier});
  assert.deepEqual(anonymousSceneFlags('<node text="Vista ligera activada por coste de render."/>'),{automaticLightObserved:true,qualityTierObserved:'light'});
  assert.throws(()=>anonymousSceneFlags(null));
});

test('authorized native authentication opts out of legacy import and preserves the exact buyer across a cold launch',()=>{
  const source=authorizedAuthFlow('register-buyer'),documents=yaml.parseAllDocuments(source),commands=documents[1].toJSON();
  assert.equal(documents[0].toJSON().appId,PREVIEW.package);
  assert.ok(commands.some(command=>command.assertVisible?.text==='Conservar mi sesión anterior'&&command.assertVisible.checked===false));
  assert.ok(commands.some(command=>command.tapOn==='^Crear cuenta de comprador$'));
  assert.match(source,/Comprador · \$\{MAESTRO_PREVIEW_ALIAS\}/);assert.match(source,/USDT 250,00/);assert.match(source,/MAESTRO_PREVIEW_PASSWORD/);
  const preserved=authorizedAuthFlow('buyer-persisted');assert.match(preserved,/Comprador · \$\{MAESTRO_PREVIEW_ALIAS\}/);assert.match(preserved,/USDT 250,00/);
  assert.doesNotMatch(preserved,/inputText|PASSWORD|Crear cuenta|Entrar en mi cuenta|launchApp|clearState/);
  for(const phase of ['buyer-logout','operator-logout']){const logout=authorizedAuthFlow(phase);assert.match(logout,/Cerrar sesión/);assert.match(logout,/USDT 228,73/);assert.match(logout,/Sesión sin cuenta/);}
});

test('authorized auth adapter restricts every phase to preview without relaxing anonymous credential guards',()=>{
  for(const phase of ['register-buyer','buyer-persisted','buyer-logout','operator-login','operator-readonly','operator-logout']){
    const source=authorizedAuthFlow(phase),documents=yaml.parseAllDocuments(source);assert.ok(documents.every(document=>document.errors.length===0));assert.equal(documents[0].toJSON().appId,PREVIEW.package);
    assert.doesNotMatch(source,/takeScreenshot|clearState|clearKeychain|uninstall|Confirmar demo|Simular venta|Revisar ingreso ficticio|stock|intake|deposit|withdraw/);
    const stableHeader=JSON.stringify({...documents[0].toJSON(),appId:PACKAGE})+'\n---\n'+source.split('\n---\n')[1];
    if(['register-buyer','operator-login'].includes(phase))assert.throws(()=>previewFlow(stableHeader,PREVIEW.package));
  }
  for(const phase of ['anything','../operator-login',undefined])assert.throws(()=>authorizedAuthFlow(phase));
  const operator=authorizedAuthFlow('operator-readonly');assert.match(operator,/Panel gerencial/);assert.match(operator,/Actividad y control/);assert.match(operator,/ACCESO A LA DEMOSTRACIÓN/);assert.match(operator,/assertNotVisible.*Billetera/);
  assert.doesNotMatch(operator,/inputText|PASSWORD|Confirmar|Revisar|Actualizar/);
});

test('public operator access accepts only the authorized DEMO HTTPS record',()=>{
  const record={publicDemoAccess:true,demoOnly:true,api:API,role:'operator',alias:'synthetic_operator',password:'Synthetic-unit-password-123'};
  assert.deepEqual(authorizedPublicOperator(record),{alias:record.alias,password:record.password});
  for(const changed of [{...record,publicDemoAccess:false},{...record,demoOnly:false},{...record,api:'http://localhost:3000'},{...record,role:'buyer'},{...record,password:'short'},{...record,password:'synthetic\npassword'}])assert.throws(()=>authorizedPublicOperator(changed));
});

test('public operator preflight revokes its observer token before native login and never calls business routes',async()=>{
  const operator={alias:'synthetic_operator',password:'Synthetic-unit-password-123'},calls=[],token='unit-observer-token-'+('x'.repeat(32));
  await publicOperatorPreflight(operator,async(url,options)=>{calls.push({url,options});return url.endsWith('/login')?{status:200,ok:true,json:async()=>({token,account:{alias:operator.alias,role:'operator'}})}:{status:200,ok:true};});
  assert.deepEqual(calls.map(call=>call.url),[API+'/api/demo/accounts/login',API+'/api/demo/accounts/logout']);assert.equal(calls[1].options.headers.Authorization,'Bearer '+token);
  const invalidCalls=[];await assert.rejects(publicOperatorPreflight(operator,async(url)=>{invalidCalls.push(url);return url.endsWith('/login')?{status:200,ok:true,json:async()=>({token,account:{alias:'foreign',role:'operator'}})}:{status:200,ok:true};}),/identity differs/);assert.equal(invalidCalls.length,2);
  await assert.rejects(publicOperatorPreflight(operator,async(url)=>url.endsWith('/login')?{status:200,ok:true,json:async()=>({token,account:{alias:operator.alias,role:'operator'}})}:{status:500,ok:false}),/could not be revoked/);
  for(const status of [401,403])await assert.rejects(publicOperatorPreflight(operator,async()=>({status,ok:false})),new RegExp('HTTP '+status));
});

test('preview workflow limits automatic runs to the trusted sprint PR and isolates stable acceptance contracts',async()=>{
  const workflow=yaml.parse(await read('../../.github/workflows/android-mine-preview.yml'));
  assert.deepEqual(Object.keys(workflow.on),['pull_request','workflow_dispatch']);assert.deepEqual(workflow.on.pull_request.branches,['main']);assert.deepEqual(Object.keys(workflow.on.workflow_dispatch.inputs),['apk_url','apk_sha256','apk_certificate_sha256']);
  assert.deepEqual(workflow.permissions,{contents:'read'});assert.equal(workflow.concurrency['cancel-in-progress'],false);
  const job=workflow.jobs['before-after'],runner=job.steps.find(step=>step.uses?.startsWith('ReactiveCircus/'));
  assert.match(job.if,/head\.repo\.full_name == github\.repository/);assert.match(job.if,/head\.ref == 'codex\/android-mine-realism-20261101'/);assert.doesNotMatch(Object.keys(workflow.on).join(','),/pull_request_target/);
  assert.equal(job['runs-on'],'ubuntu-24.04');assert.equal(runner.with['api-level'],29);assert.equal(runner.with.arch,'x86_64');assert.equal(runner.with['disable-linux-hw-accel'],false);assert.match(runner.with['emulator-options'],/-accel on/);
  assert.equal(job.env.APK_INPUT_CERT_SHA256,'${{ inputs.apk_certificate_sha256 }}');
  for(const step of job.steps.filter(step=>step.uses))assert.match(step.uses,/@[a-f0-9]{40}$/);
  const upload=job.steps.find(step=>step.uses?.startsWith('actions/upload-artifact'));assert.equal(upload.with.path,'${{ runner.temp }}/openminerals-mine-preview/public/');
  const text=await read('../../.github/workflows/android-mine-preview.yml');assert.doesNotMatch(text,/secrets\.|DEMO_ADMIN_TOKEN|DATABASE_URL|eas update|release-android\.mjs|ci-android\.mjs/);
  const script=await read('../e2e/mine-preview.mjs');assert.match(script,/emulatorGuard\(process\.env/);assert.doesNotMatch(script,/adb\('uninstall|pm','clear|clearState:\s*true|MAESTRO_LOGIN_PASSWORD/);
  const commerce=script.indexOf("await step('preview-new-legacy-commerce'");assert.ok(commerce>script.indexOf("await step('preview-reduced-motion-and-exits'"));
  assert.doesNotMatch(script.slice(commerce,script.indexOf('}catch(error){\n    progress?.failCurrent()')),/copyScreenshots\(|recordTrace\(|takeScreenshot|screenrecord/);
  assert.match(script,/if\(serial&&anonymousReady&&!commerceStarted\)/);assert.match(script,/preview-live-gl-home-resume/);
  assert.match(script,/await rm\(out,\{recursive:true,force:true\}\)/);assert.match(script,/env:\{\.\.\.process\.env,MAESTRO_PREVIEW_ALIAS/);
  assert.match(script,/publicJunit\(results,\[\.\.\.privateValues\]\)/);
});
