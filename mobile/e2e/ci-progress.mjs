import {mkdirSync,writeFileSync,appendFileSync,renameSync} from 'node:fs';
import {join,basename} from 'node:path';

const validName=value=>typeof value==='string'&&/^[a-z0-9-]{3,70}$/.test(value);
const programs=new Set(['maestro','adb','curl','apksigner','aapt','unzip']);
export function publicCommand(file,args){
  const name=basename(file).replace(/\.exe$/,'');
  const program=programs.has(name)?name:'external-command';
  const values=args[0]==='-s'?args.slice(2):args;
  const operation=program==='adb'?(['install','devices','shell','pull','push','exec-out','logcat'].includes(values[0])?values[0]:'other'):
    program==='maestro'?'test':program==='curl'?'download':program==='apksigner'?'verify':program==='aapt'?'manifest':program==='unzip'?'list':'other';
  return {program,operation};
}
export function commandOutcome(result={}){
  return {
    status:!result.error&&result.status===0?'PASSED':'FAILED',
    exitCode:Number.isInteger(result.status)?result.status:null,
    signal:['SIGKILL','SIGTERM','SIGINT'].includes(result.signal)?result.signal:null,
    reason:result.error?.code==='ETIMEDOUT'?'process-timeout':result.error?'spawn-error':result.signal?'signal-termination':result.status===0?'completed':'nonzero-exit',
  };
}
export function createProgress(directory,mode,privateValues=()=>[]){
  if(!['run','download','preflight'].includes(mode))throw new Error('Invalid progress mode.');
  let stage=null,command=null,lastFailure=null;const completed=[];
  // Construction does no I/O, so invalid workflow input still fails first.
  function emit(event){
    const at=new Date().toISOString();
    const snapshot={format:'openminerals.native-progress',version:1,mode,updatedAt:at,stage,command,lastFailure,completed:[...completed]};
    const text=JSON.stringify(snapshot,null,2)+'\n';
    const row=JSON.stringify({at,mode,event,stage,command})+'\n';
    if(privateValues().some(value=>value&&(text.includes(value)||row.includes(value))))throw new Error('Refusing a private progress value.');
    mkdirSync(directory,{recursive:true});
    const temporary=join(directory,'.progress.json.tmp');
    writeFileSync(temporary,text,{mode:0o600});renameSync(temporary,join(directory,'progress.json'));
    appendFileSync(join(directory,'progress.ndjson'),row,{mode:0o600});
  }
  return {
    stageStart(name){
      if(!validName(name))throw new Error('Invalid progress stage.');
      stage={name,status:'RUNNING',startedAt:new Date().toISOString()};command=null;emit('stage-start');
    },
    stageEnd(name,ok){
      if(stage?.name!==name||typeof ok!=='boolean')throw new Error('Invalid progress completion.');
      stage={...stage,status:ok?'PASSED':'FAILED',completedAt:new Date().toISOString()};
      if(ok)completed.push(name);emit('stage-end');
    },
    commandStart(file,args,timeoutMs){
      if(!stage||!Number.isInteger(timeoutMs)||timeoutMs<=0)throw new Error('Invalid command progress.');
      command={...publicCommand(file,args),status:'RUNNING',timeoutMs,timeoutSignal:'SIGKILL',startedAt:new Date().toISOString()};emit('command-start');
    },
    commandEnd(result){
      if(!command)throw new Error('Missing command progress.');
      command={...command,...commandOutcome(result),completedAt:new Date().toISOString()};
      if(command.status==='FAILED')lastFailure={stage:stage.name,...command};
      emit('command-end');
    },
    failCurrent(){if(stage?.status==='RUNNING'){stage={...stage,status:'FAILED',completedAt:new Date().toISOString()};emit('stage-end');}},
  };
}
