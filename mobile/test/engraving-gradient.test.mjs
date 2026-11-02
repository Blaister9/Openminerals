import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,mkdir,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {createGoldBarMesh,goldBarMatrices} from '../lib/gold-bar-3d.ts';
import {subdivideSpecimen} from '../lib/geological-specimen.ts';
import {metalMaterial} from '../lib/metal-materials.ts';
import {IMMERSIVE_VERTEX_SHADER,IMMERSIVE_FRAGMENT_SHADER,IMMERSIVE_FRAGMENT_SHADER_DERIVATIVES} from '../lib/immersive-story.ts';

// Actual shader A/B over all symbols, front/shallow/top views and three yaws.
// The scalar SDF and geometry remain identical. Only its highlight normal is
// reconstructed from screen derivatives rather than two extra field samples.
test('grabado con derivadas conserva cuatro símbolos y relieve en vistas rasantes',{
 skip:!process.env.OPENMINERALS_WEBGL_BROWSER,timeout:90000,
},async()=>{
 const directory=await mkdtemp(path.join(tmpdir(),'openminerals-engraving-gradient-'));
 try{
  const mesh=subdivideSpecimen(createGoldBarMesh()),width=360,height=480;
  const cases=[];
  for(const pitch of [.10,.6,1.3])for(const yaw of [-.8,.3,1.2])for(const [kind,code]of ['XAU','XAG','XPT','XPD'].entries()){
   const pose={yaw,pitch,roll:0,distance:3.5,lift:0,refinement:1,light:[-3,4,3]};
   const matrices=goldBarMatrices(pose,width/height);
   cases.push({pitch,yaw,kind,code,material:metalMaterial(code),model:[...matrices.model],mvp:[...matrices.mvp],camera:matrices.camera});
  }
  const data={width,height,cases,positions:[...mesh.positions],normals:[...mesh.normals],count:mesh.vertexCount,vertex:IMMERSIVE_VERTEX_SHADER,reference:IMMERSIVE_FRAGMENT_SHADER,optimized:IMMERSIVE_FRAGMENT_SHADER_DERIVATIVES};
  const html=`<!doctype html><meta charset="utf-8"><pre id="result"></pre><script>
try{
 const data=${JSON.stringify(data)},canvas=document.createElement('canvas');canvas.width=data.width;canvas.height=data.height;
 const gl=canvas.getContext('webgl',{preserveDrawingBuffer:true,antialias:false});if(!gl)throw Error('WebGL unavailable');
 if(!gl.getExtension('OES_standard_derivatives'))throw Error('Derivative capability required for this opt-in raster check.');
 const program=fragment=>{const p=gl.createProgram();for(const [type,source]of [[gl.VERTEX_SHADER,data.vertex],[gl.FRAGMENT_SHADER,fragment]]){const s=gl.createShader(type);gl.shaderSource(s,source);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(s));gl.attachShader(p,s);}gl.linkProgram(p);if(!gl.getProgramParameter(p,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(p));return p;};
 const reference=program(data.reference),optimized=program(data.optimized);
 function draw(p,pose){gl.useProgram(p);for(const [name,values]of [['a_position',data.positions],['a_normal',data.normals]]){const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(values),gl.STATIC_DRAW);const at=gl.getAttribLocation(p,name);gl.enableVertexAttribArray(at);gl.vertexAttribPointer(at,3,gl.FLOAT,false,0,0);}
  const u=name=>gl.getUniformLocation(p,'u_'+name);gl.uniformMatrix4fv(u('model'),false,new Float32Array(pose.model));gl.uniformMatrix4fv(u('mvp'),false,new Float32Array(pose.mvp));gl.uniform3f(u('camera'),...pose.camera);gl.uniform3f(u('light'),-3,4,3);gl.uniform3f(u('metalColor'),...pose.material.reflectance);gl.uniform1f(u('roughness'),pose.material.roughness);gl.uniform1f(u('metalKind'),pose.kind);gl.uniform1f(u('refinement'),1);gl.uniform1f(u('surface'),0);gl.uniform1f(u('shadowAngle'),pose.yaw);gl.uniform1f(u('storyProgress'),5/6);gl.uniform1f(u('subjectOpacity'),1);gl.uniform1f(u('extractionScale'),1);
  gl.viewport(0,0,data.width,data.height);gl.enable(gl.DEPTH_TEST);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.frontFace(gl.CCW);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.drawArrays(gl.TRIANGLES,0,data.count);gl.finish();const pixels=new Uint8Array(data.width*data.height*4);gl.readPixels(0,0,data.width,data.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);if(gl.getError()!==gl.NO_ERROR)throw Error('GL raster error');return {pixels,image:canvas.toDataURL('image/png')};}
 const results=[],images=[];
 for(const pose of data.cases){const a=draw(reference,pose),b=draw(optimized,pose);let sum=0,changed=0,over16=0,alphaMismatch=0,max=0;for(let i=0;i<a.pixels.length;i+=4){let pixelMax=0;for(let c=0;c<3;c++){const d=Math.abs(a.pixels[i+c]-b.pixels[i+c]);sum+=d;pixelMax=Math.max(pixelMax,d);}max=Math.max(max,pixelMax);if(pixelMax)changed++;if(pixelMax>16)over16++;if(a.pixels[i+3]!==b.pixels[i+3])alphaMismatch++;}results.push({pitch:pose.pitch,yaw:pose.yaw,kind:pose.kind,code:pose.code,meanAbsoluteRgb:sum/(data.width*data.height*3),changedPixels:changed,over16Pixels:over16,alphaMismatch,max});if(pose.pitch===.6&&pose.yaw===.3)images.push({code:pose.code,before:a.image,after:b.image});}
 document.getElementById('result').textContent=JSON.stringify({ok:true,environment:'desktop Chrome SwiftShader',android:false,width:data.width,height:data.height,results,images});
}catch(error){document.getElementById('result').textContent=JSON.stringify({ok:false,error:String(error)});}
</script>`;
  const file=path.join(directory,'engraving.html');await writeFile(file,html);
  const {stdout}=await promisify(execFile)(process.env.OPENMINERALS_WEBGL_BROWSER,['--headless=new','--no-first-run','--no-default-browser-check','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--user-data-dir='+path.join(directory,'profile'),'--dump-dom',pathToFileURL(file).href],{windowsHide:true,timeout:75000,maxBuffer:8*1024*1024});
  const match=stdout.match(/<pre id="result">([^<]*)<\/pre>/);assert.ok(match,'Actual GLSL must return bounded results.');const result=JSON.parse(match[1]);assert.equal(result.ok,true,result.error);assert.equal(result.results.length,36);
  if(process.env.OPENMINERALS_ENGRAVING_RASTER_DIR){const out=path.resolve(process.env.OPENMINERALS_ENGRAVING_RASTER_DIR);await mkdir(out,{recursive:true});for(const image of result.images)for(const side of ['before','after'])await writeFile(path.join(out,image.code+'-'+side+'.png'),Buffer.from(image[side].split(',')[1],'base64'));await writeFile(path.join(out,'report.json'),JSON.stringify({...result,images:result.images.map(({code})=>({code,before:code+'-before.png',after:code+'-after.png'}))},null,2)+'\n');}
  for(const row of result.results){assert.equal(row.alphaMismatch,0,'The same mesh silhouette must survive every view.');assert.ok(row.meanAbsoluteRgb<.15,'Only local incision-highlight pixels may change: '+JSON.stringify(row));assert.ok(row.over16Pixels<width*height*.005,'Large pixel differences remain limited to the tiny engraved contour: '+JSON.stringify(row));}
 }finally{const resolved=path.resolve(directory);assert.equal(path.dirname(resolved),path.resolve(tmpdir()));assert.ok(path.basename(resolved).startsWith('openminerals-engraving-gradient-'));await rm(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
});
