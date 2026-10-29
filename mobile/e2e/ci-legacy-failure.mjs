// Extra diagnostics ONLY for the fresh, anonymous 0.1.3 legacy phase.
// Native account, recovery and OTA failures must never reach this capture path.
import {spawnSync} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {flowSelectors} from './ci-diagnostics.mjs';

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
export async function captureLegacyFailure({stage,completedStages,serial,definitions,privateDirectory,publishDirectory,privateValues=[],invoke=spawnSync}){
  // Check before any process, directory or screenshot operation.
  if(invoke===spawnSync&&(process.env.GITHUB_ACTIONS!=='true'||process.env.RUNNER_OS!=='Linux'))throw new Error('Legacy device capture requires a disposable GitHub Linux runner.');
  if(!legacyFailureAllowed(stage,completedStages)||!/^emulator-\d+$/.test(serial))throw new Error('Legacy failure capture is restricted to the anonymous baseline phase.');
  if(!/clearState:\s*true/.test(definitions)||/\b(?:accounts?|alias|password|login|register|recovery|cuentas?|claves?)\b|recuperaci[oó]n/i.test(definitions))throw new Error('Legacy flow does not satisfy the anonymous capture policy.');
  await mkdir(privateDirectory,{recursive:true,mode:0o700});
  await mkdir(publishDirectory,{recursive:true});
  const adb=(args)=>checked(invoke('adb',['-s',serial,...args],{timeout:15000,maxBuffer:12000000,windowsHide:true,stdio:['ignore','pipe','pipe']}));
  const capture={stage,screenshot:'unavailable',hierarchy:'unavailable',rawXmlPublished:false,rawLogsPublished:false};
  try{
    const pixels=adb(['exec-out','screencap','-p']);
    if(!png(pixels))throw new Error('Invalid PNG.');
    await writeFile(join(privateDirectory,'safe-legacy-failure.png'),pixels,{mode:0o600});
    await writeFile(join(publishDirectory,'safe-legacy-failure.png'),pixels);
    capture.screenshot='safe-legacy-failure.png';
  }catch{ /* A fixed status is sufficient; never copy raw adb stderr. */ }
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
