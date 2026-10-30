import {clamp,multiplyMatrices,perspectiveMatrix,type Vec3} from './gold-bar-3d.ts';

export type MineSceneMesh={positions:Float32Array;normals:Float32Array;materials:Float32Array;vertexCount:number;triangleCount:number};

// Procedural, fictitious DEMO geology. The tunnel has no relation to a real mine.
// The float material attribute stores an integer type plus .49 * cavity AO.
// Dust instead stores its quad corner in the fractional part. All buffers are
// static: neither camera movement nor dust requires rebuilding the mesh.
export const MINE_MATERIAL={rock:0,floor:1,ore:2,quartz:3,housing:4,emissive:5,dust:6} as const;
const RADIAL=28,SEGMENTS=46,LENGTH=46,FRONT=3.5,DUST_COUNT=48;
export const MINE_TUNNEL_TRIANGLES=RADIAL*SEGMENTS*2;

const sub=(a:Vec3,b:Vec3):Vec3=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dot=(a:Vec3,b:Vec3)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a:Vec3,b:Vec3):Vec3=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=(a:Vec3):Vec3=>{const size=Math.hypot(...a);if(size<1e-10)throw new Error('Degenerate DEMO geology surface.');return [a[0]/size,a[1]/size,a[2]/size];};
const center=(z:number):Vec3=>[.35*Math.sin(z*.13)+.12*Math.sin(z*.37),.25+.2*Math.sin(z*.15),z];
const finite=(value:number,fallback=0)=>Number.isFinite(value)?value:fallback;
const smooth=(from:number,to:number,value:number)=>{const t=clamp((value-from)/(to-from),0,1);return t*t*(3-2*t);};
const pack=(type:number,ao=1)=>type+.49*clamp(ao,0,1);
const random=(seed:number)=>{const value=Math.sin(seed*127.1+311.7)*43758.5453;return value-Math.floor(value);};
const wallRough=(angle:number,z:number)=>.055*Math.sin(angle*5+z*.53)+.04*Math.sin(angle*9-z*.91)+.02*Math.sin(angle*3+z*1.8);
const wallWidth=(z:number)=>3.15+.18*Math.sin(z*.27);
const lampPosition=(z:number):Vec3=>{
  const axis=center(z),angle=Math.PI-Math.asin(1.2/2.9);
  return [axis[0]+wallWidth(z)*Math.cos(angle)*(1+wallRough(angle,z))+.4,axis[1]+1.2,z];
};
const lampPositions=[-2.5,-12.5,-22.5,-32.5].map(lampPosition);

