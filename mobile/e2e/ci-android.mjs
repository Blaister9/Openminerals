// Native acceptance is allowed ONLY on the disposable GitHub emulator.
// No API mutation is performed here: all wallet/stock commands come from UI.
import {randomBytes} from 'node:crypto';
import {closeSync,openSync} from 'node:fs';
import {copyFile,mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {API,BASELINE,PACKAGE,SECRET_NAMES,apkUrl,certificate,cleanFixture,emulatorGuard,fixtures,hash,manifest,nativeScenario,otaUpdateId,publicJunit,requireSafe,sha} from './ci-safety.mjs';
import {verifyNativeCommercialSnapshot,verifyNativeSnapshot} from './ci-result.mjs';
import {flowSelectors,collectFailureDiagnostic} from './ci-diagnostics.mjs';
import {captureLegacyFailure} from './ci-legacy-failure.mjs';
import {withLegacyNavigation} from './ci-legacy-navigation.mjs';
import {adbBudget,runBounded} from './ci-process.mjs';
import {createProgress} from './ci-progress.mjs';
import {captureOperatorNavigation} from './ci-operator-navigation.mjs';

const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=resolve(process.env.RUNNER_TEMP||'.','openminerals-native');
const published=join(root,'public'),privateRoot=join(root,'private');
const results=[],privateValues=new Set(),sessions=[];
let stage='configuration',users,serial,expectedOtaId=null,scenario='full';
let progress;
const request=async(path,token,body)=>{
  const response=await fetch(API+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000),redirect:'error'});
  requireSafe(response.status===200,'API precondition or native result could not be verified.');
  return response.json();
};
function command(file,args,{timeout,env=process.env,output}={}){
  timeout??=file==='adb'?adbBudget(args):180000;
  let fd;
  try{
    if(output)fd=openSync(output,'a',0o600);
    progress.commandStart(file,args,timeout);
    const result=runBounded(file,args,{encoding:'utf8',timeout,maxBuffer:16*1024*1024,env,stdio:fd===undefined?['ignore','pipe','pipe']:['ignore',fd,fd]});
    progress.commandEnd(result);
    requireSafe(!result.error&&result.status===0,'A required Android command failed or timed out.');
    return result.stdout?.trim()||'';
  }finally{if(fd!==undefined)closeSync(fd);}
}
const adb=(...args)=>command('adb',serial?['-s',serial,...args]:args);
function mask(value){
  if(!value)return;privateValues.add(value);
  // GHA consumes this command without displaying the value. Nothing else logs it.
  if(process.env.GITHUB_ACTIONS==='true')process.stdout.write('::add-mask::'+value.replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A')+'\n');
}
async function connectFixtures(){
  requireSafe(process.env.GITHUB_ACTIONS==='true'&&process.env.RUNNER_OS==='Linux','QA preflight runs only in GitHub Linux.');
  users=fixtures(process.env);
  for(const value of Object.values(users))for(const secret of [value.alias,value.password])mask(secret);
  const health=await request('/health');
  requireSafe(health.ok===true&&health.demoOnly===true&&health.mode==='postgres-demo'&&health.apiVersion==='0.2.0','The deployed PostgreSQL API 0.2.0 is required.');
  for(const user of Object.values(users)){
    const auth=await request('/api/demo/accounts/login',null,{alias:user.alias,password:user.password});
    requireSafe(auth.account?.role===user.role&&auth.account.alias===user.alias,'QA account role or alias mismatch.');
    user.token=auth.token;mask(user.token);sessions.push(user.token);
    user.me=await request('/api/demo/accounts/me',user.token);
    cleanFixture(user.me);
  }
  requireSafe(new Set(Object.values(users).map(user=>user.me.mine.id)).size===1,'QA fixture accounts must belong to exactly the same isolated mine.');
}
async function unusedFixtures(){
  for(const name of ['a','b'])cleanFixture(users[name].me,await request('/api/demo/state',users[name].token));
  const summary=await request('/api/demo/mine/summary',users.op.token);
  cleanFixture(users.op.me,null,summary);
  const management=await request('/api/demo/mine/management?limit=1',users.op.token);
  requireSafe(management.history.total===0,'QA mine already contains operations; provision fresh fixture accounts.');
  const deliveries=await request('/api/demo/mine/deliveries',users.op.token);
  const local=deliveries.policies.jurisdictions.find(item=>item.id==='DEMO_LOCAL');
  requireSafe(local&&local.serviceMinor===200&&local.preparationMinor===300&&local.transportMinor===500&&local.insuranceBps===0&&local.taxBps===0&&local.requirements.length===2&&local.requirements[0]==='Usar exclusivamente alias e identificadores ficticios'&&local.requirements[1]==='Confirmar que no se enviará metal ni se aportará una dirección real','Fresh default fictitious delivery policies are required.');
}
async function runStage(name,fn){
  stage=name;const started=Date.now();
  progress.stageStart(name);console.log('START '+name);
  try{await fn();results.push({name,ok:true,seconds:(Date.now()-started)/1000});progress.stageEnd(name,true);console.log('PASS '+name);}
  catch(error){results.push({name,ok:false,seconds:(Date.now()-started)/1000});progress.stageEnd(name,false);throw error;}
}
async function saveDiagnostic(name,consoleFile,definitions){
  const diagnostic={stage:name,...await collectFailureDiagnostic(dirname(consoleFile),flowSelectors(definitions))};
  const text=JSON.stringify(diagnostic,null,2)+'\n';
  requireSafe([...privateValues].every(value=>!text.includes(value)),'Refusing to publish a private diagnostic.');
  await writeFile(join(published,'failure-context.json'),text);
}
async function maestro(name,role){
  const directory=join(privateRoot,name);await mkdir(directory,{recursive:true,mode:0o700});
  const user=role==='register'?users.register:users[role];
  const env={...process.env,MAESTRO_CLI_NO_ANALYTICS:'1',MAESTRO_LOGIN_ALIAS:user?.alias||'',MAESTRO_LOGIN_PASSWORD:user?.password||'',MAESTRO_EXPECTED_OTA_ID:['ota','ota-before-story','operator-navigation-ota'].includes(name)?(expectedOtaId??''):''};
  try{
    command('maestro',['--no-ansi','--device',serial,'test','--format','JUNIT','--output',join(directory,'raw-report.xml'),'--debug-output',join(directory,'debug'),'--test-output-dir',join(directory,'screenshots'),join(repo,'e2e/native',name+'.yaml')],{env,timeout:420000,output:join(directory,'console.txt')});
  }catch(error){
    const definitions=(await Promise.all([name,'login'].map(flow=>readFile(join(repo,'e2e/native',flow+'.yaml'),'utf8')))).join('\n');
    await saveDiagnostic(name,join(directory,'console.txt'),definitions);
    if(scenario==='operator-navigation'||scenario==='full'&&['quote','operator','operator-stock'].includes(name))await captureNavigation('failure',name);
    throw error;
  }
}
const captureNavigation=(checkpoint,flow)=>captureOperatorNavigation({scenario,checkpoint,flow,serial,publishDirectory:published,privateValues:[...privateValues]});
async function captureSafeScreens(name){
  // These phases finish before entering any alias/password, and run alone.
  const directory=join(privateRoot,name,'screenshots');
  async function walk(folder){
    let entries;try{entries=await readdir(folder,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return;throw error;}
    for(const entry of entries){
      if(entry.isSymbolicLink())continue;
      const file=join(folder,entry.name);
      if(entry.isDirectory())await walk(file);
      else if(/^safe-(story-[1-5]|upgrade-preserved|reduced-motion)\.png$/.test(entry.name)){
        const pixels=await readFile(file);requireSafe(pixels.length<10000000&&pixels.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'Unexpected safe screenshot.');
        await copyFile(file,join(published,entry.name));
      }
    }
  }
  await walk(directory);
}
async function download(){
  requireSafe(process.env.GITHUB_ACTIONS==='true'&&process.env.RUNNER_OS==='Linux','Downloads are prepared only on GitHub Linux.');
  const url=apkUrl(process.env.APK_INPUT_URL),digest=sha(process.env.APK_INPUT_SHA256);
  await mkdir(privateRoot,{recursive:true,mode:0o700});await mkdir(published,{recursive:true});
  for(const [name,source,expected] of [['baseline',BASELINE.url,BASELINE.sha256],['new',url,digest]]){
    const file=join(root,name+'.apk');
    command('curl',['--fail','--location','--proto','=https','--proto-redir','=https','--retry','2','--max-time','180','--max-filesize','200000000','--output',file,source],{timeout:400000});
    requireSafe(hash(await readFile(file))===expected,'Downloaded APK hash does not match its required digest.');
  }
  const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT;requireSafe(sdk,'Android SDK is required.');
  const versions=(await readdir(join(sdk,'build-tools'))).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true}));
  const tools=join(sdk,'build-tools',versions.at(-1));
  const expectedApp=JSON.parse(await readFile(join(repo,'app.json'),'utf8')).expo;
  requireSafe(expectedApp.android?.versionCode===5&&expectedApp.android.package===PACKAGE,'This acceptance requires the new versionCode5 app source.');
  const metadata=[];
  for(const name of ['baseline','new']){
    const file=join(root,name+'.apk');
    const signature=certificate(command(join(tools,'apksigner'),['verify','--verbose','--print-certs',file]));
    const info=manifest(command(join(tools,'aapt'),['dump','badging',file]));
    requireSafe(info.package===PACKAGE&&info.minSdk<=29,'APK package or minimum SDK is incompatible with this acceptance.');
    requireSafe(name==='baseline'?info.code===BASELINE.code&&info.name===BASELINE.name:info.code===5&&info.name===expectedApp.version,'APK version does not match the baseline or current source.');
    if(name==='new')requireSafe(/^lib\/x86_64\/.+\.so$/m.test(command('unzip',['-Z1',file])),'The new APK must contain x86_64 native libraries for this runner.');
    metadata.push({kind:name,sha256:hash(await readFile(file)),...info,certificate:signature});
  }
  await writeFile(join(published,'apk-verification.json'),JSON.stringify({demoOnly:true,commit:process.env.GITHUB_SHA,run:process.env.GITHUB_RUN_ID,apks:metadata},null,2)+'\n');
  console.log('PASS APK hashes, mandatory signatures, package, versions and x86_64 ABI');
}
async function collectNativeSnapshot(){
  const [a,b,summary,ca,cb,cm,management,profile,history]=await Promise.all([
    request('/api/demo/state',users.a.token),request('/api/demo/state',users.b.token),
    request('/api/demo/mine/summary',users.op.token),
    request('/api/demo/custody',users.a.token),request('/api/demo/custody',users.b.token),request('/api/demo/mine/custody',users.op.token),
    request('/api/demo/mine/management?limit=50',users.op.token),request('/api/demo/accounts/profile',users.a.token),
    request('/api/demo/history?limit=50',users.a.token),
  ]);
  const lotId=ca.allocations.find(item=>item.mg>0)?.lotId;
  requireSafe(typeof lotId==='string'&&/^lot-[a-f0-9]{32}$/.test(lotId),'Native gold lot was not available.');
  const lotPath=`/api/demo/custody/lots/${lotId}/history?limit=20`;
  const [ha,hb,hm]=await Promise.all([request(lotPath,users.a.token),request(lotPath,users.b.token),request(lotPath,users.op.token)]);
  return {a,b,summary,ca,cb,cm,management,profile,history,ha,hb,hm};
}
async function verifyNative(){verifyNativeSnapshot(await collectNativeSnapshot());}
async function verifyCompletedTrades(){verifyNativeCommercialSnapshot(await collectNativeSnapshot());}
async function scenarioFixtures(){if(scenario==='profile-relaunch')await verifyCompletedTrades();else await unusedFixtures();}
async function profileRelaunch(){
  // Resume only after independently checking every completed trade/lot/fee.
  // Existing financial records are never reset or seeded through the API.
  await runStage('install-profile-apk',async()=>{
    requireSafe(!adb('shell','pm','list','packages',PACKAGE),'Profile continuation requires a fresh disposable emulator.');
    adb('install',join(root,'new.apk'));
    requireSafe(adb('shell','dumpsys','package',PACKAGE).includes('versionCode=5'),'Installed profile APK versionCode mismatch.');
  });
  await runStage('profile-compatible-ota-before-login',()=>maestro('operator-navigation-ota'));
  await runStage('buyer-history-profile-relaunch',()=>maestro('profile','a'));
  await runStage('api-verifies-native-wallets-lots-fees',verifyNative);
  await runStage('buyer-compatible-ota-cold-launch',()=>maestro('ota','a'));
  await runStage('api-verifies-data-after-compatible-ota',verifyNative);
}
async function operatorNavigation(){
  // No baseline seed, registration, financial action, quote or configuration.
  // Auth sessions and anonymous installation state are the only writes.
  await runStage('install-navigation-apk',async()=>{
    requireSafe(!adb('shell','pm','list','packages',PACKAGE),'Navigation diagnosis requires a fresh disposable emulator.');
    adb('install',join(root,'new.apk'));
    requireSafe(adb('shell','dumpsys','package',PACKAGE).includes('versionCode=5'),'Installed navigation APK versionCode mismatch.');
  });
  await runStage('navigation-compatible-ota',()=>maestro('operator-navigation-ota'));
  await runStage('navigation-operator-login',()=>maestro('operator-navigation-login','op'));
  await captureNavigation('before-original-down');
  await runStage('navigation-original-down-entry',()=>maestro('operator-navigation','op'));
  await captureNavigation('after-original-entry');
  await runStage('navigation-exit-to-account',()=>maestro('operator-navigation-exit','op'));
  await captureNavigation('after-exit');
  await runStage('navigation-reenter-deliveries',()=>maestro('operator-navigation-reentry','op'));
  await captureNavigation('after-reentry');
  await runStage('navigation-api-confirms-financially-unused',unusedFixtures);
}
async function run(){
  requireSafe(process.env.GITHUB_ACTIONS==='true'&&process.env.RUNNER_OS==='Linux','Native UI runs only in GitHub Linux.');
  await mkdir(privateRoot,{recursive:true,mode:0o700});await mkdir(published,{recursive:true});
  // Guard BEFORE install, clearState, shell input or any UI command.
  const devices=command('adb',['devices']);
  const candidate=devices.split(/\r?\n/).find(line=>/^emulator-\d+\s+device$/.test(line.trim()))?.split(/\s/)[0];
  emulatorGuard(process.env,devices,candidate?command('adb',['-s',candidate,'shell','getprop','ro.kernel.qemu']):'');
  serial=candidate;
  progress.stageEnd('emulator-preconditions',true);
  await runStage('qa-isolation-preconditions',async()=>{await connectFixtures();await scenarioFixtures();});
  if(scenario==='operator-navigation'){await operatorNavigation();return;}
  if(scenario==='profile-relaunch'){await profileRelaunch();return;}
  users.register={alias:'native_'+randomBytes(9).toString('hex'),password:randomBytes(24).toString('base64url')};
  mask(users.register.alias);mask(users.register.password);
  await runStage('install-baseline-013',async()=>{
    requireSafe(!adb('shell','pm','list','packages',PACKAGE),'Acceptance requires a fresh emulator without existing app data.');
    adb('install',join(root,'baseline.apk'));
    requireSafe(adb('shell','dumpsys','package',PACKAGE).includes('versionCode=4'),'Installed baseline versionCode mismatch.');
  });
  await runStage('legacy-seed-old-apk',async()=>{
    const directory=join(privateRoot,'legacy');await mkdir(directory,{recursive:true});
    await withLegacyNavigation(adb,async()=>{
    try{
      command('maestro',['--no-ansi','--device',serial,'test','--format','JUNIT','--output',join(directory,'raw-report.xml'),'--debug-output',join(directory,'debug'),'--test-output-dir',join(directory,'screenshots'),join(repo,'e2e/trades.yaml')],{timeout:420000,output:join(directory,'console.txt')});
    }catch(error){
      const definitions=await readFile(join(repo,'e2e/trades.yaml'),'utf8');
      await saveDiagnostic('legacy-seed-old-apk',join(directory,'console.txt'),definitions);
      await captureLegacyFailure({stage:'legacy-seed-old-apk',completedStages:results.filter(item=>item.ok).map(item=>item.name),serial,definitions,privateDirectory:directory,publishDirectory:published,privateValues:[...privateValues]});
      throw error;
    }
    },async metadata=>{await writeFile(join(published,'legacy-navigation.json'),JSON.stringify(metadata,null,2)+'\n');});
  });
  await runStage('update-without-clearing-data',async()=>{
    requireSafe(adb('shell','settings','get','global','policy_control')==='null','Legacy navigation policy must be normal before installing the new APK.');
    const before=adb('shell','pidof','system_server');
    adb('shell','am','force-stop',PACKAGE);
    adb('install','-r',join(root,'new.apk'));
    requireSafe(adb('shell','dumpsys','package',PACKAGE).includes('versionCode=5'),'Installed update versionCode mismatch.');
    requireSafe(adb('shell','pidof','system_server')===before,'Android system_server restarted during the update.');
  });
  await runStage('preserve-legacy-after-update',async()=>{await maestro('preserve');await captureSafeScreens('preserve');});
  if(expectedOtaId)await runStage('anonymous-compatible-ota-before-story',()=>maestro('ota-before-story'));
  await runStage('native-story-and-reduced-motion',async()=>{await maestro('story');await captureSafeScreens('story');});
  await runStage('native-registration-no-import',async()=>{
    await maestro('register','register');
    const auth=await request('/api/demo/accounts/login',null,{alias:users.register.alias,password:users.register.password});mask(auth.token);sessions.push(auth.token);
    const state=await request('/api/demo/state',auth.token);
    requireSafe(auth.account.role==='buyer'&&auth.account.mineId!==users.a.me.mine.id&&state.walletMinor.USDT===25000&&state.holdingsMg.XAU===0&&Object.keys(state.receipts).length===0,'Native registration imported or mutated the previous legacy data.');
  });
  await runStage('buyer-a-login-conversion',()=>maestro('buyer-a','a'));
  await runStage('buyer-a-buy-and-certificate',()=>maestro('buyer-a-buy','a'));
  await runStage('buyer-a-publish-priced-offer',()=>maestro('buyer-a-offer','a'));
  await runStage('buyer-b-marketplace-certificate',()=>maestro('buyer-b','b'));
  await runStage('buyer-a-sale-and-delivery-request',()=>maestro('request-delivery','a'));
  await runStage('operator-quote-private-mine',()=>maestro('quote','op'));
  await runStage('buyer-accept-simulated-costs',()=>maestro('accept','a'));
  await runStage('operator-delivery-lifecycle',()=>maestro('operator','op'));
  await runStage('operator-restock-management',()=>maestro('operator-stock','op'));
  await runStage('buyer-history-profile-relaunch',()=>maestro('profile','a'));
  await runStage('api-verifies-native-wallets-lots-fees',verifyNative);
  if(expectedOtaId){
    await runStage('buyer-compatible-ota-cold-launch',()=>maestro('ota','a'));
    await runStage('api-verifies-data-after-compatible-ota',verifyNative);
  }
}
async function report(){
  if(!results.length)return;
  await mkdir(published,{recursive:true});
  await writeFile(join(published,'report.xml'),publicJunit(results,[...privateValues]));
  // Fixed labels and counts only. No raw Maestro XML, stderr, hierarchy, logcat,
  // account failure screenshot, alias, password, token or recovery key is copied.
  // The isolated anonymous 0.1.3 phase has its own explicit screenshot policy.
  const summary={demoOnly:true,scenario,environment:'disposable Android CI emulator',phoneAcceptance:false,realCustody:false,ota:{requested:expectedOtaId!==null,expectedUpdateId:expectedOtaId},completed:results.filter(item=>item.ok).map(item=>item.name),failed:results.filter(item=>!item.ok).map(item=>item.name),safeScreenshots:'Anonymous legacy/story before credentials only',privateDiagnosticsPublished:false};
  const text=JSON.stringify(summary,null,2)+'\n';
  requireSafe([...privateValues].every(value=>!text.includes(value)),'Refusing to publish private values.');
  await writeFile(join(published,'summary.json'),text);
}
try{
  // Reject malformed workflow input before curl, adb, Maestro or API access.
  expectedOtaId=otaUpdateId(process.env.OTA_INPUT_UPDATE_ID);
  scenario=nativeScenario(process.env.NATIVE_INPUT_SCENARIO);
  requireSafe(scenario==='full'||expectedOtaId!==null,'Focused native scenarios require a published OTA update ID.');
  const mode=process.argv[2];
  if(['download','preflight','run'].includes(mode))progress=createProgress(published,mode,()=>[...privateValues]);
  if(mode==='download'){progress.stageStart('download-apks');await download();progress.stageEnd('download-apks',true);}
  else if(mode==='preflight'){progress.stageStart('qa-preflight');await connectFixtures();await scenarioFixtures();progress.stageEnd('qa-preflight',true);console.log('PASS scenario-specific isolated QA accounts and PostgreSQL API 0.2.0');}
  else if(mode==='run'){progress.stageStart('emulator-preconditions');await run();}
  else throw new Error('Unknown native CI mode.');
}catch{
  progress?.failCurrent();
  // Raw errors can contain an endpoint response or environment value.
  console.error('FAIL native CI stage: '+stage+'. No private diagnostics are published.');
  process.exitCode=1;
}finally{
  for(const token of sessions){try{await request('/api/demo/accounts/logout',token,{});}catch{ /* Fixture-only session; no sensitive output. */ }}
  await report();
}
