import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {join} from 'node:path';
import {PACKAGE,requireSafe} from './ci-safety.mjs';

const numeric=(text,pattern)=>{const match=pattern.exec(text);return match?Number(match[1]):null;};
export function parseAndroidPerformance({before,after,gfx,start}){
  const pss=text=>numeric(text,/TOTAL PSS:\s*(\d+)/)??numeric(text,/^\s*TOTAL\s+(\d+)/m);
  return {coldStartTotalMs:numeric(start,/TotalTime:\s*(\d+)/),coldStartWaitMs:numeric(start,/WaitTime:\s*(\d+)/),
    pssBeforeKiB:pss(before),pssAfterKiB:pss(after),
    uiFrames:numeric(gfx,/Total frames rendered:\s*(\d+)/),jankyUiFrames:numeric(gfx,/Janky frames:\s*(\d+)/),
    uiFrameP50Ms:numeric(gfx,/50th percentile:\s*(\d+)ms/),uiFrameP90Ms:numeric(gfx,/90th percentile:\s*(\d+)ms/),uiFrameP95Ms:numeric(gfx,/95th percentile:\s*(\d+)ms/)};
}
// The caller has already checked the disposable emulator guard. Everything
// here finishes BEFORE a credential is typed. Never record account flows.
export async function runImmersivePerformance({adb,serial,maestro,published,record=true,light=false}){
  requireSafe(process.env.GITHUB_ACTIONS==='true'&&process.env.RUNNER_OS==='Linux'&&/^emulator-\d+$/.test(serial),'Performance recording requires the disposable GitHub emulator.');
  const activity=adb('shell','cmd','package','resolve-activity','--brief',PACKAGE).split(/\r?\n/).find(line=>line.startsWith(PACKAGE+'/'));
  requireSafe(activity&&/^[A-Za-z0-9_.$/]+$/.test(activity),'Unable to resolve the demo activity.');
  let hwuiProfilingRequested=false;
  try{adb('shell','setprop','debug.hwui.profile','true');hwuiProfilingRequested=true;}catch{ /* Keep functional acceptance independent of optional profiler access. */ }
  adb('shell','am','force-stop',PACKAGE);
  const appPid=()=>{try{return adb('shell','pidof',PACKAGE);}catch{return '';}};
  for(let attempt=0;attempt<12&&appPid();attempt++)await new Promise(resolve=>setTimeout(resolve,250));
  const start=adb('shell','am','start','-W','-a','android.intent.action.MAIN','-c','android.intent.category.LAUNCHER','-n',activity);
  for(let attempt=0;attempt<20&&!appPid();attempt++)await new Promise(resolve=>setTimeout(resolve,250));
  const processObserved=!!appPid();
  await writeFile(join(published,'immersive-launch.json'),JSON.stringify({demoOnly:true,launcherIntent:true,processObserved,status:/Status:\s*(ok|timeout)/.exec(start)?.[1]??'unavailable',...parseAndroidPerformance({before:'',after:'',gfx:'',start})},null,2)+'\n');
  requireSafe(processObserved,'The measured launcher intent did not create the app process.');
  const before=adb('shell','dumpsys','meminfo',PACKAGE);adb('shell','dumpsys','gfxinfo',PACKAGE,'reset');
  const pids=()=>{try{return adb('shell','pidof','screenrecord');}catch{return '';}};
  requireSafe(pids()==='','Another screen recorder is running.');
  const remote='/sdcard/openminerals-story-'+randomUUID()+'.mp4';
  const recorder=record?spawn('adb',['-s',serial,'shell','screenrecord','--bit-rate','1500000','--time-limit','180',remote],{stdio:'ignore',windowsHide:true}):null;
  recorder?.on('error',()=>{});const closed=recorder?once(recorder,'close').catch(()=>[]):Promise.resolve([]);
  let recorderPid='',flags={};
  try{
    if(record){await new Promise(resolve=>setTimeout(resolve,1000));recorderPid=pids();requireSafe(/^\d+$/.test(recorderPid),'Screen recording did not start.');}
    await maestro(light?'story-light':'story');
    const xmlPath='/sdcard/openminerals-story-flags-'+randomUUID()+'.xml';
    try{
      adb('shell','uiautomator','dump',xmlPath);const xml=adb('exec-out','cat',xmlPath);
      flags={automaticLightObserved:xml.includes('Vista ligera activada por coste de render.'),privateUiPublished:false};
    }finally{adb('shell','rm','-f',xmlPath);}
    await maestro('story-exit');
  }finally{
    if(recorder){
    const current=pids();if(recorderPid&&current===recorderPid)adb('shell','kill','-INT',recorderPid);
    await Promise.race([closed,new Promise(resolve=>setTimeout(resolve,8000))]);
    if(recorder.exitCode===null)recorder.kill('SIGKILL');
    requireSafe(!recorderPid||pids()!==recorderPid,'The owned recorder must stop before any credential entry.');
    const file=join(published,'safe-immersive-scroll.mp4');
    try{adb('pull',remote,file);const metadata=await stat(file),header=await readFile(file);requireSafe(metadata.size>1000&&metadata.size<60_000_000&&header.subarray(4,8).toString()==='ftyp','Invalid anonymous demonstration video.');}finally{adb('shell','rm','-f',remote);}
    }
  }
  const after=adb('shell','dumpsys','meminfo',PACKAGE),gfx=adb('shell','dumpsys','gfxinfo',PACKAGE),metrics=parseAndroidPerformance({before,after,gfx,start});
  const report={demoOnly:true,environment:'disposable Android CI emulator',physicalDevice:false,...metrics,...flags,
    screenRecording:record,visualMode:light?'light':'3d',
    hwuiProfilingRequested,
    measurementsComplete:metrics.coldStartTotalMs!==null&&metrics.pssBeforeKiB!==null&&metrics.pssAfterKiB!==null&&metrics.uiFrames>0,
    uiFrameStatisticsAvailable:metrics.uiFrames!==null&&metrics.uiFrames>0,
    interpretation:'Android UI frame statistics; not a measurement of GPU FPS. PSS is sampled before/after, not peak memory. Cold process start uses an already installed APK and cached OTA.',phonePerformanceAcceptance:false};
  await writeFile(join(published,record?'immersive-performance.json':light?'immersive-performance-light-unrecorded.json':'immersive-performance-unrecorded.json'),JSON.stringify(report,null,2)+'\n');
}
