import {clamp,goldBarMatrices,multiplyMatrices,translationMatrix,type GoldBarPose,GOLD_VERTEX_SHADER,GOLD_FRAGMENT_SHADER} from './gold-bar-3d.ts';

export const immersiveChapters=[
  {label:'MINA',title:'Todo empieza\nbajo la superficie.',body:'Mina virtual ficticia. Desliza para explorar su profundidad.',detail:'DEMO'},
  {label:'EXTRACCIÓN',title:'De la veta,\nal proceso.',body:'Una extracción ilustrativa, sin producción física.',detail:'DEMO'},
  {label:'PROCESAMIENTO',title:'De la roca,\na la materia.',body:'Separación mineral ilustrativa. No acredita producción ni pureza.',detail:'DEMO'},
  {label:'REFINACIÓN',title:'Lo valioso\ntoma forma.',body:'La refinación es una representación virtual.',detail:'DEMO'},
  {label:'FORMACIÓN DEL LINGOTE',title:'Un lingote.\nUn lote.',body:'Metal y referencias de lote simulados.',detail:'DEMO'},
  {label:'CUSTODIA VIRTUAL',title:'Cada gramo,\nuna referencia.',body:'Bóveda ficticia; no representa instalaciones reales.',detail:'DEMO'},
  {label:'FRACCIONAMIENTO DIGITAL',title:'Del metal,\na tu portafolio.',body:'Se fracciona el registro; el lote permanece. Accede a tus posiciones de demostración.',detail:'DEMO'},
] as const;
export const chapterAt=(progress:number)=>Math.round(clamp(progress,0,1)*6);
export const immersiveTravel=(height:number)=>Math.max(300,Math.min(650,height*.72))*6;
const frames:GoldBarPose[]=[
  {yaw:-.7,pitch:.7,roll:-.18,distance:2.9,lift:.35,refinement:.1,light:[-3,4,3]},
  {yaw:.9,pitch:.88,roll:.24,distance:2.6,lift:.45,refinement:.2,light:[-2,4,1]},
  {yaw:1.7,pitch:1.12,roll:.03,distance:2.8,lift:.42,refinement:.5,light:[2,3,1]},
  {yaw:.3,pitch:.64,roll:-.04,distance:3.1,lift:.4,refinement:1,light:[-3,4,3]},
  {yaw:-.45,pitch:.4,roll:0,distance:3.6,lift:.38,refinement:1,light:[-1,3,4]},
  {yaw:.15,pitch:.96,roll:.02,distance:3,lift:.5,refinement:1,light:[3,4,2]},
  {yaw:-.2,pitch:.65,roll:-.02,distance:3.1,lift:.85,refinement:1,light:[-3,4,3]},
];
export function immersivePose(progress:number,dragYaw=0):GoldBarPose{
  const scaled=clamp(progress,0,1)*6,index=Math.min(5,Math.floor(scaled)),raw=scaled-index,t=raw*raw*(3-2*raw),a=frames[index],b=frames[index+1];
  const mix=(x:number,y:number)=>x+(y-x)*t;
  return {yaw:mix(a.yaw,b.yaw)+(Number.isFinite(dragYaw)?dragYaw%(Math.PI*2):0),pitch:mix(a.pitch,b.pitch),roll:mix(a.roll,b.roll),distance:mix(a.distance,b.distance),lift:mix(a.lift,b.lift),refinement:mix(a.refinement,b.refinement),light:a.light.map((value,i)=>mix(value,b.light[i])) as unknown as GoldBarPose['light']};
}
export function immersiveMatrices(pose:GoldBarPose,aspect:number,progress:number){
  const matrices=goldBarMatrices(pose,aspect),raw=clamp((progress-.38)/.28,0,1),formation=raw*raw*(3-2*raw);
  // The mineral is much deeper than the final casting. A floor positioned for
  // the thin bar would occlude most of its volume and make it look like a sheet.
  const floorOffset=translationMatrix(0,-1.28*(1-formation),0);
  return {...matrices,floorModel:multiplyMatrices(matrices.floorModel,floorOffset),floorMvp:multiplyMatrices(matrices.floorMvp,floorOffset)};
}
// One bounded mesh morphs on the GPU. Progress is a pure function of scroll,
// including reverse scroll; no autonomous timeline or downloaded scene assets.
export const IMMERSIVE_VERTEX_SHADER=GOLD_VERTEX_SHADER.replace('uniform mat4 u_model;','uniform mat4 u_model;\nuniform float u_storyProgress;\nuniform float u_surface;\nuniform float u_extractionScale;').replace('vec4 world = u_model * vec4(a_position, 1.0);',`
  float formation=smoothstep(.38,.66,u_storyProgress);
  vec3 seed=a_position+vec3(.001);
  vec3 mineralDirection=normalize(seed/vec3(1.4,.24,.675));
  float grain=sin(mineralDirection.x*5.0+mineralDirection.z*3.0)*sin(mineralDirection.y*6.0-mineralDirection.z*2.0);
  float release=smoothstep(.06,.17,u_storyProgress)*(1.0-smoothstep(.2,.34,u_storyProgress));
  float radius=.88+grain*.10+sin(mineralDirection.z*7.0+mineralDirection.y*4.0)*.045;
  float a=mineralDirection.x*5.0+mineralDirection.z*3.0,b=mineralDirection.y*6.0-mineralDirection.z*2.0,c=mineralDirection.z*7.0+mineralDirection.y*4.0;
  vec3 slope=(.10+release*.1)*vec3(5.0*cos(a)*sin(b),6.0*sin(a)*cos(b),3.0*cos(a)*sin(b)-2.0*sin(a)*cos(b))+.045*cos(c)*vec3(0.0,4.0,7.0);
  vec3 tangent=normalize(cross(abs(mineralDirection.y)<.9?vec3(0.0,1.0,0.0):vec3(1.0,0.0,0.0),mineralDirection));
  vec3 bitangent=cross(mineralDirection,tangent);
  float releasedRadius=radius+release*(.08+.1*grain);
  vec3 dt=(releasedRadius*tangent+mineralDirection*dot(slope,tangent))*vec3(1.12,1.28,1.04)+vec3(tangent.y*.12,tangent.z*.09,tangent.x*.07);
  vec3 db=(releasedRadius*bitangent+mineralDirection*dot(slope,bitangent))*vec3(1.12,1.28,1.04)+vec3(bitangent.y*.12,bitangent.z*.09,bitangent.x*.07);
  vec3 oreNormal=normalize(cross(dt,db));
  vec3 ore=mineralDirection*(radius+release*(.08+.1*grain))*vec3(1.12,1.28,1.04);
  ore+=vec3(mineralDirection.y*.12,mineralDirection.z*.09,mineralDirection.x*.07);
  vec3 point=u_surface>.5?a_position:mix(ore,a_position,formation)*u_extractionScale;
  vec4 world = u_model * vec4(point,1.0);`).replace('v_normal = mat3(u_model) * a_normal;','v_normal = mat3(u_model) * (u_surface>.5?a_normal:normalize(mix(oreNormal,a_normal,formation)));').replace('gl_Position = u_mvp * vec4(a_position, 1.0);','gl_Position = u_mvp * vec4(point,1.0);');
