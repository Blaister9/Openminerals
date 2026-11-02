// Authenticated R5 acceptance: fresh private QA mine, disposable GitHub emulator.
// Business mutations are performed only through the preview UI, never by this observer.
import {openSync,closeSync} from 'node:fs';
import {readFile,writeFile,mkdir,readdir,rm} from 'node:fs/promises';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {API,PACKAGE,SECRET_NAMES,fixtures,cleanFixture,apkUrl,sha,hash,manifest,emulatorGuard,publicJunit,requireSafe} from './ci-safety.mjs';
import {PREVIEW,verifyArtifact,installedIdentity,authFailureMetadata} from './mine-preview.mjs';
import {embeddedFlow,authenticatedFlow} from './release-contract.mjs';
import {nativeFlow} from './native-case.mjs';
import {horizontalWalletNavigation} from './wallet-navigation.mjs';
import {verifyNativeSnapshot} from './ci-result.mjs';
import {runNetworkQuality,verifyQualityResult} from './network-quality.mjs';
import {createObserverRequest} from './ci-http.mjs';
import {collectFailureDiagnostic} from './ci-diagnostics.mjs';
import {createProgress} from './ci-progress.mjs';
import {adbBudget,runBounded} from './ci-process.mjs';

export const R5_SECRET_NAMES=Object.freeze(SECRET_NAMES.map(name=>name.replace('OPENMINERALS_QA_','OPENMINERALS_MINE_R5_QA_')));
export const COMMERCE_PHASES=Object.freeze([
  ['buyer-a-login-conversion','buyer-a','a'],['buyer-a-buy-and-certificate','buyer-a-buy','a'],
  ['buyer-a-publish-priced-offer','buyer-a-offer','a'],['buyer-b-marketplace-certificate','buyer-b','b'],
  ['buyer-a-sale-and-delivery-request','request-delivery','a'],['operator-quote-private-mine','quote','op'],
  ['buyer-accept-simulated-costs','accept','a'],['operator-delivery-lifecycle','operator','op'],
  ['operator-restock-management','operator-stock','op'],['buyer-history-profile-relaunch','profile','a'],
  ['buyer-custody-fraction-is-not-whole-lot','custody-recheck','a'],
].map(value=>Object.freeze(value)));
const CUSTOM=new Set(['embedded','authenticated','launch','quality-login','quality-insufficient','quality-prepare','quality-offline','quality-resolve']);
const TRACKED=new Set(['login','wallet-balance-rail',...COMMERCE_PHASES.map(value=>value[1])]);
const FLOW_NAMES=new Set([...CUSTOM,...TRACKED]);

