import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {metalMaterial} from '../lib/metal-materials.ts';
import {createGoldBarMesh,goldBarMatrices,GOLD_VERTEX_SHADER,GOLD_FRAGMENT_SHADER} from '../lib/gold-bar-3d.ts';

const codes=['XAU','XAG','XPT','XPD'];
test('cuatro materiales DEMO identificados; metales blancos no se distinguen por azul o violeta',()=>{
  assert.deepEqual(codes.map(code=>{const m=metalMaterial(code);return [m.symbol,m.label];}),[['Au','Oro'],['Ag','Plata'],['Pt','Platino'],['Pd','Paladio']]);
  for(const code of codes){
    const material=metalMaterial(code);
    assert.equal(material.reflectance.length,3);
    assert.ok(material.reflectance.every(value=>Number.isFinite(value)&&value>0&&value<=1));
    assert.ok(material.roughness>=.08&&material.roughness<=.8);
    if(code!=='XAU')assert.ok(Math.max(...material.reflectance)-Math.min(...material.reflectance)<.025,'White metals remain neutral, not metal-specific colored paint.');
  }
  const [r,g,b]=metalMaterial('XAU').reflectance;assert.ok(r>g&&g>b*1.5);
});

test('selección de material no modifica otro preset y un código desconocido no se convierte en oro',()=>{
  const first=metalMaterial('XPT');first.reflectance[0]=0;first.label='alterado';first.roughness=1;
  const second=metalMaterial('XPT');assert.ok(second.reflectance[0]>0);assert.equal(second.label,'Platino');assert.ok(second.roughness<1);
  for(const value of ['',null,undefined,'SILVER','__proto__','constructor'])assert.throws(()=>metalMaterial(value),/Metal de demostración/);
});

