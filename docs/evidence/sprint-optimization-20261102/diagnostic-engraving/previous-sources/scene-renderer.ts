import {createGoldBarMesh,createStudioFloorMesh,goldBarMatrices,goldBarPose,GOLD_FRAGMENT_SHADER,GOLD_VERTEX_SHADER} from './gold-bar-3d';
import {immersivePose,immersiveMatrices,IMMERSIVE_VERTEX_SHADER,IMMERSIVE_FRAGMENT_SHADER} from './immersive-story';
export function createStoryRenderer(gl:ExpoWebGLRenderingContext,cinematic=false):Renderer {
  const buffers:WebGLBuffer[]=[],shaders:WebGLShader[]=[];
  let program:WebGLProgram|null=null,disposed=false;
  const dispose=()=>{
    if(disposed)return;disposed=true;
    // GLView owns this context; the headless destroy API must not be used.
    for(const buffer of buffers)try{gl.deleteBuffer(buffer);}catch{}
    for(const shader of shaders)try{gl.deleteShader(shader);}catch{}
    if(program)try{gl.deleteProgram(program);}catch{}
  };
  try{
    const compile=(type:number,source:string)=>{
      const shader=gl.createShader(type);if(!shader)throw new Error('GL shader unavailable.');shaders.push(shader);
      gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error('GL shader compilation failed.');
      return shader;
    };
    const vertex=compile(gl.VERTEX_SHADER,cinematic?IMMERSIVE_VERTEX_SHADER:GOLD_VERTEX_SHADER),fragment=compile(gl.FRAGMENT_SHADER,cinematic?IMMERSIVE_FRAGMENT_SHADER:GOLD_FRAGMENT_SHADER);
    program=gl.createProgram();if(!program)throw new Error('GL program unavailable.');
    gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('GL program linking failed.');
    gl.useProgram(program);
    const mesh=createGoldBarMesh(),floor=createStudioFloorMesh();
    const attribute=(name:string,data:Float32Array)=>{
      const location=gl.getAttribLocation(program!,name);
      if(location<0)throw new Error('GL attribute unavailable.');
      const buffer=gl.createBuffer();
      if(!buffer)throw new Error('GL attribute unavailable.');buffers.push(buffer);
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
      gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,3,gl.FLOAT,false,0,0);
    };
    attribute('a_position',new Float32Array([...mesh.positions,...floor.positions]));attribute('a_normal',new Float32Array([...mesh.normals,...floor.normals]));
    const uniform=(name:string)=>{const location=gl.getUniformLocation(program!,name);if(location===null)throw new Error('GL uniform unavailable.');return location;};
    const locations={model:uniform('u_model'),mvp:uniform('u_mvp'),camera:uniform('u_camera'),light:uniform('u_light'),refinement:uniform('u_refinement'),surface:uniform('u_surface'),shadowAngle:uniform('u_shadowAngle')};
    const storyProgress=cinematic?uniform('u_storyProgress'):null;
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.frontFace(gl.CCW);
    gl.clearColor(10/255,13/255,16/255,1);gl.clearDepth(1);
    return {
      draw(progress,drag){
        if(disposed)return;
        const width=gl.drawingBufferWidth,height=gl.drawingBufferHeight;
        if(width<=0||height<=0)throw new Error('GL viewport unavailable.');
        const pose=cinematic?immersivePose(progress,drag):goldBarPose(progress,drag),matrices=cinematic?immersiveMatrices(pose,width/height,progress):goldBarMatrices(pose,width/height);
        gl.viewport(0,0,width,height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);
        if(storyProgress!==null)gl.uniform1f(storyProgress,progress);
        gl.uniform3f(locations.camera,...matrices.camera);gl.uniform3f(locations.light,...pose.light);gl.uniform1f(locations.refinement,pose.refinement);gl.uniform1f(locations.shadowAngle,pose.yaw);
        gl.uniform1f(locations.surface,1);gl.uniformMatrix4fv(locations.model,false,matrices.floorModel);gl.uniformMatrix4fv(locations.mvp,false,matrices.floorMvp);
        gl.drawArrays(gl.TRIANGLES,mesh.vertexCount,floor.vertexCount);
        gl.uniform1f(locations.surface,0);gl.uniformMatrix4fv(locations.model,false,matrices.model);gl.uniformMatrix4fv(locations.mvp,false,matrices.mvp);
        gl.drawArrays(gl.TRIANGLES,0,mesh.vertexCount);gl.flush();gl.endFrameEXP();
      },dispose,
    };
  }catch(error){dispose();throw error;}
}
