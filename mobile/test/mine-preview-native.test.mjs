import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {seedState,applyCommand,availableHoldingMg} from '../../api/src/domain.js';
import {PRESENTED,PREVIEW,previewInputs,previewFlow,gestureTrace,executeTrace,metadataValue,verifyArtifact,installedIdentity,assertStablePreserved,legacyCommerceFlow,publicFailureReason,anonymousSceneFlags,authorizedAuthFlow,authorizedPublicOperator,publicOperatorPreflight,observeColdLaunch,videoCoverage,publishAnonymousScreenshots,adaptiveCandidateStory,nativeValidationScope,effectiveValidationScope,anonymousSceneState,adaptiveCandidateResume,nativeGlDiagnostics,legacyReservationFlow,legacyHistoryFlow,staticFlowDiagnosticAllowed,authFailureMetadata,selectedCiScopes,strictRecorderPid,finalizeOwnedRecorder,runCandidateFirstComparison} from '../e2e/mine-preview.mjs';
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
  assert.equal(PREVIEW.package,'com.openminerals.demo.minepreview');assert.equal(PREVIEW.version,'0.4.0');assert.equal(PREVIEW.code,5);
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
  for(const name of ['story','story-clean','story-video-prepare','story-light-prepare','story-exit','story-resume-position','story-resume-check','wallet-balance-rail']){
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

test('legacy reservation protocol matches domain balances releases and immutable receipts without shared inventory',()=>{
  let state=seedState();const run=body=>{const command={...body,requestId:randomUUID()},result=applyCommand(state,command);state=result.state;return {command,receipt:result.receipt};};
  run({action:'convert',from:'USD',to:'USDT',amount:'200'});const buy=run({action:'buy',metal:'XAU',grams:'2'});run({action:'sell',metal:'XAU',grams:'0.5'});
  const offer=run({action:'offer',metal:'XAU',grams:'0.5'}),delivery=run({action:'delivery',metal:'XAU',grams:'0.5'});assert.equal(availableHoldingMg(state,'XAU'),500);assert.equal(state.walletMinor.USDT,22873);
  const held=JSON.stringify(state);assert.throws(()=>applyCommand(state,{action:'delivery',metal:'XAU',grams:'1',requestId:randomUUID()}));assert.equal(JSON.stringify(state),held);
  run({action:'cancel_offer',offerId:offer.receipt.offer.id});run({action:'cancel_delivery',deliveryId:delivery.receipt.delivery.id});assert.equal(availableHoldingMg(state,'XAU'),1500);assert.equal(state.holdingsMg.XAU,1500);assert.equal(state.walletMinor.USDT,22873);assert.equal(state.movements.length,7);assert.equal(Object.keys(state.receipts).length,7);
  assert.equal(state.receipts[buy.command.requestId].balancesAfter.walletMinor.USDT,15710);const before=JSON.stringify(state),replay=applyCommand(state,buy.command);assert.equal(replay.receipt.replayed,true);assert.equal(JSON.stringify(replay.state),before);
});

test('native legacy reservation and historical-read flows preserve the private boundary and distinguish peer settlement',()=>{
  const reservations=legacyReservationFlow(),commands=yaml.parseAllDocuments(reservations)[1].toJSON(),history=legacyHistoryFlow();
  assert.equal(commands.filter(command=>command.tapOn==='^Confirmar demo$').length,4);assert.ok(commands.some(command=>command.assertVisible?.enabled===false));
  for(const selector of ['^Publicar oferta demo$','^Solicitar cotización de entrega$','^Cancelar oferta$','^Cancelar solicitud$'])assert.ok(commands.some(command=>command.tapOn===selector));
  assert.match(history,/157,10/);assert.match(history,/228,73/);assert.match(history,/Mostrando/);assert.equal(yaml.parseAllDocuments(history)[1].toJSON().filter(command=>command.tapOn==='(?i)^Ver comprobante: Compra de oro,.*').length,2);
  assert.doesNotMatch(reservations+history,/takeScreenshot|MAESTRO_|clearState|uninstall|Precio por gramo de oferta marketplace|mine\/stock|intake/);assert.doesNotMatch(history,/Confirmar demo|inputText/);
  assert.doesNotThrow(()=>previewFlow(reservations,PREVIEW.package));assert.doesNotThrow(()=>previewFlow(history,PREVIEW.package));
});

test('generated editable-field commands use explicit erase counts and scalar keyboard commands',()=>{
  const sources=[legacyCommerceFlow(),legacyReservationFlow(),legacyHistoryFlow(),...['register-buyer','buyer-persisted','buyer-logout','operator-login','operator-readonly','operator-logout'].map(authorizedAuthFlow)];let fields=0,keyboards=0;
  const visit=value=>{
    if(value==='hideKeyboard')keyboards++;
    if(!value||typeof value!=='object')return;
    if(Object.hasOwn(value,'eraseText')){assert.equal(value.eraseText,100);fields++;}
    assert.equal(Object.hasOwn(value,'hideKeyboard'),false,'No null-valued hideKeyboard mappings may reach the Maestro parser.');
    if(value.tapOn?.point)assert.equal(value.tapOn.point,'95%,50%');
    for(const item of Object.values(value))visit(item);
  };
  for(const source of sources)visit(yaml.parseAllDocuments(source)[1].toJSON());assert.ok(fields>=10);assert.equal(fields,keyboards);
});

test('returning from the disabled buy button searches upward to edit the quantity field',()=>{
  const commands=yaml.parseAllDocuments(legacyCommerceFlow())[1].toJSON(),disabled=commands.findIndex(command=>command.assertVisible?.text==='^Confirmar compra simulada$'&&command.assertVisible.enabled===false);
  assert.ok(disabled>0);assert.deepEqual(commands[disabled+1].scrollUntilVisible,{element:{text:'Cantidad de metal en gramos'},direction:'UP',centerElement:true,timeout:30000});
  const first=commands.find(command=>command.scrollUntilVisible?.element?.text==='Cantidad de metal en gramos');assert.equal(first.scrollUntilVisible.direction,'DOWN');
});

test('authentication diagnostics project only closed category and command type/index',()=>{
  const canary='private_alias_password_bearer_canary',input={category:'timeout',firstFailedCommand:{index:12,type:'input-text',selector:canary},recentCommands:[{selector:canary}],raw:canary};
  const safe=authFailureMetadata(input);assert.deepEqual(safe,{category:'timeout',firstFailedCommand:{index:12,type:'input-text'},rawDiagnosticsPublished:false,privateUiPublished:false});assert.ok(!JSON.stringify(safe).includes(canary));
  assert.deepEqual(authFailureMetadata({category:canary,firstFailedCommand:{index:8,type:canary}}).firstFailedCommand,{index:8,type:'other'});assert.equal(authFailureMetadata({firstFailedCommand:{index:canary,type:'tap'}}).firstFailedCommand,null);
});

test('legacy static parser diagnostics are closed to owned flows and stop before credentials',()=>{
  const context={anonymousReady:true,commerceStarted:true,credentialsStarted:false};
  for(const name of ['legacy-commerce','legacy-reservations','legacy-history','legacy-preserved'])assert.equal(staticFlowDiagnosticAllowed(name,context),true);
  for(const name of ['register-buyer','operator-login','auth-register-buyer','foreign'])assert.equal(staticFlowDiagnosticAllowed(name,context),false);
  for(const commerceStarted of [false,true])assert.equal(staticFlowDiagnosticAllowed('legacy-commerce',{...context,commerceStarted,credentialsStarted:true}),false);
  assert.equal(staticFlowDiagnosticAllowed('legacy-commerce',{...context,anonymousReady:false}),false);
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

test('cold launch waits for PID exit and proves a new process without rejecting a fast numeric launch',async()=>{
  const pids=['111','111','','222'],calls=[],pauses=[];
  const result=await observeColdLaunch({packageName:PREVIEW.package,readPid:()=>pids.shift()??'222',wait:ms=>pauses.push(ms),adb:(...args)=>{calls.push(args);return args.includes('resolve-activity')?PREVIEW.package+'/.MainActivity':'Status: ok\nLaunchState: COLD\nTotalTime: 61\nWaitTime: 80';}});
  assert.equal(result.evidence.valid,true);assert.equal(result.evidence.oldProcessExitObserved,true);assert.equal(result.evidence.pidChanged,true);assert.equal(result.evidence.oldPid,'111');assert.equal(result.evidence.newPid,'222');assert.deepEqual(pauses,[250]);
  assert.deepEqual(calls[0],['shell','am','force-stop',PREVIEW.package]);assert.ok(calls.at(-1).includes('start'));
});

test('cold launch marks warm reused missing and unchanged processes invalid',async()=>{
  for(const [start,newPid] of [['Status: ok\nLaunchState: WARM','222'],['Status: ok\nLaunchState: HOT','222'],['Status: ok\nWarning: Activity not started, intent has been delivered','222'],['Status: ok','111'],['Status: ok','222 333'],['Status: timeout','222']]){
    const pids=['111','',newPid];const result=await observeColdLaunch({packageName:PREVIEW.package,readPid:()=>pids.shift()??newPid,wait:()=>{},adb:(...args)=>args.includes('resolve-activity')?PREVIEW.package+'/.MainActivity':start});assert.equal(result.evidence.valid,false);
  }
  let started=false;const result=await observeColdLaunch({packageName:PREVIEW.package,readPid:()=> '111',wait:()=>{},adb:(...args)=>{if(args.includes('start'))started=true;return '';}});assert.equal(started,false);assert.equal(result.evidence.oldProcessExitObserved,false);assert.equal(result.evidence.valid,false);
});

test('video evidence checks container and actual presentation span against measured input duration',()=>{
  const probe=(duration,timestamps)=>({format:{duration:String(duration)},frames:timestamps.map(value=>({best_effort_timestamp_time:String(value)}))});
  const good=videoCoverage(probe(38.309733,[0,10,20,30,37.377822]),38732.4);assert.equal(good.temporalCoverageValid,true);assert.ok(good.presentationCoverageRatio>.96);assert.equal(good.visualFinalStageVerified,false);assert.equal(good.finalSamples.at(-1).ptsSeconds,37.377822);
  const failed=videoCoverage(probe(9.299533,[0,1,5,9.268733]),37966.3);assert.equal(failed.temporalCoverageValid,false);assert.ok(failed.presentationCoverageRatio<.25);
  assert.equal(videoCoverage(probe(40,[0,1,9]),38000).temporalCoverageValid,false,'Container duration cannot disguise a truncated presentation timeline.');
  assert.equal(videoCoverage(probe(9,[0,20,38]),38000).temporalCoverageValid,false,'A long timeline cannot disguise a truncated container.');
  assert.equal(videoCoverage(probe(40,[0,39,20]),38000).temporalCoverageValid,false);assert.equal(videoCoverage({frames:{}},38000).temporalCoverageValid,false);assert.equal(videoCoverage(probe(40,[0,39]),NaN).temporalCoverageValid,false);
  assert.doesNotMatch(Object.keys(good).join(','),/fps/i);
});

test('chapter evidence is published before later phases and partial sets never claim completion',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'openminerals-preview-captures-')),privateRoot=join(directory,'private'),published=join(directory,'public');
  try{
    const story=join(privateRoot,'after','story','screenshots'),reduced=join(privateRoot,'after','story-exit','screenshots');await mkdir(story,{recursive:true});await mkdir(published);
    const png=Buffer.from([137,80,78,71,13,10,26,10,0]);
    for(let chapter=1;chapter<=3;chapter++)await writeFile(join(story,'safe-story-'+chapter+'.png'),png);
    await writeFile(join(story,'private-unapproved.png'),png);
    const partial=await publishAnonymousScreenshots({kind:'after',privateRoot,published,requireChapters:false});assert.equal(partial.chapterCount,3);assert.equal(partial.complete,false);assert.match(partial.scope,/3 of seven/);assert.equal((await readdir(published)).includes('after-private-unapproved.png'),false);
    for(let chapter=4;chapter<=7;chapter++)await writeFile(join(story,'safe-story-'+chapter+'.png'),png);
    const chapters=await publishAnonymousScreenshots({kind:'after',privateRoot,published});assert.equal(chapters.chaptersComplete,true);assert.equal(chapters.reducedMotionPresent,false);assert.equal(chapters.complete,false);
    await assert.rejects(publishAnonymousScreenshots({kind:'after',privateRoot,published,requireReduced:true}),/screenshots missing/);
    await mkdir(reduced,{recursive:true});await writeFile(join(reduced,'safe-reduced-motion.png'),png);assert.equal((await publishAnonymousScreenshots({kind:'after',privateRoot,published,requireReduced:true})).complete,true);
  }finally{assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep+'openminerals-preview-captures-'));await rm(directory,{recursive:true,force:true});}
});

