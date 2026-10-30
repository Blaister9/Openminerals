import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {PACKAGE,SECRET_NAMES,requiresPrivateFixtures,fixtures,cleanFixture,requireSafe} from '../e2e/ci-safety.mjs';
import {verifyImmersiveResume} from '../e2e/immersive-performance.mjs';
import {nativeFailureAllowed} from '../e2e/ci-native-failure.mjs';
const require=createRequire(import.meta.url),ts=require('typescript'),yaml=require('yaml');
const source=path=>readFile(new URL(path,import.meta.url),'utf8');

async function preflight(scenario,env,request){
  const text=await source('../e2e/ci-android.mjs'),ast=ts.createSourceFile('ci-android.mjs',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const fn=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='connectFixtures');assert.ok(fn);
  const context=vm.createContext({scenario,process:{env:{GITHUB_ACTIONS:'true',RUNNER_OS:'Linux',...env}},requiresPrivateFixtures,fixtures,cleanFixture,requireSafe,request,users:undefined,mask:()=>{},sessions:[]});
  vm.runInContext(fn.getText(ast)+'\nthis.execute=connectFixtures;',context);await context.execute();return context;
}
test('Anonymous native story never reads QA credentials or calls account endpoints',async()=>{
  assert.equal(requiresPrivateFixtures('immersive-story'),false);
  for(const scenario of [undefined,'full','operator-navigation','profile-relaunch','asset-full','account-lifecycle','quality-network'])assert.equal(requiresPrivateFixtures(scenario),true);
  assert.throws(()=>requiresPrivateFixtures('unknown'));
  const calls=[];
  const context=await preflight('immersive-story',{},async path=>{calls.push(path);assert.equal(path,'/health');return{ok:true,demoOnly:true,mode:'postgres-demo',apiVersion:'0.2.0'};});
  assert.deepEqual(calls,['/health']);assert.deepEqual(Object.keys(context.users),[]);assert.equal(context.sessions.length,0);
  await assert.rejects(preflight('immersive-story',{},async()=>({ok:true,demoOnly:false,mode:'postgres-demo',apiVersion:'0.2.0'})),/PostgreSQL/);
});
test('Every commercial scenario still rejects absent private fixtures before any API call',async()=>{
  for(const scenario of ['full','operator-navigation','profile-relaunch','asset-full','account-lifecycle','quality-network']){
    let calls=0;await assert.rejects(preflight(scenario,{},async()=>{calls++;}),/Six private QA fixture secrets/);assert.equal(calls,0);
  }
});
test('Private native preflight checks two different buyers and the operator in one isolated mine',async()=>{
  const values=['qa_demo_a','PrivateOnly_password_A','qa_demo_b','PrivateOnly_password_B','qa_demo_op','PrivateOnly_password_OP'];
  const env=Object.fromEntries(SECRET_NAMES.map((key,index)=>[key,values[index]])),users=Object.values(fixtures(env));
  const identities=Object.fromEntries(users.map((user,index)=>[user.alias,{id:'account-'+index,alias:user.alias,role:user.role,mineId:'mine-native-unit'}]));
  let broken='';
  const request=async(path,token,body)=>{
    if(path==='/health')return{ok:true,demoOnly:true,mode:'postgres-demo',apiVersion:'0.2.0'};
    const account={...identities[body?.alias??token]};
    if(broken==='same-buyer'&&account.alias===users[1].alias)account.id=identities[users[0].alias].id;
    if(path.endsWith('/login'))return{token:account.alias,account};
    if(broken==='another-mine'&&account.role==='operator')account.mineId='mine-another';
    return{demoOnly:true,account,mine:{id:account.mineId,name:account.role==='operator'?'Native QA DEMO unit':'Mina virtual ficticia DEMO'}};
  };
  const result=await preflight('full',env,request);assert.equal(result.sessions.length,3);
  broken='same-buyer';await assert.rejects(preflight('full',env,request),/Two distinct QA buyers/);
  broken='another-mine';await assert.rejects(preflight('full',env,request),/Two distinct QA buyers/);
});