export const IMMERSIVE_FRAGMENT_SHADER=GOLD_FRAGMENT_SHADER.replace('uniform float u_refinement;','uniform float u_refinement;\nuniform float u_storyProgress;\nuniform float u_subjectOpacity;').replace('if(v_local.y>.235) {','if(v_local.y>.235&&u_storyProgress>.57) {').replace('top=smoothstep(.235,.239,v_local.y);','top=smoothstep(.235,.239,v_local.y)*smoothstep(.57,.66,u_storyProgress);').replace('gl_FragColor=vec4(displayColor(floorColor),1.0);','gl_FragColor=vec4(displayColor(floorColor),u_subjectOpacity);').replace('gl_FragColor=vec4(displayColor(color),1.0);',`
  float formation=smoothstep(.38,.66,u_storyProgress);
  float strata=.5+.5*sin(v_local.x*9.0+v_local.y*23.0+sin(v_local.z*13.0));
  float veins=1.0-smoothstep(.018,.075,abs(sin(v_local.x*6.0+v_local.y*11.0+sin(v_local.z*9.0))));
  float grit=fract(sin(dot(floor(v_local*170.0),vec3(127.1,311.7,74.7)))*43758.5453);
  float cracks=1.0-smoothstep(.012,.06,abs(sin(v_local.x*19.0+v_local.y*27.0+sin(v_local.z*13.0))));
  vec3 rock=mix(vec3(.105,.115,.12),vec3(.19,.172,.14),.25+.5*strata)*(.40+.42*NoL)*(.83+.17*grit)*(1.0-.38*cracks);
  rock=mix(rock,vec3(.22,.225,.21)*(.4+.42*NoL),veins*.10);
  float heat=smoothstep(.36,.47,u_storyProgress)*(1.0-smoothstep(.53,.64,u_storyProgress));
  color=mix(rock,color,formation)+vec3(.095,.021,.004)*heat;
  gl_FragColor=vec4(displayColor(color),u_subjectOpacity);`);

export function renderBudget(samples:readonly number[]){
  const values=samples.filter(value=>Number.isFinite(value)&&value>=0);
  if(values.length<90)return false;
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length*.9)]>40;
}