export function createMineSceneMesh():MineSceneMesh {
  const positions:number[]=[],normals:number[]=[],materials:number[]=[];
  function triangle(a:Vec3,b:Vec3,c:Vec3,type:number,ao=.8,toward?:Vec3){
    let normal=cross(sub(b,a),sub(c,a));
    if(toward&&dot(normal,toward)<0){[b,c]=[c,b];normal=cross(sub(b,a),sub(c,a));}
    normal=unit(normal);
    for(const vertex of [a,b,c]){positions.push(...vertex);normals.push(...normal);materials.push(pack(type,ao));}
  }
  // A continuous, open-front tunnel, not an image plane. Wall normals are
  // computed from displaced triangles and averaged before normalization.
  const wall:Vec3[]=[],ao:number[]=[],sums:number[][]=[];
  for(let ring=0;ring<=SEGMENTS;ring++){
    const z=FRONT-ring*LENGTH/SEGMENTS,axis=center(z);
    for(let side=0;side<RADIAL;side++){
      const angle=side/RADIAL*Math.PI*2;
      const rough=wallRough(angle,z),width=wallWidth(z);
      const x=axis[0]+width*Math.cos(angle)*(1+rough);
      const floor=Math.sin(angle)<-.7;
      const y=axis[1]+(floor?-2.1+.11*Math.sin(z*1.3+angle*4)+.04*Math.sin(z*2.3+angle*9):2.9*Math.sin(angle)*(1+rough));
      wall.push([x,y,z]);ao.push(clamp(.79-rough*1.9+(floor?-.07:0),.43,.97));sums.push([0,0,0]);
    }
  }
  const faces:{indices:[number,number,number];type:number}[]=[];
  function wallFace(a:number,b:number,c:number,type:number){
    let normal=cross(sub(wall[b],wall[a]),sub(wall[c],wall[a]));
    const p:Vec3=[(wall[a][0]+wall[b][0]+wall[c][0])/3,(wall[a][1]+wall[b][1]+wall[c][1])/3,(wall[a][2]+wall[b][2]+wall[c][2])/3];
    if(dot(normal,sub(center(p[2]),p))<0){[b,c]=[c,b];normal=cross(sub(wall[b],wall[a]),sub(wall[c],wall[a]));}
    for(const index of [a,b,c])for(let axis=0;axis<3;axis++)sums[index][axis]+=normal[axis];
    faces.push({indices:[a,b,c],type});
  }
  for(let ring=0;ring<SEGMENTS;ring++)for(let side=0;side<RADIAL;side++){
    const next=(side+1)%RADIAL,a=ring*RADIAL+side,b=ring*RADIAL+next,c=(ring+1)*RADIAL+next,d=(ring+1)*RADIAL+side;
    const floor=Math.sin((side+.5)/RADIAL*Math.PI*2)<-.7,type=floor?MINE_MATERIAL.floor:MINE_MATERIAL.rock;
    wallFace(a,b,c,type);wallFace(a,c,d,type);
  }
  const wallNormals=sums.map(value=>unit(value as unknown as Vec3));
  for(const face of faces)for(const index of face.indices){positions.push(...wall[index]);normals.push(...wallNormals[index]);materials.push(pack(face.type,ao[index]));}
  const end=center(FRONT-LENGTH);
  for(let side=0;side<RADIAL;side++)triangle(end,wall[SEGMENTS*RADIAL+side],wall[SEGMENTS*RADIAL+(side+1)%RADIAL],MINE_MATERIAL.rock,.32,[0,0,1]);

  function block(at:Vec3,size:Vec3,type:number){
    const corners:Vec3[]=[];
    for(let i=0;i<8;i++)corners.push([at[0]+(i&1?1:-1)*size[0]/2,at[1]+(i&2?1:-1)*size[1]/2,at[2]+(i&4?1:-1)*size[2]/2]);
    for(const [a,b,c,d] of [[0,2,3,1],[4,5,7,6],[0,4,6,2],[1,3,7,5],[0,1,5,4],[2,6,7,3]]){
      const outward=sub(corners[a],at);triangle(corners[a],corners[b],corners[c],type,.69,outward);triangle(corners[a],corners[c],corners[d],type,.69,outward);
    }
  }
  const phi=(1+Math.sqrt(5))/2;
  const ico:Vec3[]=([[-1,phi,0],[1,phi,0],[-1,-phi,0],[1,-phi,0],[0,-1,phi],[0,1,phi],[0,-1,-phi],[0,1,-phi],[phi,0,-1],[phi,0,1],[-phi,0,-1],[-phi,0,1]] as Vec3[]).map(unit);
  const icoFaces=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  function boulder(at:Vec3,size:Vec3,seed:number,type:number=MINE_MATERIAL.rock){
    const deform=(point:Vec3):Vec3=>{
      const radius=1+.12*Math.sin(point[0]*8+seed)+.1*Math.sin(point[1]*9-point[2]*5+seed*.7);
      return [at[0]+point[0]*size[0]*radius,at[1]+point[1]*size[1]*radius,at[2]+point[2]*size[2]*radius];
    };
    const mid=(a:Vec3,b:Vec3)=>unit([(a[0]+b[0])/2,(a[1]+b[1])/2,(a[2]+b[2])/2]);
    const pieces:{vertices:Vec3[];normal:Vec3}[]=[],averages=new Map<string,number[]>(),key=(p:Vec3)=>p.map(value=>value.toFixed(7)).join(',');
    for(const indices of icoFaces){
      const [a,b,c]=indices.map(index=>ico[index]),ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);
      for(const face of [[a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]]){
        let [v0,v1,v2]=face.map(deform),normal=cross(sub(v1,v0),sub(v2,v0));
        if(dot(normal,sub(v0,at))<0){[v1,v2]=[v2,v1];normal=cross(sub(v1,v0),sub(v2,v0));}
        pieces.push({vertices:[v0,v1,v2],normal:unit(normal)});
        for(const vertex of [v0,v1,v2]){const id=key(vertex),sum=averages.get(id)||[0,0,0];for(let axis=0;axis<3;axis++)sum[axis]+=normal[axis];averages.set(id,sum);}
      }
    }
    for(const piece of pieces)for(const vertex of piece.vertices){
      const smooth=unit(averages.get(key(vertex))! as unknown as Vec3);
      const normal=unit(smooth.map((value,axis)=>value*.82+piece.normal[axis]*.18) as unknown as Vec3);
      positions.push(...vertex);normals.push(...normal);materials.push(pack(type,.8));
    }
  }
  // Rounded, irregular rock strata overlap the wall volume. They never become
  // rectangular floating shelves, and their lighting normals follow the mesh.
  for(let i=0;i<14;i++){
    const z=-1.3-Math.floor(i/2)*5.1,axis=center(z),sign=i%2?1:-1;
    boulder([axis[0]+sign*wallWidth(z),axis[1]-.6+random(i+80)*1.55,z],[.48,.3+random(i+90)*.25,.8+random(i+100)*.45],i+200);
  }
  for(let i=0;i<14;i++){
    const z=-.8-i*2.6,axis=center(z),sign=i%2?1:-1;
    boulder([axis[0]+sign*(2.15+random(i+31)*.35),axis[1]-2.0,z],[.45+random(i+43)*.3,.4+random(i+53)*.35,.4+random(i+63)*.4],i+1);
  }
  for(let i=0;i<3;i++){const z=.5-i*5.4,axis=center(z);boulder([axis[0]+(i-1)*.62,axis[1]-2.18,z],[.24,.21,.32],i+1200);}
  for(const [z,sign] of [[-6,1],[-18,-1]]){
    const axis=center(z);boulder([axis[0]+sign*2.68,axis[1]+.25,z],[.46,.67,.65],z,MINE_MATERIAL.ore);
  }
  // Sparse, opaque quartz facets: no glass sorting or transmission pass.
  for(let crystal=0;crystal<5;crystal++){
    const z=-4-crystal*5.8,axis=center(z),sign=crystal%2?1:-1,at:Vec3=[axis[0]+sign*2.55,axis[1]-.3,z],radius=.09+random(crystal+400)*.05,height=.28+random(crystal+500)*.2;
    boulder([axis[0]+sign*3.0,axis[1]-.6,z],[.6,.4,.38],crystal+900);
    const ring=Array.from({length:6},(_,i):Vec3=>[at[0]+Math.cos(i*Math.PI/3)*radius,at[1],at[2]+Math.sin(i*Math.PI/3)*radius]);
    const tip:Vec3=[at[0]+.06,at[1]+height,at[2]];
    for(let side=0;side<6;side++){
      const a=ring[side],b=ring[(side+1)%6],bottom:Vec3=[a[0],a[1]-.13,a[2]],other:Vec3=[b[0],b[1]-.13,b[2]];
      triangle(a,b,tip,MINE_MATERIAL.quartz,.92,sub(a,at));triangle(a,bottom,other,MINE_MATERIAL.quartz,.9,sub(a,at));triangle(a,other,b,MINE_MATERIAL.quartz,.9,sub(a,at));
    }
  }
  for(let i=0;i<4;i++){
    const light=lampPositions[i],at:Vec3=[light[0]-.3,light[1],light[2]];
    block(at,[.3,.44,.27],MINE_MATERIAL.housing);
    block([at[0]+.18,at[1],at[2]],[.035,.29,.16],MINE_MATERIAL.emissive);
  }
  // Small world-space quads. Quantized centers keep each quad's four corners
  // together when the vertex shader adds deterministic progress-driven drift.
  for(let i=0;i<DUST_COUNT;i++){
    const z=Math.round((1-random(i+601)*35)*4)/4,axis=center(z);
    const at:Vec3=[Math.round((axis[0]+(random(i+701)-.5)*3.6)*4)/4,Math.round((axis[1]+(random(i+801)-.5)*2.8)*4)/4,z],size=.018;
    const corners:Vec3[]=[[-size,-size,0],[size,-size,0],[size,size,0],[-size,size,0]];
    for(const corner of [0,1,2,0,2,3]){positions.push(at[0]+corners[corner][0],at[1]+corners[corner][1],at[2]);normals.push(0,0,1);materials.push(MINE_MATERIAL.dust+corner*.125);}
  }
  return {positions:new Float32Array(positions),normals:new Float32Array(normals),materials:new Float32Array(materials),vertexCount:positions.length/3,triangleCount:positions.length/9};
}