test('candidate chapter adapter preserves initial GL proof and accepts only explicit performance degradation afterwards',async()=>{
  const source=await read('../e2e/native/story.yaml'),adapter=adaptiveCandidateStory(source);assert.equal(adapter.segments.length,7);assert.equal(adapter.initialGlBeforeGesturesRequired,true);
  const first=yaml.parseAllDocuments(adapter.segments[0].source)[1].toJSON(),initial=first.findIndex(command=>command.extendedWaitUntil?.visible?.id==='immersive-gl-ready'),swipe=first.findIndex(command=>command.swipe);
  assert.ok(initial>=0&&initial<swipe);assert.deepEqual(first[initial+1],{takeScreenshot:'safe-initial-gl'});
  for(const segment of adapter.segments){
    assert.doesNotThrow(()=>previewFlow(segment.source,PREVIEW.package));const commands=yaml.parseAllDocuments(segment.source)[1].toJSON();assert.equal(commands.at(-1).takeScreenshot,'safe-story-'+segment.chapter);
    const alternatives=commands.filter(command=>command.extendedWaitUntil?.visible?.id==='immersive-(gl-ready|scene-light)');assert.ok(alternatives.length>0);
    for(const command of commands.filter(command=>command.runFlow?.when?.visible?.id==='immersive-scene-light'))assert.deepEqual(command.runFlow.commands,[{assertVisible:{id:'immersive-scene-light',text:'.*Vista ligera activada por coste de render\\..*'}}]);
  }
  assert.throws(()=>adaptiveCandidateStory(source.replace('safe-story-7','safe-story-8')));
  const parts=source.replaceAll('\r\n','\n').split('\n---\n'),commands=JSON.parse(parts[1]);commands.unshift({swipe:{start:'80%,80%',end:'80%,18%',duration:800}});assert.throws(()=>adaptiveCandidateStory(parts[0]+'\n---\n'+JSON.stringify(commands)));
});