export function r5Fixtures(env){
  // Deliberately never fall back to the old stable/RC fixture secrets.
  return fixtures(Object.fromEntries(SECRET_NAMES.map((key,index)=>[key,env[R5_SECRET_NAMES[index]]])));
}
export function r5BuildRecord(record){
  requireSafe(record?.demoOnly===true&&record.revision==='r5'&&record.versionCode===5&&record.status==='FINISHED','A finished R5 APK record is required.');
  requireSafe(record.package==='com.openminerals.demo.minepreview'&&record.version==='0.4.0'&&record.runtime==='0.4.0'&&record.channel==='mine-realism','R5 must retain its independent native identity.');
  requireSafe(typeof record.sourceCommit==='string'&&/^[a-f0-9]{40}$/.test(record.sourceCommit),'R5 requires its independently checked build source commit.');
  requireSafe(record.buildProvider===undefined||['eas','github-actions-local-signing'].includes(record.buildProvider),'Unknown R5 build provenance provider.');
  const value={url:apkUrl(record.apkUrl),digest:sha(record.apkSha256),certificate:sha(record.certificateSha256),sourceCommit:record.sourceCommit};
  requireSafe(record.sha256===value.digest&&record.certificate===value.certificate,'R5 evidence fields must agree with the pinned APK.');
  return value;
}
export function isolatedR5Mine(users){
  for(const user of Object.values(users))cleanFixture(user.me);
  requireSafe(users.a.me.account.id!==users.b.me.account.id&&new Set(Object.values(users).map(user=>user.me.mine.id)).size===1,'R5 needs two distinct buyers and their operator in one isolated mine.');
  requireSafe(/^Native QA DEMO r5-native-[a-z0-9-]{3,25}$/.test(users.op.me.mine.name),'R5 requires a newly provisioned sprint-specific QA mine.');
}
export function verifyR5DeliveryPolicy(deliveries){
  const local=deliveries?.policies?.jurisdictions?.find(item=>item.id==='DEMO_LOCAL');
  const requirements=['Usar exclusivamente alias e identificadores ficticios','Confirmar que no se enviará metal ni se aportará una dirección real'];
  requireSafe(local&&local.serviceMinor===200&&local.preparationMinor===300&&local.transportMinor===500&&local.insuranceBps===0&&local.taxBps===0&&JSON.stringify(local.requirements)===JSON.stringify(requirements),'R5 requires the exact initial fictional delivery costs and requirements.');
}
export function previewCommerceFlow(name,source){
  requireSafe(FLOW_NAMES.has(name)&&typeof source==='string','Unapproved R5 private flow.');
  let text=source.replaceAll('\r\n','\n'),lines=text.split('\n'),header=lines[0];
  if(header.startsWith('{')){
    const value=JSON.parse(header);requireSafe(value.appId===PACKAGE,'Unexpected source application in R5 flow.');value.appId=PREVIEW.package;lines[0]=JSON.stringify(value);
  }else{requireSafe(header==='appId: '+PACKAGE,'Unexpected source application in R5 flow.');lines[0]='appId: '+PREVIEW.package;}
  text=lines.join('\n');
  requireSafe(!/clearState|clearKeychain|takeScreenshot|startRecording|stopRecording|openLink|runScript|evalScript/.test(text),'Private R5 flows must not clear state, capture UI, or execute external actions.');
  const children=[...text.matchAll(/(?:file:\s*|"file"\s*:\s*")([a-z0-9-]+)\.yaml/g)].map(match=>match[1]);
  requireSafe(children.every(child=>['login','wallet-balance-rail'].includes(child)),'Unapproved R5 child flow.');
  text=nativeFlow(name,text,'XAU');
  // Maestro 2.12 expects explicit erase counts and a scalar keyboard command.
  text=text.replace(/^- eraseText\s*$/gm,'- eraseText: 100').replace(/^- hideKeyboard\s*$/gm,'- hideKeyboard');
  return horizontalWalletNavigation(text);
}
export function observerOnlyRequest(request){
  return (path,token,body,status)=>{
    requireSafe(path==='/health'||path.startsWith('/api/demo/'),'R5 observer destination is restricted to the DEMO API.');
    requireSafe(!body||['/api/demo/accounts/login','/api/demo/accounts/logout'].includes(path),'R5 business commands must originate in native UI.');
    return request(path,token,body,status);
  };
}
export function verifyR5CommerceSnapshot(snapshot){
  verifyNativeSnapshot(snapshot,'XAU');
  const receipts=Object.values(snapshot.a.receipts);
  for(const action of ['withdraw','deposit'])requireSafe(receipts.filter(receipt=>receipt.action===action&&receipt.currency==='USD'&&receipt.amountMinor===1).length===1,'R5 offline retry or its compensating entry was duplicated or lost.');
}

export async function runR5Commerce({runStage,maestro,request,users,adb,publishChecks,snapshot,coldOpen}){
  const before=await request('/api/demo/state',users.a.token);
  await runNetworkQuality({runStage,maestro,request,users,adb,publishChecks});
  await runStage('verify-offline-retry-restored-wallets-before-trading',async()=>verifyQualityResult(await request('/api/demo/state',users.a.token),before));
  for(const [name,flow,role] of COMMERCE_PHASES)await runStage(name,()=>maestro(flow,role));
  await runStage('api-verifies-native-wallets-lots-fees-and-history',async()=>verifyR5CommerceSnapshot(await snapshot()));
  await runStage('buyer-cold-launch-preserves-identity-and-apk-source',async()=>{
    await coldOpen();await maestro('authenticated','a',{source:authenticatedFlow(false)});await maestro('embedded','a',{source:embeddedFlow('0.4.0')});
  });
  await runStage('api-verifies-data-after-buyer-cold-reopen',async()=>verifyR5CommerceSnapshot(await snapshot()));
}

async function main(){
  const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=resolve(process.env.RUNNER_TEMP||'.','openminerals-mine-r5-commerce');
  const published=join(root,'public'),privateRoot=join(root,'private');
  const results=[],privateValues=new Set(),sessions=[];let serial,users,stage='configuration',progress,privateRootOwned=false,cleanupSucceeded=true;
  const mode=process.argv[2];
  const json=async(name,value)=>{const content=JSON.stringify(value,null,2)+'\n';requireSafe([...privateValues].every(value=>!content.includes(value)),'Private R5 diagnostic cannot be published.');await writeFile(join(published,name),content);};
  const request=observerOnlyRequest(createObserverRequest({onFailure:value=>json('api-failure-context.json',value)}));
  function mask(value){if(!value)return;privateValues.add(value);process.stdout.write('::add-mask::'+value.replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A')+'\n');}
  function command(file,args,{timeout,output,binary=false,env=process.env}={}){
    timeout??=file==='adb'?adbBudget(args):180000;let fd;
    try{
      if(output)fd=openSync(output,'a',0o600);progress.commandStart(file,args,timeout);
      const value=runBounded(file,args,{encoding:binary?null:'utf8',timeout,maxBuffer:32*1024*1024,env,stdio:fd===undefined?['ignore','pipe','pipe']:['ignore',fd,fd]});
      progress.commandEnd(value);requireSafe(!value.error&&value.status===0,'A required R5 native command failed.');return binary?value.stdout:value.stdout?.trim()||'';
    }finally{if(fd!==undefined)closeSync(fd);}
  }
  const adb=(...args)=>command('adb',serial?['-s',serial,...args]:args);
  async function runStage(name,work){stage=name;const start=Date.now();progress.stageStart(name);console.log('START '+name);try{await work();results.push({name,ok:true,seconds:(Date.now()-start)/1000});progress.stageEnd(name,true);console.log('PASS '+name);}catch(error){results.push({name,ok:false,seconds:(Date.now()-start)/1000});progress.stageEnd(name,false);throw error;}}
  async function maestro(name,role,{source}={}){
    requireSafe(FLOW_NAMES.has(name),'Unapproved R5 private flow.');
    const generated=join(privateRoot,'flows'),directory=join(privateRoot,name);await mkdir(generated,{recursive:true,mode:0o700});await mkdir(directory,{recursive:true,mode:0o700});
    for(const flow of TRACKED)await writeFile(join(generated,flow+'.yaml'),previewCommerceFlow(flow,await readFile(join(repo,'e2e/native',flow+'.yaml'),'utf8')),{mode:0o600});
    if(source)await writeFile(join(generated,name+'.yaml'),previewCommerceFlow(name,source),{mode:0o600});
    const user=users?.[role],env={...process.env,MAESTRO_CLI_NO_ANALYTICS:'1',MAESTRO_LOGIN_ALIAS:user?.alias||'',MAESTRO_LOGIN_PASSWORD:user?.password||''};
    try{command('maestro',['--no-ansi','--device',serial,'test','--format','JUNIT','--output',join(directory,'raw-report.xml'),'--debug-output',join(directory,'debug'),'--test-output-dir',join(directory,'screenshots'),join(generated,name+'.yaml')],{env,timeout:420000,output:join(directory,'console.txt')});}
    catch(error){await json('private-flow-failure.json',{phase:name,...authFailureMetadata(await collectFailureDiagnostic(directory,[]))});throw error;}
    finally{await rm(directory,{recursive:true,force:true});}
  }
  async function connectFresh(){
    users=r5Fixtures(process.env);for(const user of Object.values(users)){mask(user.alias);mask(user.password);}
    const health=await request('/health');requireSafe(health.ok===true&&health.demoOnly===true&&health.mode==='postgres-demo'&&health.apiVersion==='0.2.0','R5 acceptance requires PostgreSQL DEMO API 0.2.0.');
    for(const user of Object.values(users)){
      const auth=await request('/api/demo/accounts/login',null,{alias:user.alias,password:user.password});mask(auth.token);sessions.push(auth.token);user.token=auth.token;user.me=await request('/api/demo/accounts/me',auth.token);
      requireSafe(auth.account.id===user.me.account.id&&user.me.account.alias===user.alias&&user.me.account.role===user.role,'R5 fixture identity differs.');
    }
    isolatedR5Mine(users);
    for(const role of ['a','b'])cleanFixture(users[role].me,await request('/api/demo/state',users[role].token));
    const summary=await request('/api/demo/mine/summary',users.op.token);cleanFixture(users.op.me,null,summary);
    for(const metal of ['XAU','XAG','XPT','XPD'])requireSafe(summary.inventoryMg[metal]===5000&&summary.totalSupplyMg[metal]===5000&&summary.allocatedMg[metal]===0&&summary.reservedMg[metal]===0,'R5 requires unused 5g inventory for each metal.');
    requireSafe((await request('/api/demo/mine/management?limit=1',users.op.token)).history.total===0,'R5 fixtures are already used; provision a new mine without resetting data.');
    verifyR5DeliveryPolicy(await request('/api/demo/mine/deliveries',users.op.token));
    requireSafe((await request('/api/demo/state',users.a.token)).priceCentsPerGram.XAU===14500,'R5 gold DEMO reference changed.');
  }
  async function snapshot(){
    const [a,b,summary,ca,cb,cm,management,profile,history]=await Promise.all([request('/api/demo/state',users.a.token),request('/api/demo/state',users.b.token),request('/api/demo/mine/summary',users.op.token),request('/api/demo/custody',users.a.token),request('/api/demo/custody',users.b.token),request('/api/demo/mine/custody',users.op.token),request('/api/demo/mine/management?limit=50',users.op.token),request('/api/demo/accounts/profile',users.a.token),request('/api/demo/history?limit=50',users.a.token)]);
    const lot=ca.allocations.find(item=>item.mg>0)?.lotId;requireSafe(typeof lot==='string'&&/^lot-[a-f0-9]{32}$/.test(lot),'R5 completed source lot is required.');
    const path='/api/demo/custody/lots/'+lot+'/history?limit=20';const [ha,hb,hm]=await Promise.all([request(path,users.a.token),request(path,users.b.token),request(path,users.op.token)]);return {a,b,summary,ca,cb,cm,management,profile,history,ha,hb,hm};
  }
  const coldOpen=async()=>{adb('shell','am','force-stop',PREVIEW.package);await maestro('launch',null,{source:JSON.stringify({appId:PACKAGE})+'\n---\n- launchApp\n'});};
  let build;
  try{
    requireSafe(process.env.GITHUB_ACTIONS==='true'&&process.env.RUNNER_OS==='Linux','R5 acceptance runs only on a disposable GitHub Linux emulator.');
    requireSafe(['download','preflight','run'].includes(mode),'Invalid R5 acceptance mode.');
    build=r5BuildRecord(JSON.parse(await readFile(join(repo,'../docs/evidence/sprint-realism-20261101/candidate-build.json'),'utf8')));
    requireSafe(PREVIEW.code===5,'R5 harness and candidate native identity disagree.');
    await mkdir(published,{recursive:true});await mkdir(privateRoot,{recursive:true,mode:0o700});privateRootOwned=true;progress=createProgress(published,mode,()=>[...privateValues]);
    if(mode==='download')await runStage('verify-same-r5-apk-as-performance-comparison',async()=>{
      const file=join(root,'candidate.apk');command('curl',['--fail','--location','--proto','=https','--proto-redir','=https','--retry','2','--max-time','180','--max-filesize','200000000','--output',file,build.url],{timeout:400000});requireSafe(hash(await readFile(file))===build.digest,'R5 downloaded APK digest differs.');
      const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT;requireSafe(sdk,'Android SDK required.');const versions=(await readdir(join(sdk,'build-tools'))).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),tools=join(sdk,'build-tools',versions.at(-1));
      const badging=command(join(tools,'aapt'),['dump','badging',file]);
      const verified=verifyArtifact({kind:'after',info:manifest(badging),badging,files:command('unzip',['-Z1',file]),xml:command(join(tools,'aapt'),['dump','xmltree',file,'AndroidManifest.xml']),resources:command(join(tools,'aapt'),['dump','--values','resources',file]),bundle:command('unzip',['-p',file,'assets/index.android.bundle'],{binary:true}),signature:command(join(tools,'apksigner'),['verify','--verbose','--print-certs',file]),expectedCertificate:build.certificate});
      await json('apk-verification.json',{demoOnly:true,sha256:build.digest,sourceCommit:build.sourceCommit,sourceBinding:'Independently checked build provenance; verification workflow SHA alone does not prove APK source.',verificationCommit:process.env.GITHUB_SHA,...verified});
    });
    else if(mode==='preflight')await runStage('require-new-r5-private-fixtures-without-operations',connectFresh);
    else{
      await runStage('guard-fresh-api29-emulator-stable-package-absent',async()=>{
        const devices=command('adb',['devices']),candidate=devices.split(/\r?\n/).find(line=>/^emulator-\d+\s+device$/.test(line.trim()))?.split(/\s/)[0];serial=emulatorGuard(process.env,devices,candidate?command('adb',['-s',candidate,'shell','getprop','ro.kernel.qemu']):'');
        requireSafe(adb('shell','getprop','ro.build.version.sdk')==='29','R5 acceptance requires the fixed API29 emulator.');
        for(const app of [PACKAGE,PREVIEW.package])requireSafe(!adb('shell','pm','list','packages',app),'R5 requires a fresh emulator; no existing application data will be cleared.');
        requireSafe(hash(await readFile(join(root,'candidate.apk')))===build.digest,'R5 APK changed after verification.');
      });
      await runStage('require-new-r5-private-fixtures-without-operations',connectFresh);
      await runStage('install-only-preview-and-require-embedded-source',async()=>{adb('install',join(root,'candidate.apk'));installedIdentity(adb('shell','dumpsys','package',PREVIEW.package),PREVIEW);await coldOpen();await maestro('embedded',null,{source:embeddedFlow(PREVIEW.version)});});
      await runR5Commerce({runStage,maestro,request,users,adb,publishChecks:value=>json('network-quality-checks.json',value),snapshot,coldOpen});
      await runStage('stable-package-remains-absent-after-preview-acceptance',async()=>{requireSafe(!adb('shell','pm','list','packages',PACKAGE),'Stable package presence changed.');await json('stable-preservation.json',{demoOnly:true,initiallyAbsent:true,finallyAbsent:true,stablePackageInstalled:false,stablePackageLaunched:false,stableDataCleared:false,previewSha256:build.digest});});
    }
  }catch{progress?.failCurrent();console.error('FAIL R5 authenticated acceptance stage: '+stage+'. Private diagnostics withheld.');process.exitCode=1;}
  finally{
    for(const token of sessions)try{await request('/api/demo/accounts/logout',token,{});}catch{cleanupSucceeded=false;process.exitCode=1;}
    if(serial)try{adb('shell','svc','wifi','enable');adb('shell','svc','data','enable');}catch{cleanupSucceeded=false;process.exitCode=1;}
    if(privateRootOwned)await rm(privateRoot,{recursive:true,force:true});
    if(results.length){await json('summary-'+mode+'.json',{demoOnly:true,apkSha256:build?.digest,sourceCommit:build?.sourceCommit,validationScope:'authenticated-commerce-and-offline',environment:'disposable Android API29 emulator',physicalDevice:false,realOperations:false,privateUiPublished:false,cleanupSucceeded,completed:results.filter(value=>value.ok).map(value=>value.name),failed:results.filter(value=>!value.ok).map(value=>value.name),nativeOfflinePendingRetryAfterColdOpenTested:results.some(value=>value.name==='api-verifies-no-duplicate-after-offline-retry'&&value.ok),nativeReplayAfterServerCommitResponseLossTested:false,databaseServiceRestartTested:false});await writeFile(join(published,'report-'+mode+'.xml'),publicJunit(results,[...privateValues]));}
  }
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await main();
