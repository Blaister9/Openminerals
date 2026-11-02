import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createMineSceneMesh,mineSceneCamera,mineSceneVisibility,MINE_VERTEX_SHADER,MINE_FRAGMENT_SHADER} from '../lib/geological-scene.ts';

// Compiles the shipped shader pair and exercises the actual inward-culling
// geometry. Desktop software rasterization does not measure Android fluency.
test('túnel GL real: profundidad, materiales y polvo reversibles en un único contexto',{
  skip:!process.env.OPENMINERALS_WEBGL_BROWSER,timeout:60000,
},async()=>{
  const directory=await mkdtemp(path.join(tmpdir(),'openminerals-geology-gl-'));
  try{
    const mesh=createMineSceneMesh(),width=360,height=640;
    const progress=[0,.04,.08,.12,.16,.22,.28,.34,.4,.12,0];
    const frames=progress.map(p=>{const {vp,camera}=mineSceneCamera(p,width/height);return {progress:p,vp:[...vp],camera,opacity:mineSceneVisibility(p)};});
    const data={width,height,positions:[...mesh.positions],normals:[...mesh.normals],materials:[...mesh.materials],count:mesh.vertexCount,triangles:mesh.triangleCount,vertex:MINE_VERTEX_SHADER,fragment:MINE_FRAGMENT_SHADER,frames};
    const html=`<!doctype html><html><meta charset="utf-8"><style>body{background:#0a0d10;color:#bfb29b;font:12px Arial;margin:20px}h1{font:24px Georgia}#frames{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}figure{margin:0}img{display:block;width:100%}figcaption{padding:9px}pre{white-space:pre-wrap;font-size:10px}</style><h1>Geología ficticia DEMO · prueba WebGL de software</h1><p>Compilación y reversibilidad de shaders reales; no mide rendimiento Android.</p><div id="frames"></div><pre id="result"></pre><script>
const data=${JSON.stringify(data)};
try{
 const canvas=document.createElement('canvas');canvas.width=data.width;canvas.height=data.height;
 const gl=canvas.getContext('webgl',{preserveDrawingBuffer:true,antialias:false});if(!gl)throw Error('WebGL unavailable');
 const shader=(type,source)=>{const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));return s;};
 const program=gl.createProgram();gl.attachShader(program,shader(gl.VERTEX_SHADER,data.vertex));gl.attachShader(program,shader(gl.FRAGMENT_SHADER,data.fragment));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(program));gl.useProgram(program);
 for(const [name,values,size] of [['a_position',data.positions,3],['a_normal',data.normals,3],['a_material',data.materials,1]]){const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(values),gl.STATIC_DRAW);const at=gl.getAttribLocation(program,name);if(at<0)throw Error('Missing '+name);gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,size,gl.FLOAT,false,0,0);}
 const uniform=name=>{const at=gl.getUniformLocation(program,name);if(at===null)throw Error('Missing '+name);return at;};
 const u=Object.fromEntries(['vp','progress','camera','opacity'].map(name=>[name,uniform('u_'+name)]));
 gl.viewport(0,0,data.width,data.height);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.frontFace(gl.CCW);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.clearColor(10/255,13/255,16/255,1);gl.clearDepth(1);
 const results=[];
 for(const frame of data.frames){
  gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.uniformMatrix4fv(u.vp,false,new Float32Array(frame.vp));gl.uniform1f(u.progress,frame.progress);gl.uniform3f(u.camera,...frame.camera);gl.uniform1f(u.opacity,frame.opacity);gl.drawArrays(gl.TRIANGLES,0,data.count);gl.finish();
  const pixels=new Uint8Array(data.width*data.height*4);gl.readPixels(0,0,data.width,data.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);if(gl.getError()!==gl.NO_ERROR)throw Error('Rasterization failed');
  let colored=0,warm=0,bright=0,dark=0,hash=2166136261,min=255,max=0;
  for(let i=0;i<pixels.length;i+=4){if(Math.abs(pixels[i]-10)+Math.abs(pixels[i+1]-13)+Math.abs(pixels[i+2]-16)>20)colored++;if(pixels[i]>pixels[i+1]*1.035&&pixels[i+1]>pixels[i+2]*1.08&&pixels[i]>90)warm++;const mean=(pixels[i]+pixels[i+1]+pixels[i+2])/3;if(mean>150)bright++;if(mean<60)dark++;min=Math.min(min,mean);max=Math.max(max,mean);for(let c=0;c<3;c++)hash=Math.imul(hash^pixels[i+c],16777619);}
  results.push({progress:frame.progress,opacity:frame.opacity,colored,warm,bright,dark,min,max,hash:hash>>>0});
  if(results.length<=9){const tile=document.createElement('figure'),image=document.createElement('img'),caption=document.createElement('figcaption');image.src=canvas.toDataURL('image/png');caption.textContent='Progreso '+frame.progress.toFixed(2)+' · opacidad '+frame.opacity.toFixed(2);tile.append(image,caption);document.getElementById('frames').append(tile);}
 }
 document.getElementById('result').textContent=JSON.stringify({ok:true,contexts:1,triangles:data.triangles,frames:results});
}catch(error){document.getElementById('result').textContent=JSON.stringify({ok:false,error:String(error)});}
</script></html>`;
    const file=path.join(directory,'geology.html');await writeFile(file,html);
    const args=['--headless=new','--no-first-run','--no-default-browser-check','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',`--user-data-dir=${path.join(directory,'profile')}`,'--window-size=1200,2200','--dump-dom'];
    if(process.env.OPENMINERALS_GEOLOGY_GL_SCREENSHOT)args.push(`--screenshot=${path.resolve(process.env.OPENMINERALS_GEOLOGY_GL_SCREENSHOT)}`);
    args.push(pathToFileURL(file).href);
    const {stdout}=await promisify(execFile)(process.env.OPENMINERALS_WEBGL_BROWSER,args,{windowsHide:true,timeout:45000,maxBuffer:8*1024*1024});
    const match=stdout.match(/<pre id="result">([^<]*)<\/pre>/);assert.ok(match,'The actual shader execution must produce its bounded report.');
    const result=JSON.parse(match[1]);assert.equal(result.ok,true,result.error);assert.equal(result.contexts,1);assert.equal(result.frames.length,11);
    if(process.env.OPENMINERALS_GEOLOGY_GL_REPORT)await writeFile(path.resolve(process.env.OPENMINERALS_GEOLOGY_GL_REPORT),JSON.stringify({environment:'desktop software WebGL',android:false,staticBytes:mesh.positions.byteLength+mesh.normals.byteLength+mesh.materials.byteLength,...result},null,2)+'\n');
    for(const frame of result.frames.slice(0,6)){assert.ok(frame.colored>width*height*.75,'A true interior must surround the camera at progress '+frame.progress);assert.ok(frame.bright>5&&frame.dark>1000&&frame.max-frame.min>100,'Industrial lighting must coexist with shaded rock at progress '+frame.progress);}
    // A lamp can leave the narrow portrait frustum as the camera passes it.
    // Require a genuinely warm source where the initial lamp is in view.
    assert.ok(result.frames[0].warm>30&&result.frames[3].warm>30,'Visible near lamps must have a warm industrial spectrum.');
    assert.equal(new Set(result.frames.slice(0,8).map(frame=>frame.hash)).size,8,'Continuous camera translation changes all intermediate images.');
    assert.equal(result.frames[8].colored,0,'The mine fully fades before the later bar narrative.');
    assert.equal(result.frames[9].hash,result.frames[3].hash,'Reverse scroll restores camera, material and particle positions.');
    assert.equal(result.frames[10].hash,result.frames[0].hash,'Returning to the origin restores the complete tunnel rasterization.');
  }finally{
    const resolved=path.resolve(directory);assert.equal(path.dirname(resolved),path.resolve(tmpdir()));assert.ok(path.basename(resolved).startsWith('openminerals-geology-gl-'));
    await rm(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:200});
  }
});
