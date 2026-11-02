import {fork} from 'node:child_process';
import {readFile,writeFile,mkdir,readdir,rm} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {API,apkUrl,sha,hash,manifest,requireSafe,emulatorGuard} from './ci-safety.mjs';
import {PRESENTED,gestureTrace,executeTrace,metadataValue,installedIdentity,assertStablePreserved,anonymousSceneState,observeColdLaunch,previewFlow} from './mine-preview.mjs';
import {apkRuntimeVersion,embeddedFlow} from './release-contract.mjs';
import {adbBudget,runBounded} from './ci-process.mjs';

export const R4=Object.freeze({package:'com.openminerals.demo.minepreview',version:'0.4.0',code:4,runtime:'0.4.0',channel:'mine-realism',source:'ce9b79b5abbe0389e5f2661dda0d7abc6b53bc14',url:'https://github.com/Blaister9/Openminerals/releases/download/android-mine-preview-0.4.0-r4-20261101/Openminerals-Mina-Preview-0.4.0-r4-android.apk',sha256:'adfbf909f0cf0c924c7b8938a1a773c5c96b84f14f86ae0e8c0bf53b7e1b1bf5',certificate:'86c84db35e91b187f3f818c0cc74ddb91df9a95014cba138ac7e04611957aa09'});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export const quantile=(values,p)=>values.length?[...values].sort((a,b)=>a-b)[Math.max(0,Math.ceil(values.length*p)-1)]:null;
export function profilePair(value='stable-r4',candidate={}){
  requireSafe(['stable-r4','r4-candidate'].includes(value),'Invalid fixed profile pair.');
  if(value==='stable-r4')return [PRESENTED,R4];
  requireSafe(candidate.versionCode===5&&candidate.version==='0.4.0'&&candidate.revision==='r5'&&/^[a-f0-9]{40}$/.test(candidate.sourceCommit),'Expected independently recorded r5 build source and code5.');
  return [R4,{...R4,code:5,source:candidate.sourceCommit,url:apkUrl(candidate.apkUrl),sha256:sha(candidate.apkSha256),certificate:sha(candidate.certificateSha256)}];
}
export function hwuiFrameStats(text,elapsedMs){
  const values=[],starts=[],ends=[];let header=null,rejected=0;
  for(const line of text.split(/\r?\n/)){
    if(line.startsWith('Flags,IntendedVsync,')){header=line.trim().split(',');continue;}
    if(!header||!/^\d+,/.test(line))continue;
    const row=line.trim().split(','),get=name=>Number(row[header.indexOf(name)]),start=get('IntendedVsync'),end=get('FrameCompleted');
    if(get('Flags')!==0||!Number.isFinite(start)||!Number.isFinite(end)||start<=0||end<=start||end>=9e18){rejected++;continue;}
    values.push((end-start)/1e6);starts.push(start);ends.push(end);
  }
  const count=Number(/Total frames rendered:\s*(\d+)/.exec(text)?.[1]),janky=Number(/Janky frames:\s*(\d+)/.exec(text)?.[1]);
  return {metric:'Android HWUI FrameCompleted minus IntendedVsync',p50Ms:quantile(values,.5),p95Ms:quantile(values,.95),capturedFrames:values.length,rejectedRows:rejected,capturedSlowFramesOver16_667Ms:values.filter(x=>x>1000/60).length,capturedSlowPercent:values.length?100*values.filter(x=>x>1000/60).length/values.length:null,capturedSpanMs:starts.length?(Math.max(...ends)-Math.min(...starts))/1e6:null,totalUiFrames:Number.isFinite(count)?count:null,totalJankyUiFrames:Number.isFinite(janky)?janky:null,totalJankyUiPercent:count>0&&Number.isFinite(janky)?100*janky/count:null,uiFramesPerTraceSecond:count>=0&&elapsedMs>0?count/(elapsedMs/1000):null,interpretation:'Exact durations of available HWUI framestats rows; Android retains a bounded tail, not necessarily the entire trace. UI throughput is not display or ExpoGL FPS.'};
}
export function parseSurfaceLatency(text){
  const lines=text.trim().split(/\r?\n/),refreshNs=Number(lines.shift()),timestamps=[];
  for(const line of lines){const row=line.trim().split(/\s+/);if(row.length!==3||!row.every(x=>/^\d+$/.test(x)))continue;const actual=BigInt(row[1]);if(actual>0n&&actual<9223372036854775807n)timestamps.push(actual.toString());}
  return {refreshNs:Number.isFinite(refreshNs)&&refreshNs>0?refreshNs:null,timestamps:[...new Set(timestamps)]};
}
export function presentationStats(timestamps,refreshNs){
  const sorted=[...new Set(timestamps)].map(BigInt).sort((a,b)=>a<b?-1:a>b?1:0),intervals=sorted.slice(1).map((value,i)=>Number(value-sorted[i])/1e6),spanMs=sorted.length>1?Number(sorted.at(-1)-sorted[0])/1e6:0;
  return {available:intervals.length>1,metric:'SurfaceFlinger actualPresentTime intervals for one package-matched SurfaceView',frames:sorted.length,observedFps:spanMs>0?(sorted.length-1)/(spanMs/1000):null,p50Ms:quantile(intervals,.5),p95Ms:quantile(intervals,.95),slowPercent:intervals.length&&refreshNs?100*intervals.filter(x=>x>refreshNs/1e6*1.5).length/intervals.length:null,slowThresholdMs:refreshNs?refreshNs/1e6*1.5:null,spanMs,interpretation:'Presentation intervals include intentional on-demand idle periods and are not GPU execution times. A retained but paused ExpoGL SurfaceView may present no frames in light mode.'};
}
export function memoryStats(samples){
  const valid=samples.filter(x=>Number.isFinite(x.pssKiB)&&x.pssKiB>0),sustained=valid.slice(Math.floor(valid.length/2)).map(x=>x.pssKiB);
  return {samples:valid.length,sampledPeakPssKiB:valid.length?Math.max(...valid.map(x=>x.pssKiB)):null,sustainedMedianPssKiB:quantile(sustained,.5),sustainedP95PssKiB:quantile(sustained,.95),interpretation:'Process PSS sampled roughly once per second, including dumpsys overhead. The sampled maximum is a lower bound on the true continuous peak; sustained uses the final half of valid samples.'};
}
export function threadCpuTicks(text){
  return text.split(/\r?\n/).flatMap(line=>{
    const match=/^(\d+) \((.*)\) (.+)$/.exec(line);if(!match)return [];
    const fields=match[3].split(/\s+/),user=Number(fields[11]),system=Number(fields[12]);
    const category=/^(?:mqt_js|js|JavaScript|hermes)$/i.test(match[2])?'javascript':/^RenderThread$/.test(match[2])?'hwui-render':/^(?:GLThread|GLThread .*|GLThread-.*)$/.test(match[2])?'gl':null;
    return category&&Number.isFinite(user)&&Number.isFinite(system)?[{tid:match[1],category,ticks:user+system}]:[];
  });
}
export function threadCpuDelta(before,after){
  const result={javascript:0,'hwui-render':0,gl:0},observed=new Set();
  for(const entry of after){const previous=before.find(x=>x.tid===entry.tid&&x.category===entry.category);if(previous&&entry.ticks>=previous.ticks){result[entry.category]+=entry.ticks-previous.ticks;observed.add(entry.category);}}
  return {available:observed.size>0,threadCpuTicks:Object.fromEntries(Object.keys(result).map(key=>[key,observed.has(key)?result[key]:null])),interpretation:'Linux per-thread utime+stime tick deltas for recognized thread names only. CPU time excludes blocking, GPU execution and unnamed/recreated threads; tick rate is not assumed.'};
}
function command(file,args,{timeout=180000,binary=false,allowAbsent=false}={}){
  const result=runBounded(file,args,{timeout,encoding:binary?null:'utf8',maxBuffer:32*1024*1024});
  if(allowAbsent&&!result.error&&result.status===1&&!String(result.stdout??'').trim()&&!String(result.stderr??'').trim())return '';
  requireSafe(!result.error&&result.status===0,'A bounded profiling command failed.');return binary?result.stdout:String(result.stdout??'').trim();
}
const shellQuote=value=>"'"+value.replaceAll("'","'\\''")+"'";
async function sampler(serial,pkg,out){
  requireSafe(process.env.GITHUB_ACTIONS==='true'&&process.env.RUNNER_OS==='Linux'&&/^emulator-\d+$/.test(serial)&&[PRESENTED.package,R4.package].includes(pkg),'Sampler requires disposable CI emulator.');
  const adb=(...args)=>command('adb',['-s',serial,...args],{timeout:10000});let stopped=false;process.on('message',message=>{if(message==='stop')stopped=true;});
  let surfaces=[],surfaceAccessFailed=false;try{surfaces=adb('shell','dumpsys','SurfaceFlinger','--list').split(/\r?\n/).filter(name=>name.includes(pkg)&&name.includes('SurfaceView'));}catch{surfaceAccessFailed=true;}
  const surface=surfaces.length===1?surfaces[0]:null,samples=[],timestamps=[];let initial={timestamps:[],refreshNs:null};
  if(surface)try{initial=parseSurfaceLatency(adb('shell','dumpsys SurfaceFlinger --latency '+shellQuote(surface)));}catch{surfaceAccessFailed=true;}
  const baseline=initial.timestamps.length?initial.timestamps.map(BigInt).reduce((a,b)=>a>b?a:b):0n;let refreshNs=initial.refreshNs,errors=0;
  const started=performance.now();process.send?.({ready:true});
  while(!stopped&&performance.now()-started<180000){
    const began=performance.now();
    try{const text=adb('shell','dumpsys','meminfo',pkg);const pss=Number(/TOTAL PSS:\s*(\d+)/.exec(text)?.[1]??/^\s*TOTAL\s+(\d+)/m.exec(text)?.[1]);samples.push({atMs:performance.now()-started,pssKiB:Number.isFinite(pss)?pss:null});}catch{errors++;}
    if(surface)try{const result=parseSurfaceLatency(adb('shell','dumpsys SurfaceFlinger --latency '+shellQuote(surface)));refreshNs??=result.refreshNs;timestamps.push(...result.timestamps.filter(x=>BigInt(x)>baseline));}catch{errors++;}
    if(!stopped)await pause(Math.max(1,1000-(performance.now()-began)));
  }
  await writeFile(out,JSON.stringify({samples,memory:memoryStats(samples),presentation:surface?{...presentationStats(timestamps,refreshNs),surfaceAccessFailed}:{available:false,reason:surfaceAccessFailed?'surfaceflinger-access-unavailable':surfaces.length?'ambiguous-package-surfaceview':'package-surfaceview-unavailable'},errors,targetIntervalMs:1000,actualDurationMs:performance.now()-started,surfaceSelection:surface?'unique package-matched SurfaceView':'unavailable',rawSurfaceNamesPublished:false},null,2)+'\n');process.disconnect?.();
}
export function verifyProfileArtifact({app,badging,files,xml,resources,bundle,signature}){
  const info=manifest(badging);requireSafe(info.package===app.package&&info.name===app.version&&info.code===app.code&&info.minSdk<=29&&!/^application-debuggable\b/m.test(badging),'Profile APK identity differs.');
  for(const abi of ['arm64-v8a','x86_64'])requireSafe(new RegExp('^lib/'+abi+'/.+\\.so$','m').test(files),'Profile APK native ABI missing.');
  const certificates=[...signature.matchAll(/certificate SHA-256 digest: ([a-f0-9]{64})/gi)].map(x=>x[1].toLowerCase());requireSafe(certificates.length&&certificates.every(x=>x===app.certificate),'Profile APK certificate differs.');
  requireSafe(apkRuntimeVersion(xml,resources)===app.runtime,'Profile APK runtime differs.');
  const meta=(name,options)=>metadataValue(xml,resources,'expo.modules.updates.'+name,options);
  requireSafe(meta('ENABLED')===true&&meta('EXPO_UPDATE_URL')==='https://u.expo.dev/c3985e04-43dd-4896-9f8a-09366b6a3579'&&meta('DISABLE_ANTI_BRICKING_MEASURES',{optional:true})!==true&&meta('HAS_EMBEDDED_UPDATE',{optional:true})!==false,'Profile APK update protections differ.');
  const headers=JSON.parse(meta('UPDATES_CONFIGURATION_REQUEST_HEADERS_KEY'));requireSafe(Object.keys(headers).length===1&&headers['expo-channel-name']===app.channel,'Profile APK channel differs.');
  requireSafe(Buffer.isBuffer(bundle)&&bundle.length>1000&&bundle.length<15000000&&bundle.includes(Buffer.from(API)),'Profile APK embedded HTTPS API missing.');
  for(const local of ['http://localhost:3000','http://127.0.0.1:3000','http://10.0.2.2:3000'])requireSafe(!bundle.includes(Buffer.from(local)),'Profile APK contains local API.');
  return {package:app.package,version:app.version,code:app.code,sha256:app.sha256,sourceCommit:app.source,sourceScope:'Independently pinned build record; APK source must also be linked to EAS metadata.',certificate:app.certificate,embeddedHttpsApi:true};
}
async function main(){
  requireSafe(process.env.GITHUB_ACTIONS==='true'&&process.env.RUNNER_OS==='Linux','Profiler restricted to disposable Linux GitHub runner.');
  const mode=process.argv[2],repo=resolve(dirname(fileURLToPath(import.meta.url)),'..'),root=join(process.env.RUNNER_TEMP,'openminerals-mine-profile'),published=join(root,'public'),priv=join(root,'private');
  requireSafe(['download','run'].includes(mode),'Expected download or run.');await mkdir(published,{recursive:true});await mkdir(priv,{recursive:true,mode:0o700});
  const candidate=JSON.parse(await readFile(join(repo,'../docs/evidence/sprint-realism-20261101/candidate-build.json'),'utf8')),pairName=process.env.MINE_PROFILE_PAIR||'stable-r4',pair=profilePair(pairName,candidate);let serial='';
  const adb=(...args)=>command('adb',serial?['-s',serial,...args]:args,{timeout:adbBudget(args)}),json=(name,value)=>writeFile(join(published,name),JSON.stringify(value,null,2)+'\n');
  if(mode==='download'){
    const sdk=process.env.ANDROID_HOME||process.env.ANDROID_SDK_ROOT;requireSafe(sdk,'Android SDK required.');const versions=(await readdir(join(sdk,'build-tools'))).sort((a,b)=>a.localeCompare(b,undefined,{numeric:true})),tools=join(sdk,'build-tools',versions.at(-1)),verification=[];
    for(const [index,app] of [...pair,PRESENTED].entries()){
      const file=join(root,index+'.apk');command('curl',['--fail','--location','--proto','=https','--proto-redir','=https','--retry','2','--max-time','180','--max-filesize','200000000','--output',file,apkUrl(app.url)],{timeout:400000});requireSafe(hash(await readFile(file))===app.sha256,'Profile APK hash differs.');
      verification.push(verifyProfileArtifact({app,badging:command(join(tools,'aapt'),['dump','badging',file]),files:command('unzip',['-Z1',file]),xml:command(join(tools,'aapt'),['dump','xmltree',file,'AndroidManifest.xml']),resources:command(join(tools,'aapt'),['dump','--values','resources',file]),bundle:command('unzip',['-p',file,'assets/index.android.bundle'],{binary:true}),signature:command(join(tools,'apksigner'),['verify','--verbose','--print-certs',file])}));
    }
    await json('apk-verification.json',{demoOnly:true,pair:pairName,workflowCommit:process.env.GITHUB_SHA,apks:verification});return;
  }
  const devices=adb('devices'),emulator=devices.split(/\r?\n/).find(x=>/^emulator-\d+\s+device$/.test(x.trim()))?.split(/\s/)[0];serial=emulatorGuard(process.env,devices,emulator?command('adb',['-s',emulator,'shell','getprop','ro.kernel.qemu']):'');requireSafe(adb('shell','getprop','ro.build.version.sdk')==='29','Profiler requires API29.');
  const packages=adb('shell','pm','list','packages');requireSafe(!packages.includes(PRESENTED.package)&&!packages.includes(R4.package),'Profiler requires initially absent demo packages.');
  const identity=app=>installedIdentity(adb('shell','dumpsys','package',app.package),app);adb('install',join(root,'2.apk'));const stable=identity(PRESENTED),trace=gestureTrace(adb('shell','wm','size'));
  await json('protocol.json',{demoOnly:true,pair:pairName,order:['A','B','B','A'],modes:['light','3d'],trace,device:{api:29,abi:adb('shell','getprop','ro.product.cpu.abi'),renderer:'configured SwiftShader',physical:false},samplingOverhead:'One independent process samples dumpsys PSS and optional SurfaceFlinger during each trace; both APKs use the identical sampler. No video is recorded.'});
  async function flow(app,name,source){const out=join(priv,name);await mkdir(out,{recursive:true,mode:0o700});await writeFile(join(out,'flow.yaml'),previewFlow(source,app.package));const result=runBounded('maestro',['--no-ansi','--device',serial,'test','--format','JUNIT','--output',join(out,'report.xml'),'--debug-output',join(out,'debug'),join(out,'flow.yaml')],{timeout:420000,encoding:'utf8',maxBuffer:4*1024*1024,env:{...process.env,MAESTRO_CLI_NO_ANALYTICS:'1'}});requireSafe(!result.error&&result.status===0,'Anonymous profiler flow failed.');}
  async function scene(){const remote='/sdcard/openminerals-profile-scene.xml';try{adb('shell','uiautomator','dump',remote);return anonymousSceneState(adb('exec-out','cat',remote));}finally{adb('shell','rm','-f',remote);}}
  function cpuSnapshot(app){try{const pid=command('adb',['-s',serial,'shell','pidof',app.package],{timeout:5000});requireSafe(/^\d+$/.test(pid),'Invalid CPU sample process.');return threadCpuTicks(adb('shell',`cat /proc/${pid}/task/*/stat`));}catch{return [];}}
  const results=[];let previewInstalled=false;
  try{
    for(const [iteration,index] of [0,1,1,0].entries()){
      const app=pair[index];for(const other of [PRESENTED.package,R4.package])adb('shell','am','force-stop',other);
      if(app.package===R4.package){if(previewInstalled)adb('uninstall',R4.package);requireSafe(hash(await readFile(join(root,index+'.apk')))===app.sha256,'Profile APK changed.');adb('install',join(root,index+'.apk'));previewInstalled=true;}identity(app);assertStablePreserved(stable,identity(PRESENTED));
      for(const visualMode of ['light','3d']){
        const name='trial-'+iteration+'-'+visualMode;console.log('PROFILE '+name+' '+(index?'B':'A'));
        const launchStarted=performance.now(),launch=await observeColdLaunch({packageName:app.package,adb,readPid:()=>command('adb',['-s',serial,'shell','pidof',app.package],{allowAbsent:true,timeout:5000})});requireSafe(launch.evidence.valid,'Profiler cold launch invalid.');
        let observed=null,firstUiObservedMs=null;const pollStarted=performance.now();
        while(performance.now()-pollStarted<45000){const current=await scene();if(current.knownIds.includes('home-cinematic-scroll')&&firstUiObservedMs===null)firstUiObservedMs=performance.now()-launchStarted;if(['gl','automatic-light','light'].includes(current.mode)){observed=current;break;}await pause(250);}
        const sceneObservedMs=observed?performance.now()-launchStarted:null;requireSafe(observed,'Initial scene readiness not observed.');
        await flow(app,name+'-embedded',embeddedFlow(app.version));await flow(app,name+'-prepare',await readFile(join(repo,'e2e/native',visualMode==='light'?'story-light-prepare.yaml':'story-video-prepare.yaml'),'utf8'));
        const initialScene=await scene();requireSafe(visualMode==='light'?initialScene.readiness==='light':initialScene.mode==='gl','Prepared scene mode differs.');
        adb('shell','setprop','debug.hwui.profile','true');adb('shell','dumpsys','gfxinfo',app.package,'reset');
        const cpuBefore=cpuSnapshot(app),sampleFile=join(published,name+'-sampling.json'),worker=fork(fileURLToPath(import.meta.url),['sample',serial,app.package,sampleFile],{stdio:['ignore','ignore','ignore','ipc']});
        await new Promise((resolveReady,reject)=>{const timer=setTimeout(()=>{worker.kill('SIGKILL');reject(Error('Sampler startup failed.'));},20000);worker.once('message',message=>{if(message?.ready){clearTimeout(timer);resolveReady();}});worker.once('error',()=>{clearTimeout(timer);reject(Error('Sampler startup failed.'));});});
        let timing;try{timing=await executeTrace({trace,adb});}finally{worker.send('stop');await new Promise((done,reject)=>{const timer=setTimeout(()=>{worker.kill('SIGKILL');reject(Error('Sampler exit failed.'));},20000);worker.once('exit',code=>{clearTimeout(timer);code===0?done():reject(Error('Sampler failed.'));});});}
        const cpu=threadCpuDelta(cpuBefore,cpuSnapshot(app)),gfx=adb('shell','dumpsys','gfxinfo',app.package,'framestats'),sampling=JSON.parse(await readFile(sampleFile,'utf8')),finalScene=await scene();
        const report={demoOnly:true,trial:iteration,arm:index?'B':'A',app:{package:app.package,code:app.code,source:app.source,sha256:app.sha256},visualMode,coldLaunch:launch.evidence,activityTotalMs:Number(/TotalTime:\s*(\d+)/.exec(launch.start)?.[1])||null,firstUiObservedMs,firstSceneObservedMs:sceneObservedMs,readinessScope:'Observed host elapsed upper bound from before cold-launch command to UIAutomator observation. Includes polling overhead; excludes server-data readiness. A scene marker is not compositor presentation.',initialScene,finalScene,qualityEquivalentAtEndpoints:initialScene.mode===finalScene.mode&&initialScene.qualityTierObserved===finalScene.qualityTierObserved,hwui:hwuiFrameStats(gfx,timing.observedDurationMs),memory:sampling.memory,presentation:sampling.presentation,cpu,inputTrace:{protocol:trace.protocol,specificationSha256:trace.specificationSha256,compiledSha256:trace.compiledSha256,...timing},physicalDevice:false,gpuExecutionTimeMeasured:false,jsThreadWallTimeMeasured:false};results.push(report);await json(name+'.json',report);await json('summary.json',{demoOnly:true,complete:false,results});
      }
    }
    assertStablePreserved(stable,identity(PRESENTED));await json('summary.json',{demoOnly:true,complete:true,pair:pairName,order:'ABBA',stableUidVersionPreserved:true,noStableUninstall:true,noStableDataClear:true,credentialsEntered:false,operationsPerformed:false,phonePerformanceAcceptance:false,results,limitations:['Two repetitions per APK and mode; no statistical confidence interval.','Adaptive GL-to-light changes invalidate an equal-quality 3D comparison. Endpoint state does not prove mode throughout trace.','HWUI is not ExpoGL; SurfaceFlinger presentation is optional and never GPU execution timing.','PSS sampled maximum is not the true continuous peak.','Light mode can retain a paused SurfaceView; missing presentations are expected.']});
  }finally{await rm(priv,{recursive:true,force:true});}
}
if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){if(process.argv[2]==='sample')await sampler(...process.argv.slice(3));else await main();}
