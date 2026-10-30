export type Vec3=readonly[number,number,number];
export type GoldBarMesh={positions:Float32Array;normals:Float32Array;vertexCount:number;triangleCount:number};
export type GoldBarPose={yaw:number;pitch:number;roll:number;distance:number;lift:number;refinement:number;light:Vec3};
export type Mat4=Float32Array;

const finite=(value:number,fallback=0)=>Number.isFinite(value)?value:fallback;
export const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,finite(value,min)));
const subtract=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];

// Ten rounded rings close a tapered casting with curved edge bevels. Smooth
// analytic normals carry studio reflections across the bevel instead of making
// every triangle look like an independent polygon. Only 400 triangles.
export function createGoldBarMesh(width=2.8,depth=1.35,height=.48,bevel=.08):GoldBarMesh {
  if(![width,depth,height,bevel].every(value=>Number.isFinite(value)&&value>0)||bevel>=Math.min(width,depth,height)/4)throw new Error('Invalid gold-bar dimensions.');
  const ring=(y:number,x:number,z:number,horizontal:number,vertical:number)=>{
    const points:Vec3[]=[],normals:Vec3[]=[],radius=bevel*.9;
    for(const [cx,cz,start] of [[-x+radius,-z+radius,Math.PI],[x-radius,-z+radius,Math.PI*1.5],[x-radius,z-radius,0],[-x+radius,z-radius,Math.PI*.5]]){
      for(let segment=0;segment<=4;segment++){
        const angle=start+segment*Math.PI/8,nx=Math.cos(angle),nz=Math.sin(angle);
        points.push([cx+nx*radius,y,cz+nz*radius]);normals.push([nx*horizontal,vertical,nz*horizontal]);
      }
    }
    return {points,normals};
  };
  const rings=[];
  for(let i=0;i<=4;i++){const theta=i*Math.PI/8;rings.push(ring(-height/2+bevel*(1-Math.cos(theta)),width/2-bevel+bevel*Math.sin(theta),depth/2-bevel+bevel*Math.sin(theta),Math.sin(theta),-Math.cos(theta)));}
  for(let i=0;i<=4;i++){const theta=i*Math.PI/8;rings.push(ring(height/2-bevel+bevel*Math.sin(theta),width*.47-bevel+bevel*Math.cos(theta),depth*.47-bevel+bevel*Math.cos(theta),Math.cos(theta),Math.sin(theta)));}
  const positions:number[]=[],normals:number[]=[];
  function triangle(a:Vec3,b:Vec3,c:Vec3,na:Vec3,nb:Vec3,nc:Vec3){
    let normal=cross(subtract(b,a),subtract(c,a));
    const center:Vec3=[(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3,(a[2]+b[2]+c[2])/3];
    if(dot(normal,center)<0){[b,c]=[c,b];[nb,nc]=[nc,nb];normal=cross(subtract(b,a),subtract(c,a));}
    const length=Math.hypot(...normal);if(length<1e-10)throw new Error('Degenerate gold-bar triangle.');
    for(const [vertex,n] of [[a,na],[b,nb],[c,nc]]){positions.push(...vertex);normals.push(...n);}
  }
  const count=rings[0].points.length;
  for(let level=0;level<rings.length-1;level++)for(let i=0;i<count;i++){
    const j=(i+1)%count,a=rings[level],b=rings[level+1];
    triangle(a.points[i],a.points[j],b.points[j],a.normals[i],a.normals[j],b.normals[j]);
    triangle(a.points[i],b.points[j],b.points[i],a.normals[i],b.normals[j],b.normals[i]);
  }
  for(let i=0;i<count;i++){
    triangle([0,-height/2,0],rings[0].points[i],rings[0].points[(i+1)%count],[0,-1,0],[0,-1,0],[0,-1,0]);
    triangle([0,height/2,0],rings.at(-1)!.points[i],rings.at(-1)!.points[(i+1)%count],[0,1,0],[0,1,0],[0,1,0]);
  }
  return {positions:new Float32Array(positions),normals:new Float32Array(normals),vertexCount:positions.length/3,triangleCount:positions.length/9};
}

export function createStudioFloorMesh():GoldBarMesh {
  return {positions:new Float32Array([-30,0,-30,30,0,30,30,0,-30,-30,0,-30,-30,0,30,30,0,30]),normals:new Float32Array(Array.from({length:6},()=>[0,1,0]).flat()),vertexCount:6,triangleCount:2};
}

export function identityMatrix():Mat4{return new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);}
export function multiplyMatrices(a:ArrayLike<number>,b:ArrayLike<number>):Mat4 {
  const result=new Float32Array(16);
  for(let column=0;column<4;column++)for(let row=0;row<4;row++)for(let k=0;k<4;k++)result[column*4+row]+=a[k*4+row]*b[column*4+k];
  return result;
}
export function translationMatrix(x:number,y:number,z:number):Mat4 {const result=identityMatrix();result[12]=x;result[13]=y;result[14]=z;return result;}
export function rotationX(angle:number):Mat4 {const c=Math.cos(angle),s=Math.sin(angle);return new Float32Array([1,0,0,0,0,c,s,0,0,-s,c,0,0,0,0,1]);}
export function rotationY(angle:number):Mat4 {const c=Math.cos(angle),s=Math.sin(angle);return new Float32Array([c,0,-s,0,0,1,0,0,s,0,c,0,0,0,0,1]);}
export function rotationZ(angle:number):Mat4 {const c=Math.cos(angle),s=Math.sin(angle);return new Float32Array([c,s,0,0,-s,c,0,0,0,0,1,0,0,0,0,1]);}
export function perspectiveMatrix(fov:number,aspect:number,near=.1,far=100):Mat4 {
  if(![fov,aspect,near,far].every(Number.isFinite)||fov<=0||fov>=Math.PI||aspect<=0||near<=0||far<=near)throw new Error('Invalid perspective.');
  const f=1/Math.tan(fov/2),nf=1/(near-far);
  return new Float32Array([f/aspect,0,0,0,0,f,0,0,0,0,(far+near)*nf,-1,0,0,2*far*near*nf,0]);
}
export function transformPoint(matrix:ArrayLike<number>,point:Vec3):[number,number,number,number] {
  return [0,1,2,3].map(row=>matrix[row]*point[0]+matrix[row+4]*point[1]+matrix[row+8]*point[2]+matrix[row+12]) as [number,number,number,number];
}
export function scrollProgress(scroll:number,start:number,end:number):number {
  return Number.isFinite(start)&&Number.isFinite(end)&&end>start?clamp((finite(scroll,start)-start)/(end-start),0,1):0;
}
export const storyStage=(progress:number,count=5)=>Math.round(clamp(progress,0,1)*(Math.max(1,Math.floor(finite(count,5)))-1));
// Bound fragment work on high-density Android displays, retaining logical size.
export function goldRenderScale(width:number,height:number,pixelRatio:number){
  if(![width,height,pixelRatio].every(value=>Number.isFinite(value)&&value>0))return 1;
  return Math.min(1,1024/(Math.max(width,height)*pixelRatio));
}
export const horizontalDrag=(dx:number,dy:number,touches=1)=>Number.isFinite(dx)&&Number.isFinite(dy)&&touches===1&&Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy)*1.4;

