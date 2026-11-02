// Causal renderer ablations in desktop SwiftShader only. No Android FPS claim.
// OPENMINERALS_WEBGL_BROWSER=/path/to/chrome node mobile/scripts/benchmark-geology-cost.mjs
// Optional OPENMINERALS_GEOLOGY_COST_DIR selects a NEW repo-relative output.
// Optional OPENMINERALS_GEOLOGY_COST_WIDTH/HEIGHT must be set together, 64..2048.
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
const widthInput=process.env.OPENMINERALS_GEOLOGY_COST_WIDTH,heightInput=process.env.OPENMINERALS_GEOLOGY_COST_HEIGHT;
if((widthInput===undefined)!==(heightInput===undefined))throw Error('Set benchmark WIDTH and HEIGHT together.');
const dimension=(input,fallback)=>{if(input===undefined)return fallback;if(!/^[1-9]\d{1,3}$/.test(input))throw Error('Benchmark dimensions must be decimal integers, 64..2048.');const value=Number(input);if(value<64||value>2048)throw Error('Benchmark dimensions must be decimal integers, 64..2048.');return value;};
const width=dimension(widthInput,360),height=dimension(heightInput,640);
const stamp=new Date().toISOString().replaceAll(/[:.]/g,'-');
const output=path.resolve(repo,process.env.OPENMINERALS_GEOLOGY_COST_DIR||'artifacts/geology-cost-'+stamp);
await mkdir(output);await mkdir(path.join(output,'sources'));
const sourceNames=['gold-bar-3d','immersive-story','geological-scene','geological-specimen','metal-materials','scene-renderer'];
const sources={};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const sourceCommit=process.env.OPENMINERALS_GEOLOGY_COST_SOURCE_COMMIT||'ce9b79b5abbe0389e5f2661dda0d7abc6b53bc14';
for(const name of sourceNames){sources[name]=execFileSync('git',['show',sourceCommit+':mobile/lib/'+name+'.ts'],{cwd:repo,encoding:'utf8',windowsHide:true}).replaceAll('\r\n','\n');await writeFile(path.join(output,'sources',name+'.ts'),sources[name],{flag:'wx'});}
const workspaceCommit=execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8',windowsHide:true}).trim();
const previousCommit='ed87d2ea233227437ab5f5cc2eb0900674e1231f';
const previous={};
const gitFile=file=>execFileSync('git',['show',previousCommit+':mobile/'+file],{cwd:repo,encoding:'utf8',windowsHide:true}).replaceAll('\r\n','\n');
for(const name of ['gold-bar-3d','immersive-story'])previous[name]=gitFile('lib/'+name+'.ts');
const component=gitFile('components/GoldBar3D.tsx');
const begin=component.indexOf('function createRenderer('),end=component.indexOf('\nclass GLBoundary');
if(begin<0||end<begin)throw Error('Unable to extract the frozen stable renderer.');
previous['scene-renderer']=`import {createGoldBarMesh,createStudioFloorMesh,goldBarMatrices,goldBarPose,GOLD_FRAGMENT_SHADER,GOLD_VERTEX_SHADER} from './gold-bar-3d';\nimport {immersivePose,immersiveMatrices,IMMERSIVE_VERTEX_SHADER,IMMERSIVE_FRAGMENT_SHADER} from './immersive-story';\n`+component.slice(begin,end).replace('function createRenderer(','export function createStoryRenderer(');
await mkdir(path.join(output,'previous-sources'));
for(const [name,source]of Object.entries(previous))await writeFile(path.join(output,'previous-sources',name+'.ts'),source,{flag:'wx'});
const replace=(source,needle,value)=>{if(!source.includes(needle))throw Error('Ablation target not found: '+needle);return source.replace(needle,value);};
const allConditions=[
 {id:'stable-030',description:'Frozen previous renderer; original 400-triangle subject and material.',sources:previous},
 {id:'r4-full',description:'Unmodified current renderer.',sources},
 {id:'one-light',description:'Only first of four direct PBR lights; otherwise unchanged.',sources:{...sources,'geological-scene':replace(sources['geological-scene'],'for(int i=0;i<4;i++)','for(int i=0;i<1;i++)')}},
 {id:'no-direct-light',description:'No direct PBR light contribution; ambient and procedural surface remain.',sources:{...sources,'geological-scene':replace(sources['geological-scene'],'for(int i=0;i<4;i++)','for(int i=0;i<0;i++)')}},
 {id:'no-shadows',description:'Direct lights remain, ellipsoid shadow evaluation removed.',sources:{...sources,'geological-scene':replace(sources['geological-scene'],'float shadow=mineShadow(p+n*.025,lamp);','float shadow=1.0;')}},
 {id:'flat-surface',description:'Override procedural base/normal/roughness/metallic to allow compiler to remove surface-detail work; lights and shadows remain.',sources:{...sources,'geological-scene':replace(sources['geological-scene'],'vec3 view=normalize(u_camera-p);','base=vec3(.12);n=normalize(v_mineNormal);roughness=.9;metallic=0.0;f0=vec3(.04);\n  vec3 view=normalize(u_camera-p);')}},
 {id:'no-dust',description:'Remove 48 dust quads (96 triangles); no other shader changes.',sources:{...sources,'geological-scene':replace(sources['geological-scene'],'DUST_COUNT=48','DUST_COUNT=0')}},
 {id:'coarse-tunnel',description:'Halve radial and length subdivisions of tunnel only; boulders/materials remain.',sources:{...sources,'geological-scene':replace(sources['geological-scene'],'RADIAL=28,SEGMENTS=46','RADIAL=14,SEGMENTS=23')}},
 {id:'coarse-subject',description:'Use 400-triangle subject instead of subdivided 1600 triangles; same current shaders.',sources:{...sources,'scene-renderer':replace(sources['scene-renderer'],'cinematic?subdivideSpecimen(createGoldBarMesh()):createGoldBarMesh()','createGoldBarMesh()')}},
 {id:'no-engraving-gradient',description:'Keep the engraved symbol/darkening; omit its two extra SDF gradient taps and normal perturbation.',sources:{...sources,'gold-bar-3d':replace(sources['gold-bar-3d'],'if(distance<.03) {','if(false) {')}},
 {id:'no-engraving',description:'Replace engraving distance with an outside constant (tiny metalKind dependence retains the uniform); omit gradient.',sources:{...sources,'gold-bar-3d':replace(replace(sources['gold-bar-3d'],'if(distance<.03) {','if(false) {'),'float distance=engravingDistance(p),top=','float distance=.1+u_metalKind*.0000001,top=')}},
 {id:'skip-formed-rock',description:'Skip fully invisible procedural rock/vein computations once formation is complete.',sources:{...sources,'immersive-story':replace(replace(sources['immersive-story'],'float formation=smoothstep(.26,.5,u_storyProgress);\n  float strata=','if(u_storyProgress<.5){\n  float formation=smoothstep(.26,.5,u_storyProgress);\n  float strata='),'color=mix(rock,color,formation)+vec3(.095,.021,.004)*heat;','color=mix(rock,color,formation)+vec3(.095,.021,.004)*heat;\n  }')}},
];
if(process.env.OPENMINERALS_GEOLOGY_COST_CANDIDATE){
 const candidate={...sources};await mkdir(path.join(output,'candidate-sources'));
 const names=process.env.OPENMINERALS_GEOLOGY_COST_CANDIDATE==='engraving'?['immersive-story','scene-renderer']:sourceNames;
 for(const name of names)candidate[name]=(await readFile(path.join(mobile,'lib',name+'.ts'),'utf8')).replaceAll('\r\n','\n');
 for(const [name,source]of Object.entries(candidate))await writeFile(path.join(output,'candidate-sources',name+'.ts'),source,{flag:'wx'});
 allConditions.push({id:'candidate',description:process.env.OPENMINERALS_GEOLOGY_COST_CANDIDATE==='engraving'?'Frozen r4 plus only the candidate immersive shader; no geological-lighting changes.':'Current workspace renderer and scene.',sources:candidate});
}
const selected=process.env.OPENMINERALS_GEOLOGY_COST_CONDITIONS?.split(',');
const conditions=selected?allConditions.filter(c=>selected.includes(c.id)):allConditions;
if(!conditions.length||selected?.some(id=>!allConditions.some(c=>c.id===id)))throw Error('Unknown or empty benchmark condition selection.');
const require=createRequire(path.join(mobile,'package.json')),{transformSync}=require('@babel/core');
const compile=items=>'{'+Object.entries(items).map(([name,source])=>{
 const code=transformSync(source,{filename:name+'.ts',babelrc:false,configFile:false,plugins:[require.resolve('@babel/plugin-transform-typescript'),require.resolve('@babel/plugin-transform-modules-commonjs')]}).code;
 return JSON.stringify('./'+name+'.ts')+':function(require,module,exports){'+code+'}';
}).join(',')+'}';
const protocol={width,height,poses:[0,.08,.12,.2,.3,.35,.4,.5,.67,.83,1],warmupRounds:2,measuredRounds:6,conditionOrder:'Forward on even rounds, reverse on odd rounds; one independent GL context per condition.',completionFence:'One gl.finish plus full-viewport RGBA readPixels per measured draw; transfer overhead included.',compilationExcludedFromFrameSamples:true,frameMetric:'Wall-clock renderer submission, software completion and full RGBA readback, not GPU-only or display frame time.'};
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
const results=[];
for(const context of contexts){if(context.gl.getError()!==context.gl.NO_ERROR)throw Error('GL error: '+context.id);const images=[];for(const progress of [0,.2,.35,.67]){context.renderer.draw(progress,0,'XAU');complete(context);images.push({progress,image:context.canvas.toDataURL('image/png')});}context.renderer.dispose();results.push({id:context.id,rendererInfo:context.rendererInfo,createRendererMs:context.createRendererMs,firstDrawCompletionMs:context.firstDrawCompletionMs,firstReadyMs:context.firstReadyMs,uploadBytes:context.uploadBytes,work:context.work,samples:context.samples,images});}
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
const report={demoOnly:true,environment:'desktop Chrome ANGLE SwiftShader',android:false,physicalDevice:false,displayFpsMeasured:false,gpuOnlyMeasured:false,memoryMeasured:false,sourceCommit,workspaceCommit,previousCommit,capturedAtUtc:new Date().toISOString(),host:{platform:platform(),availableLogicalCpus:availableParallelism(),totalMemoryMiB:Math.floor(totalmem()/1048576),nodeVersion:process.version},protocol,...result,limitations:['Software completion includes RGBA readback, not native GPU/display timings.','Shader/mesh construction and first readiness are single samples; no cold-browser cache control.','One host/run; alternating measured order reduces but does not eliminate host/cache effects.','Ablations deliberately degrade appearance to attribute costs; they are not proposed final visual quality.','No native UI, scroll, TextureView lifecycle, app memory or physical-device acceptance is measured.']};
await writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output:path.relative(repo,output),sourceCommit,environment:report.environment,results:report.results.map(({id,stats,createRendererMs,firstReadyMs,uploadBytes})=>({id,stats,createRendererMs,firstReadyMs,uploadBytes}))}));
