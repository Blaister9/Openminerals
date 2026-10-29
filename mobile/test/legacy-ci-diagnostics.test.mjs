import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {join,resolve,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {captureLegacyFailure,legacyFailureAllowed,legacyRuntimeState,sanitizeLegacyHierarchy} from '../e2e/ci-legacy-failure.mjs';
import {withLegacyNavigation} from '../e2e/ci-legacy-navigation.mjs';
import {PACKAGE} from '../e2e/ci-safety.mjs';

const completed=['qa-isolation-preconditions','install-baseline-013'];
const definitions='appId: com.openminerals.demo.mobile\n---\n- launchApp:\n    clearState: true\n- tapOn: ^Billetera$\n- text: Cantidad de dinero para convertir\n';
const secret='PRIVATE_ACCOUNT_PASSWORD_ABCDEFGHIJKLMN';
const xml='<hierarchy><node class="android.widget.FrameLayout" bounds="[0,0][1080,1920]" enabled="true" scrollable="false" text="'+secret+'" content-desc="'+secret+'">'+
  '<node class="android.widget.EditText" bounds="[20,100][1000,200]" enabled="true" scrollable="false" text="20" content-desc="Cantidad de dinero para convertir"/>'+
  '<node class="android.widget.EditText" bounds="[20,300][1000,400]" enabled="true" scrollable="false" text="'+secret+'" content-desc="'+secret+'"/>'+
  '<node class="android.widget.EditText" bounds="[20,500][1000,600]" enabled="false" scrollable="false" text="0.500" content-desc="Cantidad de dinero para convertir, 20"/>'+
  '<node class="android.widget.TextView" bounds="[20,700][1000,800]" enabled="true" scrollable="true" text="USDT 250,00" content-desc="Billetera"/>'+
  '<node class="android.widget.EditText" bounds="[20,900][1000,1000]" enabled="true" scrollable="false" text="1234567890123456789012345678901234567890123" content-desc="Unknown '+secret+'"/>'+
  '</node></hierarchy>';
const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==','base64');
async function workspace(t){
  const folder=await mkdtemp(join(tmpdir(),'openminerals-legacy-diagnostics-'));
  t.after(async()=>{
    // Check the absolute target before recursive removal on Windows.
    assert.equal(dirname(resolve(folder)),resolve(tmpdir()));assert.ok(basename(folder).startsWith('openminerals-legacy-diagnostics-'));
    await rm(folder,{recursive:true,force:true});
  });
  return {folder,privateDirectory:join(folder,'private'),publishDirectory:join(folder,'public')};
}

test('Legacy diagnostics: every account recovery OTA or later stage denies capture before adb/files',async t=>{
  const paths=await workspace(t);let invoked=0;
  const options={stage:'legacy-seed-old-apk',completedStages:completed,serial:'emulator-5554',definitions,...paths,invoke:()=>{invoked++;throw new Error(secret);}};
  assert.equal(legacyFailureAllowed(options.stage,completed),true);
  for(const stage of ['register','native-registration-no-import','buyer-a','accept','profile','ota','buyer-compatible-ota-cold-launch']){
    assert.equal(legacyFailureAllowed(stage,completed),false);
    await assert.rejects(()=>captureLegacyFailure({...options,stage}),/restricted/);
  }
  for(const completedStages of [[],completed.slice(1),[...completed,'native-registration-no-import']])await assert.rejects(()=>captureLegacyFailure({...options,completedStages}),/restricted/);
  await assert.rejects(()=>captureLegacyFailure({...options,serial:'physical-phone'}),/restricted/);
  await assert.rejects(()=>captureLegacyFailure({...options,definitions:definitions+'\n- tapOn: Alias de cuenta demo'}),/anonymous capture policy/);
  const previous=process.env.GITHUB_ACTIONS;
  try{
    process.env.GITHUB_ACTIONS='false';
    await assert.rejects(()=>captureLegacyFailure({...options,invoke:undefined}),/GitHub Linux/);
  }finally{if(previous===undefined)delete process.env.GITHUB_ACTIONS;else process.env.GITHUB_ACTIONS=previous;}
  assert.equal(invoked,0);assert.deepEqual(await readdir(paths.folder),[]);
});

test('Legacy diagnostics: XML publishes structural attributes and numeric/static EditText data only',()=>{
  const result=sanitizeLegacyHierarchy(xml,['^Billetera$','Cantidad de dinero para convertir']);
  assert.equal(result.nodes.length,6);assert.equal(result.truncated,false);
  assert.deepEqual(Object.keys(result.nodes[0]),['class','bounds','enabled','scrollable']);
  assert.equal(result.nodes[1].text,'20');assert.equal(result.nodes[1].contentDescription,'Cantidad de dinero para convertir');
  assert.deepEqual(Object.keys(result.nodes[2]),['class','bounds','enabled','scrollable']);
  assert.equal(result.nodes[3].text,'0.500');assert.equal(result.nodes[3].enabled,false);
  assert.equal(result.nodes[3].contentDescription,'Cantidad de dinero para convertir, 20');
  assert.equal(result.nodes[4].scrollable,true);assert.equal(result.nodes[4].text,undefined);assert.equal(result.nodes[4].contentDescription,undefined);
  assert.equal(result.nodes[5].text,undefined);assert.equal(result.nodes[5].contentDescription,undefined);
  assert.equal(JSON.stringify(result).includes(secret),false);
});

test('Legacy diagnostics: declarations malformed XML and wildcard labels fail closed',()=>{
  for(const source of ['<hierarchy><node', '<!DOCTYPE x [<!ENTITY secret "'+secret+'">]><hierarchy/>','<!ENTITY x "'+secret+'"><hierarchy/>'])assert.throws(()=>sanitizeLegacyHierarchy(source,['.*']),error=>!error.message.includes(secret));
  const result=sanitizeLegacyHierarchy(xml,['.*','^.*$']);
  assert.ok(result.nodes.every(node=>node.contentDescription===undefined));
});

test('Legacy diagnostics: anonymous PNG allowed, raw XML stays private and account values are absent',async t=>{
  const paths=await workspace(t),calls=[];
  const actualLegacyFlow=await readFile(new URL('../e2e/trades.yaml',import.meta.url),'utf8');
  const screens=join(paths.privateDirectory,'screenshots','takeScreenshot');await mkdir(screens,{recursive:true});
  writeFileSync(join(screens,'trades-01-initial.png'),pixel);writeFileSync(join(screens,'safe-legacy-after-wallet.png'),pixel);
  writeFileSync(join(screens,'unapproved-error.png'),pixel);
  const invoke=(program,args)=>{
    calls.push({program,args});
    if(args.includes('exec-out'))return {status:0,stdout:pixel};
    if(args.includes('pidof'))return {status:0,stdout:Buffer.from('1234')};
    if(args.includes('dumpsys'))return {status:0,stdout:Buffer.from('mResumedActivity: ActivityRecord{123 u0 '+PACKAGE+'/.MainActivity t1}')};
    if(args.includes('pull'))writeFileSync(args.at(-1),xml);
    return {status:0,stdout:Buffer.from('private device response '+secret)};
  };
  const result=await captureLegacyFailure({stage:'legacy-seed-old-apk',completedStages:completed,serial:'emulator-5554',definitions:actualLegacyFlow,...paths,privateValues:[secret],invoke});
  assert.equal(result.screenshot,'safe-legacy-failure.png');assert.equal(result.hierarchy,'safe-legacy-ui.json');
  assert.equal(calls.length,6);assert.ok(calls.every(call=>call.program==='adb'&&call.args[0]==='-s'&&call.args[1]==='emulator-5554'));
  const published=(await readdir(paths.publishDirectory)).sort();
  assert.deepEqual(published,['legacy-failure-capture.json','safe-legacy-after-wallet.png','safe-legacy-before-wallet.png','safe-legacy-failure.png','safe-legacy-runtime.json','safe-legacy-ui.json']);
  assert.deepEqual(result.walletScreenshots,['safe-legacy-after-wallet.png','safe-legacy-before-wallet.png']);
  const runtime=JSON.parse(await readFile(join(paths.publishDirectory,'safe-legacy-runtime.json'),'utf8'));
  assert.equal(runtime.processAlive,true);assert.equal(runtime.foregroundApp,true);
  assert.equal((await readFile(join(paths.privateDirectory,'uiautomator.xml'),'utf8')).includes(secret),true);
  assert.equal((await readFile(join(paths.publishDirectory,'safe-legacy-ui.json'),'utf8')).includes(secret),false);
  assert.deepEqual(await readFile(join(paths.publishDirectory,'safe-legacy-failure.png')),pixel);
});

test('Legacy diagnostics: known private numeric value or adb errors never enter published JSON',async t=>{
  const paths=await workspace(t);
  const invoke=(program,args)=>{
    if(args.includes('exec-out'))return {status:1,stderr:Buffer.from(secret)};
    if(args.includes('pull'))writeFileSync(args.at(-1),xml);
    return {status:0,stdout:Buffer.from(secret)};
  };
  // Even a numeric string that otherwise passes the allowlist is rejected if
  // the process knows it as private. Real fixture passwords are never numeric UI.
  const result=await captureLegacyFailure({stage:'legacy-seed-old-apk',completedStages:completed,serial:'emulator-5554',definitions,...paths,privateValues:[secret,'20'],invoke});
  assert.equal(result.screenshot,'unavailable');assert.equal(result.hierarchy,'unavailable');
  assert.deepEqual((await readdir(paths.publishDirectory)).sort(),['legacy-failure-capture.json','safe-legacy-runtime.json']);
  assert.equal((await readFile(join(paths.publishDirectory,'legacy-failure-capture.json'),'utf8')).includes(secret),false);
});

test('Legacy diagnostics: PID foreground and fatal classes never expose process extras or exception messages',()=>{
  const runtime=legacyRuntimeState({
    pidStatus:0,pidText:'147',
    activityText:'mResumedActivity: ActivityRecord{cafe u0 com.google.android.apps.nexuslauncher/.NexusLauncherActivity t1} '+secret,
    crashText:[
      'E/AndroidRuntime(11): FATAL EXCEPTION: main',
      'E/AndroidRuntime(11): Process: com.android.other, PID: 11',
      'E/AndroidRuntime(11): java.lang.SecurityException: '+secret,
      'E/AndroidRuntime(147): FATAL EXCEPTION: main',
      'E/AndroidRuntime(147): Process: '+PACKAGE+', PID: 147',
      'E/AndroidRuntime(147): com.facebook.react.common.JavascriptException: '+secret,
      'E/AndroidRuntime(147): Caused by: java.lang.IllegalArgumentException: '+secret,
      'F/DEBUG: pid: 147, tid: 147, name: app >>> '+PACKAGE+' <<<',
      'F/DEBUG: signal 6 (SIGABRT), code -6 '+secret,
    ].join('\n'),
  });
  assert.equal(runtime.processAlive,true);assert.equal(runtime.foregroundApp,false);assert.equal(runtime.foregroundLauncher,true);
  assert.equal(runtime.topActivity,'com.google.android.apps.nexuslauncher/.NexusLauncherActivity');
  assert.deepEqual(runtime.fatalClasses,['com.facebook.react.common.JavascriptException','java.lang.IllegalArgumentException']);
  assert.deepEqual(runtime.nativeSignals,['SIGABRT']);
  assert.equal(JSON.stringify(runtime).includes(secret),false);assert.equal(JSON.stringify(runtime).includes('147'),false);
  const unknown=legacyRuntimeState({pidStatus:1,pidText:'',activityText:'mResumedActivity: ActivityRecord{abc u0 com.unknown.app/.Something t2}'});
  assert.equal(unknown.processAlive,false);assert.equal(unknown.topActivity,null);
});

test('Legacy diagnostics: screenshots bracket the first wallet tap and header assertion precedes lookup',async()=>{
  const flow=await readFile(new URL('../e2e/trades.yaml',import.meta.url),'utf8');
  const before=flow.indexOf('- takeScreenshot: trades-01-initial'),tap=flow.indexOf("- tapOn: '^Billetera$'");
  const after=flow.indexOf('- takeScreenshot: safe-legacy-after-wallet',tap),header=flow.indexOf("visible: '^CUENTAS MULTIDIVISA$'",tap),lookup=flow.indexOf("text: 'Cantidad de dinero para convertir'",tap);
  assert.ok(before>=0&&before<tap&&tap<after&&after<header&&header<lookup);
});

function navigationFixture({code=4,initial='null',restore=true}={}){
  const calls=[];let value=initial;
  const adb=(...args)=>{
    calls.push(args);
    if(args[1]==='dumpsys')return 'versionCode='+code+' minSdk=24';
    if(args[1]==='settings'){
      if(args[2]==='get')return value;
      if(args[2]==='put'){value=args.at(-1);return '';}
      if(args[2]==='delete'){if(restore)value='null';return '';}
    }
    throw new Error('Unexpected mock Android command.');
  };
  return {adb,calls,policy:()=>value};
}
test('Legacy navigation: only code4 with null policy can temporarily hide the old package bar',async()=>{
  const fixture=navigationFixture(),metadata=[];
  const result=await withLegacyNavigation(fixture.adb,async()=>{
    assert.equal(fixture.policy(),'immersive.navigation='+PACKAGE);return 'seeded';
  },async value=>metadata.push(value));
  assert.equal(result,'seeded');assert.equal(fixture.policy(),'null');
  assert.equal(metadata[0].restoredToNull,true);assert.equal(metadata[0].overlapHypothesisOnly,true);
  const put=fixture.calls.findIndex(args=>args[2]==='put'),del=fixture.calls.findIndex(args=>args[2]==='delete');
  assert.ok(put>=0&&del>put);assert.deepEqual(fixture.calls.at(-1),['shell','settings','get','global','policy_control']);
});
test('Legacy navigation: flow failure restores normal bars in finally',async()=>{
  const fixture=navigationFixture(),metadata=[];
  await assert.rejects(()=>withLegacyNavigation(fixture.adb,async()=>{throw new Error('Synthetic flow failure');},async value=>metadata.push(value)),/Synthetic flow failure/);
  assert.equal(fixture.policy(),'null');assert.equal(metadata[0].restoredToNull,true);
});
test('Legacy navigation: new APK other versions or preexisting policy never mutate Android settings',async()=>{
  for(const options of [{code:5},{code:40},{initial:'immersive.navigation=another.package'}]){
    const fixture=navigationFixture(options);let ran=false;
    await assert.rejects(()=>withLegacyNavigation(fixture.adb,async()=>{ran=true;}));
    assert.equal(ran,false);assert.equal(fixture.calls.some(args=>args[2]==='put'||args[2]==='delete'),false);
  }
});
test('Legacy navigation: restore failure blocks progression and install-r has an independent normal-bars gate',async()=>{
  const fixture=navigationFixture({restore:false});let progressed=false;
  await assert.rejects(async()=>{await withLegacyNavigation(fixture.adb,async()=>{});progressed=true;},/not restored/);
  assert.equal(progressed,false);
  const source=await readFile(new URL('../e2e/ci-android.mjs',import.meta.url),'utf8');
  const start=source.indexOf("await runStage('update-without-clearing-data'"),end=source.indexOf("await runStage('preserve-legacy-after-update'");
  const update=source.slice(start,end);
  assert.ok(update.indexOf("'settings','get','global','policy_control'")>=0);
  assert.ok(update.indexOf("'settings','get','global','policy_control'")<update.indexOf("adb('install','-r'"));
  assert.equal((source.match(/withLegacyNavigation\(/g)||[]).length,1);
});
