import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {writeFileSync} from 'node:fs';
import {join,resolve,dirname,basename} from 'node:path';
import {tmpdir} from 'node:os';
import {captureLegacyFailure,legacyFailureAllowed,sanitizeLegacyHierarchy} from '../e2e/ci-legacy-failure.mjs';

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
  const invoke=(program,args)=>{
    calls.push({program,args});
    if(args.includes('exec-out'))return {status:0,stdout:pixel};
    if(args.includes('pull'))writeFileSync(args.at(-1),xml);
    return {status:0,stdout:Buffer.from('private device response '+secret)};
  };
  const result=await captureLegacyFailure({stage:'legacy-seed-old-apk',completedStages:completed,serial:'emulator-5554',definitions:actualLegacyFlow,...paths,privateValues:[secret],invoke});
  assert.equal(result.screenshot,'safe-legacy-failure.png');assert.equal(result.hierarchy,'safe-legacy-ui.json');
  assert.equal(calls.length,3);assert.ok(calls.every(call=>call.program==='adb'&&call.args[0]==='-s'&&call.args[1]==='emulator-5554'));
  const published=(await readdir(paths.publishDirectory)).sort();
  assert.deepEqual(published,['legacy-failure-capture.json','safe-legacy-failure.png','safe-legacy-ui.json']);
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
  assert.deepEqual(await readdir(paths.publishDirectory),['legacy-failure-capture.json']);
  assert.equal((await readFile(join(paths.publishDirectory,'legacy-failure-capture.json'),'utf8')).includes(secret),false);
});