test('native validation scope permits only closed comparison regression and independent commerce cases',()=>{
  assert.equal(nativeValidationScope(), 'comparison');assert.equal(nativeValidationScope('comparison'),'comparison');assert.equal(nativeValidationScope('regression'),'regression');
  assert.equal(nativeValidationScope('commerce'),'commerce');assert.equal(effectiveValidationScope('comparison','commerce'),'commerce');assert.equal(effectiveValidationScope('regression',''),'regression');assert.throws(()=>effectiveValidationScope('comparison','commerce; unsafe'));
  for(const value of [null,'','all','../regression',0,{}])assert.throws(()=>nativeValidationScope(value));
});

test('independent CI scope selection defaults to both cases and never mutates an explicit selection',()=>{
  assert.deepEqual(selectedCiScopes({}),['comparison','commerce']);const record={independentCiScopes:['comparison']},selected=selectedCiScopes(record);selected.push('commerce');assert.deepEqual(record.independentCiScopes,['comparison']);
  for(const independentCiScopes of [null,[],['comparison','comparison'],['regression'],['commerce','comparison','commerce'],'comparison',['comparison; unsafe']])assert.throws(()=>selectedCiScopes({independentCiScopes}));assert.throws(()=>selectedCiScopes(null));
});

test('only an empty exit-one recorder probe proves absence; transport errors never do',()=>{
  assert.equal(strictRecorderPid({status:1,stdout:'',stderr:''}),'');assert.equal(strictRecorderPid({status:0,stdout:'42\n',stderr:''}),'42');
  for(const result of [{status:0,stdout:'',stderr:''},{status:1,stdout:'',stderr:'device offline'},{status:null,error:Error('timeout')},{status:1,stdout:'',stderr:'',signal:'SIGKILL'},{status:0,stdout:'unknown',stderr:''}])assert.throws(()=>strictRecorderPid(result),/absence could not be verified/);
});