export function mineSceneCamera(progress:number,aspect:number,drag=0):{vp:Float32Array;camera:Vec3} {
  const p=clamp(finite(progress),0,1),travel=smooth(0,.4,p),z=1.8-travel*18.5,axis=center(z);
  const camera:Vec3=[axis[0]+Math.sin(p*7)*.08,axis[1]+.03+Math.sin(p*9)*.035,z];
  const yaw=Math.sin(clamp(finite(drag),-1.2,1.2))*.23,next=center(z-7.5);
  const target:Vec3=[next[0]+Math.sin(yaw)*7.5,next[1]+.08,z-Math.cos(yaw)*7.5];
  const back=unit(sub(camera,target)),right=unit(cross([0,1,0],back)),up=cross(back,right);
  const view=new Float32Array([right[0],up[0],back[0],0,right[1],up[1],back[1],0,right[2],up[2],back[2],0,-dot(right,camera),-dot(up,camera),-dot(back,camera),1]);
  const projection=perspectiveMatrix(Math.PI/3.6,clamp(finite(aspect,9/16),.35,3),.08,75);
  return {vp:multiplyMatrices(projection,view),camera};
}

export function mineSceneVisibility(progress:number):number{return 1-smooth(.24,.4,clamp(finite(progress),0,1));}

