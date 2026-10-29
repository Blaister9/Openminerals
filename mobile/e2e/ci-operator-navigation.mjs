// Account XML is processed in RAM; neither it nor screenshots are persisted.
import {spawnSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {requireSafe} from './ci-safety.mjs';

const checkpoints=new Set(['before-original-down','after-original-entry','after-exit','after-reentry','failure']);
export function sanitizeOperatorHierarchy(xml){
  const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('OPENMINERALS_QA_')&&!key.startsWith('MAESTRO_')&&!/TOKEN|PASSWORD|SECRET/.test(key)));
  env.PYTHONIOENCODING='utf-8';
  const result=spawnSync(process.platform==='win32'?'python':'python3',[fileURLToPath(new URL('./operator-ui.py',import.meta.url))],{input:JSON.stringify({xml}),encoding:'utf8',timeout:10000,killSignal:'SIGKILL',maxBuffer:100000,windowsHide:true,env});
  requireSafe(!result.error&&result.status===0,'Operator landmarks could not be safely parsed.');
  return JSON.parse(result.stdout);
}
export async function captureOperatorNavigation({scenario,checkpoint,serial,publishDirectory,privateValues=[],invoke=spawnSync}){
  requireSafe(scenario==='operator-navigation'&&checkpoints.has(checkpoint)&&/^emulator-\d+$/.test(serial),'Invalid operator diagnostic scope.');
  requireSafe(invoke!==spawnSync||(process.env.GITHUB_ACTIONS==='true'&&process.env.RUNNER_OS==='Linux'),'Native capture requires disposable GitHub Linux.');
  const remote='/sdcard/openminerals-ci-navigation.xml';
  const run=args=>invoke('adb',['-s',serial,...args],{encoding:'utf8',timeout:15000,killSignal:'SIGKILL',maxBuffer:2500000,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let diagnostic={checkpoint,status:'unavailable',rawUiPublished:false,screenshotsTaken:false};
  try{
    const dumped=run(['shell','uiautomator','dump',remote]);
    requireSafe(!dumped.error&&dumped.status===0,'UI dump unavailable.');
    const read=run(['exec-out','cat',remote]);
    requireSafe(!read.error&&read.status===0,'UI dump unavailable.');
    diagnostic={...diagnostic,status:'captured',...sanitizeOperatorHierarchy(read.stdout)};
  }catch{ /* Never include raw stdout, stderr, exceptions or fallback screenshots. */ }
  finally{run(['shell','rm','-f',remote]);}
  const text=JSON.stringify(diagnostic,null,2)+'\n';
  requireSafe(privateValues.every(value=>!value||!text.includes(value)),'Refusing a private native diagnostic.');
  await writeFile(join(publishDirectory,'operator-navigation-'+checkpoint+'.json'),text);
  return diagnostic;
}
