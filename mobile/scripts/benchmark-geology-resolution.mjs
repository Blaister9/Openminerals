// Desktop software-rendering evidence only. Run from any directory:
// OPENMINERALS_WEBGL_BROWSER=/path/to/chrome node mobile/scripts/benchmark-geology-resolution.mjs
// Optional OPENMINERALS_GEOLOGY_BENCHMARK_DIR is resolved relative to the repo.
// OPENMINERALS_GEOLOGY_SOURCE_DIR can select archived source snapshots without
// changing the app; it defaults to mobile/lib and is also repo-relative.
// The output directory must be new: previous evidence is never overwritten.
import {execFile,execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir,mkdtemp,rm,readdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {availableParallelism,totalmem,platform,tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const mobile=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const repo=path.dirname(mobile),browser=process.env.OPENMINERALS_WEBGL_BROWSER;
if(!browser)throw Error('Set OPENMINERALS_WEBGL_BROWSER to a Chrome/Chromium executable. This benchmark does not run Android.');
const stamp=new Date().toISOString().replaceAll(/[:.]/g,'-');
const output=path.resolve(repo,process.env.OPENMINERALS_GEOLOGY_BENCHMARK_DIR||'artifacts/geology-resolution-'+stamp);
const sourceRoot=path.resolve(repo,process.env.OPENMINERALS_GEOLOGY_SOURCE_DIR||'mobile/lib');
try{await readdir(output);throw Error('Benchmark output already exists; choose a new directory to preserve prior evidence.');}catch(error){if(error.code!=='ENOENT')throw error;}
await mkdir(path.join(output,'sources'),{recursive:true});

// Use the same Babel compilation path as test/geological-render.test.mjs;
// no new dependencies, downloaded assets or native modules are required.
const require=createRequire(path.join(mobile,'package.json')),{transformSync}=require('@babel/core');
const sourceNames=['gold-bar-3d','immersive-story','geological-scene','geological-specimen','metal-materials','scene-renderer'];
const modules=[],sourceHashes={};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
for(const name of sourceNames){
 const source=(await readFile(path.join(sourceRoot,name+'.ts'),'utf8')).replaceAll('\r\n','\n');
 await writeFile(path.join(output,'sources',name+'.ts'),source,{flag:'wx'});
 sourceHashes[name+'.ts']=hash(source);
 const compiled=transformSync(source,{filename:name+'.ts',babelrc:false,configFile:false,plugins:[require.resolve('@babel/plugin-transform-typescript'),require.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
 modules.push(JSON.stringify('./'+name+'.ts')+':function(require,module,exports){'+compiled+'}');
}
let headCommit=null;
try{headCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8',windowsHide:true,stdio:['ignore','pipe','ignore']}).trim();}catch{}
const protocol={aspect:'9:16',resolutionOrder:[640,384,320],poseCount:18,warmupDrawsPerResolution:18,measuredRounds:5,measuredDrawsPerResolution:90,independentContextPerResolution:true,compilationExcluded:true,oneGlFinishPerMeasuredDraw:true,fullFrameReadbackIncluded:true,readbackBytesPerDraw:'width*height*4',imageEncodingOutsideTimedSamples:true};
const limitations=[
 'Desktop Chrome/SwiftShader completion plus RGBA readback, not Android/native GPU/compositor timings or FPS.',
 'Full-viewport readPixels is an observable completion fence and its transfer cost is included. gl.finish-only near-zero pilot timings did not prove raster completion.',
 'One host and ordered conditions; no randomization or cross-run statistical acceptance.',
 'Warmup excludes shader compilation. This does not exercise Android lifecycle, gestures or automatic fallback transitions.',
 'A completion-budget hit is not physical-device acceptance. Compare the native-resolution PNGs when judging quality.',
];
const profiles=[];
const metric=samples=>{
 const values=samples.map(sample=>sample.completionMs).sort((a,b)=>a-b);
 const q=percentile=>values[Math.min(values.length-1,Math.floor(values.length*percentile))];
 return {sampleCount:values.length,minMs:values[0],medianMs:q(.5),p90Ms:q(.9),p95Ms:q(.95),maxMs:values.at(-1),meanMs:values.reduce((a,b)=>a+b,0)/values.length,completionBudget16_67ms:values.filter(v=>v<=1000/60).length,completionBudget33_33ms:values.filter(v=>v<=1000/30).length};
};

for(const longSide of protocol.resolutionOrder){
 const directory=path.join(output,String(longSide)),width=Math.round(longSide*9/16),height=longSide;
 await mkdir(directory);
 const script=`const modules={${modules.join(',')}},cache={};function require(id){if(cache[id])return cache[id].exports;const module={exports:{}};cache[id]=module;modules[id](require,module,module.exports);return module.exports;}
 const width=${width},height=${height},canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
 const gl=canvas.getContext('webgl',{preserveDrawingBuffer:true,antialias:false});if(!gl)throw Error('WebGL unavailable');
 // Exactly one explicit finish plus a full RGBA readback for each timed draw.
 // endFrameEXP is a desktop shim, not Android presentation synchronization.
 gl.endFrameEXP=()=>{};
 const pixels=new Uint8Array(width*height*4),complete=()=>{gl.finish();gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);};
 const debug=gl.getExtension('WEBGL_debug_renderer_info');
 const rendererInfo={renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),vendor:debug?gl.getParameter(debug.UNMASKED_VENDOR_WEBGL):gl.getParameter(gl.VENDOR),version:gl.getParameter(gl.VERSION),shadingLanguage:gl.getParameter(gl.SHADING_LANGUAGE_VERSION),browserUserAgent:navigator.userAgent};
 if(!/SwiftShader/i.test(rendererInfo.renderer))throw Error('Explicit SwiftShader software renderer required.');
 const {createStoryRenderer}=require('./scene-renderer.ts'),renderer=createStoryRenderer(gl,true);
 const poses=[...Array.from({length:13},(_,i)=>({progress:i/12,metal:'XAU'})),{progress:.5,metal:'XAU'},{progress:0,metal:'XAU'},...['XAG','XPT','XPD'].map(metal=>({progress:5/6,metal}))];
 for(const pose of poses){renderer.draw(pose.progress,0,pose.metal);complete();}
 const samples=[];
 for(let round=0;round<5;round++)for(const [poseIndex,pose]of poses.entries()){
  const began=performance.now();renderer.draw(pose.progress,0,pose.metal);complete();const completionMs=performance.now()-began;
  samples.push({round,poseIndex,...pose,completionMs});
 }
 if(gl.getError()!==gl.NO_ERROR)throw Error('GL rasterization/readback failed.');
 const images=[];for(const poseIndex of [0,2,4,6,8]){const pose=poses[poseIndex];renderer.draw(pose.progress,0,pose.metal);complete();images.push({poseIndex,...pose,image:canvas.toDataURL('image/png')});}
 renderer.dispose();document.getElementById('result').textContent=JSON.stringify({ok:true,width,height,rendererInfo,poses,warmupDraws:18,measuredRounds:5,samples,images});`;
 const file=path.join(directory,'benchmark.html');
 await writeFile(file,'<!doctype html><meta charset="utf-8"><pre id="result"></pre><script>try{'+script+'}catch(error){document.getElementById("result").textContent=JSON.stringify({ok:false,error:String(error)});}</script>',{flag:'wx'});
 const profile=await mkdtemp(path.join(tmpdir(),'openminerals-geology-resolution-'));
 let result;
 try{
  const {stdout}=await promisify(execFile)(browser,['--headless=new','--no-first-run','--no-default-browser-check','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--user-data-dir='+profile,'--dump-dom',pathToFileURL(file).href],{windowsHide:true,timeout:55000,maxBuffer:16*1024*1024});
  const match=stdout.match(/<pre id="result">([^<]*)<\/pre>/);if(!match)throw Error('Missing bounded benchmark result.');result=JSON.parse(match[1]);if(!result.ok)throw Error(result.error);
 }finally{
  const resolved=path.resolve(profile);
  if(path.dirname(resolved)!==path.resolve(tmpdir())||!path.basename(resolved).startsWith('openminerals-geology-resolution-'))throw Error('Unexpected temporary browser profile target.');
  await rm(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:200});
 }
 if(result.samples.length!==90||result.poses.length!==18||result.samples.some(s=>!Number.isFinite(s.completionMs)||s.completionMs<0))throw Error('Incomplete or invalid frame samples.');
 const stats={all:metric(result.samples),tunnelAndExtraction:metric(result.samples.filter(s=>s.progress<.4)),laterBarAndCustody:metric(result.samples.filter(s=>s.progress>=.4))};
 const images=[];
 for(const {image,...pose}of result.images){
  const bytes=Buffer.from(image.split(',')[1],'base64'),name='pose-'+pose.poseIndex+'.png';
  if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Invalid bounded screenshot.');
  await writeFile(path.join(directory,name),bytes,{flag:'wx'});images.push({...pose,file:String(longSide)+'/'+name,bytes:bytes.length,sha256:hash(bytes)});
 }
 const report={demoOnly:true,headCommit,sourceInputDirectory:path.relative(repo,sourceRoot),sourceHashes,capturedAtUtc:new Date().toISOString(),environment:'desktop Chrome ANGLE SwiftShader',android:false,physicalDevice:false,gpuFpsMeasured:false,phonePerformanceAcceptance:false,completionFence:'gl.finish + full RGBA readPixels; readback transfer cost included',host:{platform:platform(),availableLogicalCpus:availableParallelism(),totalMemoryMiB:Math.floor(totalmem()/1048576),nodeVersion:process.version},longSide,...result,stats,images};
 await writeFile(path.join(directory,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});profiles.push({longSide,width,height,rendererInfo:result.rendererInfo,stats,images});
 console.log(JSON.stringify({environment:report.environment,android:false,longSide,width,height,stats}));
}
const summary={demoOnly:true,headCommit,sourceInputDirectory:path.relative(repo,sourceRoot),sourceHashes,capturedAtUtc:new Date().toISOString(),environment:'desktop Chrome ANGLE SwiftShader',android:false,physicalDevice:false,gpuFpsMeasured:false,phonePerformanceAcceptance:false,protocol,profiles,limitations};
await writeFile(path.join(output,'benchmark-summary.json'),JSON.stringify(summary,null,2)+'\n',{flag:'wx'});
console.log('Desktop benchmark saved to '+path.relative(repo,output)+'. Includes RGBA readback; no Android FPS or phone acceptance.');
