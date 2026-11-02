import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createMineSceneMesh,mineSceneCamera,MINE_VERTEX_SHADER,MINE_FRAGMENT_SHADER} from '../lib/geological-scene.ts';

// A/B rasterize the actual shipping fragment shader against the same shader
// with only its shadow multiplier disabled. This proves receiver pixels change;
// matching shader text alone would not prove a shadow reaches the image.
test('luz minera real: sombras oscurecen receptores y BRDF GLSL permanece finita',{
 skip:!process.env.OPENMINERALS_WEBGL_BROWSER,timeout:90000,
},async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'openminerals-mine-lighting-'));
 try{
  const mesh=createMineSceneMesh(),width=360,height=640;
  const enabled='float shadow=mineShadow(p+n*.025,lamp);';
  assert.ok(MINE_FRAGMENT_SHADER.includes(enabled),'The A/B control must disable the actual shipped shadow call.');
  const disabled=MINE_FRAGMENT_SHADER.replace(enabled,'float shadow=1.0;');
  const frames=[0,.10,.18,.24].flatMap(progress=>[0,-1.2,1.2].map(drag=>({progress,drag,...mineSceneCamera(progress,width/height,drag)}))).map(({vp,...pose})=>({...pose,vp:[...vp]}));
  // CPU normals are actual displaced receiver geometry, not duplicated BRDF
  // equations. Sampling GLSL below checks the shader's own numeric arithmetic.
  let normalError=0;for(let i=0;i<mesh.normals.length;i+=3){const length=Math.hypot(...mesh.normals.subarray(i,i+3));assert.ok(Number.isFinite(length));normalError=Math.max(normalError,Math.abs(length-1));}assert.ok(normalError<1e-5);
  const probes=[];
  for(const roughness of [0,.04,.32,.55,.92,1])for(const metallic of [0,.68,1])for(const angle of [0,.4,1.2,Math.PI/2-.0001]){
   const light=[Math.sin(angle),0,Math.cos(angle)];
   for(const view of [[0,0,1],[.999999,0,.001],[0,1,0],[0,0,-1]])probes.push({roughness,metallic,light,view});
  }
  const preamble=MINE_FRAGMENT_SHADER.slice(0,MINE_FRAGMENT_SHADER.indexOf('void main(){'));
  assert.ok(preamble.includes('vec3 mineBRDF('));
  const probeFragment=preamble+`\nuniform vec3 u_probeLight;uniform vec3 u_probeView;uniform float u_probeRoughness;uniform float u_probeMetallic;
void main(){vec3 result=mineBRDF(vec3(.42,.27,.08),vec3(.75,.49,.16),u_probeMetallic,u_probeRoughness,vec3(0.,0.,1.),normalize(u_probeView),normalize(u_probeLight));
 bool finite=all(equal(result,result))&&all(lessThan(abs(result),vec3(1.0e20)));bool positive=all(greaterThanEqual(result,vec3(0.)));gl_FragColor=vec4(finite?1.:0.,positive?1.:0.,1.,1.);}`;
  const data={width,height,count:mesh.vertexCount,positions:[...mesh.positions],normals:[...mesh.normals],materials:[...mesh.materials],vertex:MINE_VERTEX_SHADER,enabled:MINE_FRAGMENT_SHADER,disabled,probeFragment,frames,probes};
  const html=`<!doctype html><meta charset="utf-8"><pre id="result"></pre><script>
try{const data=${JSON.stringify(data)};const canvas=document.createElement('canvas');canvas.width=data.width;canvas.height=data.height;
 const gl=canvas.getContext('webgl',{preserveDrawingBuffer:true,antialias:false});if(!gl)throw Error('WebGL unavailable');
 function program(vertex,fragment){const p=gl.createProgram();for(const [kind,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]){const s=gl.createShader(kind);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));gl.attachShader(p,s);}gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;}
 function draw(p,pose){gl.useProgram(p);for(const [name,values,size]of [['a_position',data.positions,3],['a_normal',data.normals,3],['a_material',data.materials,1]]){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(values),gl.STATIC_DRAW);const at=gl.getAttribLocation(p,name);if(at<0)throw Error('Missing '+name);gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,size,gl.FLOAT,false,0,0);}gl.uniformMatrix4fv(gl.getUniformLocation(p,'u_vp'),false,new Float32Array(pose.vp));gl.uniform1f(gl.getUniformLocation(p,'u_progress'),pose.progress);gl.uniform1f(gl.getUniformLocation(p,'u_opacity'),1);gl.uniform3f(gl.getUniformLocation(p,'u_camera'),...pose.camera);gl.viewport(0,0,data.width,data.height);gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.frontFace(gl.CCW);gl.disable(gl.BLEND);gl.clearColor(10/255,13/255,16/255,1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,data.count);gl.finish();const pixels=new Uint8Array(data.width*data.height*4);gl.readPixels(0,0,data.width,data.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);if(gl.getError()!==gl.NO_ERROR)throw Error('GL raster error');return pixels;}
 const withShadow=program(data.vertex,data.enabled),withoutShadow=program(data.vertex,data.disabled),frames=[];
 for(const pose of data.frames){const a=draw(withShadow,pose),b=draw(withoutShadow,pose);let darkened=0,brightened=0,totalDimming=0,maxDimming=0;for(let i=0;i<a.length;i+=4){let dim=0;for(let c=0;c<3;c++)dim+=b[i+c]-a[i+c];if(dim>1)darkened++;if(dim< -1)brightened++;totalDimming+=dim;maxDimming=Math.max(maxDimming,dim);}frames.push({progress:pose.progress,drag:pose.drag,darkened,brightened,totalDimming,maxDimming});}
 const probe=program('attribute vec2 a_probe;void main(){gl_Position=vec4(a_probe,0.,1.);}',data.probeFragment);gl.useProgram(probe);gl.disable(gl.DEPTH_TEST);gl.disable(gl.CULL_FACE);gl.disable(gl.BLEND);gl.viewport(0,0,1,1);
 for(let i=0;i<gl.getParameter(gl.MAX_VERTEX_ATTRIBS);i++)gl.disableVertexAttribArray(i);
 const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);const at=gl.getAttribLocation(probe,'a_probe');gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,2,gl.FLOAT,false,0,0);
 let finiteProbes=0,nonnegativeProbes=0;const invalid=[];
 for(let i=0;i<data.probes.length;i++){const p=data.probes[i];gl.uniform3f(gl.getUniformLocation(probe,'u_probeLight'),...p.light);gl.uniform3f(gl.getUniformLocation(probe,'u_probeView'),...p.view);gl.uniform1f(gl.getUniformLocation(probe,'u_probeRoughness'),p.roughness);gl.uniform1f(gl.getUniformLocation(probe,'u_probeMetallic'),p.metallic);gl.drawArrays(gl.TRIANGLES,0,3);const pixel=new Uint8Array(4);gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);if(gl.getError()!==gl.NO_ERROR)throw Error('BRDF probe error');if(pixel[0]===255)finiteProbes++;if(pixel[1]===255)nonnegativeProbes++;if(pixel[0]!==255||pixel[1]!==255)invalid.push({index:i,case:p,pixel:[...pixel]});}
 document.getElementById('result').textContent=JSON.stringify({ok:true,frames,probes:data.probes.length,finiteProbes,nonnegativeProbes,invalid});
}catch(error){document.getElementById('result').textContent=JSON.stringify({ok:false,error:String(error)});}
</script>`;
  const file=path.join(directory,'lighting.html');await writeFile(file,html);
  const {stdout}=await promisify(execFile)(process.env.OPENMINERALS_WEBGL_BROWSER,['--headless=new','--no-first-run','--no-default-browser-check','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--user-data-dir='+path.join(directory,'profile'),'--dump-dom',pathToFileURL(file).href],{windowsHide:true,timeout:75000,maxBuffer:8*1024*1024});
  const match=stdout.match(/<pre id="result">([^<]*)<\/pre>/);assert.ok(match,'Actual GLSL execution must return a report.');const result=JSON.parse(match[1]);assert.equal(result.ok,true,result.error);
  assert.equal(result.frames.length,frames.length);assert.ok(result.frames.some(frame=>frame.darkened>30),'An occluder must darken actual receiver pixels.');for(const frame of result.frames)assert.equal(frame.brightened,0,'A shadow may not brighten a receiver.');
  assert.equal(result.finiteProbes,probes.length,JSON.stringify(result.invalid));assert.equal(result.nonnegativeProbes,probes.length,JSON.stringify(result.invalid));
  if(process.env.OPENMINERALS_MINE_LIGHTING_REPORT)await writeFile(path.resolve(process.env.OPENMINERALS_MINE_LIGHTING_REPORT),JSON.stringify({environment:'desktop SwiftShader',android:false,phonePerformanceAcceptance:false,maxNormalLengthError:normalError,...result},null,2)+'\n');
 }finally{const resolved=path.resolve(directory);assert.equal(path.dirname(resolved),path.resolve(tmpdir()));assert.ok(path.basename(resolved).startsWith('openminerals-mine-lighting-'));await rm(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
});