for(const failure of [null,'restarted','gl-unavailable'])test('Native HOME resume '+(failure??'preserves its process and GL gesture checks'),async t=>{
  const original={GITHUB_ACTIONS:process.env.GITHUB_ACTIONS,RUNNER_OS:process.env.RUNNER_OS};
  Object.assign(process.env,{GITHUB_ACTIONS:'true',RUNNER_OS:'Linux'});
  t.after(()=>{for(const[key,value]of Object.entries(original))if(value===undefined)delete process.env[key];else process.env[key]=value;});
  const published=await mkdtemp(join(tmpdir(),'openminerals-native-resume-'));
  assert.ok(resolve(published).startsWith(resolve(tmpdir())+sep+'openminerals-native-resume-'));
  const commands=[],flows=[];let background=false,returned=false;
  const adb=(...args)=>{
    commands.push(args);assert.equal(args.includes('force-stop')||args.includes('clear')||args.includes('uninstall'),false);
    if(args.includes('resolve-activity'))return PACKAGE+'/.MainActivity';
    if(args.includes('pidof'))return failure==='restarted'&&returned?'2000':'1000';
    if(args.includes('keyevent')){assert.equal(args.at(-1),'KEYCODE_HOME');background=true;return '';}
    if(args.includes('activities'))return'mResumedActivity: ActivityRecord{123 u0 '+(background?'com.android.launcher3/.Launcher':PACKAGE+'/.MainActivity')+' t1}';
    if(args.includes('start')){assert.ok(background);returned=true;background=false;return'Status: ok';}
    throw Error('Unexpected adb command');
  };
  try{
    const work=verifyImmersiveResume({adb,serial:'emulator-5554',published,maestro:async name=>{flows.push(name);if(failure==='gl-unavailable'&&name==='story-resume-check')throw Error('GL readiness assertion failed');}});
    if(failure)await assert.rejects(work,failure==='restarted'?/original process/:/GL readiness/);else await work;
    const report=JSON.parse(await readFile(join(published,'immersive-resume.json'),'utf8'));
    assert.equal(report.backgroundObserved,true);assert.equal(report.sameProcess,failure!=='restarted');
    for(const key of ['stagePreserved','glReadinessMarker','advancedAndReversed'])assert.equal(report[key],!failure);
    assert.equal(report.forceStopUsed,false);assert.equal(report.credentialsEntered,false);assert.equal(report.physicalDevice,false);
    assert.equal(flows[0],'story-resume-position');if(!failure)assert.deepEqual(flows,['story-resume-position','story-resume-check']);
    assert.equal(commands.filter(args=>args.includes('keyevent')).length,1);
  }finally{await rm(published,{recursive:true,force:true});}
});
test('Resume flow asserts retained progress before using reversible native swipes',async()=>{
  const raw=await source('../e2e/native/story-resume-check.yaml'),commands=yaml.parseAllDocuments(raw)[1].toJSON();
  assert.deepEqual(commands[0],{assertVisible:'Etapa 4 de 7: FORMACIÓN DEL LINGOTE'});
  assert.deepEqual(commands[1].extendedWaitUntil.visible,{id:'immersive-gl-ready'});
  assert.deepEqual(commands.filter(command=>command.repeat).map(command=>command.repeat.commands[0].swipe.direction),['UP','DOWN']);
  assert.doesNotMatch(raw,/launchApp|stopApp|clearState|inputText|takeScreenshot|Ir a etapa/);
  for(const name of ['story-resume-position','story-resume-check','story-performance-complete','story-performance-light-complete']){
    assert.equal(nativeFailureAllowed('immersive-story',name),true);assert.equal(nativeFailureAllowed('full',name),true);assert.equal(nativeFailureAllowed('quality-network',name),false);
  }
});