const cameraFrames:GoldBarPose[]=[
  {yaw:-.62,pitch:.62,roll:-.025,distance:4.8,lift:0,refinement:.68,light:[-3,4,3]},
  {yaw:-.12,pitch:1.02,roll:0,distance:2.1,lift:0,refinement:.95,light:[-2,4,2]},
  {yaw:.15,pitch:.78,roll:0,distance:4.25,lift:0,refinement:1,light:[2,4,3]},
  {yaw:.66,pitch:.22,roll:.018,distance:4.7,lift:0,refinement:1,light:[-3,3,3]},
  {yaw:-.15,pitch:.76,roll:-.012,distance:4.1,lift:0,refinement:1,light:[-1.5,4,3]},
];
export function goldBarPose(progress:number,dragYaw=0,reducedMotion=false):GoldBarPose {
  const scaled=(reducedMotion?.5:clamp(progress,0,1))*4,index=Math.min(3,Math.floor(scaled)),next=index+1;
  const raw=scaled-index,t=raw*raw*(3-2*raw),a=cameraFrames[index],b=cameraFrames[next],mix=(x:number,y:number)=>x+(y-x)*t;
  return {yaw:mix(a.yaw,b.yaw)+(reducedMotion?0:finite(dragYaw)%(Math.PI*2)),pitch:mix(a.pitch,b.pitch),roll:mix(a.roll,b.roll),distance:mix(a.distance,b.distance),lift:mix(a.lift,b.lift),refinement:mix(a.refinement,b.refinement),light:a.light.map((value,i)=>mix(value,b.light[i])) as unknown as Vec3};
}
export function goldBarMatrices(pose:GoldBarPose,aspect:number):{model:Mat4;mvp:Mat4;camera:Vec3;floorModel:Mat4;floorMvp:Mat4} {
  const fittedAspect=clamp(aspect,.4,4),distance=pose.distance*Math.max(1,1.15/fittedAspect);
  const camera:Vec3=[0,Math.sin(pose.pitch)*distance,Math.cos(pose.pitch)*distance];
  const z:Vec3=[0,Math.sin(pose.pitch),Math.cos(pose.pitch)],x:Vec3=[1,0,0],y=cross(z,x);
  const view=new Float32Array([x[0],y[0],z[0],0,x[1],y[1],z[1],0,x[2],y[2],z[2],0,-dot(x,camera),-dot(y,camera),-dot(z,camera),1]);
  const model=multiplyMatrices(translationMatrix(0,pose.lift,0),multiplyMatrices(rotationY(pose.yaw),rotationZ(pose.roll)));
  const floorModel=translationMatrix(0,pose.lift-.242-Math.abs(Math.sin(pose.roll))*1.4,0);
  const vp=multiplyMatrices(perspectiveMatrix(Math.PI/4,fittedAspect),view);
  return {model,mvp:multiplyMatrices(vp,model),camera,floorModel,floorMvp:multiplyMatrices(vp,floorModel)};
}

