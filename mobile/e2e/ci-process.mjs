import {spawnSync} from 'node:child_process';
const adbArguments=args=>args[0]==='-s'?args.slice(2):args;
export function adbBudget(args){
  const values=adbArguments(args);
  if(values[0]==='install')return 180000;
  if(['pull','push'].includes(values[0])||(values[0]==='shell'&&values[1]==='dumpsys'))return 30000;
  return 20000;
}
export function runBounded(file,args,options={}){
  // SIGTERM may be handled by a JVM indefinitely. The OS deadline must kill it.
  return spawnSync(file,args,{...options,killSignal:'SIGKILL',windowsHide:true});
}