test('recorder finalization waits beyond eight seconds for remote exit and host close',async()=>{
  let time=0,signals=0;const report=await finalizeOwnedRecorder({pid:'42',probe:()=>time<10500?'42':'',signal:()=>{signals++;},hostClosed:()=>time>=12000,wait:ms=>{time+=ms;},now:()=>time});
  assert.equal(report.finalized,true);assert.equal(report.latencyMs,12000);assert.equal(report.remoteExitObserved,true);assert.equal(report.hostCloseObserved,true);assert.equal(report.hostForceTerminationRequested,false);assert.equal(report.stopWaitOutsideInputTrace,true);assert.equal(signals,1);
});

test('a recorder probe outage or missing host close cannot certify finalization',async()=>{
  let time=0;const outage=await finalizeOwnedRecorder({pid:'42',probe:()=>{throw Error('transport');},signal:()=>{},hostClosed:()=>true,wait:ms=>{time+=ms;},now:()=>time});assert.equal(outage.finalized,false);assert.equal(outage.remoteExitObserved,false);assert.equal(outage.latencyMs,30000);assert.ok(outage.probeErrors>0);
  time=0;const host=await finalizeOwnedRecorder({pid:'42',probe:()=>'',signal:()=>{},hostClosed:()=>false,wait:ms=>{time+=ms;},now:()=>time});assert.equal(host.finalized,false);assert.equal(host.remoteExitObserved,true);assert.equal(host.hostCloseObserved,false);assert.equal(host.timedOut,true);
});