// Demand rendering: input changes coalesce into at most one queued frame.
// No idle RAF loop, and disabled/disposed renderers cannot submit a frame.
export function createFrameScheduler({request,cancel,draw,onError,maxFps=0,now=Date.now}:{request:(callback:()=>void)=>number;cancel:(id:number)=>void;draw:()=>void;onError:(error:unknown)=>void;maxFps?:number;now?:()=>number}){
  let pending:number|null=null,enabled=true,dirty=false,disposed=false,lastDraw=-Infinity;
  const interval=Number.isFinite(maxFps)&&maxFps>0?1000/maxFps:0;
  // Rounded 16 ms vsync timestamps must not turn a 60 fps budget into 30.
  // The existing 30 fps cap keeps its exact threshold; faster budgets receive
  // only a sub-millisecond allowance, bounded relative to their own interval.
  const tolerance=maxFps>=50?Math.min(.75,interval*.05):0;
  const schedule=()=>{if(!disposed&&enabled&&dirty&&pending===null)pending=request(frame);};
  const frame=()=>{
    pending=null;if(disposed||!enabled||!dirty)return;
    const time=now();if(time-lastDraw+tolerance<interval){schedule();return;}
    dirty=false;lastDraw=time;
    try{draw();}catch(error){enabled=false;onError(error);}
    schedule();
  };
  return {
    invalidate(){if(!disposed){dirty=true;schedule();}},
    setEnabled(value:boolean){enabled=value;if(!value&&pending!==null){cancel(pending);pending=null;}schedule();},
    dispose(){disposed=true;dirty=false;if(pending!==null)cancel(pending);pending=null;},
  };
}

