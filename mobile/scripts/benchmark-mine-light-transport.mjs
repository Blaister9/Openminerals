// Causal renderer ablations in desktop SwiftShader only. No Android FPS claim.
// OPENMINERALS_WEBGL_BROWSER=/path/to/chrome node mobile/scripts/benchmark-mine-light-transport.mjs
// Optional OPENMINERALS_MINE_LIGHT_TRANSPORT_DIR selects a NEW repo-relative output.
import {execFile,execFileSync} from 'node:child_process';
import {promisify} from 'node:util';
import {readFile,writeFile,mkdir,mkdtemp,rm} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {tmpdir,platform,availableParallelism,totalmem} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const mobile=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),repo=path.dirname(mobile);
const browser=process.env.OPENMINERALS_WEBGL_BROWSER;
if(!browser)throw Error('Set OPENMINERALS_WEBGL_BROWSER. This script only benchmarks desktop SwiftShader.');
const stamp=new Date().toISOString().replaceAll(/[:.]/g,'-');
const output=path.resolve(repo,process.env.OPENMINERALS_MINE_LIGHT_TRANSPORT_DIR||'artifacts/mine-light-transport-'+stamp);
await mkdir(output);await mkdir(path.join(output,'sources'));
const sourceNames=['gold-bar-3d','immersive-story','geological-scene','geological-specimen','metal-materials','scene-renderer'];
const sources={};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const baselineCommit='ce9b79b5abbe0389e5f2661dda0d7abc6b53bc14';
for(const name of sourceNames)sources[name]=execFileSync('git',['show',baselineCommit+':mobile/lib/'+name+'.ts'],{cwd:repo,encoding:'utf8',windowsHide:true}).replaceAll('\r\n','\n');
const candidate={...sources,'geological-scene':(await readFile(path.join(mobile,'lib/geological-scene.ts'),'utf8')).replaceAll('\r\n','\n')};
for(const [name,source]of Object.entries(candidate))await writeFile(path.join(output,'sources',name+'.ts'),source,{flag:'wx'});
const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8',windowsHide:true}).trim();
const previousCommit='ce9b79b5abbe0389e5f2661dda0d7abc6b53bc14';
const conditions=[{id:'r4-full',description:'Frozen r4 six-module snapshot.',sources},{id:'rough-light-transport',description:'Only geological shader changed: four static lights and analytic shadows interpolate broad dielectric lighting; veins/quartz retain fragment PBR.',sources:candidate}];
const require=createRequire(path.join(mobile,'package.json')),{transformSync}=require('@babel/core');
const compile=items=>'{'+Object.entries(items).map(([name,source])=>{
 const code=transformSync(source,{filename:name+'.ts',babelrc:false,configFile:false,plugins:[require.resolve('@babel/plugin-transform-typescript'),require.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
 return JSON.stringify('./'+name+'.ts')+':function(require,module,exports){'+code+'}';
}).join(',')+'}';
const protocol={width:360,height:640,poses:[0,.06,.12,.18,.24,.3,.35,.4,.5,.67,.83,1],warmupRounds:2,measuredRounds:6,conditionOrder:'Forward on even rounds, reverse on odd rounds; one independent GL context per condition.',completionFence:'One gl.finish plus full-viewport RGBA readPixels per measured draw; transfer overhead included.',compilationExcludedFromFrameSamples:true,frameMetric:'Wall-clock renderer submission, software completion and full RGBA readback, not GPU-only or display frame time.'};
const script=`const definitions=[${conditions.map(item=>`{id:${JSON.stringify(item.id)},modules:${compile(item.sources)}}`).join(',')}];
const protocol=${JSON.stringify(protocol)},contexts=[];
const complete=context=>{context.gl.finish();context.gl.readPixels(0,0,protocol.width,protocol.height,context.gl.RGBA,context.gl.UNSIGNED_BYTE,context.pixels);};
for(const definition of definitions){
 const canvas=document.createElement('canvas');canvas.width=protocol.width;canvas.height=protocol.height;
 const gl=canvas.getContext('webgl',{preserveDrawingBuffer:true,antialias:false});if(!gl)throw Error('WebGL unavailable');gl.endFrameEXP=()=>{};
 const debug=gl.getExtension('WEBGL_debug_renderer_info'),renderer=debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);
 if(!/SwiftShader/i.test(renderer))throw Error('Explicit SwiftShader required.');
 const cache={},require=id=>{id=id.endsWith('.ts')?id:id+'.ts';if(cache[id])return cache[id].exports;const module={exports:{}};cache[id]=module;definition.modules[id](require,module,module.exports);return module.exports;};
 const context={id:definition.id,gl,canvas,pixels:new Uint8Array(protocol.width*protocol.height*4),samples:[],rendererInfo:{renderer,version:gl.getParameter(gl.VERSION),userAgent:navigator.userAgent},drawCalls:0,triangles:0,uploadBytes:0};
 const draw=gl.drawArrays.bind(gl),upload=gl.bufferData.bind(gl);
 gl.drawArrays=(mode,start,count)=>{context.drawCalls++;context.triangles+=count/3;return draw(mode,start,count);};
 gl.bufferData=(target,data,usage)=>{context.uploadBytes+=typeof data==='number'?data:data.byteLength;return upload(target,data,usage);};
 const began=performance.now();context.renderer=require('./scene-renderer.ts').createStoryRenderer(gl,true);context.createRendererMs=performance.now()-began;
 const first=performance.now();context.renderer.draw(0,0,'XAU');complete(context);context.firstDrawCompletionMs=performance.now()-first;
 context.firstReadyMs=context.createRendererMs+context.firstDrawCompletionMs;context.work=[];
 for(const progress of protocol.poses){context.drawCalls=0;context.triangles=0;context.renderer.draw(progress,0,'XAU');complete(context);context.work.push({progress,drawCalls:context.drawCalls,triangles:context.triangles});}
 for(let round=0;round<protocol.warmupRounds;round++)for(const progress of protocol.poses){context.renderer.draw(progress,0,'XAU');complete(context);}
 contexts.push(context);
}
const roundOrder=[];
for(let round=0;round<protocol.measuredRounds;round++){
 const order=round%2?[...contexts].reverse():contexts;roundOrder.push(order.map(c=>c.id));
 for(const context of order)for(const progress of protocol.poses){const began=performance.now();context.renderer.draw(progress,0,'XAU');complete(context);context.samples.push({round,progress,completionMs:performance.now()-began});}
}
const results=[],referencePixels=new Map();
for(const context of contexts){if(context.gl.getError()!==context.gl.NO_ERROR)throw Error('GL error: '+context.id);const images=[];for(const progress of [0,.1,.2,.3,.35,.67]){context.renderer.draw(progress,0,'XAU');complete(context);let difference=null;if(context.id==='r4-full')referencePixels.set(progress,new Uint8Array(context.pixels));else{const baseline=referencePixels.get(progress),absolute=[];let sum=0,changedPixelsOver6=0,max=0;for(let pixel=0;pixel<baseline.length;pixel+=4){let changed=false;for(let channel=0;channel<3;channel++){const error=Math.abs(baseline[pixel+channel]-context.pixels[pixel+channel]);sum+=error;absolute.push(error);max=Math.max(max,error);if(error>6)changed=true;}if(changed)changedPixelsOver6++;}absolute.sort((a,b)=>a-b);difference={meanAbsoluteRgbError:sum/absolute.length,p95AbsoluteChannelError:absolute[Math.floor(absolute.length*.95)],maxAbsoluteChannelError:max,pixelsOver6Percent:100*changedPixelsOver6/(baseline.length/4)};}images.push({progress,image:context.canvas.toDataURL('image/png'),difference});}context.renderer.dispose();results.push({id:context.id,rendererInfo:context.rendererInfo,createRendererMs:context.createRendererMs,firstDrawCompletionMs:context.firstDrawCompletionMs,firstReadyMs:context.firstReadyMs,uploadBytes:context.uploadBytes,work:context.work,samples:context.samples,images});}
document.getElementById('result').textContent=JSON.stringify({ok:true,roundOrder,results});`;
const file=path.join(output,'benchmark.html');
await writeFile(file,'<!doctype html><meta charset="utf-8"><pre id="result"></pre><script>try{'+script+'}catch(error){document.getElementById("result").textContent=JSON.stringify({ok:false,error:String(error)});}</script>',{flag:'wx'});
const profile=await mkdtemp(path.join(tmpdir(),'openminerals-geology-cost-'));let result;
try{
 const {stdout}=await promisify(execFile)(browser,['--headless=new','--no-first-run','--no-default-browser-check','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--user-data-dir='+profile,'--dump-dom',pathToFileURL(file).href],{windowsHide:true,timeout:150000,maxBuffer:24*1024*1024});
 const match=stdout.match(/<pre id="result">([^<]*)<\/pre>/);if(!match)throw Error('Missing benchmark result.');result=JSON.parse(match[1]);if(!result.ok)throw Error(result.error);
}finally{
 const resolved=path.resolve(profile);if(path.dirname(resolved)!==path.resolve(tmpdir())||!path.basename(resolved).startsWith('openminerals-geology-cost-'))throw Error('Unexpected browser profile target.');
 await rm(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:200});
}
const metric=samples=>{const values=samples.map(s=>s.completionMs).sort((a,b)=>a-b),q=p=>values[Math.min(values.length-1,Math.floor(values.length*p))];return {count:values.length,p50Ms:q(.5),p95Ms:q(.95),meanMs:values.reduce((a,b)=>a+b,0)/values.length,maxMs:values.at(-1),completionOver16_67Percent:100*values.filter(v=>v>1000/60).length/values.length};};
for(const row of result.results){
 if(row.samples.length!==protocol.poses.length*protocol.measuredRounds||row.samples.some(s=>!Number.isFinite(s.completionMs)||s.completionMs<0))throw Error('Invalid samples.');
 await mkdir(path.join(output,row.id));
 for(const image of row.images){const bytes=Buffer.from(image.image.split(',')[1],'base64');delete image.image;image.file=row.id+'/progress-'+image.progress+'.png';image.sha256=hash(bytes);await writeFile(path.join(output,image.file),bytes,{flag:'wx'});}
 row.stats={all:metric(row.samples),mine:metric(row.samples.filter(s=>s.progress<.4)),subject:metric(row.samples.filter(s=>s.progress>=.4))};
 row.description=conditions.find(c=>c.id===row.id).description;
 row.sourceHashes=Object.fromEntries(Object.entries(conditions.find(c=>c.id===row.id).sources).map(([name,source])=>[name+'.ts',hash(source)]));
}
const report={demoOnly:true,environment:'desktop Chrome ANGLE SwiftShader',android:false,physicalDevice:false,displayFpsMeasured:false,gpuOnlyMeasured:false,memoryMeasured:false,sourceCommit,previousCommit,capturedAtUtc:new Date().toISOString(),host:{platform:platform(),availableLogicalCpus:availableParallelism(),totalMemoryMiB:Math.floor(totalmem()/1048576),nodeVersion:process.version},protocol,...result,limitations:['Software completion includes RGBA readback, not native GPU/display timings.','Shader/mesh construction and first readiness are single samples; no cold-browser cache control.','One host/run; alternating measured order reduces but does not eliminate host/cache effects.','Candidate changes only the mine shader; subject and renderer are frozen r4 to isolate this optimization.','No native UI, scroll, TextureView lifecycle, app memory or physical-device acceptance is measured.']};
await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output:path.relative(repo,output),sourceCommit,environment:report.environment,results:report.results.map(({id,stats,createRendererMs,firstReadyMs,uploadBytes})=>({id,stats,createRendererMs,firstReadyMs,uploadBytes}))}));