test('candidate-first comparison preserves partial evidence and propagates either profile failure',async()=>{
  const order=[];
  await runCandidateFirstComparison({candidate:async()=>{order.push('candidate');},stopCandidate:async()=>{order.push('stop-candidate');},presented:async()=>{order.push('presented');}});
  assert.deepEqual(order,['candidate','stop-candidate','presented']);
  const evidence=[],failure=Error('profile failed');
  await assert.rejects(runCandidateFirstComparison({candidate:async()=>{evidence.push('candidate-photo');throw failure;},stopCandidate:async()=>{evidence.push('unexpected-stop');},presented:async()=>{evidence.push('unexpected-baseline');}}),error=>error===failure);
  assert.deepEqual(evidence,['candidate-photo']);
  await assert.rejects(runCandidateFirstComparison({candidate:async()=>{evidence.push('candidate-complete');},stopCandidate:async()=>{evidence.push('candidate-stopped');},presented:async()=>{evidence.push('baseline-partial');throw failure;}}),error=>error===failure);
  assert.deepEqual(evidence,['candidate-photo','candidate-complete','candidate-stopped','baseline-partial']);
});

test('bounded anonymous scene snapshots distinguish explicit cost fallback from unexplained light or pending',()=>{
  assert.equal(anonymousSceneState('<node resource-id="immersive-gl-ready"/>').mode,'gl');
  const automatic=anonymousSceneState('<node resource-id="immersive-scene-light" content-desc="Vista ligera activada por coste de render."/>');assert.equal(automatic.mode,'automatic-light');assert.equal(automatic.automaticLightObserved,true);
  const generic=anonymousSceneState('<node resource-id="immersive-scene-light" content-desc="Vista simplificada private_unit_canary"/>');assert.equal(generic.mode,'light');assert.equal(generic.automaticLightObserved,false);assert.equal(generic.genericSimplifiedTextObserved,true);assert.ok(!JSON.stringify(generic).includes('private_unit_canary'));
  const pending=anonymousSceneState('<node resource-id="immersive-scene-pending"/>');assert.equal(pending.readiness,'pending');assert.equal(pending.mode,'unknown');assert.equal(pending.rawUiPublished,false);
  const bounded=anonymousSceneState('x'.repeat(1_000_001)+'immersive-gl-ready');assert.equal(bounded.xmlTruncated,true);assert.equal(bounded.readiness,'absent');
});