export const GOLD_VERTEX_SHADER=`
attribute vec3 a_position;
attribute vec3 a_normal;
uniform mat4 u_model;
uniform mat4 u_mvp;
varying vec3 v_position;
varying vec3 v_normal;
varying vec3 v_local;
void main() {
  vec4 world = u_model * vec4(a_position, 1.0);
  v_position = world.xyz;
  v_normal = mat3(u_model) * a_normal;
  v_local = a_position;
  gl_Position = u_mvp * vec4(a_position, 1.0);
}`;
export const GOLD_FRAGMENT_SHADER=`
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec3 u_camera;
uniform vec3 u_light;
uniform float u_refinement;
uniform float u_surface;
uniform float u_shadowAngle;
uniform vec3 u_metalColor;
uniform float u_roughness;
uniform float u_metalKind;
varying vec3 v_position;
varying vec3 v_normal;
varying vec3 v_local;
float segment(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b-a;
  float t = clamp(dot(p-a,ab)/dot(ab,ab),0.0,1.0);
  return length(p-a-t*ab);
}
float boxDistance(vec2 p,vec2 b,float radius) {
  vec2 q=abs(p)-b+radius;
  return length(max(q,0.0))+min(max(q.x,q.y),0.0)-radius;
}
float letterA(vec2 p) {
  return min(min(segment(p,vec2(-.15,-.17),vec2(0.0,.18)),segment(p,vec2(0.0,.18),vec2(.15,-.17))),segment(p,vec2(-.10,-.055),vec2(.10,-.055)));
}
float letterU(vec2 p) {
  float sides=min(segment(p,vec2(-.14,.18),vec2(-.14,-.075)),segment(p,vec2(.14,.18),vec2(.14,-.075)));
  return min(sides,max(abs(length(p-vec2(0.0,-.075))-.14),p.y+.075));
}
float lowerU(vec2 p) {
  vec2 q=p-vec2(0.0,-.035);
  float sides=min(segment(q,vec2(-.11,.105),vec2(-.11,-.035)),segment(q,vec2(.11,.105),vec2(.11,-.035)));
  return min(sides,max(abs(length(q-vec2(0.0,-.035))-.11),q.y+.035));
}
float lowerG(vec2 p) {
  float bowl=abs(length(p-vec2(-.005,.005))-.105);
  float stem=segment(p,vec2(.10,.015),vec2(.10,-.17));
  float tail=min(segment(p,vec2(.10,-.17),vec2(.015,-.235)),segment(p,vec2(.015,-.235),vec2(-.075,-.21)));
  return min(bowl,min(stem,tail));
}
float letterP(vec2 p) {
  float stem=segment(p,vec2(-.13,-.17),vec2(-.13,.18));
  float bowl=abs(boxDistance(p-vec2(-.005,.09),vec2(.125,.09),.065));
  return min(stem,bowl);
}
float lowerT(vec2 p) {
  return min(segment(p,vec2(0.0,-.14),vec2(0.0,.17)),min(segment(p,vec2(-.095,.07),vec2(.095,.07)),segment(p,vec2(0.0,-.14),vec2(.075,-.17))));
}
float lowerD(vec2 p) {
  return min(abs(length(p-vec2(-.01,-.035))-.11),segment(p,vec2(.10,-.145),vec2(.10,.18)));
}
float demoLetters(vec2 p) {
  vec2 d=p-vec2(-1.38,0.0),e=p-vec2(-.46,0.0),m=p-vec2(.46,0.0),o=p-vec2(1.38,0.0);
  float D=min(segment(d,vec2(-.28,-.4),vec2(-.28,.4)),abs(boxDistance(d,vec2(.28,.4),.23)));
  float E=min(min(segment(e,vec2(-.27,-.4),vec2(-.27,.4)),segment(e,vec2(-.27,.4),vec2(.27,.4))),min(segment(e,vec2(-.27,0.0),vec2(.18,0.0)),segment(e,vec2(-.27,-.4),vec2(.27,-.4))));
  float M=min(min(segment(m,vec2(-.3,-.4),vec2(-.3,.4)),segment(m,vec2(.3,-.4),vec2(.3,.4))),min(segment(m,vec2(-.3,.4),vec2(0.0,-.02)),segment(m,vec2(0.0,-.02),vec2(.3,.4))));
  float O=abs(boxDistance(o,vec2(.29,.4),.27));
  return min(min(D,E),min(M,O))/6.4;
}
float engravingDistance(vec2 p) {
  vec2 first=p-vec2(-.23,.015),second=p-vec2(.23,.015);
  float letters;
  if(u_metalKind<.5)letters=min(letterA(first),lowerU(second));
  else if(u_metalKind<1.5)letters=min(letterA(first),lowerG(second));
  else if(u_metalKind<2.5)letters=min(letterP(first),lowerT(second));
  else letters=min(letterP(first),lowerD(second));
  float demo=demoLetters((p-vec2(0.0,-.30))*6.4);
  float border=abs(boxDistance(p,vec2(1.04,.435),.07));
  // Openminerals' own abstract mountain mark; no assay or third-party seal.
  vec2 q=p-vec2(0.0,.31);
  float maker=min(min(segment(q,vec2(-.115,-.04),vec2(-.025,.055)),segment(q,vec2(-.025,.055),vec2(.025,0.0))),min(segment(q,vec2(.025,0.0),vec2(.065,.035)),segment(q,vec2(.065,.035),vec2(.12,-.04))));
  return min(min(letters,demo),min(border+.006,maker+.001));
}
vec3 studioReflection(vec3 r,float polished) {
  vec3 light=vec3(.049,.051,.054)*(0.6+0.4*smoothstep(-.4,.8,r.y));
  float key=pow(max(dot(r,normalize(vec3(-.35,.85,-.42))),0.0),mix(6.0,30.0,polished));
  float rim=pow(max(dot(r,normalize(vec3(.85,.32,.25))),0.0),mix(10.0,46.0,polished));
  float strip=exp(-pow((r.x+.17)*mix(4.0,7.0,polished),2.0))*smoothstep(.1,.8,r.y)*(1.0-smoothstep(.2,.8,r.z));
  float warm=pow(max(dot(r,normalize(vec3(-.7,.2,.65))),0.0),10.0);
  light+=vec3(2.65,2.55,2.4)*key+vec3(1.75,1.82,1.9)*rim+vec3(1.65,1.68,1.72)*strip+vec3(.18,.16,.13)*warm;
  return light;
}
vec3 displayColor(vec3 linear) {
  vec3 mapped=clamp((linear*(2.51*linear+.03))/(linear*(2.43*linear+.59)+.14),0.0,1.0);
  return pow(mapped,vec3(1.0/2.2));
}
void main() {
  if(u_surface>.5) {
    float c=cos(u_shadowAngle),s=sin(u_shadowAngle);
    vec2 p=mat2(c,s,-s,c)*v_position.xz;
    float broad=exp(-dot(p/vec2(1.65,.88),p/vec2(1.65,.88))*2.0);
    float contact=1.0-smoothstep(-.12,.22,boxDistance(p,vec2(1.25,.57),.16));
    float pool=exp(-dot(v_position.xz/vec2(3.5,2.8),v_position.xz/vec2(3.5,2.8)));
    float grain=fract(sin(dot(v_position.xz,vec2(12.9898,78.233)))*43758.5453)*.00025;
    vec3 floorColor=(vec3(.003,.0048,.0068)+vec3(.020,.016,.010)*pool+grain)*(1.0-.40*broad-.48*contact);
    gl_FragColor=vec4(displayColor(floorColor),1.0);return;
  }
  vec3 N = normalize(v_normal);
  float roughness=clamp(u_roughness,.08,.8);
  vec3 tangent=normalize(cross(abs(N.y)<.95?vec3(0.0,1.0,0.0):vec3(0.0,0.0,1.0),N));
  vec3 bitangent=cross(N,tangent);
  float brush=sin(v_local.x*55.0+sin(v_local.z*12.0)*.2);
  float grain=sin(v_local.z*85.0+v_local.x*11.0)*sin(v_local.x*73.0);
  N=normalize(N+tangent*brush*(.0012+.003*roughness)+bitangent*grain*.0006);
  float stamp=0.0,lip=0.0;
  // The SDF changes the local highlight as an incision would, rather than
  // painting black letters. Extra gradient taps run only near the top mark.
  if(v_local.y>.235) {
    vec2 p=vec2(v_local.x,-v_local.z);
    float distance=engravingDistance(p),top=smoothstep(.235,.239,v_local.y);
    stamp=(1.0-smoothstep(.005,.013,distance))*top;
    lip=(1.0-smoothstep(.002,.007,abs(distance-.014)))*top;
    if(distance<.03) {
      vec2 slope=vec2(engravingDistance(p+vec2(.003,0.0))-distance,engravingDistance(p+vec2(0.0,.003))-distance)/.003;
      float shoulder=smoothstep(.003,.009,distance)*(1.0-smoothstep(.012,.026,distance))*top;
      N=normalize(N+(tangent*slope.x-bitangent*slope.y)*shoulder*.15);
    }
  }
  vec3 V = normalize(u_camera-v_position);
  vec3 L = normalize(u_light-v_position);
  float NoV=max(dot(N,V),.001),NoL=max(dot(N,L),0.0);
  // Keep the historical gold identifier for the composed immersive shader.
  vec3 gold=clamp(u_metalColor,vec3(0.0),vec3(1.0)),fresnel=gold+(1.0-gold)*pow(1.0-NoV,5.0);
  vec3 reflection=studioReflection(reflect(-V,N),clamp(u_refinement,0.0,1.0)*(1.0-roughness));
  vec3 color=fresnel*reflection+gold*(.035+.055*NoL);
  color*=mix(.73,1.0,smoothstep(-.24,.10,v_local.y));
  color*=1.0-stamp*.56;
  color+=gold*lip*.055;
  gl_FragColor=vec4(displayColor(color),1.0);
}`;
