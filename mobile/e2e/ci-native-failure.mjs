// Failure-only, fixed landmarks/runtime enums. Raw XML and logs stay in RAM.
import {spawnSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {sanitizeOperatorHierarchy} from './ci-operator-navigation.mjs';
import {legacyRuntimeState} from './ci-legacy-failure.mjs';
import {PACKAGE,requireSafe} from './ci-safety.mjs';
const tradeFlows=new Set(['ota-before-story','operator-navigation-ota','story','register','buyer-a','buyer-a-buy','buyer-a-offer','buyer-b','request-delivery','quote','accept','operator','operator-stock','profile','ota']);
// Keep one redacted exception line, never raw logs or stack dumps. Known QA
// credentials, opaque strings, IDs, URLs and arbitrary quoted values are removed.
export function redactedJavascriptFailure(text,privateValues=[]){
  let own=false;
  for(const line of text.split(/\r?\n/).slice(-300)){
    if(line.includes('FATAL EXCEPTION:'))own=false;
    const process=line.match(/Process:\s*([A-Za-z0-9_.$]+),\s*PID:/);
    if(process){own=process[1]===PACKAGE;continue;}
    if(!own)continue;
    const match=line.match(/com\.facebook\.react\.common\.JavascriptException:\s*(.*)/);
    if(!match)continue;
    let message=match[1];
    for(const secret of privateValues)if(secret)message=message.replaceAll(secret,'[redacted]');
    message=message.replace(/\b(?:https?|file):\/\/\S+/g,'[url]').replace(/\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}\b/gi,'[id]').replace(/[A-Za-z0-9_-]{24,}/g,'[opaque]');
    const property=message.match(/Cannot read property ['"]([A-Za-z_$][A-Za-z0-9_$]{0,80})['"] of (?:null|undefined)/)?.[1]??null;
    const frames=text.split(/\r?\n/).slice(-100).flatMap(row=>{const frame=row.match(/AndroidRuntime[^:]*:\s*([A-Za-z_$][A-Za-z0-9_.$]{0,80})@(\d+):(\d+)/);return frame&&!privateValues.some(secret=>secret&&frame[1].includes(secret))?[{symbol:frame[1],line:Number(frame[2]),column:Number(frame[3])}]:[];}).slice(0,10);
    const properties=new Set(['opacity','translateY','translateX','scale','width','height','transform','value','length','prototype','x','y','inputRange','outputRange','_value']);
    message=message.replace(/(['"])([^'"\n]{1,200})\1/g,(_all,quote,value)=>properties.has(value)?quote+value+quote:'[quoted]');
    return {message:message.slice(0,600),propertyIdentifier:property,frames,redacted:true,rawLogsPublished:false};
  }
  return null;
}
export function nativeFailureAllowed(scenario,flow){return ['full','asset-full'].includes(scenario)&&tradeFlows.has(flow)||scenario==='account-lifecycle'&&/^(?:operator-navigation-ota|wallet-(?:cop|eur|usd|usdt)|account-(?:import|setup|hide-and-logout|recover-start|recover-complete|reenter))$/.test(flow)||scenario==='quality-network'&&/^(?:operator-navigation-ota|quality-(?:login|insufficient|prepare|offline|resolve))$/.test(flow);}
export async function captureNativeFailure({scenario,flow,serial,publishDirectory,privateValues=[],invoke=spawnSync}){
  requireSafe(nativeFailureAllowed(scenario,flow)&&/^emulator-\d+$/.test(serial),'Invalid native failure scope.');
  requireSafe(invoke!==spawnSync||process.env.GITHUB_ACTIONS==='true'&&process.env.RUNNER_OS==='Linux','Native failure capture requires disposable CI.');
  const remote='/data/local/tmp/openminerals-native-failure.xml';
  const run=(args,binary=false)=>invoke('adb',['-s',serial,...args],{encoding:binary?null:'utf8',windowsHide:true,timeout:15000,killSignal:'SIGKILL',maxBuffer:10000000,stdio:['ignore','pipe','pipe']});
  const value={flow,rawUiPublished:false,rawLogsPublished:false,screenshot:null};
  try{const dumped=run(['shell','uiautomator','dump',remote]);requireSafe(!dumped.error&&dumped.status===0,'Private UI unavailable.');const read=run(['exec-out','cat',remote]);requireSafe(!read.error&&read.status===0,'Private UI unavailable.');value.navigation=sanitizeOperatorHierarchy(read.stdout);}catch{value.navigation={status:'unavailable'};}
  finally{run(['shell','rm','-f',remote]);}
  try{const pid=run(['shell','pidof',PACKAGE]),activity=run(['shell','dumpsys','activity','activities']),crash=run(['logcat','-d','-b','crash','-v','brief','-t','200']);value.runtime=legacyRuntimeState({pidStatus:pid.status,pidText:pid.stdout||'',activityText:activity.stdout||'',crashText:crash.stdout||''});value.javascript=redactedJavascriptFailure(crash.stdout||'',privateValues);}catch{value.runtime={status:'unavailable'};}
  // Both closed flows precede all UI credential entry on a fresh emulator.
  if(scenario==='full'&&flow==='ota-before-story'||['asset-full','account-lifecycle'].includes(scenario)&&flow==='operator-navigation-ota'){
    try{const result=run(['exec-out','screencap','-p'],true),pixels=result.stdout;requireSafe(!result.error&&result.status===0&&Buffer.isBuffer(pixels)&&pixels.length>=32&&pixels.length<10000000&&pixels.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),'Anonymous screenshot unavailable.');await writeFile(join(publishDirectory,'safe-anonymous-failure.png'),pixels);value.screenshot='safe-anonymous-failure.png';}catch{}
  }
  const text=JSON.stringify(value,null,2)+'\n';requireSafe(privateValues.every(secret=>!secret||!text.includes(secret)),'Private value in native failure metadata.');
  await writeFile(join(publishDirectory,'native-failure-state.json'),text);return value;
}
