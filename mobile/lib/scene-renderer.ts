import type {ExpoWebGLRenderingContext} from 'expo-gl';
import {createGoldBarMesh,createStudioFloorMesh,goldBarMatrices,goldBarPose,GOLD_VERTEX_SHADER,GOLD_FRAGMENT_SHADER} from './gold-bar-3d.ts';
import {immersivePose,immersiveMatrices,IMMERSIVE_VERTEX_SHADER,IMMERSIVE_FRAGMENT_SHADER} from './immersive-story.ts';
import {createMineSceneMesh,mineSceneCamera,mineSceneVisibility,MINE_VERTEX_SHADER,MINE_FRAGMENT_SHADER} from './geological-scene.ts';
import {metalMaterial,type MetalCode} from './metal-materials.ts';
import {subdivideSpecimen} from './geological-specimen.ts';

export type StoryRenderer={draw:(progress:number,drag:number,metal?:MetalCode,minePeek?:number)=>void;dispose:()=>void};
const smooth=(a:number,b:number,value:number)=>{const t=Math.max(0,Math.min(1,(value-a)/(b-a)));return t*t*(3-2*t);};

// Both Android and the offline raster check use this renderer. Buffers are
// uploaded once per context; progress and the selected material are uniforms.
export function createStoryRenderer(gl:ExpoWebGLRenderingContext,cinematic=false):StoryRenderer {
 const buffers:WebGLBuffer[]=[],shaders:WebGLShader[]=[],programs:WebGLProgram[]=[];let disposed=false;
 const dispose=()=>{if(disposed)return;disposed=true;for(const item of buffers)try{gl.deleteBuffer(item);}catch{}for(const item of shaders)try{gl.deleteShader(item);}catch{}for(const item of programs)try{gl.deleteProgram(item);}catch{}};
 try{
  const program=(vertexSource:string,fragmentSource:string)=>{
   const compile=(type:number,source:string)=>{const shader=gl.createShader(type);if(!shader)throw Error('GL shader unavailable');shaders.push(shader);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw Error('GL shader compilation failed: '+gl.getShaderInfoLog(shader));return shader;};
   const vertex=compile(gl.VERTEX_SHADER,vertexSource),fragment=compile(gl.FRAGMENT_SHADER,fragmentSource),item=gl.createProgram();if(!item)throw Error('GL program unavailable');programs.push(item);gl.attachShader(item,vertex);gl.attachShader(item,fragment);gl.linkProgram(item);if(!gl.getProgramParameter(item,gl.LINK_STATUS))throw Error('GL program linking failed: '+gl.getProgramInfoLog(item));return item;
  };
  const attribute=(item:WebGLProgram,name:string,data:Float32Array,size=3)=>{const location=gl.getAttribLocation(item,name);if(location<0)throw Error('GL attribute unavailable: '+name);const buffer=gl.createBuffer();if(!buffer)throw Error('GL buffer unavailable');buffers.push(buffer);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);return()=>{gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,size,gl.FLOAT,false,0,0);};};
  const uniform=(item:WebGLProgram,name:string)=>{const location=gl.getUniformLocation(item,name);if(location===null)throw Error('GL uniform unavailable: '+name);return location;};
  const bar=program(cinematic?IMMERSIVE_VERTEX_SHADER:GOLD_VERTEX_SHADER,cinematic?IMMERSIVE_FRAGMENT_SHADER:GOLD_FRAGMENT_SHADER);
  const mesh=cinematic?subdivideSpecimen(createGoldBarMesh()):createGoldBarMesh(),floor=createStudioFloorMesh();
  const barAttributes=[attribute(bar,'a_position',new Float32Array([...mesh.positions,...floor.positions])),attribute(bar,'a_normal',new Float32Array([...mesh.normals,...floor.normals]))];
  const names=['u_model','u_mvp','u_camera','u_light','u_refinement','u_surface','u_shadowAngle','u_metalColor','u_roughness','u_metalKind'] as const;
  const u=Object.fromEntries(names.map(name=>[name,uniform(bar,name)])) as Record<typeof names[number],WebGLUniformLocation>;
  const storyProgress=cinematic?uniform(bar,'u_storyProgress'):null,subjectOpacity=cinematic?uniform(bar,'u_subjectOpacity'):null,extraction=cinematic?uniform(bar,'u_extractionScale'):null;
  const mine=cinematic?program(MINE_VERTEX_SHADER,MINE_FRAGMENT_SHADER):null;
  const room=mine?createMineSceneMesh():null;
  const mineAttributes=mine&&room?[attribute(mine,'a_position',room.positions),attribute(mine,'a_normal',room.normals),attribute(mine,'a_material',room.materials,1)]:[];
  const m=mine?{vp:uniform(mine,'u_vp'),progress:uniform(mine,'u_progress'),camera:uniform(mine,'u_camera'),opacity:uniform(mine,'u_opacity')}:null;
  gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.frontFace(gl.CCW);gl.clearColor(10/255,13/255,16/255,1);gl.clearDepth(1);
  return {draw(progress,drag,metal='XAU',minePeek=drag){
   if(disposed)return;const width=gl.drawingBufferWidth,height=gl.drawingBufferHeight;if(width<=0||height<=0)throw Error('GL viewport unavailable');
   gl.viewport(0,0,width,height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.enable(gl.BLEND);gl.blendFuncSeparate(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA,gl.ONE,gl.ONE_MINUS_SRC_ALPHA);
   const mineOpacity=cinematic?mineSceneVisibility(progress):0;
   if(mine&&room&&m&&mineOpacity>0){const camera=mineSceneCamera(progress,width/height,minePeek);gl.useProgram(mine);for(const bind of mineAttributes)bind();gl.uniformMatrix4fv(m.vp,false,camera.vp);gl.uniform3f(m.camera,...camera.camera);gl.uniform1f(m.progress,progress);gl.uniform1f(m.opacity,mineOpacity);gl.drawArrays(gl.TRIANGLES,0,room.vertexCount);}
   const opacity=cinematic?smooth(.08,.25,progress):1;
   if(opacity>0){
    // The extracted specimen moves into the foreground as the tunnel recedes.
    // Its composition remains reversible; it is not a timed scene switch.
    gl.clear(gl.DEPTH_BUFFER_BIT);gl.useProgram(bar);for(const bind of barAttributes)bind();
    const pose=cinematic?immersivePose(progress,drag):goldBarPose(progress,drag),matrices=cinematic?immersiveMatrices(pose,width/height,progress):goldBarMatrices(pose,width/height),material=metalMaterial(metal);
    if(storyProgress!==null)gl.uniform1f(storyProgress,progress);
    if(extraction!==null)gl.uniform1f(extraction,opacity);
    gl.uniform3f(u.u_metalColor,...material.reflectance);gl.uniform1f(u.u_roughness,material.roughness);gl.uniform1f(u.u_metalKind,['XAU','XAG','XPT','XPD'].indexOf(metal));
    gl.uniform3f(u.u_camera,...matrices.camera);gl.uniform3f(u.u_light,...pose.light);gl.uniform1f(u.u_refinement,pose.refinement);gl.uniform1f(u.u_shadowAngle,pose.yaw);
    const floorOpacity=cinematic?opacity*smooth(.28,.53,progress):1;
    if(floorOpacity>0){if(subjectOpacity!==null)gl.uniform1f(subjectOpacity,floorOpacity);gl.uniform1f(u.u_surface,1);gl.uniformMatrix4fv(u.u_model,false,matrices.floorModel);gl.uniformMatrix4fv(u.u_mvp,false,matrices.floorMvp);gl.drawArrays(gl.TRIANGLES,mesh.vertexCount,floor.vertexCount);}
    if(subjectOpacity!==null)gl.uniform1f(subjectOpacity,1);
    gl.uniform1f(u.u_surface,0);gl.uniformMatrix4fv(u.u_model,false,matrices.model);gl.uniformMatrix4fv(u.u_mvp,false,matrices.mvp);gl.drawArrays(gl.TRIANGLES,0,mesh.vertexCount);
   }
   gl.disable(gl.BLEND);gl.flush();gl.endFrameEXP();
  },dispose};
 }catch(error){dispose();throw error;}
}
