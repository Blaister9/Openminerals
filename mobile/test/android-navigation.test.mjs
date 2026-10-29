import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import vm from 'node:vm';
import {nativeScenario,PACKAGE} from '../e2e/ci-safety.mjs';
import {sanitizeOperatorHierarchy,captureOperatorNavigation} from '../e2e/ci-operator-navigation.mjs';

const require=createRequire(import.meta.url),yaml=require('yaml'),ts=require('typescript');
const source=path=>readFile(new URL(path,import.meta.url),'utf8');
const node=(text,attributes='')=>`<node text="${text}" class="android.widget.TextView" bounds="[10,20][200,60]" enabled="true" clickable="true" selected="false" ${attributes}/>`;

test('operator navigation: scenario allowlist fails closed before CLI or runner files',async()=>{
  assert.equal(nativeScenario(undefined),'full');assert.equal(nativeScenario(''),'full');assert.equal(nativeScenario('full'),'full');assert.equal(nativeScenario('operator-navigation'),'operator-navigation');
  for(const value of [null,0,{},'operator-navigation; echo unsafe','Full',' full','operator-navigation\n'])assert.throws(()=>nativeScenario(value));
  const directory=await mkdtemp(join(tmpdir(),'openminerals-native-scenario-'));
  assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep+'openminerals-native-scenario-'));
  try{
    for(const env of [{NATIVE_INPUT_SCENARIO:'$(private_payload)'},{NATIVE_INPUT_SCENARIO:'operator-navigation',OTA_INPUT_UPDATE_ID:''}]){
      const result=spawnSync(process.execPath,[fileURLToPath(new URL('../e2e/ci-android.mjs',import.meta.url)),'download'],{encoding:'utf8',timeout:10000,env:{...process.env,PATH:directory,GITHUB_ACTIONS:'true',RUNNER_OS:'Linux',RUNNER_TEMP:directory,OTA_INPUT_UPDATE_ID:'',...env}});
      assert.equal(result.status,1);assert.match(result.stderr,/stage: configuration/);assert.doesNotMatch(result.stderr+result.stdout,/private_payload/);
      assert.deepEqual(await readdir(directory),[]);
    }
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('operator navigation: hierarchy emits constant IDs and geometry, never account text or credentials',()=>{
  const secret='private_account_token_abcdef0123456789';
  const xml='<hierarchy>'+node('Operador · private_fixture_op')+node('Entregas DEMO')+node('Gestionar entregas demo')+node(secret)+node('USDT 123,45')+node('Alias de cuenta demo',`content-desc="${secret}"`)+node('Failure '+secret+' Toca aquí para actualizar los datos.')+node('Panel gerencial',`package="com.google.android.inputmethod.latin"`)+'</hierarchy>';
  const result=sanitizeOperatorHierarchy(xml),serialized=JSON.stringify(result);
  assert.deepEqual(result.roles,['operator']);assert.equal(result.keyboardPresent,true);assert.equal(result.globalErrorPresent,true);
  assert.deepEqual(result.landmarks.map(item=>item.id),['menu-deliveries','deliveries-header','menu-management']);
  assert.deepEqual(result.landmarks[0].bounds,[10,20,200,60]);assert.equal(result.rawUiPublished,false);
  for(const value of [secret,'private_fixture_op','Operador','USDT','Alias de cuenta demo','Entregas DEMO','Failure'])assert.equal(serialized.includes(value),false);
  assert.throws(()=>sanitizeOperatorHierarchy('<!DOCTYPE x [<!ENTITY a "secret">]><hierarchy/>'));
  assert.throws(()=>sanitizeOperatorHierarchy('<hierarchy>'+node('Entregas DEMO')));
  assert.throws(()=>sanitizeOperatorHierarchy('x'.repeat(2000001)));
});

test('operator navigation: captures no screenshot or raw UI, removes remote dump and safely tolerates capture failure',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'openminerals-navigation-capture-'));
  try{
    const calls=[],secret='private_fixture_do_not_publish',invoke=(file,args)=>{
      assert.equal(file,'adb');calls.push(args);
      return {status:0,stdout:args.includes('cat')?'<hierarchy>'+node('Operador · qa_operator')+node('Entregas DEMO')+node(secret)+'</hierarchy>':'',stderr:secret};
    };
    const options={scenario:'operator-navigation',checkpoint:'before-original-down',serial:'emulator-5554',publishDirectory:directory,privateValues:[secret],invoke};
    const result=await captureOperatorNavigation(options);assert.equal(result.status,'captured');
    assert.deepEqual(calls.map(args=>args.slice(2,4)),[['shell','uiautomator'],['exec-out','cat'],['shell','rm']]);
    assert.doesNotMatch(JSON.stringify(calls),/screencap|pull|logcat|password|token/);
    const files=await readdir(directory);assert.deepEqual(files,['operator-navigation-before-original-down.json']);
    const text=await readFile(join(directory,files[0]),'utf8');assert.equal(text.includes(secret),false);assert.equal(text.includes('<node'),false);assert.equal(text.includes('qa_operator'),false);
    const failed=await captureOperatorNavigation({...options,checkpoint:'failure',invoke:()=>({status:1,stderr:secret})});
    assert.equal(failed.status,'unavailable');assert.equal(JSON.stringify(failed).includes(secret),false);
    let invoked=false;await assert.rejects(()=>captureOperatorNavigation({...options,scenario:'full',invoke:()=>{invoked=true;}}));assert.equal(invoked,false);
    await assert.rejects(()=>captureOperatorNavigation({...options,serial:'physical-device'}));
  }finally{await rm(directory,{recursive:true,force:true});}
});