export const MINE_VERTEX_SHADER=`
precision highp float;
attribute vec3 a_position;
attribute vec3 a_normal;
attribute float a_material;
uniform mat4 u_vp;
uniform float u_progress;
varying vec3 v_minePosition;
varying vec3 v_mineNormal;
varying float v_mineMaterial;
varying vec2 v_mineDust;
void main(){
  vec3 position=a_position;
  v_mineDust=vec2(0.0);
  if(a_material>5.9){
    float corner=floor(fract(a_material)*8.0+.5);
    v_mineDust=vec2(corner==1.0||corner==2.0?1.0:-1.0,corner>=2.0?1.0:-1.0);
    vec3 seed=floor(a_position*4.0+.5)*.25;
    position.xy+=vec2(sin(u_progress*11.0+seed.z*.37+seed.y),sin(u_progress*8.0+seed.x*.71))*vec2(.055,.045);
  }
  v_minePosition=position;v_mineNormal=a_normal;v_mineMaterial=a_material;
  gl_Position=u_vp*vec4(position,1.0);
}`;

export const MINE_FRAGMENT_SHADER=`
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform float u_progress;
uniform float u_opacity;
uniform vec3 u_camera;
varying vec3 v_minePosition;
varying vec3 v_mineNormal;
varying float v_mineMaterial;
varying vec2 v_mineDust;
float grain(vec3 p){p=fract(p*.1031);p+=dot(p,p.yzx+33.33);return fract((p.x+p.y)*p.z);}
vec3 displayMine(vec3 color){color=max(color,vec3(0.0))*2.2;return pow(color/(1.0+color),vec3(1.0/2.2));}
vec3 mineLamp(int index){
  ${lampPositions.map((position,index)=>`${index<3?`if(index==${index})`:''}return vec3(${position.map(value=>value.toFixed(6)).join(',')});`).join('\n  ')}
}
void main(){
  if(u_opacity<.001)discard;
  float kind=floor(v_mineMaterial+.001),alpha=1.0;
  if(kind>5.5){
    float radius=length(v_mineDust);if(radius>.95)discard;
    alpha=(1.0-smoothstep(.1,.95,radius))*.32;
    gl_FragColor=vec4(vec3(.48,.41,.29),alpha*u_opacity);return;
  }
  if(kind>4.5){gl_FragColor=vec4(displayMine(vec3(3.4,1.48,.4)),u_opacity);return;}
  float ao=clamp(fract(v_mineMaterial)/.49,.2,1.0);
  vec3 p=v_minePosition;
  vec3 n=normalize(v_mineNormal+vec3(sin(p.y*14.0+p.z*8.0),sin(p.z*11.0+p.x*7.0),sin(p.x*15.0-p.y*7.0))*.035);
  float bedding=p.y*4.3+p.z*.35+sin(p.z*.6+p.x*.5)*.4;
  float strata=.5+.5*sin(bedding);
  float fractureA=abs(sin(p.y*2.4+p.z*.8+sin(p.z*1.8+p.x*.4)*.35));
  float fractureB=abs(sin(p.x*3.0-p.z*1.5+sin(p.y*2.2)*.6));
  float crack=(1.0-smoothstep(.025,.08,fractureA))*.55+(1.0-smoothstep(.018,.055,fractureB))*.22;
  float fleck=.8+.2*grain(floor(p*18.0));
  vec3 base=mix(vec3(.067,.083,.095),vec3(.185,.169,.137),strata)*fleck*(1.0-crack);
  float roughness=.92;vec3 f0=vec3(.04);
  if(kind>.5&&kind<1.5){base=mix(vec3(.085,.086,.079),vec3(.16,.143,.111),strata*.7)*fleck*(1.0-crack*.6);roughness=.88;}
  if(kind>1.5&&kind<2.5){
    float seam=pow(max(0.0,sin(p.y*17.0+sin(p.z*6.0)*2.0)*sin(p.x*19.0+p.z*3.0)),28.0);
    seam=smoothstep(.78,.98,seam);
    base=mix(vec3(.085,.093,.086)*fleck,vec3(.38,.235,.065),seam);
    f0=mix(vec3(.04),vec3(.6,.35,.09),seam*.85);roughness=mix(.9,.48,seam);
  }
  if(kind>2.5&&kind<3.5){base=vec3(.5,.56,.58)*(.9+.1*fleck);roughness=.32;}
  if(kind>3.5){base=vec3(.06,.067,.075);roughness=.55;f0=vec3(.22);}
  vec3 view=normalize(u_camera-p);
  vec3 color=base*vec3(.12,.14,.165)*(.8+.2*max(n.y,0.0))*ao;
  color+=base*vec3(.018,.01,.003)*max(-n.y,0.0)*ao;
  for(int i=0;i<4;i++){
    vec3 lamp=mineLamp(i);
    vec3 delta=lamp-p;float distance2=dot(delta,delta);
    vec3 light=delta*inversesqrt(max(distance2,.001)),halfway=normalize(light+view);
    float nl=max(dot(n,light),0.0);
    float spec=pow(max(dot(n,halfway),0.0),mix(95.0,7.0,roughness))*(1.0-roughness*.8);
    vec3 fresnel=f0+(1.0-f0)*pow(1.0-max(dot(n,view),0.0),5.0);
    float attenuation=10.0/(1.5+distance2);
    color+=vec3(1.0,.72,.42)*attenuation*(base*nl*.65+fresnel*spec*nl*.5)*ao;
  }
  color+=base*vec3(.035,.014,.003)*smoothstep(.11,.29,u_progress);
  float fog=1.0-exp(-length(u_camera-p)*.036);
  color=mix(color,vec3(.012,.018,.024),fog);
  gl_FragColor=vec4(displayMine(color),clamp(u_opacity,0.0,1.0));
}`;
