import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createGoldBarMesh,createStudioFloorMesh} from '../lib/gold-bar-3d.ts';
import {immersivePose,immersiveMatrices,IMMERSIVE_VERTEX_SHADER,IMMERSIVE_FRAGMENT_SHADER} from '../lib/immersive-story.ts';

// Explicit opt-in: this compiles the actual cinematic shaders and checks their
// rasterization. Software WebGL is not evidence of Android GPU performance.
test('shader inmersivo real: etapas intermedias y reversión producen píxeles válidos en un contexto',{
  skip:!process.env.OPENMINERALS_WEBGL_BROWSER,timeout:60000,
},async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'openminerals-immersive-gl-'));
  try{
    const mesh=createGoldBarMesh(),floor=createStudioFloorMesh(),width=360,height=640;
    const progress=[0,1/12,1/6,1/4,1/3,5/12,.5,7/12,2/3,.75,5/6,11/12,1,.5,0];
    const frames=progress.map(value=>{
      const pose=immersivePose(value),matrices=immersiveMatrices(pose,width/height,value);
      return {progress:value,pose,model:[...matrices.model],mvp:[...matrices.mvp],camera:matrices.camera,floorModel:[...matrices.floorModel],floorMvp:[...matrices.floorMvp]};
    });
    const data={width,height,positions:[...mesh.positions,...floor.positions],normals:[...mesh.normals,...floor.normals],count:mesh.vertexCount,floorCount:floor.vertexCount,vertex:IMMERSIVE_VERTEX_SHADER,fragment:IMMERSIVE_FRAGMENT_SHADER,frames};
    const html=`<!doctype html><html><meta charset="utf-8"><style>body{background:#0a0d10;color:#dbc28e;font:12px Arial;margin:20px}h1{font:26px Georgia}#frames{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}figure{margin:0;border:1px solid #334139}img{display:block;width:100%}figcaption{padding:10px}pre{white-space:pre-wrap;font-size:9px}</style><h1>Openminerals · continuidad de escena</h1><p>Prueba de shaders propios / WebGL de software · no es una medición Android.</p><div id="frames"></div><pre id="result"></pre><script>
const data=${JSON.stringify(data)};
try{
 const canvas=document.createElement('canvas');canvas.width=data.width;canvas.height=data.height;
 const gl=canvas.getContext('webgl',{preserveDrawingBuffer:true,antialias:false});if(!gl)throw Error('WebGL unavailable');
 const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
 const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,data.vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,data.fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
 for(const [name,values] of [['a_position',data.positions],['a_normal',data.normals]]){const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(values),gl.STATIC_DRAW);const at=gl.getAttribLocation(program,name);if(at<0)throw Error('Missing attribute');gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,3,gl.FLOAT,false,0,0);}
 const uniform=name=>{const at=gl.getUniformLocation(program,name);if(at===null)throw Error('Missing '+name);return at;};
 const u=Object.fromEntries(['model','mvp','camera','light','refinement','surface','shadowAngle','storyProgress','subjectOpacity','extractionScale','metalColor','roughness','metalKind'].map(name=>[name,uniform('u_'+name)]));
 gl.uniform1f(u.subjectOpacity,1);gl.uniform1f(u.extractionScale,1);gl.uniform3f(u.metalColor,.98,.77,.35);gl.uniform1f(u.roughness,.24);gl.uniform1f(u.metalKind,0);
 gl.viewport(0,0,data.width,data.height);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.frontFace(gl.CCW);gl.clearColor(10/255,13/255,16/255,1);gl.clearDepth(1);
 const results=[];
 for(const frame of data.frames){
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniform1f(u.storyProgress,frame.progress);gl.uniform3f(u.camera,...frame.camera);gl.uniform3f(u.light,...frame.pose.light);gl.uniform1f(u.refinement,frame.pose.refinement);gl.uniform1f(u.shadowAngle,frame.pose.yaw);
  gl.uniform1f(u.surface,1);gl.uniformMatrix4fv(u.model,false,new Float32Array(frame.floorModel));gl.uniformMatrix4fv(u.mvp,false,new Float32Array(frame.floorMvp));gl.drawArrays(gl.TRIANGLES,data.count,data.floorCount);
  gl.uniform1f(u.surface,0);gl.uniformMatrix4fv(u.model,false,new Float32Array(frame.model));gl.uniformMatrix4fv(u.mvp,false,new Float32Array(frame.mvp));gl.drawArrays(gl.TRIANGLES,0,data.count);gl.finish();
  const pixels=new Uint8Array(data.width*data.height*4);gl.readPixels(0,0,data.width,data.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);if(gl.getError()!==gl.NO_ERROR)throw Error('Rasterization failed');
  let gold=0,colored=0,hash=2166136261;for(let i=0;i<pixels.length;i+=4){if(Math.abs(pixels[i]-10)+Math.abs(pixels[i+1]-13)+Math.abs(pixels[i+2]-16)>20)colored++;if(pixels[i]>pixels[i+1]*1.035&&pixels[i+1]>pixels[i+2]*1.08&&pixels[i]>55)gold++;for(let c=0;c<3;c++)hash=Math.imul(hash^pixels[i+c],16777619);}
  const screenshot=canvas.toDataURL('image/png');
  // A close overhead camera may legitimately fill the background with the
  // studio floor. Measure the actual metal geometry separately from that floor.
  gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,data.count);gl.finish();
  const mask=new Uint8Array(pixels.length);gl.readPixels(0,0,data.width,data.height,gl.RGBA,gl.UNSIGNED_BYTE,mask);if(gl.getError()!==gl.NO_ERROR)throw Error('Geometry mask failed');
  let geometryPixels=0;for(let i=3;i<mask.length;i+=4)if(mask[i]>0)geometryPixels++;
  gl.clearColor(10/255,13/255,16/255,1);
  results.push({progress:frame.progress,gold,colored,geometryPixels,hash:hash>>>0});
  if(results.length<=13){const tile=document.createElement('figure'),image=document.createElement('img'),caption=document.createElement('figcaption');image.src=screenshot;caption.textContent='Progreso '+frame.progress.toFixed(3);tile.append(image,caption);document.getElementById('frames').append(tile);}
 }
 document.getElementById('result').textContent=JSON.stringify({ok:true,contexts:1,frames:results});
}catch(error){document.getElementById('result').textContent=JSON.stringify({ok:false,error:String(error)});}
</script></html>`;
    const file=path.join(directory,'immersive.html');await writeFile(file,html);
    const args=['--headless=new','--no-first-run','--no-default-browser-check','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',`--user-data-dir=${path.join(directory,'profile')}`,'--window-size=1200,1800','--dump-dom'];
    if(process.env.OPENMINERALS_IMMERSIVE_GL_SCREENSHOT)args.push(`--screenshot=${path.resolve(process.env.OPENMINERALS_IMMERSIVE_GL_SCREENSHOT)}`);
    args.push(pathToFileURL(file).href);
    const {stdout}=await promisify(execFile)(process.env.OPENMINERALS_WEBGL_BROWSER,args,{windowsHide:true,timeout:45000,maxBuffer:4*1024*1024});
    const match=stdout.match(/<pre id="result">([^<]*)<\/pre>/);assert.ok(match,'Software renderer must return its bounded report.');
    const result=JSON.parse(match[1]);assert.equal(result.ok,true,result.error);assert.equal(result.contexts,1);assert.equal(result.frames.length,15);
    if(process.env.OPENMINERALS_IMMERSIVE_GL_REPORT)await writeFile(path.resolve(process.env.OPENMINERALS_IMMERSIVE_GL_REPORT),JSON.stringify({environment:'desktop software WebGL',android:false,...result},null,2)+'\n');
    for(const frame of result.frames)assert.ok(frame.colored>1000&&frame.geometryPixels>1000&&frame.geometryPixels<width*height,'The material must remain visible and bounded at progress '+frame.progress+'; geometryPixels='+frame.geometryPixels+'.');
    assert.equal(new Set(result.frames.slice(0,13).map(frame=>frame.hash)).size,13,'Intermediate scroll values must visibly change the scene.');
    assert.equal(result.frames[13].hash,result.frames[6].hash,'Reverse scroll restores the same mid-scene rasterization.');
    assert.equal(result.frames[14].hash,result.frames[0].hash,'Reverse scroll restores the original mineral.');
    assert.ok(result.frames[6].gold>result.frames[0].gold+500,'Refining the mineral creates a visibly metallic surface.');
  }finally{
    const resolved=path.resolve(directory);assert.equal(path.dirname(resolved),path.resolve(tmpdir()));assert.ok(path.basename(resolved).startsWith('openminerals-immersive-gl-'));
    await rm(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
});
