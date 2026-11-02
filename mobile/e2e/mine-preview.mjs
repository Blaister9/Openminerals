import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {openSync,closeSync} from 'node:fs';
import {readFile,writeFile,mkdir,readdir,copyFile,rm} from 'node:fs/promises';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,resolve,join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {API,PACKAGE,BASELINE,apkUrl,sha,hash,manifest,requireSafe,emulatorGuard,publicJunit} from './ci-safety.mjs';
import {apkRuntimeVersion,embeddedFlow} from './release-contract.mjs';
import {parseAndroidPerformance} from './immersive-performance.mjs';
import {adbBudget,runBounded} from './ci-process.mjs';
import {createProgress} from './ci-progress.mjs';

export const PRESENTED=Object.freeze({
  package:PACKAGE,version:'0.3.0',code:6,runtime:'0.3.0',channel:'demo',
  source:'eae7f6ad57f5a667c2bf40775a4cb30f1c0dd8b6',
  url:'https://expo.dev/artifacts/eas/zzjf0770cQWD12A6J-ly7cuCyZfpwrKet8sKRaWJDZQ.apk',
  sha256:'d99e8af9617f56d7862a849ebd057025cb9d6adc164b97496a5532f7b29ad29e',
  certificate:BASELINE.certificate,
});
export const PREVIEW=Object.freeze({package:'com.openminerals.demo.minepreview',version:'0.4.0',code:1,runtime:'0.4.0',channel:'mine-realism'});
export function previewInputs(env,manifest={}){
  requireSafe(manifest&&typeof manifest==='object'&&!Array.isArray(manifest),'Invalid preview build record.');
  const supplied=[env.APK_INPUT_URL,env.APK_INPUT_SHA256,env.APK_INPUT_CERT_SHA256].filter(value=>value!==undefined&&value!=='');
  requireSafe(supplied.length===0||supplied.length===3,'Manual preview URL, APK SHA and certificate SHA must be supplied together.');
  if(manifest.baselineApkSha256!==undefined)requireSafe(manifest.baselineApkSha256===PRESENTED.sha256,'The presented APK digest cannot be overridden.');
  return {
    url:apkUrl(supplied.length?env.APK_INPUT_URL:manifest.apkUrl),
    digest:sha(supplied.length?env.APK_INPUT_SHA256:manifest.apkSha256),
    certificate:sha(supplied.length?env.APK_INPUT_CERT_SHA256:manifest.certificateSha256),
    baselineUrl:apkUrl(manifest.baselineApkUrl??PRESENTED.url),
  };
}
const FLOW_NAMES=new Set(['story','story-clean','story-video-prepare','story-exit','story-resume-position','story-resume-check','wallet-balance-rail']);
const PUBLIC_FAILURE_REASONS=new Set([
  'A required preview command failed or timed out.','Downloaded APK SHA256 differs.','APK changed after download verification.',
  'APK package, version or minimum SDK differs.','APK signing certificate differs from the explicitly pinned identity.',
  'Preview QA requires a signed release APK.','APK lacks phone or emulator native libraries.','Unexpected native runtime.',
  'Missing or ambiguous native metadata.','Native metadata value missing.','Expected quoted native metadata.',
  'Unresolved or ambiguous native metadata resource.','Unresolved or ambiguous native metadata string.','Unsupported native metadata value.',
  'Expo updates must retain embedded fallback.','Unexpected Expo project.','Unexpected native update channel.',
  'Embedded fallback or anti-bricking protection disabled.','Expected public HTTPS API missing from embedded bundle.',
  'Embedded bundle points to a local QA API.','Only the fixed API29 comparison is supported.',
  'Comparison requires a fresh emulator; stable data will never be cleared.','Comparison requires a fresh preview install.',
  'Installed application identity differs.','Preview install or execution changed stable UID/version.',
  'Unable to resolve preview activity.','Anonymous chapter or reduced-motion screenshots missing.',
  'Invalid anonymous preview screenshot.','Ambiguous anonymous screenshot.','Another recorder is running.',
  'Owned screen recorder did not start.','Recorder ended before the fixed trace completed.',
  'Owned recorder must stop before commerce.','Invalid anonymous preview video.',
  'Required cold start or memory samples unavailable.','The presented APK digest cannot be overridden.',
  'HOME did not background the anonymous application.','The original Android process did not survive resume.',
  'Public DEMO operator login rejected by API (HTTP 401).','Public DEMO operator login rejected by API (HTTP 403).',
  'Public DEMO operator login unavailable or rejected by API.','Public DEMO operator identity differs from its authorized access record.',
  'Public DEMO operator preflight token could not be revoked before native login.','Invalid authorized public DEMO operator access record.',
]);
export function publicFailureReason(error){return PUBLIC_FAILURE_REASONS.has(error?.message)?error.message:'Unclassified assertion or infrastructure failure; raw diagnostics withheld.';}
export function anonymousSceneFlags(xml){
  requireSafe(typeof xml==='string','Expected anonymous Android XML.');
  const high=xml.includes('Calidad 3D alta'),balanced=xml.includes('Calidad 3D equilibrada'),light=xml.includes('Vista ligera');
  return {automaticLightObserved:xml.includes('Vista ligera activada por coste de render.'),qualityTierObserved:Number(high)+Number(balanced)+Number(light)===1?(high?'high':balanced?'balanced':'light'):'unknown'};
}
const document=(name,commands)=>JSON.stringify({appId:PACKAGE,name})+'\n---\n'+JSON.stringify(commands,null,2)+'\n';
const tap=text=>({tapOn:text}),wait=visible=>({extendedWaitUntil:{visible,timeout:30000}});
const scroll=text=>({scrollUntilVisible:{element:{text},direction:'DOWN',centerElement:true,timeout:30000}});