test('explicit R3 internal failures and bounded retry are never accepted as automatic performance fallback',()=>{
  for(const code of ['context-timeout','create','draw','boundary','unavailable']){
    const state=anonymousSceneState('<node resource-id="immersive-scene-light" content-desc="Vista ligera activada por coste de render. Estado 3D: '+code+'. Vista ligera por fallo 3D: '+code+'"/>');
    assert.equal(state.mode,'internal-failure');assert.equal(state.internalFailureObserved,true);assert.equal(state.internalFailureCode,code);assert.equal(state.automaticLightObserved,true,'The reason text is observed but cannot override a diagnosed failure.');
  }
  const retry=anonymousSceneState('<node resource-id="immersive-scene-pending" content-desc="Estado 3D: context-timeout. Reintentando 3D: context-timeout"/>');assert.equal(retry.mode,'retrying');assert.equal(retry.retryPendingObserved,true);assert.equal(retry.internalFailureObserved,false);
  const visibleFailure=anonymousSceneState('<node text="3D no disponible · draw"/><node content-desc="Reintentar 3D"/>');assert.equal(visibleFailure.mode,'internal-failure');assert.equal(visibleFailure.internalFailureCode,'draw');assert.equal(visibleFailure.manualRetryControlObserved,true);
  const unknown=anonymousSceneState('<node resource-id="immersive-scene-light" text="Vista ligera por fallo 3D: private_unit_canary"/>');assert.equal(unknown.mode,'internal-failure');assert.equal(unknown.internalFailureCode,null);assert.ok(!JSON.stringify(unknown).includes('private_unit_canary'));
});

test('native GL diagnostics publish only fixed enum counters and never raw log suffixes or unknown values',()=>{
  const source='W/ReactNativeJS(42): [Openminerals 3D] context-timeout\nW/ReactNativeJS(42): [Openminerals 3D] create\nW/ReactNativeJS(42): [Openminerals 3D] draw\nW/ReactNativeJS(42): [Openminerals 3D] boundary\nW/ReactNativeJS(42): [Openminerals 3D] private_unit_canary\nW/ReactNativeJS(42): [Openminerals 3D] create private_unit_canary\n';
  const result=nativeGlDiagnostics(source);assert.deepEqual(result.nativeGlFailureCounts,{'context-timeout':1,create:1,draw:1,boundary:1});assert.equal(result.unknownNativeGlDiagnosticLines,2);assert.equal(result.rawLogsPublished,false);assert.ok(!JSON.stringify(result).includes('private_unit_canary'));
  assert.equal(nativeGlDiagnostics('x'.repeat(1_000_001)).diagnosticLogTruncated,true);assert.throws(()=>nativeGlDiagnostics(null));
});

