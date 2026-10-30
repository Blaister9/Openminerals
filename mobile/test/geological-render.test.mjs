import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

// The actual two-pass ExpoGL renderer is compiled for an isolated software GL
// context. This checks images/resources, not Android or physical GPU speed.
test('mina y cuatro metales: renderer compuesto rasteriza, revierte y libera recursos',{
 skip:!process.env.OPENMINERALS_WEBGL_BROWSER,timeout:90000,
},async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'openminerals-geological-gl-'));
 try{
  const require=createRequire(import.meta.url),{transformSync}=require('@babel/core');
  const files=['gold-bar-3d','immersive-story','geological-scene','geological-specimen','metal-materials','scene-renderer'];
  const modules=[];
  for(const name of files){const source=await readFile(new URL('../lib/'+name+'.ts',import.meta.url),'utf8');const output=transformSync(source,{filename:name+'.ts',babelrc:false,configFile:false,plugins:[require.resolve('@babel/plugin-transform-typescript'),require.resolve('@babel/plugin-transform-modules-commonjs')]}).code;modules.push(JSON.stringify('./'+name+'.ts')+':function(require,module,exports){'+output+'}');}
  const script=`const modules={${modules.join(',')}},cache={};function require(id){if(cache[id])return cache[id].exports;const module={exports:{}};cache[id]=module;modules[id](require,module,module.exports);return module.exports;}
  const canvas=document.createElement('canvas');canvas.width=360;canvas.height=640;const gl=canvas.getContext('webgl',{preserveDrawingBuffer:true,antialias:false});if(!gl)throw Error('WebGL unavailable');gl.endFrameEXP=()=>gl.finish();
  const resources={buffers:0,shaders:0,programs:0};for(const [create,del,key] of [['createBuffer','deleteBuffer','buffers'],['createShader','deleteShader','shaders'],['createProgram','deleteProgram','programs']]){const a=gl[create].bind(gl),b=gl[del].bind(gl);gl[create]=(...args)=>{const item=a(...args);if(item)resources[key]++;return item;};gl[del]=item=>{if(item)resources[key]--;return b(item);};}
  const {createStoryRenderer}=require('./scene-renderer.ts'),renderer=createStoryRenderer(gl,true),frames=[];
  const poses=[...Array.from({length:13},(_,i)=>({progress:i/12,metal:'XAU'})),{progress:.5,metal:'XAU'},{progress:0,metal:'XAU'},...['XAG','XPT','XPD'].map(metal=>({progress:5/6,metal}))];
  for(const pose of poses){renderer.draw(pose.progress,0,pose.metal);gl.finish();const pixels=new Uint8Array(360*640*4);gl.readPixels(0,0,360,640,gl.RGBA,gl.UNSIGNED_BYTE,pixels);if(gl.getError()!==gl.NO_ERROR)throw Error('GL draw failed');let hash=2166136261,colored=0,warm=0;for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]!==255)throw Error('Composed scene must remain opaque through fades and dust');if(Math.abs(pixels[i]-10)+Math.abs(pixels[i+1]-13)+Math.abs(pixels[i+2]-16)>25)colored++;if(pixels[i]>pixels[i+1]*1.08&&pixels[i+1]>pixels[i+2]*1.12&&pixels[i]>60)warm++;for(let c=0;c<3;c++)hash=Math.imul(hash^pixels[i+c],16777619);}const image=canvas.toDataURL('image/png');frames.push({...pose,hash:hash>>>0,colored,warm,image});if(frames.length<=13||frames.length>15){const figure=document.createElement('figure');figure.innerHTML='<img src="'+image+'"><figcaption>'+pose.metal+' · '+pose.progress.toFixed(3)+'</figcaption>';document.querySelector('#frames').append(figure);}}
  renderer.dispose();renderer.dispose();document.querySelector('#result').textContent=JSON.stringify({ok:true,frames,resources});`;
  const html='<!doctype html><meta charset="utf-8"><style>body{background:#0a0d10;color:#dbc28e;font:14px Arial}#frames{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}figure{margin:0}img{width:100%;display:block}figcaption{padding:6px}pre{display:none}</style><h1>Mina y metales DEMO · render de software</h1><div id="frames"></div><pre id="result"></pre><script>try{'+script+'}catch(e){document.querySelector("#result").textContent=JSON.stringify({ok:false,error:String(e)})}</script>';
  const file=path.join(directory,'geology.html');await writeFile(file,html);
  const args=['--headless=new','--no-first-run','--no-default-browser-check','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--user-data-dir='+path.join(directory,'profile'),'--window-size=1440,3000','--dump-dom'];
  if(process.env.OPENMINERALS_GEOLOGY_SHEET)args.push('--screenshot='+path.resolve(process.env.OPENMINERALS_GEOLOGY_SHEET));args.push(pathToFileURL(file).href);
  const {stdout}=await promisify(execFile)(process.env.OPENMINERALS_WEBGL_BROWSER,args,{windowsHide:true,timeout:75000,maxBuffer:25*1024*1024});
  const match=stdout.match(/<pre id="result">([^<]*)<\/pre>/);assert.ok(match);const result=JSON.parse(match[1]);assert.equal(result.ok,true,result.error);assert.equal(result.frames.length,18);
  const output=process.env.OPENMINERALS_GEOLOGY_RASTER_DIR;
  if(output){await mkdir(output,{recursive:true});for(let i=0;i<result.frames.length;i++)await writeFile(path.join(output,'pose-'+i+'.png'),Buffer.from(result.frames[i].image.split(',')[1],'base64'));await writeFile(path.join(output,'report.json'),JSON.stringify({environment:'desktop SwiftShader',android:false,...result,frames:result.frames.map(({image,...frame})=>frame)},null,2));}
  for(const frame of result.frames)assert.ok(frame.colored>4000,'Scene must remain visible at '+frame.progress);
  assert.equal(new Set(result.frames.slice(0,13).map(frame=>frame.hash)).size,13);
  assert.equal(result.frames[13].hash,result.frames[6].hash);assert.equal(result.frames[14].hash,result.frames[0].hash);
  assert.equal(new Set([result.frames[10],...result.frames.slice(15)].map(frame=>frame.hash)).size,4,'All four engravings/materials must differ.');
  assert.ok(result.frames[10].warm>result.frames[15].warm+100,'Gold must differ from neutral silver.');
  assert.deepEqual(result.resources,{buffers:0,shaders:0,programs:0});
 }finally{const resolved=path.resolve(directory);assert.equal(path.dirname(resolved),path.resolve(tmpdir()));assert.ok(path.basename(resolved).startsWith('openminerals-geological-gl-'));await rm(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
});