// Only a tracked anonymous flow's application header is changed. Child flows
// are copied from this small allowlist; existing release YAML is never edited.
export function previewFlow(source,target){
  requireSafe(typeof source==='string'&&[PRESENTED.package,PREVIEW.package].includes(target),'Invalid anonymous flow target.');
  const normalized=source.replaceAll('\r\n','\n'),parts=normalized.split('\n---\n');
  requireSafe(parts.length===2,'Expected one anonymous YAML document separator.');
  let header=parts[0];
  if(header.startsWith('{')){
    const parsed=JSON.parse(header);requireSafe(parsed.appId===PACKAGE,'Unexpected flow application.');
    header=JSON.stringify({...parsed,appId:target});
  }else{
    requireSafe(header.startsWith('appId: '+PACKAGE+'\n')&&(header.match(/^appId:/gm)??[]).length===1,'Unexpected flow application header.');
    header=header.replace('appId: '+PACKAGE+'\n','appId: '+target+'\n');
  }
  requireSafe(!/clearState|clearKeychain|uninstall|MAESTRO_(?:LOGIN|PREVIEW)|accounts\/(?:login|register)|Buscar actualización/.test(parts[1]),'Anonymous preview flows cannot reset identity or request credentials or OTA.');
  for(const match of parts[1].matchAll(/"file"\s*:\s*"([^"]+)"|^\s*file:\s*([^\s]+)\s*$/gm)){
    const file=match[1]??match[2];requireSafe(FLOW_NAMES.has(file.replace(/\.yaml$/,''))&&/^[a-z-]+\.yaml$/.test(file),'Unexpected anonymous child flow.');
  }
  return header+'\n---\n'+parts[1];
}

// Frozen v1 workload from the geological prototype. No menus, screenshots,
// adaptive early exits or chapter assertions are inside the timed input trace.
export function gestureTrace(display){
  requireSafe(typeof display==='string','Display dimensions are required.');
  const size=/Override size:\s*(\d+)x(\d+)/.exec(display)??/Physical size:\s*(\d+)x(\d+)/.exec(display);
  const width=Number(size?.[1]),height=Number(size?.[2]);
  requireSafe(Number.isInteger(width)&&Number.isInteger(height)&&width>=320&&width<=4320&&height>width&&height<=8192,'A bounded portrait display is required.');
  const specification={protocol:'openminerals-native-gesture-trace-v1',coordinateSpace:'effective portrait display pixels',xFraction:0.8,lowerYFraction:0.8,upperYFraction:0.18,swipeDurationMs:1800,settleMs:250,segments:[{name:'advance',direction:'UP',count:3},{name:'reverse',direction:'DOWN',count:4},{name:'complete',direction:'UP',count:8}]};
  const x=Math.round(width*.8),lower=Math.round(height*.8),upper=Math.round(height*.18);
  const gestures=specification.segments.flatMap(segment=>Array.from({length:segment.count},()=>({segment:segment.name,direction:segment.direction,args:['shell','input','touchscreen','swipe',String(x),String(segment.direction==='UP'?lower:upper),String(x),String(segment.direction==='UP'?upper:lower),'1800'],settleMs:250})));
  const compiled={display:{width,height},gestures};
  return {protocol:specification.protocol,specificationSha256:hash(JSON.stringify(specification)),compiledSha256:hash(JSON.stringify(compiled)),...compiled,gestureCount:gestures.length,plannedDurationMs:30750};
}
export async function executeTrace({trace,adb,wait:pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=()=>performance.now()}){
  requireSafe(trace?.gestureCount===15&&trace.gestures?.length===15,'Expected the complete fixed trace.');
  const start=now(),events=[];
  for(const [index,gesture] of trace.gestures.entries()){
    const startMs=now()-start;await adb(...gesture.args);const inputCompletedMs=now()-start;await pause(gesture.settleMs);
    events.push({index,segment:gesture.segment,direction:gesture.direction,startMs,inputCompletedMs,completedMs:now()-start});
  }
  return {observedDurationMs:now()-start,events};
}

