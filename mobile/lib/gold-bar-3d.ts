export type Vec3=readonly[number,number,number];
export type GoldBarMesh={positions:Float32Array;normals:Float32Array;vertexCount:number;triangleCount:number};
export type GoldBarPose={yaw:number;pitch:number;roll:number;distance:number;lift:number;refinement:number;light:Vec3};
export type Mat4=Float32Array;

const finite=(value:number,fallback=0)=>Number.isFinite(value)?value:fallback;
export const clamp=(value:number,min:number,max:number)=>Math.min(max,Math.max(min,finite(value,min)));
const subtract=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];

// Four octagonal rings form a closed, tapered, bevelled solid. Normals are
// duplicated per face for visible bevels; the topology is 64 actual triangles.
export function createGoldBarMesh(width=2.8,depth=1.35,height=.48,bevel=.08):GoldBarMesh {
  if(![width,depth,height,bevel].every(value=>Number.isFinite(value)&&value>0)||bevel>=Math.min(width,depth,height)/4)throw new Error('Invalid gold-bar dimensions.');
  const ring=(y:number,x:number,z:number,cut:number):Vec3[]=>[
    [-x+cut,y,-z],[x-cut,y,-z],[x,y,-z+cut],[x,y,z-cut],
    [x-cut,y,z],[-x+cut,y,z],[-x,y,z-cut],[-x,y,-z+cut],
  ];
  const rings=[ring(-height/2,width/2-bevel,depth/2-bevel,bevel*.6),ring(-height/2+bevel,width/2,depth/2,bevel),ring(height/2-bevel,width*.44,depth*.44,bevel),ring(height/2,width*.44-bevel,depth*.44-bevel,bevel*.6)];
  const positions:number[]=[],normals:number[]=[];
  function triangle(a:Vec3,b:Vec3,c:Vec3){
    let normal=cross(subtract(b,a),subtract(c,a));
    const center:Vec3=[(a[0]+b[0]+c[0])/3,(a[1]+b[1]+c[1])/3,(a[2]+b[2]+c[2])/3];
    if(dot(normal,center)<0){[b,c]=[c,b];normal=cross(subtract(b,a),subtract(c,a));}
    const length=Math.hypot(...normal);if(length<1e-10)throw new Error('Degenerate gold-bar triangle.');
    const unit=normal.map(value=>value/length);
    for(const vertex of [a,b,c]){positions.push(...vertex);normals.push(...unit);}
  }
  for(let level=0;level<3;level++)for(let i=0;i<8;i++){
    const j=(i+1)%8;
    triangle(rings[level][i],rings[level][j],rings[level+1][j]);
    triangle(rings[level][i],rings[level+1][j],rings[level+1][i]);
  }
  for(let i=0;i<8;i++){
    triangle([0,-height/2,0],rings[0][i],rings[0][(i+1)%8]);
    triangle([0,height/2,0],rings[3][i],rings[3][(i+1)%8]);
  }
  return {positions:new Float32Array(positions),normals:new Float32Array(normals),vertexCount:positions.length/3,triangleCount:positions.length/9};
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
export const storyStage=(progress:number)=>Math.round(clamp(progress,0,1)*4);
export const horizontalDrag=(dx:number,dy:number,touches=1)=>Number.isFinite(dx)&&Number.isFinite(dy)&&touches===1&&Math.abs(dx)>8&&Math.abs(dx)>Math.abs(dy)*1.4;

const cameraFrames:GoldBarPose[]=[
  {yaw:-.85,pitch:.65,roll:-.12,distance:5.3,lift:-.08,refinement:.18,light:[-3,4,5]},
  {yaw:-.35,pitch:.95,roll:.05,distance:4.8,lift:.05,refinement:.85,light:[-2,4,4]},
  {yaw:.35,pitch:.72,roll:0,distance:4.5,lift:0,refinement:1,light:[2,4,4]},
  {yaw:1.05,pitch:.5,roll:-.05,distance:5,lift:.02,refinement:1,light:[-3,3,4]},
  {yaw:.15,pitch:.8,roll:.08,distance:4.65,lift:0,refinement:1,light:[-1.5,4,4]},
];
export function goldBarPose(progress:number,dragYaw=0,reducedMotion=false):GoldBarPose {
  const scaled=(reducedMotion?.5:clamp(progress,0,1))*4,index=Math.min(3,Math.floor(scaled)),next=index+1;
  const raw=scaled-index,t=raw*raw*(3-2*raw),a=cameraFrames[index],b=cameraFrames[next],mix=(x:number,y:number)=>x+(y-x)*t;
  return {yaw:mix(a.yaw,b.yaw)+(reducedMotion?0:finite(dragYaw)%(Math.PI*2)),pitch:mix(a.pitch,b.pitch),roll:mix(a.roll,b.roll),distance:mix(a.distance,b.distance),lift:mix(a.lift,b.lift),refinement:mix(a.refinement,b.refinement),light:a.light.map((value,i)=>mix(value,b.light[i])) as unknown as Vec3};
}
export function goldBarMatrices(pose:GoldBarPose,aspect:number):{model:Mat4;mvp:Mat4} {
  const model=multiplyMatrices(translationMatrix(0,pose.lift,0),multiplyMatrices(rotationY(pose.yaw),multiplyMatrices(rotationX(pose.pitch),rotationZ(pose.roll))));
  const view=translationMatrix(0,0,-pose.distance);
  const projection=perspectiveMatrix(Math.PI/4,clamp(aspect,.4,4));
  return {model,mvp:multiplyMatrices(projection,multiplyMatrices(view,model))};
}

// Demand rendering: input changes coalesce into at most one queued frame.
// No idle RAF loop, and disabled/disposed renderers cannot submit a frame.
export function createFrameScheduler({request,cancel,draw,onError}:{request:(callback:()=>void)=>number;cancel:(id:number)=>void;draw:()=>void;onError:(error:unknown)=>void}){
  let pending:number|null=null,enabled=true,dirty=false,disposed=false;
  const schedule=()=>{if(!disposed&&enabled&&dirty&&pending===null)pending=request(frame);};
  const frame=()=>{
    pending=null;if(disposed||!enabled||!dirty)return;dirty=false;
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
precision mediump float;
uniform vec3 u_camera;
uniform vec3 u_light;
uniform float u_refinement;
varying vec3 v_position;
varying vec3 v_normal;
varying vec3 v_local;
float stroke(vec2 p, vec2 a, vec2 b) {
  vec2 ab = b-a;
  float t = clamp(dot(p-a,ab)/dot(ab,ab),0.0,1.0);
  return 1.0-smoothstep(0.012,0.025,length(p-a-t*ab));
}
void main() {
  vec3 N = normalize(v_normal);
  vec3 V = normalize(u_camera-v_position);
  vec3 L = normalize(u_light-v_position);
  float diffuse = max(dot(N,L),0.0);
  float specular = pow(max(dot(N,normalize(L+V)),0.0),mix(12.0,58.0,u_refinement));
  float rim = pow(1.0-max(dot(N,V),0.0),3.0);
  float brushed = 0.016*sin(v_local.x*130.0+v_local.z*17.0);
  vec3 base = mix(vec3(0.42,0.28,0.095),vec3(0.83,0.52,0.14),u_refinement);
  vec3 color = base*(0.24+0.72*diffuse+brushed)+vec3(1.0,0.88,0.55)*specular*0.85+vec3(0.48,0.34,0.11)*rim*0.4;
  vec2 p = v_local.xz;
  float stamp = max(stroke(p,vec2(-0.48,0.16),vec2(-0.30,-0.18)),stroke(p,vec2(-0.30,-0.18),vec2(-0.12,0.16)));
  stamp = max(stamp,stroke(p,vec2(-0.40,0.025),vec2(-0.20,0.025)));
  stamp = max(stamp,stroke(p,vec2(0.10,-0.16),vec2(0.10,0.13)));
  stamp = max(stamp,stroke(p,vec2(0.10,0.13),vec2(0.40,0.13)));
  stamp = max(stamp,stroke(p,vec2(0.40,0.13),vec2(0.40,-0.16)));
  color = mix(color,vec3(0.27,0.15,0.035),stamp*step(0.235,v_local.y)*0.85);
  gl_FragColor = vec4(clamp(color,0.0,1.0),1.0);
}`;
