import test from 'node:test';
import assert from 'node:assert/strict';
import {createGoldBarMesh,createStudioFloorMesh,identityMatrix,multiplyMatrices,translationMatrix,rotationX,rotationY,rotationZ,perspectiveMatrix,transformPoint,scrollProgress,storyStage,goldRenderScale,horizontalDrag,goldBarPose,goldBarMatrices,createFrameScheduler,GOLD_VERTEX_SHADER,GOLD_FRAGMENT_SHADER} from '../lib/gold-bar-3d.ts';
import {metalStoryScenes} from '../lib/story-scenes.ts';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const close=(actual,expected,epsilon=1e-5)=>assert.ok(Math.abs(actual-expected)<epsilon,`Expected ${actual} near ${expected}`);
const sub=(a,b)=>a.map((value,i)=>value-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((sum,value,i)=>sum+value*b[i],0);

test('lingote redondeado tiene 400 triángulos cerrados, volumen y normales suaves exteriores unitarias',()=>{
  const mesh=createGoldBarMesh();
  assert.equal(mesh.triangleCount,400);assert.equal(mesh.vertexCount,1200);assert.equal(mesh.normals.length,mesh.positions.length);
  const point=index=>Array.from(mesh.positions.slice(index,index+3)),key=p=>p.map(value=>value.toFixed(6)).join(','),vertices=new Set(),edges=new Map();
  let volume=0;
  for(let i=0;i<mesh.positions.length;i+=9){
    const triangle=[point(i),point(i+3),point(i+6)],normal=Array.from(mesh.normals.slice(i,i+3));
    triangle.forEach(p=>{assert.ok(p.every(Number.isFinite));assert.ok(Math.abs(p[0])<=1.400001&&Math.abs(p[1])<=.240001&&Math.abs(p[2])<=.675001);vertices.add(key(p));});
    const geometric=cross(sub(triangle[1],triangle[0]),sub(triangle[2],triangle[0]));
    assert.ok(Math.hypot(...geometric)>1e-6);
    for(let j=0;j<3;j++){const n=Array.from(mesh.normals.slice(i+j*3,i+j*3+3));close(Math.hypot(...n),1);assert.ok(dot(n,geometric)>0);assert.ok(dot(n,triangle[j])>0);}
    volume+=dot(triangle[0],cross(triangle[1],triangle[2]))/6;
    for(let j=0;j<3;j++){const edge=[key(triangle[j]),key(triangle[(j+1)%3])].sort().join('|');edges.set(edge,(edges.get(edge)||0)+1);}
  }
  assert.ok(volume>1&&volume<2.8*1.35*.48);
  assert.ok([...edges.values()].every(count=>count===2));assert.equal(vertices.size-edges.size+mesh.triangleCount,2);
  assert.equal(new Set([...mesh.positions].filter((_,i)=>i%3===1)).size,10,'Curved bevels retain ten profile rings.');
});

test('suelo de estudio conserva normales superiores y dos triángulos sin añadir un contexto',()=>{
  const floor=createStudioFloorMesh();assert.equal(floor.vertexCount,6);assert.equal(floor.triangleCount,2);
  for(let i=0;i<floor.positions.length;i+=9){const p=Array.from(floor.positions.slice(i,i+9));assert.ok(cross(sub(p.slice(3,6),p.slice(0,3)),sub(p.slice(6,9),p.slice(0,3)))[1]>0);}
  for(let i=0;i<floor.normals.length;i+=3)assert.deepEqual(Array.from(floor.normals.slice(i,i+3)),[0,1,0]);
});

test('geometría rechaza dimensiones degeneradas antes de enviar buffers a GL',()=>{
  for(const args of [[0,1,1,.1],[2,1,1,0],[2,1,.1,.1],[NaN,1,1,.1],[2,Infinity,1,.1],[-2,1,1,.1]])assert.throws(()=>createGoldBarMesh(...args));
});

test('matrices usan composición column-major y rotaciones tridimensionales correctas',()=>{
  const identity=identityMatrix(),translation=translationMatrix(2,3,4);
  assert.deepEqual([...multiplyMatrices(identity,translation)],[...translation]);
  assert.deepEqual(transformPoint(translation,[1,2,3]),[3,5,7,1]);
  const rx=transformPoint(rotationX(Math.PI/2),[0,1,0]),ry=transformPoint(rotationY(Math.PI/2),[1,0,0]),rz=transformPoint(rotationZ(Math.PI/2),[1,0,0]);
  close(rx[1],0);close(rx[2],1);close(ry[0],0);close(ry[2],-1);close(rz[0],0);close(rz[1],1);
  const composed=transformPoint(multiplyMatrices(translation,rotationZ(Math.PI/2)),[1,0,0]);
  close(composed[0],2);close(composed[1],4);close(composed[2],4);
});

test('proyección mantiene profundidad y encuadre; el plano macro recorta intencionalmente el borde sin perder el sello',()=>{
  const projection=perspectiveMatrix(Math.PI/2,1,1,10);
  const near=transformPoint(projection,[0,0,-1]),far=transformPoint(projection,[0,0,-10]);
  close(near[2]/near[3],-1);close(far[2]/far[3],1);
  assert.throws(()=>perspectiveMatrix(Math.PI/2,0));assert.throws(()=>perspectiveMatrix(Math.PI,1));
  const mesh=createGoldBarMesh();
  for(const progress of [0,.25,.5,.75,1])for(const aspect of [.65,1,1.3,2]){
    const {mvp,camera,floorMvp}=goldBarMatrices(goldBarPose(progress),aspect);
    assert.ok(camera[1]>0&&camera[2]>0&&[...floorMvp].every(Number.isFinite));
    for(let i=0;i<mesh.positions.length;i+=3){const p=transformPoint(mvp,[mesh.positions[i],mesh.positions[i+1],mesh.positions[i+2]]);assert.ok(p[3]>0&&Math.abs(p[2]/p[3])<1);if(progress!==.25)assert.ok(Math.abs(p[0]/p[3])<1&&Math.abs(p[1]/p[3])<1);}
    for(const stamp of [[-.46,.24,-.37],[.46,.24,-.37],[-.46,.24,.37],[.46,.24,.37]]){const p=transformPoint(mvp,stamp);assert.ok(Math.abs(p[0]/p[3])<1&&Math.abs(p[1]/p[3])<1);}
  }
});

test('scroll y arrastre producen poses finitas; movimiento reducido es estable',()=>{
  assert.equal(scrollProgress(-100,20,100),0);assert.equal(scrollProgress(60,20,100),.5);assert.equal(scrollProgress(1000,20,100),1);assert.equal(scrollProgress(NaN,20,100),0);assert.equal(scrollProgress(20,20,20),0);
  assert.deepEqual([0,.25,.5,.75,1].map(value=>storyStage(value)),[0,1,2,3,4]);
  assert.equal(horizontalDrag(12,2),true);assert.equal(horizontalDrag(2,20),false);assert.equal(horizontalDrag(12,20),false);assert.equal(horizontalDrag(12,0,2),false);assert.equal(horizontalDrag(NaN,0),false);
  for(const p of [-1,0,.23,.5,.999,1,2,NaN]){
    const pose=goldBarPose(p,Number.POSITIVE_INFINITY);assert.ok([pose.yaw,pose.pitch,pose.roll,pose.distance,pose.lift,pose.refinement,...pose.light].every(Number.isFinite));
    assert.ok(pose.distance>=2.1&&pose.distance<=4.8);
  }
  assert.deepEqual(goldBarPose(0,3,true),goldBarPose(1,-2,true));
  const a=goldBarPose(.5-1e-6),b=goldBarPose(.5+1e-6);close(a.yaw,b.yaw);close(a.distance,b.distance);
});

test('siete capítulos mantienen el orden comercial y un índice válido incluso en extremos',()=>{
  assert.equal(metalStoryScenes.length,7);
  assert.deepEqual(metalStoryScenes.map(item=>item.label),['MINA','LINGOTE','CUSTODIA','COMPRA FRACCIONADA','PORTAFOLIO','MARKETPLACE','ENTREGA FÍSICA · DEMO']);
  assert.deepEqual(metalStoryScenes.map((_,index)=>storyStage(index/6,7)),[0,1,2,3,4,5,6]);
  for(const value of [-1,NaN,0,1,2])assert.ok(storyStage(value,7)>=0&&storyStage(value,7)<=6);
});

test('presupuesto GL limita el lado mayor a 1024 píxeles sin ampliar buffers de pantallas pequeñas',()=>{
  for(const [width,height,density] of [[390,300,3],[430,300,4],[320,160,2],[1000,600,2]]){
    const scale=goldRenderScale(width,height,density);assert.ok(scale>0&&scale<=1);assert.ok(Math.max(width,height)*density*scale<=1024.00001);
  }
  assert.equal(goldRenderScale(320,160,2),1);assert.equal(goldRenderScale(0,0,0),1);
});

test('presupuesto de animación limita a 30 fps y deja de solicitar cuadros cuando no hay cambios',()=>{
  let clock=0,draws=0,id=0;const frames=new Map();
  const scheduler=createFrameScheduler({request:callback=>{frames.set(++id,callback);return id;},cancel:id=>frames.delete(id),draw:()=>draws++,onError:assert.fail,maxFps:30,now:()=>clock});
  const flush=()=>{const queue=[...frames.values()];frames.clear();queue.forEach(callback=>callback());};
  scheduler.invalidate();flush();assert.equal(draws,1);assert.equal(frames.size,0);
  clock=16;scheduler.invalidate();flush();assert.equal(draws,1);assert.equal(frames.size,1);
  clock=34;flush();assert.equal(draws,2);assert.equal(frames.size,0);
  clock=40;scheduler.invalidate();flush();scheduler.setEnabled(false);assert.equal(frames.size,0);scheduler.dispose();
});

function fakeFrames(draw,onError=()=>{}){
  const queue=new Map();let sequence=0,cancellations=0;
  const scheduler=createFrameScheduler({request:callback=>{queue.set(++sequence,callback);return sequence;},cancel:id=>{cancellations++;queue.delete(id);},draw,onError});
  return {scheduler,queue,flush(){const callbacks=[...queue.values()];queue.clear();callbacks.forEach(callback=>callback());},cancellations:()=>cancellations};
}
test('scheduler agrupa cambios y no mantiene animación en reposo, pausa o desmontaje',()=>{
  let draws=0;const f=fakeFrames(()=>draws++);
  for(let i=0;i<100;i++)f.scheduler.invalidate();assert.equal(f.queue.size,1);f.flush();assert.equal(draws,1);assert.equal(f.queue.size,0);
  f.scheduler.invalidate();f.scheduler.setEnabled(false);assert.equal(f.queue.size,0);assert.equal(f.cancellations(),1);
  f.scheduler.invalidate();f.flush();assert.equal(draws,1);f.scheduler.setEnabled(true);f.flush();assert.equal(draws,2);
  f.scheduler.invalidate();f.scheduler.dispose();f.scheduler.invalidate();f.scheduler.setEnabled(true);f.flush();assert.equal(draws,2);assert.equal(f.queue.size,0);
});
test('error GPU detiene el scheduler y permite fallback sin otro dibujo',()=>{
  let failures=0,draws=0;const f=fakeFrames(()=>{draws++;throw new Error('Synthetic GL failure');},()=>failures++);
  f.scheduler.invalidate();f.flush();f.scheduler.invalidate();f.flush();assert.equal(draws,1);assert.equal(failures,1);assert.equal(f.queue.size,0);
});

// Opt in with an explicit local Chromium executable. CI without a browser keeps
// the deterministic geometry/scheduler suite; this is software WebGL, not proof
// of an Android/iOS GPU or of native gestures, AppState or accessibility.
test('shaders compilan y seis vistas producen píxeles diferentes en UN contexto WebGL',{skip:!process.env.OPENMINERALS_WEBGL_BROWSER,timeout:60000},async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'openminerals-gl-'));
  try{
    const mesh=createGoldBarMesh(),floor=createStudioFloorMesh(),width=540,height=360;
    const cases=[0,.25,.5,.75,1].map(progress=>({pose:goldBarPose(progress),name:`Etapa ${storyStage(progress)+1}`}));
    cases.push({pose:goldBarPose(.5,1.1),name:'Arrastre horizontal'});
    const frames=cases.map(item=>{const scene=goldBarMatrices(item.pose,width/height);return {...item,model:[...scene.model],mvp:[...scene.mvp],camera:scene.camera,floorModel:[...scene.floorModel],floorMvp:[...scene.floorMvp]};});
    const data={positions:[...mesh.positions,...floor.positions],normals:[...mesh.normals,...floor.normals],count:mesh.vertexCount,floorCount:floor.vertexCount,vertex:GOLD_VERTEX_SHADER,fragment:GOLD_FRAGMENT_SHADER,frames,width,height};
    const html=`<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}body{margin:32px;background:#090f15;color:#d3b77f;font:13px Arial,sans-serif}header{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:24px;letter-spacing:3px}h1{color:#eee8da;font:32px Georgia,serif;font-weight:400;margin:0}#views{display:grid;grid-template-columns:repeat(2,1fr);gap:20px}.tile{border:1px solid #30363a;border-radius:14px;overflow:hidden;background:#0d151c}.title{padding:14px 18px;font-size:10px;letter-spacing:2px;color:#b9a781;text-transform:uppercase}img{width:100%;display:block}#results{font-size:10px;white-space:pre-wrap;color:#8a959b}</style></head><body><header><h1>Openminerals / Estudio del oro</h1><span>DEMO · WEBGL SOFTWARE</span></header><div id="views"></div><pre id="results"></pre><script>
const data=${JSON.stringify(data)};
try{
  const canvas=document.createElement('canvas');canvas.width=data.width;canvas.height=data.height;
  const gl=canvas.getContext('webgl',{preserveDrawingBuffer:true,antialias:false});if(!gl)throw Error('WebGL unavailable');
  function compile(type,source){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;}
  const program=gl.createProgram();gl.attachShader(program,compile(gl.VERTEX_SHADER,data.vertex));gl.attachShader(program,compile(gl.FRAGMENT_SHADER,data.fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
  function attribute(name,values){const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(values),gl.STATIC_DRAW);const at=gl.getAttribLocation(program,name);if(at<0)throw Error('Missing attribute');gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,3,gl.FLOAT,false,0,0);}
  attribute('a_position',data.positions);attribute('a_normal',data.normals);
  const at=name=>{const result=gl.getUniformLocation(program,name);if(result===null)throw Error('Missing uniform');return result;};
  const uniforms={model:at('u_model'),mvp:at('u_mvp'),camera:at('u_camera'),light:at('u_light'),refinement:at('u_refinement'),surface:at('u_surface'),shadowAngle:at('u_shadowAngle')};
  gl.viewport(0,0,data.width,data.height);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.frontFace(gl.CCW);gl.clearColor(10/255,13/255,16/255,1);gl.clearDepth(1);
  const results=[];
  for(const frame of data.frames){
    gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniform3f(uniforms.camera,...frame.camera);gl.uniform3f(uniforms.light,...frame.pose.light);gl.uniform1f(uniforms.refinement,frame.pose.refinement);gl.uniform1f(uniforms.shadowAngle,frame.pose.yaw);
    gl.uniform1f(uniforms.surface,1);gl.uniformMatrix4fv(uniforms.model,false,new Float32Array(frame.floorModel));gl.uniformMatrix4fv(uniforms.mvp,false,new Float32Array(frame.floorMvp));gl.drawArrays(gl.TRIANGLES,data.count,data.floorCount);
    gl.uniform1f(uniforms.surface,0);gl.uniformMatrix4fv(uniforms.model,false,new Float32Array(frame.model));gl.uniformMatrix4fv(uniforms.mvp,false,new Float32Array(frame.mvp));gl.drawArrays(gl.TRIANGLES,0,data.count);gl.finish();
    const pixels=new Uint8Array(data.width*data.height*4);gl.readPixels(0,0,data.width,data.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);if(gl.getError()!==gl.NO_ERROR)throw Error('WebGL draw error');
    let colored=0,gold=0,highlights=0,darkGold=0,hash=2166136261;
    for(let i=0;i<pixels.length;i+=4){if(Math.abs(pixels[i]-9)+Math.abs(pixels[i+1]-19)+Math.abs(pixels[i+2]-28)>10)colored++;if(pixels[i]>pixels[i+1]*1.035&&pixels[i+1]>pixels[i+2]*1.08&&pixels[i]>55){gold++;if(pixels[i]>210)highlights++;if(pixels[i]<150)darkGold++;}hash=Math.imul(hash^pixels[i],16777619);hash=Math.imul(hash^pixels[i+1],16777619);hash=Math.imul(hash^pixels[i+2],16777619);}
    results.push({colored,gold,highlights,darkGold,hash:hash>>>0});const tile=document.createElement('div'),title=document.createElement('div'),image=document.createElement('img');tile.className='tile';title.className='title';title.textContent=frame.name;image.src=canvas.toDataURL('image/png');tile.append(title,image);document.getElementById('views').append(tile);
  }
  document.getElementById('results').textContent=JSON.stringify({ok:true,contexts:1,frames:results});
}catch(error){document.getElementById('results').textContent=JSON.stringify({ok:false,error:String(error)});}
</script></body></html>`;
    const file=path.join(directory,'render.html');await writeFile(file,html,'utf8');
    const args=['--headless=new','--no-first-run','--no-default-browser-check','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',`--user-data-dir=${path.join(directory,'browser-profile')}`,'--window-size=1200,1420','--dump-dom'];
    if(process.env.OPENMINERALS_WEBGL_SCREENSHOT)args.push(`--screenshot=${path.resolve(process.env.OPENMINERALS_WEBGL_SCREENSHOT)}`);
    args.push(pathToFileURL(file).href);
    const {stdout}=await promisify(execFile)(process.env.OPENMINERALS_WEBGL_BROWSER,args,{windowsHide:true,timeout:45000,maxBuffer:4*1024*1024});
    const match=stdout.match(/<pre id="results">([^<]*)<\/pre>/);assert.ok(match,'Browser must return its WebGL results.');
    const result=JSON.parse(match[1]);assert.equal(result.ok,true,result.error);assert.equal(result.contexts,1);assert.equal(result.frames.length,6);
    for(const frame of result.frames){assert.ok(frame.gold>3000&&frame.gold<width*height*.90);assert.ok(frame.highlights>50&&frame.darkGold>50,'Gold keeps both luminous reflections and darker metallic detail.');}
    assert.ok(result.frames[1].gold>result.frames[0].gold*1.8,'The macro shot must be visibly closer than the establishing shot.');
    assert.equal(new Set(result.frames.map(frame=>frame.hash)).size,6,'Camera, light and drag changes must visibly alter the rasterization.');
  }finally{
    const resolved=path.resolve(directory);
    assert.equal(path.dirname(resolved),path.resolve(tmpdir()));assert.ok(path.basename(resolved).startsWith('openminerals-gl-'));
    await rm(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
});