test('candidate resume keeps its first post-HOME GL proof and allows only explicit cost fallback after gestures',async()=>{
  const source=await read('../e2e/native/story-resume-check.yaml'),adapted=adaptiveCandidateResume(source),commands=yaml.parseAllDocuments(adapted)[1].toJSON();
  assert.equal(commands[1].extendedWaitUntil.visible.id,'immersive-gl-ready');assert.ok(commands[2].repeat);
  const alternatives=commands.filter(command=>command.extendedWaitUntil?.visible?.id==='immersive-(gl-ready|scene-light)');assert.equal(alternatives.length,2);
  for(const command of commands.filter(command=>command.runFlow?.when?.visible?.id==='immersive-scene-light'))assert.deepEqual(command.runFlow.commands,[{assertVisible:{id:'immersive-scene-light',text:'.*Vista ligera activada por coste de render\\..*'}}]);
  assert.doesNotThrow(()=>previewFlow(adapted,PREVIEW.package));assert.doesNotMatch(adapted,/takeScreenshot|inputText|launchApp|clearState/);
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

test('preview video requires explicit manual opt-in and isolates stable acceptance contracts',async()=>{
  const workflow=yaml.parse(await read('../../.github/workflows/android-mine-preview.yml'));
  assert.deepEqual(Object.keys(workflow.on),['workflow_dispatch']);assert.deepEqual(Object.keys(workflow.on.workflow_dispatch.inputs),['record_video','apk_url','apk_sha256','apk_certificate_sha256']);assert.equal(workflow.on.workflow_dispatch.inputs.record_video.default,false);assert.equal(workflow.on.workflow_dispatch.inputs.record_video.type,'boolean');
  assert.deepEqual(workflow.permissions,{contents:'read'});assert.equal(workflow.concurrency,undefined);
  const job=workflow.jobs['before-after'],runner=job.steps.find(step=>step.uses?.startsWith('ReactiveCircus/'));
  assert.equal(job.concurrency.group,'openminerals-isolated-native-mine-preview-${{ matrix.validation_scope }}');assert.equal(job.concurrency['cancel-in-progress'],false);
  assert.equal(job.needs,'scopes');assert.equal(job.strategy.matrix.validation_scope,'${{ fromJSON(needs.scopes.outputs.matrix) }}');assert.equal(job.strategy['fail-fast'],false);assert.equal(job.strategy['max-parallel'],2);assert.equal(job.env.MINE_PREVIEW_QA_SCOPE,'${{ matrix.validation_scope }}');
  const prepare=workflow.jobs.scopes;assert.equal(prepare.if,job.if);assert.ok(prepare.steps.some(step=>step.run?.includes('JSON.stringify(selectedCiScopes(record))')));for(const step of prepare.steps.filter(step=>step.uses))assert.match(step.uses,/@[a-f0-9]{40}$/);
  const mediaIndex=job.steps.findIndex(step=>step.run?.includes('apt-get install -y --no-install-recommends ffmpeg'));
  const verificationIndex=job.steps.findIndex(step=>step.run==='node mobile/e2e/mine-preview.mjs download');
  assert.ok(mediaIndex>=0&&mediaIndex<verificationIndex,'ffprobe/ffmpeg must be installed before host media verification.');
  assert.match(job.steps[mediaIndex].run,/command -v ffprobe/);assert.match(job.steps[mediaIndex].run,/command -v ffmpeg/);
  assert.equal(job.steps[mediaIndex].if,"matrix.validation_scope != 'commerce'");
  assert.match(job.if,/inputs\.record_video == true/);assert.match(job.if,/github\.repository == 'Blaister9\/Openminerals'/);assert.match(job.if,/github\.ref == 'refs\/heads\/codex\/android-mine-realism-20261101'/);assert.doesNotMatch(Object.keys(workflow.on).join(','),/pull_request_target/);
  assert.equal(job['runs-on'],'ubuntu-24.04');assert.equal(runner.with['api-level'],29);assert.equal(runner.with.arch,'x86_64');assert.equal(runner.with['disable-linux-hw-accel'],false);assert.match(runner.with['emulator-options'],/-accel on/);
  assert.equal(job.env.APK_INPUT_CERT_SHA256,'${{ inputs.apk_certificate_sha256 }}');
  for(const step of job.steps.filter(step=>step.uses))assert.match(step.uses,/@[a-f0-9]{40}$/);
  const upload=job.steps.find(step=>step.uses?.startsWith('actions/upload-artifact'));assert.equal(upload.with.path,'${{ runner.temp }}/openminerals-mine-preview/public/');
  assert.equal(upload.with.name,'android-mine-preview-${{ github.run_id }}-${{ matrix.validation_scope }}');
  const text=await read('../../.github/workflows/android-mine-preview.yml');assert.doesNotMatch(text,/secrets\.|DEMO_ADMIN_TOKEN|DATABASE_URL|eas update|release-android\.mjs|ci-android\.mjs/);
  const script=await read('../e2e/mine-preview.mjs');assert.match(script,/emulatorGuard\(process\.env/);assert.doesNotMatch(script,/adb\('uninstall|pm','clear|clearState:\s*true|MAESTRO_LOGIN_PASSWORD/);
  const commerce=script.indexOf("await step('preview-new-legacy-commerce'");assert.ok(commerce>script.indexOf("await step('preview-reduced-motion-and-exits'"));
  assert.doesNotMatch(script.slice(commerce,script.indexOf('}catch(error){\n    progress?.failCurrent()')),/copyScreenshots\(|recordTrace\(|takeScreenshot|screenrecord/);
  assert.match(script,/if\(serial&&anonymousReady&&!commerceStarted\)/);assert.match(script,/preview-live-gl-home-resume/);
  assert.match(script,/await rm\(out,\{recursive:true,force:true\}\)/);assert.match(script,/env:\{\.\.\.process\.env,MAESTRO_PREVIEW_ALIAS/);
  assert.match(script,/publicJunit\(results,\[\.\.\.privateValues\]\)/);
});