export function metadataValue(xml,resources,name,{optional=false}={}){
  const blocks=xml.split(/(?=^\s*E: meta-data\b)/m).filter(block=>/^\s*E: meta-data\b/.test(block));
  const selected=blocks.map(block=>block.split(/\n\s*E: (?!meta-data\b)/)[0]).filter(block=>{
    const value=/android:name(?:\([^)]*\))?=("(?:\\.|[^"\\])*")/.exec(block);return value&&JSON.parse(value[1])===name;
  });
  if(optional&&selected.length===0)return null;
  requireSafe(selected.length===1,'Missing or ambiguous native metadata.');
  const value=/android:value(?:\([^)]*\))?=([^\n]+)/.exec(selected[0])?.[1]?.trim();requireSafe(value,'Native metadata value missing.');
  const decode=text=>{const match=/^"(?:\\.|[^"\\])*"/.exec(text);requireSafe(match,'Expected quoted native metadata.');return JSON.parse(match[0]);};
  if(value.startsWith('"'))return decode(value);
  const reference=/^@(0x[a-f0-9]{8})\b/i.exec(value);
  if(reference){
    const resource=resources.split(/(?=^\s*resource 0x[a-f0-9]+\b)/mi).filter(block=>new RegExp('^\\s*resource '+reference[1]+'\\b','i').test(block));
    requireSafe(resource.length===1,'Unresolved or ambiguous native metadata resource.');
    const strings=[...resource[0].matchAll(/\(string(?:8|16)\)\s*("(?:\\.|[^"\\])*")/g)].map(match=>JSON.parse(match[1]));
    requireSafe(strings.length>0&&new Set(strings).size===1,'Unresolved or ambiguous native metadata string.');return strings[0];
  }
  const boolean=/^\(type 0x12\)\s*(0x[a-f0-9]+)\b/i.exec(value);requireSafe(boolean,'Unsupported native metadata value.');return Number.parseInt(boolean[1],16)!==0;
}
export function verifyArtifact({kind,info,badging,files,xml,resources,bundle,signature,expectedCertificate}){
  requireSafe(['before','after'].includes(kind),'Unexpected artifact kind.');
  const expected=kind==='before'?PRESENTED:PREVIEW;
  requireSafe(info.package===expected.package&&info.name===expected.version&&info.code===expected.code&&info.minSdk<=29,'APK package, version or minimum SDK differs.');
  requireSafe(!/^application-debuggable\b/m.test(badging),'Preview QA requires a signed release APK.');
  for(const abi of ['arm64-v8a','x86_64'])requireSafe(new RegExp('^lib/'+abi+'/.+\\.so$','m').test(files),'APK lacks phone or emulator native libraries.');
  const certificates=[...signature.matchAll(/certificate SHA-256 digest: ([a-f0-9]{64})/gi)].map(match=>match[1].toLowerCase());
  const signing=kind==='before'?PRESENTED.certificate:sha(expectedCertificate);
  requireSafe(certificates.length>0&&certificates.every(value=>value===signing),'APK signing certificate differs from the explicitly pinned identity.');
  requireSafe(apkRuntimeVersion(xml,resources)===expected.runtime,'Unexpected native runtime.');
  const metadata=(name,options)=>metadataValue(xml,resources,'expo.modules.updates.'+name,options);
  requireSafe(metadata('ENABLED')===true,'Expo updates must retain embedded fallback.');
  requireSafe(metadata('EXPO_UPDATE_URL')==='https://u.expo.dev/c3985e04-43dd-4896-9f8a-09366b6a3579','Unexpected Expo project.');
  const headers=JSON.parse(metadata('UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY'));
  requireSafe(headers&&Object.keys(headers).length===1&&headers['expo-channel-name']===expected.channel,'Unexpected native update channel.');
  requireSafe(metadata('DISABLE_ANTI_BRICKING_MEASURES',{optional:true})!==true&&metadata('HAS_EMBEDDED_UPDATE',{optional:true})!==false,'Embedded fallback or anti-bricking protection disabled.');
  requireSafe(Buffer.isBuffer(bundle)&&bundle.length>1000&&bundle.length<15_000_000&&bundle.includes(Buffer.from(API)),'Expected public HTTPS API missing from embedded bundle.');
  for(const local of ['http://localhost:3000','http://127.0.0.1:3000','http://10.0.2.2:3000'])requireSafe(!bundle.includes(Buffer.from(local)),'Embedded bundle points to a local QA API.');
  return {kind,package:info.package,version:info.name,versionCode:info.code,runtime:expected.runtime,channel:expected.channel,certificate:signing,embeddedHttpsApi:true,embeddedBytes:bundle.length,debuggable:false};
}
export function installedIdentity(text,expected){
  const code=/\bversionCode=(\d+)\b/.exec(text),name=/\bversionName=([^\s]+)/.exec(text),uid=/\buserId=(\d+)\b/.exec(text);
  requireSafe(code&&Number(code[1])===expected.code&&name?.[1]===expected.version&&uid,'Installed application identity differs.');
  return {uid:uid[1],version:expected.version,versionCode:expected.code};
}
export function assertStablePreserved(before,after){requireSafe(JSON.stringify(before)===JSON.stringify(after),'Preview install or execution changed stable UID/version.');return true;}