test('operator navigation: exact original DOWN search precedes entry; exit and reentry never submit financial commands',async()=>{
  const flow=async name=>yaml.parseAllDocuments(await source('../e2e/native/'+name+'.yaml'))[1].toJSON();
  const quote=await flow('quote'),entry=await flow('operator-navigation');
  assert.deepEqual(entry.slice(0,2),quote.slice(1,3));
  const all=[];
  for(const name of ['operator-navigation','operator-navigation-login','operator-navigation-exit','operator-navigation-reentry','operator-navigation-ota']){
    const commands=await flow(name);all.push(...commands);
    assert.equal(yaml.parseAllDocuments(await source('../e2e/native/'+name+'.yaml'))[0].toJSON().appId,PACKAGE);
  }
  assert.doesNotMatch(JSON.stringify(all),/Confirmar demo|Revisar cotización|Revisar:|Revisar política|Revisar ingreso|inputText|takeScreenshot|clearState|eraseText/);
  assert.deepEqual((await flow('operator-navigation-login'))[0],{runFlow:{file:'login.yaml'}});
  const ota=await source('../e2e/native/operator-navigation-ota.yaml');assert.equal((ota.match(/MAESTRO_EXPECTED_OTA_ID\.slice\(0,8\)/g)||[]).length,2);
});

test('operator navigation: actual runner branch installs only new APK and verifies unchanged fixtures',async()=>{
  const text=await source('../e2e/ci-android.mjs'),ast=ts.createSourceFile('ci-android.mjs',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const fn=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='operatorNavigation');assert.ok(fn);
  const stages=[],flows=[],captures=[],adbCalls=[];
  const context=vm.createContext({root:'/fixture',PACKAGE,join:(...args)=>args.join('/'),requireSafe:(condition)=>assert.ok(condition),
    runStage:async(name,work)=>{stages.push(name);await work();},maestro:async(...args)=>{flows.push(args);},captureNavigation:async point=>captures.push(point),unusedFixtures:async()=>stages.push('checked-unused'),
    adb:(...args)=>{adbCalls.push(args);return args[0]==='shell'&&args[1]==='dumpsys'?'versionCode=5':'';}});
  vm.runInContext(fn.getText(ast)+'\nthis.execute=operatorNavigation;',context);await context.execute();
  assert.deepEqual(flows,[['operator-navigation-ota'],['operator-navigation-login','op'],['operator-navigation','op'],['operator-navigation-exit','op'],['operator-navigation-reentry','op']]);
  assert.deepEqual(captures,['before-original-down','after-original-entry','after-exit','after-reentry']);
  assert.deepEqual(adbCalls.filter(args=>args[0]==='install'),[['install','/fixture/new.apk']]);
  assert.equal(stages.at(-1),'checked-unused');assert.doesNotMatch(JSON.stringify(flows),/buyer|quote|stock|accept/);
  assert.match(text,/if\(scenario==='operator-navigation'\)\{await operatorNavigation\(\);return;\}/);
});

test('delivery lifecycle starts at the restored top and finds its first form below the heading',async()=>{
  const commands=yaml.parseAllDocuments(await source('../e2e/native/operator.yaml'))[1].toJSON();
  const entry=commands.findIndex(command=>command.tapOn==='^Entregas DEMO$');assert.ok(entry>=0);
  const wait=commands[entry+1];assert.equal(wait.extendedWaitUntil.visible,'^Gestionar entregas demo$');
  const field=commands[entry+2].scrollUntilVisible;assert.equal(field.element.text,'Motivo ficticio del cambio de entrega');assert.equal(field.direction,'DOWN');
});