// Opt-in software rasterization of the actual shader. It checks uniforms,
// material identity and the incision under identical lighting, not Android FPS.
test('shader real mantiene cuatro materiales y cuatro grabados distintos en un único contexto',{
  skip:!process.env.OPENMINERALS_WEBGL_BROWSER,timeout:60000,
},async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'openminerals-metal-gl-'));
  try{
    const mesh=createGoldBarMesh(),width=360,height=480;
    const pose={yaw:-.15,pitch:1.1,roll:0,distance:3.5,lift:0,refinement:1,light:[-3,4,3]};
    const matrices=goldBarMatrices(pose,width/height),gold=metalMaterial('XAU');
    const frames=[
      ...codes.map((code,kind)=>({name:code,kind,material:metalMaterial(code)})),
      ...codes.map((code,kind)=>({name:'grabado '+metalMaterial(code).symbol,kind,material:gold})),
      ...[.12,.6].map(roughness=>({name:'acabado '+roughness,kind:0,material:{...gold,roughness}})),
    ];
    const data={width,height,positions:[...mesh.positions],normals:[...mesh.normals],count:mesh.vertexCount,vertex:GOLD_VERTEX_SHADER,fragment:GOLD_FRAGMENT_SHADER,frames,pose,model:[...matrices.model],mvp:[...matrices.mvp],camera:matrices.camera};
    const html=`<!doctype html><html><meta charset="utf-8"><style>body{margin:16px;background:#0a0d10;color:#ddd4bf;font:12px Arial}#frames{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}figure{margin:0}img{width:100%;display:block}pre{font-size:10px;white-space:pre-wrap}</style><h1>Materiales DEMO / WebGL de software</h1><div id="frames"></div><pre id="result"></pre><script>
const data=${JSON.stringify(data)};
try{
 const canvas=document.createElement('canvas');canvas.width=data.width;canvas.height=data.height;
 const gl=canvas.getContext('webgl',{preserveDrawingBuffer:true,antialias:false,alpha:true});if(!gl)throw Error('WebGL unavailable');
 const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
 const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,data.vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,data.fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
 for(const [name,values] of [['a_position',data.positions],['a_normal',data.normals]]){const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(values),gl.STATIC_DRAW);const at=gl.getAttribLocation(program,name);if(at<0)throw Error('Missing '+name);gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,3,gl.FLOAT,false,0,0);}
 const uniform=name=>{const value=gl.getUniformLocation(program,'u_'+name);if(value===null)throw Error('Missing active uniform '+name);return value;};
 const u=Object.fromEntries(['model','mvp','camera','light','refinement','surface','shadowAngle','metalColor','roughness','metalKind'].map(name=>[name,uniform(name)]));
 gl.viewport(0,0,data.width,data.height);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.frontFace(gl.CCW);gl.clearColor(0,0,0,0);gl.clearDepth(1);
 gl.uniformMatrix4fv(u.model,false,new Float32Array(data.model));gl.uniformMatrix4fv(u.mvp,false,new Float32Array(data.mvp));gl.uniform3f(u.camera,...data.camera);gl.uniform3f(u.light,...data.pose.light);gl.uniform1f(u.refinement,1);gl.uniform1f(u.surface,0);gl.uniform1f(u.shadowAngle,data.pose.yaw);
 const results=[];
 for(const frame of data.frames){
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniform3f(u.metalColor,...frame.material.reflectance);gl.uniform1f(u.roughness,frame.material.roughness);gl.uniform1f(u.metalKind,frame.kind);gl.drawArrays(gl.TRIANGLES,0,data.count);gl.finish();
  const pixels=new Uint8Array(data.width*data.height*4);gl.readPixels(0,0,data.width,data.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);if(gl.getError()!==gl.NO_ERROR)throw Error('Metal rasterization failed');
  let visible=0,hash=2166136261,r=0,g=0,b=0;
  for(let i=0;i<pixels.length;i+=4){if(pixels[i+3]){visible++;r+=pixels[i];g+=pixels[i+1];b+=pixels[i+2];}for(let c=0;c<4;c++)hash=Math.imul(hash^pixels[i+c],16777619);}
  results.push({name:frame.name,visible,hash:hash>>>0,mean:[r/visible,g/visible,b/visible]});
  const tile=document.createElement('figure'),image=document.createElement('img'),caption=document.createElement('figcaption');image.src=canvas.toDataURL('image/png');caption.textContent=frame.name;tile.append(image,caption);document.getElementById('frames').append(tile);
 }
 document.getElementById('result').textContent=JSON.stringify({ok:true,contexts:1,frames:results});
}catch(error){document.getElementById('result').textContent=JSON.stringify({ok:false,error:String(error)});}
</script></html>`;
    const file=path.join(directory,'materials.html');await writeFile(file,html);
    const args=['--headless=new','--no-first-run','--no-default-browser-check','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',`--user-data-dir=${path.join(directory,'profile')}`,'--window-size=1400,1150','--dump-dom'];
    if(process.env.OPENMINERALS_METAL_SCREENSHOT)args.push(`--screenshot=${path.resolve(process.env.OPENMINERALS_METAL_SCREENSHOT)}`);
    args.push(pathToFileURL(file).href);
    const {stdout}=await promisify(execFile)(process.env.OPENMINERALS_WEBGL_BROWSER,args,{windowsHide:true,timeout:45000,maxBuffer:4*1024*1024});
    const match=stdout.match(/<pre id="result">([^<]*)<\/pre>/);assert.ok(match,'Software material report unavailable.');
    const result=JSON.parse(match[1]);assert.equal(result.ok,true,result.error);assert.equal(result.contexts,1);assert.equal(result.frames.length,10);
    for(const frame of result.frames)assert.ok(frame.visible>3000&&frame.visible<width*height*.95,'Visible bounded material: '+frame.name);
    assert.equal(new Set(result.frames.slice(0,4).map(frame=>frame.hash)).size,4);
    assert.equal(new Set(result.frames.slice(4,8).map(frame=>frame.hash)).size,4,'Symbols differ even with identical color and finish.');
    assert.notEqual(result.frames[8].hash,result.frames[9].hash,'Roughness changes the actual reflection.');
    assert.ok(result.frames[0].mean[0]>result.frames[0].mean[2]*1.15,'Gold retains warm spectral contrast.');
    for(const frame of result.frames.slice(1,4))assert.ok(Math.max(...frame.mean)-Math.min(...frame.mean)<25,'White metals stay neutral under the shared studio: '+frame.name);
  }finally{
    const resolved=path.resolve(directory);assert.equal(path.dirname(resolved),path.resolve(tmpdir()));assert.ok(path.basename(resolved).startsWith('openminerals-metal-gl-'));
    await rm(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
});