export function legacyCommerceFlow(){
  const input=(text,value)=>[scroll(text),tap(text),{eraseText:null},{inputText:value},{hideKeyboard:null}];
  const receipt=balance=>[tap('^Confirmar demo$'),wait('^Comprobante$'),scroll('^USDT '+balance+'$'),{assertVisible:'^USDT '+balance+'$'},tap('Cerrar comprobante')];
  return document('New anonymous preview session simulated commerce without account credentials',[
    tap('^Billetera$'),{runFlow:{file:'wallet-balance-rail.yaml'}},wait('^USDT 250,00$'),
    ...input('Cantidad de dinero para convertir','200'),scroll('^Convertir en demo$'),tap('^Convertir en demo$'),...receipt('450,00'),
    tap('^Mercado$'),...input('Cantidad de metal en gramos','1000'),scroll('^Confirmar compra simulada$'),{assertVisible:{text:'^Confirmar compra simulada$',enabled:false}},
    ...input('Cantidad de metal en gramos','2'),scroll('^Confirmar compra simulada$'),tap('^Confirmar compra simulada$'),...receipt('157,10'),
    tap('^Metales$'),...input('Gramos para operación','0.5'),scroll('^Simular venta$'),tap('^Simular venta$'),...receipt('228,73'),
  ]);
}
const AUTH_PHASES=new Set(['register-buyer','buyer-persisted','buyer-logout','operator-login','operator-readonly','operator-logout']);
export function authorizedAuthFlow(phase){
  requireSafe(AUTH_PHASES.has(phase),'Unexpected authorized preview authentication phase.');
  const input=(text,value)=>[scroll(text),tap(text),{eraseText:null},{inputText:value},{hideKeyboard:null}];
  const open=[tap('^Actividad$'),{tapOn:{text:'^Cuenta$',index:0}},wait('^Cuenta demo$')];
  const fields=[...input('Alias de cuenta demo','${MAESTRO_PREVIEW_ALIAS}'),...input('Clave de cuenta demo','${MAESTRO_PREVIEW_PASSWORD}')];
  const buyer=[tap('^Actividad$'),wait('^Comprador · ${MAESTRO_PREVIEW_ALIAS}$'),{assertNotVisible:'^Operador ·.*|^Sesión sin cuenta$|^Sesión anterior · solo consulta$'},tap('^Billetera$'),{runFlow:{file:'wallet-balance-rail.yaml'}},wait('^USDT 250,00$')];
  const logout=[wait('^Cuenta demo$'),{scrollUntilVisible:{element:{text:'^Cerrar sesión$'},direction:'UP',centerElement:true,timeout:30000}},tap('^Cerrar sesión$'),wait({id:'home-cinematic-scroll'}),tap('^Billetera$'),{runFlow:{file:'wallet-balance-rail.yaml'}},wait('^USDT 228,73$'),{assertVisible:'^Sesión sin cuenta$'}];
  const definitions={
    'register-buyer':[
      ...open,tap('^Crear comprador$'),...fields,scroll('Conservar mi sesión anterior'),
      {runFlow:{when:{visible:{text:'Conservar mi sesión anterior',checked:true}},commands:[{tapOn:{text:'Conservar mi sesión anterior',checked:true}}]}},
      {assertVisible:{text:'Conservar mi sesión anterior',checked:false}},scroll('^Crear cuenta de comprador$'),{assertNotVisible:'^Crear y vincular mi sesión$'},tap('^Crear cuenta de comprador$'),wait({id:'home-cinematic-scroll'}),...buyer,
    ],
    'buyer-persisted':buyer,
    'buyer-logout':[tap('^Actividad$'),{tapOn:{text:'^Cuenta$',index:0}},...logout],
    'operator-login':[...open,...fields,scroll('^Entrar en mi cuenta$'),tap('^Entrar en mi cuenta$'),wait('^Operador · ${MAESTRO_PREVIEW_ALIAS}$'),{assertVisible:'^Mina$'},{assertVisible:'^Cuenta$'},{assertNotVisible:'^Inicio$|^Billetera$|^Mercado$|^Metales$|^CUENTAS MULTIDIVISA$'}],
    'operator-readonly':[
      {assertVisible:'^Mina$'},{assertVisible:'^Cuenta$'},{assertNotVisible:'^Billetera$|^CUENTAS MULTIDIVISA$|^USDT de tu cuenta demo$'},
      {scrollUntilVisible:{element:{text:'^Panel gerencial$'},direction:'UP',centerElement:true,timeout:30000}},tap('^Panel gerencial$'),scroll('^Actividad y control$'),{assertVisible:'^Actividad y control$'},
      {tapOn:{text:'^Cuenta$',index:1}},wait('^ACCESO A LA DEMOSTRACIÓN$'),{assertVisible:'^Operador · ${MAESTRO_PREVIEW_ALIAS}$'},{assertNotVisible:'^Billetera$|^CUENTAS MULTIDIVISA$'},
    ],
    'operator-logout':[{tapOn:{text:'^Cuenta$',index:0}},...logout],
  };
  // This adapter has its own explicit authorization and fixed phase definitions.
  // It does not relax previewFlow's anonymous credential/child-flow restrictions.
  return JSON.stringify({appId:PREVIEW.package,name:'Private isolated preview authentication '+phase})+'\n---\n'+JSON.stringify(definitions[phase],null,2)+'\n';
}
export function authorizedPublicOperator(record){
  requireSafe(record?.publicDemoAccess===true&&record.demoOnly===true&&record.api===API&&record.role==='operator'&&typeof record.alias==='string'&&/^[a-z0-9_-]{3,40}$/.test(record.alias)&&typeof record.password==='string'&&record.password.length>=10&&record.password.length<=128&&!/[\r\n\0]/.test(record.password),'Invalid authorized public DEMO operator access record.');
  return {alias:record.alias,password:record.password};
}
export async function publicOperatorPreflight(operator,fetcher=fetch){
  let token;
  try{
    const response=await fetcher(API+'/api/demo/accounts/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(operator),signal:AbortSignal.timeout(15000)});
    requireSafe(response.status!==401,'Public DEMO operator login rejected by API (HTTP 401).');
    requireSafe(response.status!==403,'Public DEMO operator login rejected by API (HTTP 403).');
    requireSafe(response.ok,'Public DEMO operator login unavailable or rejected by API.');
    const identity=await response.json();token=identity.token;
    requireSafe(typeof token==='string'&&token.length>20&&identity.account?.role==='operator'&&identity.account.alias===operator.alias,'Public DEMO operator identity differs from its authorized access record.');
  }finally{
    if(token){const response=await fetcher(API+'/api/demo/accounts/logout',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:'{}',signal:AbortSignal.timeout(15000)});requireSafe(response.ok,'Public DEMO operator preflight token could not be revoked before native login.');}
  }
}
const preservedWalletFlow=()=>document('Verify preview legacy balance after cold process restart',[
  tap('^Billetera$'),{runFlow:{file:'wallet-balance-rail.yaml'}},wait('^USDT 228,73$'),{assertVisible:'^Sesión sin cuenta$'},
]);

