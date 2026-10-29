// Extra diagnostics ONLY for the fresh, anonymous 0.1.3 legacy phase.
// Native account, recovery and OTA failures must never reach this capture path.
import {spawnSync} from 'node:child_process';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {flowSelectors} from './ci-diagnostics.mjs';
import {PACKAGE} from './ci-safety.mjs';

const requiredStages=['qa-isolation-preconditions','install-baseline-013'];
export function legacyFailureAllowed(stage,completedStages){
  return stage==='legacy-seed-old-apk'&&Array.isArray(completedStages)&&completedStages.length===2&&completedStages.every((value,index)=>value===requiredStages[index]);
}
export function sanitizeLegacyHierarchy(xml,selectors){
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('OPENMINERALS_QA_')&&!key.startsWith('MAESTRO_')&&!/TOKEN|PASSWORD|SECRET/.test(key)));
  env.PYTHONIOENCODING='utf-8';
  const result=spawnSync(process.platform==='win32'?'python':'python3',[fileURLToPath(new URL('./legacy-ui.py',import.meta.url))],{
    input:JSON.stringify({xml,selectors}),encoding:'utf8',timeout:10000,maxBuffer:2000000,windowsHide:true,env,
  });
  if(result.error||result.status!==0)throw new Error('Legacy hierarchy could not be safely parsed.');
  return JSON.parse(result.stdout);
}
function checked(result){
  if(result.error||result.status!==0)throw new Error('Legacy capture command unavailable.');
  return result.stdout;
}
function png(pixels){
  return Buffer.isBuffer(pixels)&&pixels.length>=32&&pixels.length<10000000&&pixels.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&pixels.subarray(12,16).toString()==='IHDR';
}
export function legacyRuntimeState({pidStatus,pidText='',activityText='',crashText=''}){
  const processAlive=pidStatus===0&&/^\d+(?:\s+\d+)*$/.test(pidText.trim())?true:pidStatus===1&&!pidText.trim()?false:null;
  const top=activityText.match(/(?:mResumedActivity|topResumedActivity)\s*[:=][^\n]*?\bu\d+\s+([A-Za-z0-9_.$]+)\/([A-Za-z0-9_.$]+)/);
  const known=new Set([PACKAGE,'com.google.android.apps.nexuslauncher','com.android.launcher3','com.android.systemui','dev.mobile.maestro','dev.mobile.maestro.test']);
  const foregroundApp=top?top[1]===PACKAGE:null,foregroundLauncher=top?['com.google.android.apps.nexuslauncher','com.android.launcher3'].includes(top[1]):null;
  const topActivity=top&&known.has(top[1])&&(top[1]+'/'+top[2]).length<=180?top[1]+'/'+top[2]:null;
  const fatalClasses=new Set(),nativeSignals=new Set();let belongsToApp=false,nativeBelongsToApp=false;
  for(const line of crashText.split(/\r?\n/).slice(-300)){
    if(line.includes('FATAL EXCEPTION:'))belongsToApp=false;
    const process=line.match(/Process:\s*([A-Za-z0-9_.$]+),\s*PID:\s*\d+/);
    if(process){belongsToApp=process[1]===PACKAGE;continue;}
    const nativeProcess=line.match(/>>>\s*([A-Za-z0-9_.$]+)\s*<<</);
    if(nativeProcess)nativeBelongsToApp=nativeProcess[1]===PACKAGE;
    const signal=line.match(/^F\/DEBUG\s*(?:\(\s*\d+\))?:\s*signal\s+\d+\s+\((SIGABRT|SIGSEGV|SIGBUS|SIGILL|SIGFPE|SIGTRAP|SIGSYS)\)/);
    if(nativeBelongsToApp&&signal&&nativeSignals.size<3)nativeSignals.add(signal[1]);
    if(!belongsToApp)continue;
    const exception=line.match(/AndroidRuntime[^\n]*?:\s*(?:Caused by:\s*)?((?:java|javax|android|androidx|com\.facebook\.react|expo|host\.exp\.exponent)\.[A-Za-z0-9_.$]*(?:Exception|Error))(?=[:\s]|$)/);
    if(exception&&exception[1].length<=180&&fatalClasses.size<5)fatalClasses.add(exception[1]);
  }
  return {processAlive,foregroundApp,foregroundLauncher,topActivity,fatalClasses:[...fatalClasses],nativeSignals:[...nativeSignals]};
}
async function copyLegacyScreenshots(directory,publishDirectory){
  const wanted=new Map([['trades-01-initial.png','safe-legacy-before-wallet.png'],['safe-legacy-after-wallet.png','safe-legacy-after-wallet.png']]);
  const copied=[];
  async function visit(folder){
    let entries;try{entries=await readdir(folder,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return;throw error;}
    for(const entry of entries){
      if(entry.isSymbolicLink())continue;
      const file=join(folder,entry.name);
      if(entry.isDirectory())await visit(file);
      else if(wanted.has(entry.name)){
        const pixels=await readFile(file);
        if(png(pixels)){const name=wanted.get(entry.name);await writeFile(join(publishDirectory,name),pixels);copied.push(name);}
      }
    }
  }
  await visit(join(directory,'screenshots'));return [...new Set(copied)].sort();
}
export async function captureLegacyFailure({stage,completedStages,serial,definitions,privateDirectory,publishDirectory,privateValues=[],invoke=spawnSync}){
  // Check before any process, directory or screenshot operation.
  if(invoke===spawnSync&&(process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_OS!=='Linux'))throw new Error('Legacy device capture requires a disposable GitHub Linux runner.');
  if(!legacyFailureAllowed(stage,completedStages)||!/^emulator-\d+$/.test(serial))throw new Error('Legacy failure capture is restricted to the anonymous baseline phase.');
  if(!/clearState:\s*true/.test(definitions)||/\b(?:accounts?|alias|password|login|register|recovery|cuenta|claves?)\b|recuperaci[oó]n/i.test(definitions))throw new Error('Legacy flow does not satisfy the anonymous capture policy.');
  await mkdir(privateDirectory,{recursive:true,mode:0o700});
  await mkdir(publishDirectory,{recursive:true});
  const adbRaw=(args)=>invoke('adb',['-s',serial,...args],{timeout:15000,maxBuffer:12000000,windowsHide:true,stdio:['ignore','pipe','pipe']});
  const adb=(args)=>checked(adbRaw(args));
  const capture={stage,screenshot:'unavailable',hierarchy:'unavailable',runtime:'unavailable',walletScreenshots:[],rawXmlPublished:false,rawLogsPublished:false};
  try{capture.walletScreenshots=await copyLegacyScreenshots(privateDirectory,publishDirectory);}catch{ /* Never broaden the screenshot allowlist. */ }
  try{
    const pixels=adb(['exec-out','screencap','-p']);
    if(!png(pixels))throw new Error('Invalid PNG.');
    await writeFile(join(privateDirectory,'safe-legacy-failure.png'),pixels,{mode:0o600});
    await writeFile(join(publishDirectory,'safe-legacy-failure.png'),pixels);
    capture.screenshot='safe-legacy-failure.png';
  }catch{ /* A fixed status is sufficient; never copy raw adb stderr. */ }
  try{
    const pid=adbRaw(['shell','pidof',PACKAGE]),activity=adb(['shell','dumpsys','activity','activities']),crash=adb(['logcat','-d','-b','crash','-v','brief','-t','200']);
    if(pid.error||pid.stderr?.toString().trim())throw new Error('PID unavailable.');
    const safe=legacyRuntimeState({pidStatus:pid.status,pidText:pid.stdout?.toString()||'',activityText:activity.toString(),crashText:crash.toString()});
    const text=JSON.stringify({stage,...safe},null,2)+'\n';
    if(privateValues.some(value=>value&&text.includes(value)))throw new Error('Private value in runtime state.');
    await writeFile(join(publishDirectory,'safe-legacy-runtime.json'),text);capture.runtime='safe-legacy-runtime.json';
  }catch{ /* No raw process/activity/logcat output is published. */ }
  try{
    const remote='/sdcard/openminerals-ci-legacy-ui.xml',local=join(privateDirectory,'uiautomator.xml');
    adb(['shell','uiautomator','dump',remote]);adb(['pull',remote,local]);
    const xml=await readFile(local,'utf8');
    const safe=sanitizeLegacyHierarchy(xml,flowSelectors(definitions)),text=JSON.stringify({stage,...safe},null,2)+'\n';
    if(privateValues.some(value=>value&&text.includes(value)))throw new Error('Private value in legacy hierarchy.');
    await writeFile(join(publishDirectory,'safe-legacy-ui.json'),text);
    capture.hierarchy='safe-legacy-ui.json';
  }catch{ /* Keep raw XML private, including on parse or allowlist rejection. */ }
  await writeFile(join(publishDirectory,'legacy-failure-capture.json'),JSON.stringify(capture,null,2)+'\n');
  return capture;
}
