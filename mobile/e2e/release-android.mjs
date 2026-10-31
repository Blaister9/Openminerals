// Standalone APK acceptance. The historical OTA harness remains unchanged.
// Execute only on a fresh disposable GitHub Android emulator, never a phone.
import {randomBytes} from 'node:crypto';
import {openSync,closeSync} from 'node:fs';
import {readFile,writeFile,mkdir,readdir,copyFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {PACKAGE,apkUrl,sha,hash,certificate,manifest,fixtures,cleanFixture,emulatorGuard,publicJunit,requireSafe} from './ci-safety.mjs';
import {RELEASE,RELEASE_BASELINE,releaseScenario,validateReleaseConfig,releaseRegisterFlow,validateReleaseManifest,apkRuntimeVersion,assertReleasePreserved,embeddedFlow,authenticatedFlow,buyerPreservedFlow,operatorPreservedFlow} from './release-contract.mjs';
import {createProgress} from './ci-progress.mjs';
import {adbBudget,runBounded} from './ci-process.mjs';
import {createObserverRequest} from './ci-http.mjs';
import {nativeFlow} from './native-case.mjs';
import {horizontalWalletNavigation} from './wallet-navigation.mjs';
import {flowSelectors,collectFailureDiagnostic} from './ci-diagnostics.mjs';
import {captureNativeFailure,nativeFailureAllowed} from './ci-native-failure.mjs';
import {verifyNativeSnapshot} from './ci-result.mjs';
import {runImmersivePerformance,verifyImmersiveResume} from './immersive-performance.mjs';
import {runAccountLifecycle} from './account-lifecycle.mjs';
import {privateRecoveryKey} from './private-recovery.mjs';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const root=resolve(process.env.RUNNER_TEMP||'.','openminerals-release'),published=join(root,'public'),privateRoot=join(root,'private');
let scenario,serial,users,progress,stage='configuration';
const results=[],privateValues=new Set(),sessions=[];
const request=createObserverRequest({onFailure:async value=>{if(value.operation!=='logout')await writeFile(join(published,'api-failure-context.json'),JSON.stringify(value,null,2)+'\n').catch(()=>{});}});
function command(file,args,{timeout,output,env=process.env}={}){
  timeout??=file==='adb'?adbBudget(args):180000;let fd;
  try{
    if(output)fd=openSync(output,'a',0o600);
    progress.commandStart(file,args,timeout);
    const result=runBounded(file,args,{encoding:'utf8',timeout,maxBuffer:16*1024*1024,env,stdio:fd===undefined?['ignore','pipe','pipe']:['ignore',fd,fd]});
    progress.commandEnd(result);requireSafe(!result.error&&result.status===0,'A required release command failed or timed out.');return result.stdout?.trim()||'';
  }finally{if(fd!==undefined)closeSync(fd);}
}
const adb=(...args)=>command('adb',serial?['-s',serial,...args]:args);
function mask(value){if(!value)return;privateValues.add(value);if(process.env.GITHUB_ACTIONS==='true')process.stdout.write('::add-mask::'+value.replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A')+'\n');}
async function runStage(name,work){stage=name;const start=Date.now();progress.stageStart(name);console.log('START '+name);try{await work();results.push({name,ok:true,seconds:(Date.now()-start)/1000});progress.stageEnd(name,true);console.log('PASS '+name);}catch(error){results.push({name,ok:false,seconds:(Date.now()-start)/1000});progress.stageEnd(name,false);throw error;}}
async function maestro(name,role,{source,extraEnv={}}={}){
  requireSafe(/^[a-z0-9-]{3,70}$/.test(name),'Invalid release flow name.');
  for(const [key,value] of Object.entries(extraEnv))requireSafe(['MAESTRO_RECOVERY_KEY','MAESTRO_NEXT_PASSWORD'].includes(key)&&typeof value==='string'&&/^[A-Za-z0-9_-]{32,43}$/.test(value),'Invalid private release flow environment.');
  const generated=join(privateRoot,'flows'),directory=join(privateRoot,name);await mkdir(generated,{recursive:true,mode:0o700});await mkdir(directory,{recursive:true,mode:0o700});
  for(const file of await readdir(join(repo,'e2e/native')))if(file.endsWith('.yaml'))await writeFile(join(generated,file),horizontalWalletNavigation(nativeFlow(file.slice(0,-5),await readFile(join(repo,'e2e/native',file),'utf8'),'XAU')),{mode:0o600});
  const definitions=source??await readFile(join(repo,'e2e/native',name+'.yaml'),'utf8');
  if(source)await writeFile(join(generated,name+'.yaml'),horizontalWalletNavigation(source),{mode:0o600});
  const user=users?.[role],env={...process.env,MAESTRO_CLI_NO_ANALYTICS:'1',MAESTRO_LOGIN_ALIAS:user?.alias||'',MAESTRO_LOGIN_PASSWORD:user?.password||'',...extraEnv};
  try{command('maestro',['--no-ansi','--device',serial,'test','--format','JUNIT','--output',join(directory,'raw-report.xml'),'--debug-output',join(directory,'debug'),'--test-output-dir',join(directory,'screenshots'),join(generated,name+'.yaml')],{env,timeout:420000,output:join(directory,'console.txt')});}
  catch(error){
    const diagnostic={stage:name,...await collectFailureDiagnostic(directory,flowSelectors(definitions))},text=JSON.stringify(diagnostic,null,2)+'\n';
    requireSafe([...privateValues].every(value=>!text.includes(value)),'Private release diagnostic.');await writeFile(join(published,'failure-context.json'),text);
    if(nativeFailureAllowed('asset-full',name))await captureNativeFailure({scenario:'asset-full',flow:name,serial,publishDirectory:published,privateValues:[...privateValues]});
    throw error;
  }
}
async function connectFixtures(){
  users=fixtures(process.env);for(const user of Object.values(users)){mask(user.alias);mask(user.password);}
  const health=await request('/health');requireSafe(health.ok===true&&health.demoOnly===true&&health.mode==='postgres-demo'&&health.apiVersion==='0.2.0','Standalone APK requires the PostgreSQL demo API.');
  for(const user of Object.values(users)){
    const auth=await request('/api/demo/accounts/login',null,{alias:user.alias,password:user.password});mask(auth.token);sessions.push(auth.token);user.token=auth.token;user.me=await request('/api/demo/accounts/me',auth.token);cleanFixture(user.me);
    requireSafe(auth.account.id===user.me.account.id&&user.me.account.alias===user.alias&&user.me.account.role===user.role,'QA authenticated identity differs.');
  }
  requireSafe(users.a.me.account.id!==users.b.me.account.id&&new Set(Object.values(users).map(user=>user.me.mine.id)).size===1,'Release requires two buyers and their operator in one isolated QA mine.');
}
async function snapshot(){
  const [a,b,summary,ca,cb,cm,management,profile,history]=await Promise.all([request('/api/demo/state',users.a.token),request('/api/demo/state',users.b.token),request('/api/demo/mine/summary',users.op.token),request('/api/demo/custody',users.a.token),request('/api/demo/custody',users.b.token),request('/api/demo/mine/custody',users.op.token),request('/api/demo/mine/management?limit=50',users.op.token),request('/api/demo/accounts/profile',users.a.token),request('/api/demo/history?limit=50',users.a.token)]);
  const lot=ca.allocations.find(item=>item.mg>0)?.lotId;requireSafe(typeof lot==='string'&&/^lot-[a-f0-9]{32}$/.test(lot),'Completed QA source lot required.');
  const path='/api/demo/custody/lots/'+lot+'/history?limit=20';const [ha,hb,hm]=await Promise.all([request(path,users.a.token),request(path,users.b.token),request(path,users.op.token)]);return {a,b,summary,ca,cb,cm,management,profile,history,ha,hb,hm};
}
async function preconditions(){
  await connectFixtures();
  if(scenario!=='clean-commerce'){verifyNativeSnapshot(await snapshot(),'XAU');return;}
  for(const name of ['a','b'])cleanFixture(users[name].me,await request('/api/demo/state',users[name].token));
  const summary=await request('/api/demo/mine/summary',users.op.token);cleanFixture(users.op.me,null,summary);
  for(const metal of ['XAU','XAG','XPT','XPD'])requireSafe(summary.inventoryMg[metal]===5000&&summary.totalSupplyMg[metal]===5000&&summary.allocatedMg[metal]===0&&summary.reservedMg[metal]===0,'Release QA metals must be unused with 5g each.');
  const management=await request('/api/demo/mine/management?limit=1',users.op.token);requireSafe(management.history.total===0,'Release QA mine already has movements; do not reset it.');
  const deliveries=await request('/api/demo/mine/deliveries',users.op.token),local=deliveries.policies.jurisdictions.find(item=>item.id==='DEMO_LOCAL');
  requireSafe(local&&local.serviceMinor===200&&local.preparationMinor===300&&local.transportMinor===500&&local.insuranceBps===0&&local.taxBps===0&&local.requirements.length===2,'Default fictitious delivery policy required.');
  const state=await request('/api/demo/state',users.a.token);requireSafe(state.priceCentsPerGram.XAU===14500,'Release gold reference differs.');
}
async function download(){
  const app=JSON.parse(await readFile(join(repo,'app.json'),'utf8')).expo;validateReleaseConfig(app);
  const url=apkUrl(process.env.APK_INPUT_URL),digest=sha(process.env.APK_INPUT_SHA256);await mkdir(published,{recursive:true});await mkdir(privateRoot,{recursive:true,mode:0o700});
  const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT;requireSafe(sdk,'Android SDK required.');const versions=(await readdir(join(sdk,'build-tools'))).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),tools=join(sdk,'build-tools',versions.at(-1));
  const metadata=[];
  for(const [kind,source,expected] of [['baseline',RELEASE_BASELINE.url,RELEASE_BASELINE.sha256],['new',url,digest]]){
    const file=join(root,kind+'.apk');command('curl',['--fail','--location','--proto','=https','--proto-redir','=https','--retry','2','--max-time','180','--max-filesize','200000000','--output',file,source],{timeout:400000});
    requireSafe(hash(await readFile(file))===expected,'Release APK hash differs.');
    const signing=certificate(command(join(tools,'apksigner'),['verify','--verbose','--print-certs',file])),badging=command(join(tools,'aapt'),['dump','badging',file]),info=manifest(badging),files=command('unzip',['-Z1',file]);validateReleaseManifest(info,kind,badging,files);
    const runtime=apkRuntimeVersion(command(join(tools,'aapt'),['dump','xmltree',file,'AndroidManifest.xml']),command(join(tools,'aapt'),['dump','--values','resources',file]));
    requireSafe(runtime===(kind==='baseline'?RELEASE_BASELINE.name:RELEASE.version),'Native APK runtime differs.');
    metadata.push({kind,sha256:expected,...info,runtimeVersion:runtime,debuggable:false,certificate:signing});
  }
  await writeFile(join(published,'apk-verification.json'),JSON.stringify({demoOnly:true,verificationCommit:process.env.GITHUB_SHA,expectedBuildSourceCommit:RELEASE.buildSourceCommit,run:process.env.GITHUB_RUN_ID,apks:metadata},null,2)+'\n');
}
function installed(code){const info=adb('shell','dumpsys','package',PACKAGE),match=/\bversionCode=(\d+)\b/.exec(info);requireSafe(match&&Number(match[1])===code,'Installed release version code differs.');return /\buserId=(\d+)\b/.exec(info)?.[1]??null;}
const embedded=(version,operator=false)=>maestro('release-embedded',null,{source:embeddedFlow(version,operator)});
const authenticated=operator=>maestro('release-authenticated',operator?'op':'a',{source:authenticatedFlow(operator)});
async function coldOpen(){adb('shell','am','force-stop',PACKAGE);await maestro('release-launch',null,{source:JSON.stringify({appId:PACKAGE})+'\n---\n- launchApp\n'});}
async function cleanInstall(){requireSafe(!adb('shell','pm','list','packages',PACKAGE),'Release clean install requires a fresh emulator.');adb('install',join(root,'new.apk'));installed(RELEASE.code);await coldOpen();await embedded(RELEASE.version);}
async function copyAnonymous(){
  const wanted=new Set([...Array.from({length:7},(_,i)=>'safe-story-'+(i+1)+'.png'),'safe-reduced-motion.png']),copied=new Set();
  async function walk(folder){for(const entry of await readdir(folder,{withFileTypes:true})){if(entry.isSymbolicLink())continue;const file=join(folder,entry.name);if(entry.isDirectory())await walk(file);else if(wanted.has(entry.name)){const bytes=await readFile(file);requireSafe(bytes.length<10000000&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'Invalid anonymous release PNG.');await copyFile(file,join(published,entry.name));copied.add(entry.name);}}}
  for(const name of ['story','story-exit'])await walk(join(privateRoot,name,'screenshots'));requireSafe([...wanted].every(name=>copied.has(name)),'Missing anonymous release chapter screenshots.');
  const file=join(published,'immersive-performance.json'),metrics=JSON.parse(await readFile(file,'utf8'));metrics.bundleSourceRequirement='embedded';metrics.sourceCheckpoint='embedded-after-story-cold-launch';metrics.interpretation=metrics.interpretation.replace('already installed APK and cached OTA','already installed APK; embedded source checked separately');await writeFile(file,JSON.stringify(metrics,null,2)+'\n');
}
async function cleanCommerce(){
  await runStage('clean-install-030-embedded',cleanInstall);
  await runStage('native-story-reduced-motion-and-operations',async()=>{await runImmersivePerformance({adb,serial,maestro,published});await copyAnonymous();});
  await runStage('embedded-after-story-cold-launch',()=>embedded(RELEASE.version));
  await runStage('native-story-resumes-after-home',()=>verifyImmersiveResume({adb,serial,maestro,published}));
  await runStage('embedded-after-resume-before-credentials',()=>embedded(RELEASE.version));
  users.register={alias:'native_'+randomBytes(9).toString('hex'),password:randomBytes(24).toString('base64url')};mask(users.register.alias);mask(users.register.password);
  await runStage('native-registration-without-import',async()=>{await maestro('register','register',{source:releaseRegisterFlow(await readFile(join(repo,'e2e/native/register.yaml'),'utf8'))});const auth=await request('/api/demo/accounts/login',null,users.register);mask(auth.token);sessions.push(auth.token);const state=await request('/api/demo/state',auth.token);requireSafe(auth.account.role==='buyer'&&auth.account.mineId!==users.a.me.mine.id&&state.walletMinor.USDT===25000&&Object.values(state.holdingsMg).every(value=>value===0)&&Object.keys(state.receipts).length===0,'Release registration imported or changed balances.');});
  for(const [name,flow,role] of [
    ['buyer-a-login-conversion','buyer-a','a'],['buyer-a-buy-and-certificate','buyer-a-buy','a'],['buyer-a-publish-priced-offer','buyer-a-offer','a'],['buyer-b-marketplace-certificate','buyer-b','b'],['buyer-a-sale-and-delivery-request','request-delivery','a'],['operator-quote-private-mine','quote','op'],['buyer-accept-simulated-costs','accept','a'],['operator-delivery-lifecycle','operator','op'],['operator-restock-management','operator-stock','op'],['buyer-history-profile-relaunch','profile','a'],['buyer-custody-fraction-is-not-whole-lot','custody-recheck','a'],
  ])await runStage(name,()=>maestro(flow,role));
  await runStage('api-verifies-native-wallets-lots-fees',async()=>verifyNativeSnapshot(await snapshot(),'XAU'));
  await runStage('buyer-embedded-cold-launch-preserves-auth',async()=>{await coldOpen();await authenticated(false);await embedded(RELEASE.version);});
  await runStage('api-verifies-data-after-embedded-cold-launch',async()=>verifyNativeSnapshot(await snapshot(),'XAU'));
}
async function upgrade(){
  const operator=scenario==='upgrade-operator',before=await snapshot();let uid;
  await runStage('install-baseline-020-embedded',async()=>{requireSafe(!adb('shell','pm','list','packages',PACKAGE),'Upgrade requires a fresh emulator.');adb('install',join(root,'baseline.apk'));uid=installed(RELEASE_BASELINE.code);requireSafe(uid!==null,'Baseline Android UID unavailable.');await coldOpen();await embedded(RELEASE_BASELINE.name);});
  await runStage('baseline-020-authenticated-identity',async()=>{await maestro('login',operator?'op':'a');await authenticated(operator);});
  await runStage('api-confirms-baseline-data-unchanged',async()=>assertReleasePreserved(before,await snapshot()));
  await runStage('replace-020-with-030-without-data-clear',async()=>{const system=adb('shell','pidof','system_server');adb('shell','am','force-stop',PACKAGE);adb('install','-r',join(root,'new.apk'));requireSafe(installed(RELEASE.code)===uid&&adb('shell','pidof','system_server')===system,'Upgrade changed Android UID or system process.');});
  await runStage('upgraded-030-preserves-auth-without-login',async()=>{await coldOpen();await authenticated(operator);await embedded(RELEASE.version,operator);});
  await runStage('upgraded-030-readonly-wallet-history-mine',()=>maestro('release-preserved-ui',operator?'op':'a',{source:operator?operatorPreservedFlow():buyerPreservedFlow()}));
  await runStage('upgraded-030-second-cold-launch-preserves-auth',async()=>{await coldOpen();await authenticated(operator);await embedded(RELEASE.version,operator);});
  await runStage('api-verifies-all-upgrade-data-preserved',async()=>{const checks=assertReleasePreserved(before,await snapshot());verifyNativeSnapshot(await snapshot(),'XAU');await writeFile(join(published,'upgrade-preservation.json'),JSON.stringify({demoOnly:true,role:operator?'operator':'buyer',from:RELEASE_BASELINE.name,to:RELEASE.version,sameAndroidUid:true,noCredentialEntryAfterReplacement:true,embeddedLaunchesVerified:2,...checks},null,2)+'\n');});
}
function captureSecret(id){const remote='/data/local/tmp/openminerals-release-recovery.xml';try{adb('shell','uiautomator','dump',remote);return privateRecoveryKey(adb('exec-out','cat',remote),id);}finally{adb('shell','rm','-f',remote);}}
async function accounts(){const before=await snapshot();await runStage('accounts-clean-install-030-embedded',cleanInstall);await runAccountLifecycle({runStage,maestro,request,users,mask,sessions,captureSecret});await runStage('api-confirms-commercial-fixture-unchanged',async()=>assertReleasePreserved(before,await snapshot()));await runStage('recovered-account-still-uses-embedded-apk',()=>embedded(RELEASE.version));}
async function report(){if(!results.length)return;const summary={demoOnly:true,scenario,environment:'disposable Android CI emulator',phoneAcceptance:false,realCustody:false,bundleSource:'embedded-required',ota:{required:false,explicitlyRequested:false,backgroundChecksMayRun:true},completed:results.filter(item=>item.ok).map(item=>item.name),failed:results.filter(item=>!item.ok).map(item=>item.name),privateDiagnosticsPublished:false};const text=JSON.stringify(summary,null,2)+'\n';requireSafe([...privateValues].every(value=>!text.includes(value)),'Private release summary.');await mkdir(published,{recursive:true});await writeFile(join(published,'summary.json'),text);await writeFile(join(published,'report.xml'),publicJunit(results,[...privateValues]));}
try{
  scenario=releaseScenario(process.env.NATIVE_RELEASE_SCENARIO,process.env.OTA_INPUT_UPDATE_ID);const mode=process.argv[2];requireSafe(['download','preflight','run'].includes(mode),'Invalid release mode.');requireSafe(process.env.GITHUB_ACTIONS==='true'&&process.env.RUNNER_OS==='Linux','Release runner requires disposable GitHub Linux.');progress=createProgress(published,mode,()=>[...privateValues]);
  if(mode==='download')await runStage('download-signed-release-apks',download);
  else if(mode==='preflight')await runStage('release-qa-preflight',preconditions);
  else{
    await mkdir(privateRoot,{recursive:true,mode:0o700});progress.stageStart('emulator-preconditions');const devices=command('adb',['devices']),candidate=devices.split(/\r?\n/).find(line=>/^emulator-\d+\s+device$/.test(line.trim()))?.split(/\s/)[0];serial=emulatorGuard(process.env,devices,candidate?command('adb',['-s',candidate,'shell','getprop','ro.kernel.qemu']):'');progress.stageEnd('emulator-preconditions',true);
    await runStage('release-qa-preconditions',preconditions);if(scenario==='clean-commerce')await cleanCommerce();else if(scenario==='accounts-wallets')await accounts();else await upgrade();
  }
}catch{progress?.failCurrent();console.error('FAIL standalone release stage: '+stage+'. No private diagnostics are published.');process.exitCode=1;}
finally{for(const token of sessions)try{await request('/api/demo/accounts/logout',token,{});}catch{}await report();}