async function main(){
  let serial,progress,stage='configuration',failureReason=null,commerceStarted=false,anonymousReady=false;const results=[],privateValues=new Set();
  const authChecks={buyerCreatedWithoutImport:false,buyerColdLaunchSecureStore:false,legacyRestoredAfterBuyerLogout:false,publicOperatorReadOnlyLogin:false,publicOperatorMineAndAccountWithoutBuyerWallet:false,publicOperatorLoggedOut:false};
  const repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=resolve(process.env.RUNNER_TEMP||'.','openminerals-mine-preview');
  const published=join(root,'public'),privateRoot=join(root,'private');
  const mode=process.argv[2];
  function command(file,args,{timeout,output,binary=false,env=process.env}={}){
    timeout??=file==='adb'?adbBudget(args):180000;let fd;
    try{
      if(output)fd=openSync(output,'a',0o600);
      progress.commandStart(file,args,timeout);
      const result=runBounded(file,args,{encoding:binary?null:'utf8',timeout,maxBuffer:32*1024*1024,env:{...env,MAESTRO_CLI_NO_ANALYTICS:'1'},stdio:fd===undefined?['ignore','pipe','pipe']:['ignore',fd,fd]});
      progress.commandEnd(result);requireSafe(!result.error&&result.status===0,'A required preview command failed or timed out.');
      return binary?result.stdout:(result.stdout?.trim()||'');
    }finally{if(fd!==undefined)closeSync(fd);}
  }
  const adb=(...args)=>command('adb',serial?['-s',serial,...args]:args);
  async function step(name,work){stage=name;const started=Date.now();progress.stageStart(name);console.log('START '+name);try{await work();results.push({name,ok:true,seconds:(Date.now()-started)/1000});progress.stageEnd(name,true);console.log('PASS '+name);}catch(error){results.push({name,ok:false,seconds:(Date.now()-started)/1000});progress.stageEnd(name,false);throw error;}}
  const json=(name,value)=>{const text=JSON.stringify(value,null,2)+'\n';requireSafe([...privateValues].every(value=>!text.includes(value)),'Private authentication value cannot be published.');return writeFile(join(published,name),text);};
  function mask(value){privateValues.add(value);process.stdout.write('::add-mask::'+value.replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A')+'\n');}
  const flowDirectory=(kind)=>join(privateRoot,kind,'flows');
  async function maestro(kind,name,{source}={}){
    requireSafe(['before','after'].includes(kind)&&/^[a-z0-9-]{3,60}$/.test(name),'Invalid preview flow.');
    const target=kind==='before'?PRESENTED:PREVIEW,flows=flowDirectory(kind),out=join(privateRoot,kind,name);
    await mkdir(flows,{recursive:true,mode:0o700});await mkdir(out,{recursive:true,mode:0o700});
    for(const file of FLOW_NAMES)await writeFile(join(flows,file+'.yaml'),previewFlow(await readFile(join(repo,'e2e/native',file+'.yaml'),'utf8'),target.package),{mode:0o600});
    if(source)await writeFile(join(flows,name+'.yaml'),previewFlow(source,target.package),{mode:0o600});
    requireSafe(source||FLOW_NAMES.has(name),'Unapproved tracked preview flow.');
    command('maestro',['--no-ansi','--device',serial,'test','--format','JUNIT','--output',join(out,'raw-report.xml'),'--debug-output',join(out,'debug'),'--test-output-dir',join(out,'screenshots'),join(flows,name+'.yaml')],{timeout:420000,output:join(out,'console.txt')});
  }
  async function maestroAuth(phase,identity,{password=false}={}){
    requireSafe(commerceStarted&&AUTH_PHASES.has(phase),'Authentication must follow the anonymous recording boundary.');
    const out=join(privateRoot,'auth',phase);await mkdir(out,{recursive:true,mode:0o700});
    try{
      await writeFile(join(out,'auth.yaml'),authorizedAuthFlow(phase),{mode:0o600});
      await writeFile(join(out,'wallet-balance-rail.yaml'),previewFlow(await readFile(join(repo,'e2e/native/wallet-balance-rail.yaml'),'utf8'),PREVIEW.package),{mode:0o600});
      command('maestro',['--no-ansi','--device',serial,'test','--format','JUNIT','--output',join(out,'report.xml'),'--debug-output',join(out,'debug'),'--test-output-dir',join(out,'screenshots'),join(out,'auth.yaml')],{timeout:420000,output:join(out,'console.txt'),env:{...process.env,MAESTRO_PREVIEW_ALIAS:identity.alias,MAESTRO_PREVIEW_PASSWORD:password?identity.password:'',MAESTRO_CLI_NO_ANALYTICS:'1'}});
    }finally{
      // phase is a closed enum and out is always this owned ephemeral directory.
      // Remove private Maestro output, including expanded input text on failures.
      requireSafe(AUTH_PHASES.has(phase)&&resolve(out)===resolve(privateRoot,'auth',phase),'Invalid private authentication cleanup path.');
      await rm(out,{recursive:true,force:true});
    }
  }
  const identity=expected=>installedIdentity(adb('shell','dumpsys','package',expected.package),expected);
  async function coldOpen(expected){
    adb('shell','am','force-stop',expected.package);
    const activity=adb('shell','cmd','package','resolve-activity','--brief',expected.package).split(/\r?\n/).find(line=>line.startsWith(expected.package+'/'));
    requireSafe(activity&&/^[A-Za-z0-9_.$/]+$/.test(activity),'Unable to resolve preview activity.');
    return adb('shell','am','start','-W','-a','android.intent.action.MAIN','-c','android.intent.category.LAUNCHER','-n',activity);
  }
  async function embedded(kind){const app=kind==='before'?PRESENTED:PREVIEW;await maestro(kind,'embedded',{source:embeddedFlow(app.version)});}
  async function resume(kind){
    const app=kind==='before'?PRESENTED:PREVIEW;
    await maestro(kind,'story-resume-position');
    const activity=adb('shell','cmd','package','resolve-activity','--brief',app.package).split(/\r?\n/).find(line=>line.startsWith(app.package+'/'));
    requireSafe(activity&&/^[A-Za-z0-9_.$/]+$/.test(activity),'Unable to resolve preview activity.');
    const pid=adb('shell','pidof',app.package);requireSafe(/^\d+$/.test(pid),'The original Android process did not survive resume.');
    adb('shell','input','keyevent','KEYCODE_HOME');let background=false;
    for(let attempt=0;attempt<12;attempt++){
      const current=adb('shell','dumpsys','activity','activities').split(/\r?\n/).find(line=>/mResumedActivity|topResumedActivity/.test(line))?.match(/\b[A-Za-z0-9_.]+\/[A-Za-z0-9_.$]+/)?.[0];
      if(current&&!current.startsWith(app.package+'/')){background=true;break;}await new Promise(resolve=>setTimeout(resolve,250));
    }
    requireSafe(background,'HOME did not background the anonymous application.');
    adb('shell','am','start','-W','-a','android.intent.action.MAIN','-c','android.intent.category.LAUNCHER','-n',activity);
    requireSafe(adb('shell','pidof',app.package)===pid,'The original Android process did not survive resume.');
    await maestro(kind,'story-resume-check');requireSafe(adb('shell','pidof',app.package)===pid,'The original Android process did not survive resume.');
    await json(kind+'-resume.json',{demoOnly:true,physicalDevice:false,sameProcess:true,backgroundObserved:true,stagePreserved:true,glReadyAfterResume:true,reversibleGesturesAfterResume:true,noForceStopDuringResume:true});
    await embedded(kind);
  }
  async function copyScreenshots(kind){
    const wanted=new Set([...Array.from({length:7},(_,i)=>'safe-story-'+(i+1)+'.png'),'safe-reduced-motion.png']);const found=new Set();
    async function walk(folder){for(const entry of await readdir(folder,{withFileTypes:true})){if(entry.isSymbolicLink())continue;const file=join(folder,entry.name);if(entry.isDirectory())await walk(file);else if(wanted.has(entry.name)){
      const bytes=await readFile(file);requireSafe(bytes.length<10_000_000&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'Invalid anonymous preview screenshot.');
      requireSafe(!found.has(entry.name),'Ambiguous anonymous screenshot.');await copyFile(file,join(published,kind+'-'+entry.name));found.add(entry.name);
    }}}
    for(const flow of ['story','story-exit'])await walk(join(privateRoot,kind,flow,'screenshots'));
    requireSafe(found.size===wanted.size,'Anonymous chapter or reduced-motion screenshots missing.');
  }
  async function recordTrace(kind,trace){
    const remote='/sdcard/openminerals-preview-'+randomUUID()+'.mp4';
    const pids=()=>{try{return adb('shell','pidof','screenrecord');}catch{return '';}};
    requireSafe(!pids(),'Another recorder is running.');
    const child=spawn('adb',['-s',serial,'shell','screenrecord','--bit-rate','2000000','--time-limit','180',remote],{stdio:'ignore',windowsHide:true});
    child.on('error',()=>{});const closed=once(child,'close').catch(()=>[]);let pid='',complete=false,result;
    try{
      await new Promise(resolve=>setTimeout(resolve,1000));pid=pids();requireSafe(/^\d+$/.test(pid),'Owned screen recorder did not start.');
      result=await executeTrace({trace,adb});requireSafe(child.exitCode===null&&pids()===pid,'Recorder ended before the fixed trace completed.');complete=true;
    }finally{
      if(pid&&pids()===pid)adb('shell','kill','-INT',pid);
      await Promise.race([closed,new Promise(resolve=>setTimeout(resolve,8000))]);if(child.exitCode===null)child.kill('SIGKILL');
      requireSafe(!pid||pids()!==pid,'Owned recorder must stop before commerce.');
      try{
        if(complete){const local=join(published,kind+'-anonymous-scroll.mp4');adb('pull',remote,local);const bytes=await readFile(local);requireSafe(bytes.length>1000&&bytes.length<60_000_000&&bytes.subarray(4,8).toString()==='ftyp','Invalid anonymous preview video.');}
      }finally{adb('shell','rm','-f',remote);}
    }
    return result;
  }
  async function measure(kind,trace,{record}){
    const app=kind==='before'?PRESENTED:PREVIEW,start=await coldOpen(app);await embedded(kind);await maestro(kind,'story-video-prepare');
    let hwuiProfilingRequested=false;try{adb('shell','setprop','debug.hwui.profile','true');hwuiProfilingRequested=true;}catch{}
    const before=adb('shell','dumpsys','meminfo',app.package);adb('shell','dumpsys','gfxinfo',app.package,'reset');
    const timing=record?await recordTrace(kind,trace):await executeTrace({trace,adb});
    const after=adb('shell','dumpsys','meminfo',app.package),gfx=adb('shell','dumpsys','gfxinfo',app.package),metrics=parseAndroidPerformance({before,after,gfx,start});
    requireSafe(metrics.coldStartTotalMs!==null&&metrics.pssBeforeKiB!==null&&metrics.pssAfterKiB!==null,'Required cold start or memory samples unavailable.');
    const snapshot='/sdcard/openminerals-preview-flags-'+randomUUID()+'.xml';let sceneFlags;
    try{adb('shell','uiautomator','dump',snapshot);sceneFlags=anonymousSceneFlags(adb('exec-out','cat',snapshot));}finally{adb('shell','rm','-f',snapshot);}
    await json(kind+'-performance-'+(record?'recorded':'unrecorded')+'.json',{
      demoOnly:true,environment:'disposable API 29 x86_64 emulator with SwiftShader',physicalDevice:false,package:app.package,version:app.version,
      ...metrics,hwuiProfilingRequested,...sceneFlags,qualityTierScope:'Observed adaptive tier; GL resolution and GPU FPS are not inferred.',screenRecording:record,inputTrace:{protocol:trace.protocol,specificationSha256:trace.specificationSha256,compiledSha256:trace.compiledSha256,gestureCount:15,plannedDurationMs:trace.plannedDurationMs,...timing},
      uiFrameStatisticsAvailable:metrics.uiFrames!==null&&metrics.uiFrames>0,phonePerformanceAcceptance:false,gpuFpsMeasured:false,
      interpretation:'gfxinfo reports Android UI frames, not ExpoGL GPU FPS. PSS samples are not peak memory. Input duration includes ADB overhead. Cold start is a process launch of an installed APK. Recorded and unrecorded traces are separate; menus, readiness checks and screenshots are outside the measured workload.',
    });
    await maestro(kind,'trace-final',{source:document('Final stage after fixed reversible gesture trace',[wait('Etapa 7 de 7: PORTAFOLIO'),wait({id:sceneFlags.automaticLightObserved?'immersive-scene-light':'immersive-gl-ready'})])});
    await embedded(kind);
  }
  try{
    requireSafe(process.env.GITHUB_ACTIONS==='true'&&process.env.RUNNER_OS==='Linux','Preview QA runs only on a disposable Linux GitHub runner.');
    requireSafe(['download','run'].includes(mode),'Expected preview download or run mode.');
    let buildRecord={};
    try{buildRecord=JSON.parse(await readFile(join(repo,'../docs/evidence/sprint-realism-20261101/candidate-build.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
    const {url,digest,certificate,baselineUrl}=previewInputs(process.env,buildRecord);
    await mkdir(published,{recursive:true});await mkdir(privateRoot,{recursive:true,mode:0o700});progress=createProgress(published,mode,()=>[...privateValues]);
    if(mode==='download')await step('verify-both-isolated-apks',async()=>{
      const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT;requireSafe(sdk,'Android SDK required.');
      const versions=(await readdir(join(sdk,'build-tools'))).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),tools=join(sdk,'build-tools',versions.at(-1));const verified=[];
      for(const [kind,source,expected] of [['before',baselineUrl,PRESENTED.sha256],['after',url,digest]]){
        const file=join(root,kind+'.apk');command('curl',['--fail','--location','--proto','=https','--proto-redir','=https','--retry','2','--max-time','180','--max-filesize','200000000','--output',file,source],{timeout:400000});
        requireSafe(hash(await readFile(file))===expected,'Downloaded APK SHA256 differs.');
        const badging=command(join(tools,'aapt'),['dump','badging',file]);
        verified.push({sha256:expected,...verifyArtifact({kind,info:manifest(badging),badging,files:command('unzip',['-Z1',file]),xml:command(join(tools,'aapt'),['dump','xmltree',file,'AndroidManifest.xml']),resources:command(join(tools,'aapt'),['dump','--values','resources',file]),bundle:command('unzip',['-p',file,'assets/index.android.bundle'],{binary:true}),signature:command(join(tools,'apksigner'),['verify','--verbose','--print-certs',file]),expectedCertificate:certificate})});
      }
      await json('apk-verification.json',{demoOnly:true,verificationCommit:process.env.GITHUB_SHA,presentedBuildSource:PRESENTED.source,candidateBuildSource:'Bind independently to the EAS build record; workflow commit does not prove APK source.',apks:verified});
    });
    else{
      await step('guard-disposable-api29-emulator',async()=>{
        const devices=command('adb',['devices']),candidate=devices.split(/\r?\n/).find(line=>/^emulator-\d+\s+device$/.test(line.trim()))?.split(/\s/)[0];
        serial=emulatorGuard(process.env,devices,candidate?command('adb',['-s',candidate,'shell','getprop','ro.kernel.qemu']):'');
        requireSafe(adb('shell','getprop','ro.build.version.sdk')==='29','Only the fixed API29 comparison is supported.');
        for(const [kind,expected] of [['before',PRESENTED.sha256],['after',digest]])requireSafe(hash(await readFile(join(root,kind+'.apk')))===expected,'APK changed after download verification.');
        requireSafe(!adb('shell','pm','list','packages',PRESENTED.package),'Comparison requires a fresh emulator; stable data will never be cleared.');
        requireSafe(!adb('shell','pm','list','packages',PREVIEW.package),'Comparison requires a fresh preview install.');
      });
      let stable;const trace=gestureTrace(adb('shell','wm','size'));await json('fixed-input-trace.json',trace);
      await step('install-presented-stable-separate-package',async()=>{adb('install',join(root,'before.apk'));stable=identity(PRESENTED);await coldOpen(PRESENTED);await embedded('before');anonymousReady=true;});
      await step('presented-seven-chapters',()=>maestro('before','story'));
      await step('presented-recorded-fixed-trace',()=>measure('before',trace,{record:true}));
      await step('presented-unrecorded-fixed-trace',()=>measure('before',trace,{record:false}));
      await step('presented-reduced-motion-and-exits',async()=>{await maestro('before','story-video-prepare');await maestro('before','story-exit');await copyScreenshots('before');});
      await step('presented-live-gl-home-resume',()=>resume('before'));
      adb('shell','am','force-stop',PRESENTED.package);
      await step('install-preview-alongside-preserved-stable',async()=>{adb('install',join(root,'after.apk'));identity(PREVIEW);assertStablePreserved(stable,identity(PRESENTED));await coldOpen(PREVIEW);await embedded('after');});
      await step('preview-seven-chapters',()=>maestro('after','story'));
      await step('preview-recorded-fixed-trace',()=>measure('after',trace,{record:true}));
      await step('preview-unrecorded-fixed-trace',()=>measure('after',trace,{record:false}));
      await step('preview-reduced-motion-and-exits',async()=>{await maestro('after','story-video-prepare');await maestro('after','story-exit');await copyScreenshots('after');});
      await step('preview-live-gl-home-resume',()=>resume('after'));
      // No recording, copying of UI or public raw Maestro output follows this
      // boundary. Mutations use only this fresh app-owned DEMO legacy session.
      commerceStarted=true;
      await step('preview-new-legacy-commerce',()=>maestro('after','legacy-commerce',{source:legacyCommerceFlow()}));
      await step('preview-legacy-balance-after-restart',async()=>{await coldOpen(PREVIEW);await embedded('after');await maestro('after','legacy-preserved',{source:preservedWalletFlow()});});
      const buyer={alias:'mineqa_'+randomUUID().replaceAll('-','').slice(0,20),password:randomUUID().replaceAll('-','')+randomUUID().replaceAll('-','')};mask(buyer.alias);mask(buyer.password);
      await step('preview-buyer-register-without-import',async()=>{await maestroAuth('register-buyer',buyer,{password:true});authChecks.buyerCreatedWithoutImport=true;});
      await step('preview-buyer-securestore-after-cold-launch',async()=>{await coldOpen(PREVIEW);await maestroAuth('buyer-persisted',buyer);authChecks.buyerColdLaunchSecureStore=true;});
      await step('preview-buyer-logout-restores-owned-legacy',async()=>{await maestroAuth('buyer-logout',buyer);authChecks.legacyRestoredAfterBuyerLogout=true;});
      let operator;
      await step('preview-public-operator-access-preflight',async()=>{operator=authorizedPublicOperator(JSON.parse(await readFile(join(repo,'../demo-access/operator-public.json'),'utf8')));mask(operator.alias);mask(operator.password);await publicOperatorPreflight(operator);});
      await step('preview-public-operator-readonly-login',async()=>{await maestroAuth('operator-login',operator,{password:true});authChecks.publicOperatorReadOnlyLogin=true;});
      await step('preview-public-operator-mine-account-readonly',async()=>{await maestroAuth('operator-readonly',operator);authChecks.publicOperatorMineAndAccountWithoutBuyerWallet=true;});
      await step('preview-public-operator-logout',async()=>{await maestroAuth('operator-logout',operator);authChecks.publicOperatorLoggedOut=true;});
      await step('stable-package-uid-and-version-preserved',async()=>{assertStablePreserved(stable,identity(PRESENTED));await json('stable-preservation.json',{demoOnly:true,sameUid:true,sameVersion:true,stable,preview:identity(PREVIEW),noStableUninstall:true,noStableDataClear:true,noStableCommerce:true});});
    }
  }catch(error){
    progress?.failCurrent();failureReason=publicFailureReason(error);
    console.error('FAIL isolated mine preview stage: '+stage+'. '+failureReason);process.exitCode=1;
    if(serial&&anonymousReady&&!commerceStarted){
      try{
        const bytes=command('adb',['-s',serial,'exec-out','screencap','-p'],{binary:true});
        if(bytes.length<10_000_000&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))await writeFile(join(published,'anonymous-failure.png'),bytes);
      }catch{}
      try{
        const logs=adb('logcat','-d','-t','500','-v','brief','ReactNativeJS:E','AndroidRuntime:E','ExpoGL:E','*:S');
        await json('anonymous-failure-flags.json',{demoOnly:true,credentialsEntered:false,rawLogsPublished:false,reactNativeJsError:/ReactNativeJS/.test(logs),javaScriptTypeError:/TypeError/.test(logs),nativeFatalException:/FATAL EXCEPTION/.test(logs),glContextFailure:/CONTEXT_LOST|context lost/i.test(logs),shaderFailure:/shader.*(?:error|fail)|GL_INVALID/i.test(logs)});
      }catch{}
    }
  }
  finally{
    if(results.length){await json('summary-'+mode+'.json',{demoOnly:true,environment:'disposable Android API29 emulator',physicalDevice:false,phonePerformanceAcceptance:false,gpuFpsMeasured:false,completed:results.filter(item=>item.ok).map(item=>item.name),failed:results.filter(item=>!item.ok).map(item=>item.name),failureReason,nativeAuthentication:authChecks,nativeAuthenticatedCommerce:'NOT RUN: authenticated trading, marketplace transfers, certificates and deliveries require isolated fixtures; read-only native account access is reported separately.',privateUiPublished:false});await writeFile(join(published,'report-'+mode+'.xml'),publicJunit(results,[...privateValues]));}
  }
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url)await main();
