import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {RELEASE,RELEASE_BASELINE,releaseScenario,validateReleaseConfig,releaseRegisterFlow,validateReleaseManifest,apkRuntimeVersion,preservationProjection,assertReleasePreserved,embeddedFlow,authenticatedFlow,buyerPreservedFlow,operatorPreservedFlow} from '../e2e/release-contract.mjs';
import {PACKAGE,BASELINE,SECRET_NAMES,certificate} from '../e2e/ci-safety.mjs';
import {accountFlow,walletCurrencies} from '../e2e/account-lifecycle.mjs';
const yaml=createRequire(import.meta.url)('yaml');
const source=path=>readFile(new URL(path,import.meta.url),'utf8');

test('release: explicit standalone phases reject OTA and retain the established signing identity',()=>{
  for(const phase of ['clean-commerce','upgrade-buyer','upgrade-operator','accounts-wallets'])assert.equal(releaseScenario(phase,''),phase);
  for(const phase of ['',undefined,'full','operator','$(echo unsafe)'])assert.throws(()=>releaseScenario(phase,''));
  for(const ota of [null,0,'01a18acb-c4d3-772f-8385-2c9bd4035d1b','anything'])assert.throws(()=>releaseScenario('clean-commerce',ota));
  assert.equal(RELEASE_BASELINE.code,5);assert.equal(RELEASE_BASELINE.name,'0.2.0');assert.equal(RELEASE.code,6);assert.equal(RELEASE.version,'0.3.0');
  assert.equal(RELEASE_BASELINE.sha256,'c35719bf44fdc5a1237249be7e80d6d3102e57ee58f0cd0d9b5af3c66f32d83f');
  assert.equal(certificate('Signer #1 certificate SHA-256 digest: '+BASELINE.certificate),BASELINE.certificate);
  assert.throws(()=>certificate('Signer #1 certificate SHA-256 digest: '+'a'.repeat(64)));
});
test('release: registration changes only its final clean legacy balance and preserves opt-out and mutable origin guards',async()=>{
  const original=await source('../e2e/native/register.yaml'),rendered=releaseRegisterFlow(original);
  const before=yaml.parseAllDocuments(original)[1].toJSON(),after=yaml.parseAllDocuments(rendered)[1].toJSON();
  const lastWait=before.findLastIndex(command=>command.extendedWaitUntil);
  assert.equal(before[lastWait].extendedWaitUntil.visible,'^USDT 268,40$');
  assert.equal(after[lastWait].extendedWaitUntil.visible,'^USDT 250,00$');
  const expected=structuredClone(before);expected[lastWait].extendedWaitUntil.visible='^USDT 250,00$';assert.deepEqual(after,expected);
  assert.ok(after.some(command=>command.assertVisible?.text==='Conservar mi sesión anterior'&&command.assertVisible.checked===false));
  assert.deepEqual(after.at(-1),{assertVisible:'^Sesión sin cuenta$'});
  assert.equal(releaseRegisterFlow(original.replaceAll('\r\n','\n').replaceAll('\n','\r\n')),rendered);
  assert.match(original,/visible: \^USDT 268,40\$/);assert.equal((rendered.match(/268,40/g)??[]).length,0);
  const script=await source('../e2e/release-android.mjs');assert.match(script,/source:releaseRegisterFlow\(await readFile\(join\(repo,'e2e\/native\/register\.yaml'\),'utf8'\)\)/);
  const legacy=await source('../e2e/ci-android.mjs');assert.ok(legacy.includes("await maestro('register','register')"));assert.doesNotMatch(legacy,/releaseRegisterFlow/);
});
test('release: registration rejects missing ambiguous or non-text balance nodes instead of broad replacement',async()=>{
  const original=(await source('../e2e/native/register.yaml')).replaceAll('\r\n','\n');
  for(const value of [null,undefined,0,{},[],Buffer.from(original),'',original.replace('268,40','269,00'),original+'- tapOn: ^Inicio$\n',original.replace('appId: '+PACKAGE,'appId: foreign.app'),original.replace('---\n','---\n- extendedWaitUntil:\n    visible: ^USDT 268,40$\n    timeout: 30000\n')])assert.throws(()=>releaseRegisterFlow(value));
});
test('release: reachable native and generated account flows have no 0.1.3 seeded-balance dependencies',async()=>{
  const visited=new Set();
  async function inspect(name){
    if(visited.has(name))return;visited.add(name);
    const text=await source('../e2e/native/'+name+'.yaml'),rendered=name==='register'?releaseRegisterFlow(text):text;
    assert.doesNotMatch(rendered,/268,40|196,77|270,00|73,23|71,63/,'Legacy seed balance reached through '+name);
    async function visit(value){if(!value||typeof value!=='object')return;if(value.runFlow?.file)await inspect(value.runFlow.file.replace(/\.yaml$/,''));for(const item of Object.values(value))if(item&&typeof item==='object')await visit(item);}
    await visit(yaml.parseAllDocuments(rendered)[1].toJSON());
  }
  for(const name of ['story','story-video-prepare','story-video','story-exit','story-resume-position','story-resume-check','register','buyer-a','buyer-a-buy','buyer-a-offer','buyer-b','request-delivery','quote','accept','operator','operator-stock','profile','custody-recheck'])await inspect(name);
  for(const name of ['preserve','ota-before-story'])assert.equal(visited.has(name),false);
  for(const currency of walletCurrencies)assert.doesNotMatch(accountFlow('wallet',currency),/268,40|196,77|270,00/);
  for(const name of ['import','setup','hide-and-logout','recover-start','recover-complete','reenter'])assert.doesNotMatch(accountFlow(name),/268,40|196,77|270,00/);
  const script=await source('../e2e/release-android.mjs');assert.doesNotMatch(script,/e2e\/trades\.yaml|maestro\('(?:preserve|ota-before-story)'/);
});
test('release: candidate config, release manifest and both native ABIs fail closed',()=>{
  const config={version:'0.3.0',android:{package:PACKAGE,versionCode:6},runtimeVersion:{policy:'appVersion'},updates:{enabled:true}};
  assert.doesNotThrow(()=>validateReleaseConfig(config));
  for(const changed of [{...config,version:'0.2.0'},{...config,android:{...config.android,versionCode:5}},{...config,runtimeVersion:'0.2.0'},{...config,updates:{enabled:false}}])assert.throws(()=>validateReleaseConfig(changed));
  const candidate={package:PACKAGE,code:6,name:'0.3.0',minSdk:24},abis='lib/arm64-v8a/libexpo.so\nlib/x86_64/libexpo.so\n';
  assert.doesNotThrow(()=>validateReleaseManifest(candidate,'new','',abis));
  for(const changed of [{...candidate,code:5},{...candidate,code:60},{...candidate,name:'0.2.0'},{...candidate,package:'another.app'},{...candidate,minSdk:30}])assert.throws(()=>validateReleaseManifest(changed,'new','',abis));
  assert.throws(()=>validateReleaseManifest(candidate,'new','application-debuggable',abis));
  for(const files of ['',abis.split('\n')[0],abis.split('\n')[1]])assert.throws(()=>validateReleaseManifest(candidate,'new','',files));
  assert.doesNotThrow(()=>validateReleaseManifest({...candidate,code:5,name:'0.2.0'},'baseline',''));
});
test('release: embedded UI assertions never request an OTA or enter credentials',()=>{
  for(const version of ['0.2.0','0.3.0'])for(const operator of [true,false]){
    const text=embeddedFlow(version,operator),documents=yaml.parseAllDocuments(text);assert.ok(documents.every(doc=>doc.errors.length===0));
    const commands=documents[1].toJSON();assert.ok(commands.some(command=>command.assertVisible?.id==='demo-update-source'&&command.assertVisible.text==='^Versión incluida en el APK$'));
    assert.ok(commands.some(command=>command.assertVisible==='^Versión Android '+version.replaceAll('.','\\.')+'$'));
    assert.doesNotMatch(text,/Buscar actualización|checkForUpdate|fetchUpdate|inputText|clearState|uninstall|reloadAsync|takeScreenshot/);
  }
  for(const text of [authenticatedFlow(),authenticatedFlow(true),buyerPreservedFlow(),operatorPreservedFlow()]){
    assert.doesNotMatch(text,/inputText|file.*login\.yaml|Confirmar demo|Simular ingreso|Simular retiro|clearState|uninstall|takeScreenshot/);
    assert.ok(yaml.parseAllDocuments(text).every(doc=>doc.errors.length===0));
  }
});
test('release: native runtime comes from its exact manifest entry and resolved resource',()=>{
  const entry=value=>'    E: meta-data (line=20)\n      A: android:name(0x01010003)="expo.modules.updates.EXPO_RUNTIME_VERSION" (Raw: "expo.modules.updates.EXPO_RUNTIME_VERSION")\n      A: android:value(0x01010024)='+value+'\n    E: activity (line=22)\n';
  assert.equal(apkRuntimeVersion(entry('"0.3.0" (Raw: "0.3.0")')),'0.3.0');
  const resources='      resource 0x7f120123 com.openminerals.demo.mobile:string/expo_runtime_version: t=0x03\n        (string8) "0.3.0"\n      resource 0x7f120124 com.openminerals.demo.mobile:string/other: t=0x03\n        (string8) "different"\n';
  assert.equal(apkRuntimeVersion(entry('@0x7f120123'),resources),'0.3.0');
  assert.equal(apkRuntimeVersion(entry('@0x7f120123'),resources.replace('(string8)','(string16)')),'0.3.0');
  assert.equal(apkRuntimeVersion(entry('"0.2.0"')),'0.2.0');
  for(const [xml,dump] of [[entry('@0x7f120123'),''],[entry('@0x7f120123'),resources.replace('expo_runtime_version','other')],[entry('"0.3.0"')+entry('"0.2.0"'),''],['A: android:versionName="0.3.0"',''],[entry('@0x7f120123'),resources.replace('(string8) "0.3.0"','(string8) "0.3.0"\n        (string8) "0.2.0"')]])assert.throws(()=>apkRuntimeVersion(xml,dump));
});
function completedSnapshot(){
  const state={walletMinor:{USD:40000,USDT:28789},holdingsMg:{XAU:500},movements:[{id:'movement-local'}],receipts:{receipt:{amountMinor:100}},offers:[{status:'FILLED'}],custodyRequests:[{status:'DELIVERED_DEMO'}]};
  return {a:structuredClone(state),b:structuredClone(state),summary:{inventoryMg:{XAU:4500},allocatedMg:{XAU:1000},reservedMg:{XAU:0},totalSupplyMg:{XAU:5500},demoFeesCollectedMinor:375,stockAdjustments:[{mg:1000}],accountCount:2},ca:{allocations:[{lotId:'source-lot',mg:500}]},cb:{allocations:[{lotId:'source-lot',mg:500}]},cm:{totals:{XAU:{weightMg:6000,deliveredMg:500}}},history:{items:[{action:'buy',amountMinor:100}]},ha:{items:[{kind:'BUY',mg:2000}]},hb:{items:[{kind:'MARKET_TRANSFER',mg:500}]},hm:{items:[{kind:'DELIVERY',mg:500}]},profile:{profile:{displayName:'Demo'}},management:{kpis:{directBuys:1},history:{items:[{kind:'buy'}],total:1}}};
}
test('release: upgrade preservation rejects changed balances, positions, receipts, lots and histories',()=>{
  const original=completedSnapshot();assert.ok(Object.values(assertReleasePreserved(original,structuredClone(original))).every(Boolean));
  const mutations=[copy=>copy.a.walletMinor.USDT--,copy=>copy.b.holdingsMg.XAU++,copy=>copy.a.movements.push({id:'duplicate'}),copy=>copy.a.receipts.receipt.amountMinor++,copy=>copy.a.offers[0].status='OPEN',copy=>copy.a.custodyRequests[0].status='REQUESTED',copy=>copy.summary.inventoryMg.XAU++,copy=>copy.ca.allocations[0].lotId='different-lot',copy=>copy.hm.items.pop(),copy=>copy.history.items[0].amountMinor++,copy=>copy.profile.profile.displayName='Changed',copy=>copy.management.history.items.pop()];
  for(const mutate of mutations){const changed=structuredClone(original);mutate(changed);assert.throws(()=>assertReleasePreserved(original,changed));}
  assert.ok(!JSON.stringify(preservationProjection(original)).includes('generatedAt'));
});
test('release: workflow serializes the owned fixture and gates all upgrades on clean commerce',async()=>{
  const text=await source('../../.github/workflows/android-release.yml'),workflow=yaml.parse(text);
  assert.deepEqual(Object.keys(workflow.on),['workflow_dispatch']);assert.deepEqual(Object.keys(workflow.on.workflow_dispatch.inputs),['apk_url','apk_sha256']);
  assert.deepEqual(workflow.permissions,{contents:'read'});assert.equal(workflow.concurrency.group,'openminerals-isolated-native-qa-single');assert.equal(workflow.concurrency['cancel-in-progress'],false);
  const followup=workflow.jobs['preservation-and-wallets'];assert.deepEqual(followup.needs,['clean-commerce']);assert.equal(followup.strategy['max-parallel'],1);assert.deepEqual(followup.strategy.matrix.scenario,['upgrade-buyer','upgrade-operator','accounts-wallets']);
  for(const job of Object.values(workflow.jobs)){
    assert.equal(job['runs-on'],'ubuntu-24.04');assert.equal(job['timeout-minutes'],55);assert.equal(job.env.APK_INPUT_SHA256,'${{ inputs.apk_sha256 }}');assert.ok(!Object.keys(job.env).some(key=>key.includes('PASSWORD')));
    const runner=job.steps.find(step=>step.uses?.startsWith('ReactiveCircus/'));
    assert.equal(runner['timeout-minutes'],45);assert.equal(runner.with['disable-linux-hw-accel'],false);assert.match(runner.with['emulator-options'],/-accel on/);assert.match(runner.with.script,/release-android\.mjs run/);
    const preflight=job.steps.find(step=>step.run?.endsWith('release-android.mjs preflight'));
    for(const step of [preflight,runner]){assert.deepEqual(Object.keys(step.env).sort(),[...SECRET_NAMES].sort());for(const name of SECRET_NAMES)assert.equal(step.env[name],'${{ secrets.'+name+' }}');}
    for(const step of job.steps.filter(step=>step.uses))assert.match(step.uses,/@[a-f0-9]{40}$/);
    const upload=job.steps.find(step=>step.uses?.startsWith('actions/upload-artifact'));assert.equal(upload.with.path,'${{ runner.temp }}/openminerals-release/public/');assert.equal(upload.with['retention-days'],1);
  }
  assert.doesNotMatch(text,/DEMO_ADMIN_TOKEN|DATABASE_URL|ota_update_id|eas update|inputs\.[a-z_]+.*\n.*curl/);
});
test('release: no clear, uninstall, production secret or credential entry after APK replacement',async()=>{
  const script=await source('../e2e/release-android.mjs'),upgrade=script.slice(script.indexOf('async function upgrade(){'),script.indexOf('function captureSecret'));
  assert.doesNotMatch(script,/clearState|clearKeychain|adb\('uninstall|pm','clear|DEMO_ADMIN_TOKEN|DATABASE_URL|withLegacyNavigation/);
  const replacement=upgrade.indexOf("adb('install','-r'");assert.ok(replacement>upgrade.indexOf("await maestro('login'"));
  assert.doesNotMatch(upgrade.slice(replacement),/maestro\('login'|inputText|users\.[a-z]+\.password/);
  assert.match(upgrade,/installed\(RELEASE\.code\)===uid/);assert.match(upgrade,/assertReleasePreserved\(before,await snapshot\(\)\)/);
  assert.match(script,/emulatorGuard\(process\.env/);assert.match(script,/releaseScenario\(process\.env\.NATIVE_RELEASE_SCENARIO,process\.env\.OTA_INPUT_UPDATE_ID\)/);
});
test('release: narrative cold launches are checked for embedded source before any UI credential',async()=>{
  const script=await source('../e2e/release-android.mjs'),clean=script.slice(script.indexOf('async function cleanCommerce(){'),script.indexOf('async function upgrade(){'));
  const narrative=clean.indexOf("'native-story-reduced-motion-and-operations'"),afterNarrative=clean.indexOf("'embedded-after-story-cold-launch'"),resume=clean.indexOf("'native-story-resumes-after-home'"),afterResume=clean.indexOf("'embedded-after-resume-before-credentials'"),credentials=clean.indexOf("'native-registration-without-import'");
  assert.ok(narrative<afterNarrative&&afterNarrative<resume&&resume<afterResume&&afterResume<credentials);
  for(const label of ['embedded-after-story-cold-launch','embedded-after-resume-before-credentials'])assert.ok(clean.includes("runStage('"+label+"',()=>embedded(RELEASE.version))"));
  assert.match(script,/ota:\{required:false,explicitlyRequested:false,backgroundChecksMayRun:true\}/);
  assert.match(script,/expectedBuildSourceCommit:RELEASE\.buildSourceCommit/);
});
