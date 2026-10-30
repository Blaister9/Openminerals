import {clamp,type GoldBarPose,GOLD_VERTEX_SHADER,GOLD_FRAGMENT_SHADER} from './gold-bar-3d.ts';

export const immersiveChapters=[
  {label:'ORIGEN MINERAL',title:'El valor empieza\nbajo la superficie.',body:'De una veta mineral a una posición registrada. Explora el recorrido de la materia y su trazabilidad.',detail:'ORIGEN ILUSTRATIVO · datos sintéticos.'},
  {label:'EXTRACCIÓN',title:'Del terreno,\na un registro.',body:'La producción DEMO se registra por separado. Declararla no habilita una venta.',detail:'Producido → pendiente de verificación.'},
  {label:'REFINACIÓN',title:'La materia\nse transforma.',body:'La pureza y los documentos son referencias sintéticas. La verificación de esta demo no es un ensayo físico.',detail:'La cantidad pendiente sigue fuera de la oferta.'},
  {label:'FORMACIÓN DEL LINGOTE',title:'Una forma.\nUna referencia.',body:'Una recepción DEMO vincula cantidad, metal y lote. Solo entonces se incorpora a las existencias vendibles.',detail:'Recibido = disponible + asignado + salido.'},
  {label:'CUSTODIA VIRTUAL',title:'Resguardar.\nPoder consultar.',body:'Una representación ficticia de resguardo. Consulta las referencias del lote y sus certificados DEMO.',detail:'BÓVEDA VIRTUAL · sin instalaciones reales ni valor legal.'},
  {label:'FRACCIONAMIENTO DIGITAL',title:'El lote permanece.\nLa posición cambia.',body:'Se registran fracciones simuladas sobre un lote. Un intercambio cambia la asignación, sin producir más metal.',detail:'Reservado y comprometido forman parte de lo asignado.'},
  {label:'PORTAFOLIO',title:'Tu siguiente\nmovimiento.',body:'Consulta posiciones, opera con claridad y sigue cada comprobante. Tus operaciones están a un toque.',detail:'SIMULADO · sin dinero, tokens o custodia reales.'},
] as const;
export const chapterAt=(progress:number)=>Math.round(clamp(progress,0,1)*6);
export const immersiveTravel=(height:number)=>Math.max(300,Math.min(650,height*.72))*6;
const frames:GoldBarPose[]=[
  {yaw:-.6,pitch:.55,roll:-.12,distance:4.8,lift:0,refinement:.1,light:[-3,4,3]},
  {yaw:.8,pitch:.8,roll:.16,distance:3.9,lift:.16,refinement:.2,light:[-2,4,1]},
  {yaw:1.6,pitch:1.1,roll:0,distance:3.5,lift:.1,refinement:.5,light:[2,3,1]},
  {yaw:.3,pitch:.6,roll:-.04,distance:4.6,lift:0,refinement:1,light:[-3,4,3]},
  {yaw:-.45,pitch:.35,roll:0,distance:5.2,lift:.02,refinement:1,light:[-1,3,4]},
  {yaw:.15,pitch:.96,roll:0,distance:4.3,lift:.1,refinement:1,light:[3,4,2]},
  {yaw:-.2,pitch:.65,roll:-.02,distance:4.5,lift:0,refinement:1,light:[-3,4,3]},
];
export function immersivePose(progress:number,dragYaw=0):GoldBarPose{
  const scaled=clamp(progress,0,1)*6,index=Math.min(5,Math.floor(scaled)),raw=scaled-index,t=raw*raw*(3-2*raw),a=frames[index],b=frames[index+1];
  const mix=(x:number,y:number)=>x+(y-x)*t;
  return {yaw:mix(a.yaw,b.yaw)+(Number.isFinite(dragYaw)?dragYaw%(Math.PI*2):0),pitch:mix(a.pitch,b.pitch),roll:mix(a.roll,b.roll),distance:mix(a.distance,b.distance),lift:mix(a.lift,b.lift),refinement:mix(a.refinement,b.refinement),light:a.light.map((value,i)=>mix(value,b.light[i])) as unknown as GoldBarPose['light']};
}
// One bounded mesh morphs on the GPU. Progress is a pure function of scroll,
// including reverse scroll; no autonomous timeline or downloaded scene assets.
export const IMMERSIVE_VERTEX_SHADER=GOLD_VERTEX_SHADER.replace('uniform mat4 u_model;','uniform mat4 u_model;\nuniform float u_storyProgress;\nuniform float u_surface;').replace('vec4 world = u_model * vec4(a_position, 1.0);',`
  float formation=smoothstep(.26,.5,u_storyProgress);
  vec3 seed=a_position+vec3(.001);
  float grain=sin(seed.x*19.0+seed.z*13.0)*sin(seed.y*23.0+seed.z*7.0);
  vec3 ore=normalize(seed)*(.85+grain*.13);
  vec3 point=u_surface>.5?a_position:mix(ore,a_position,formation);
  vec4 world = u_model * vec4(point,1.0);`).replace('v_normal = mat3(u_model) * a_normal;','v_normal = mat3(u_model) * (u_surface>.5?a_normal:normalize(mix(normalize(seed),a_normal,formation)));').replace('gl_Position = u_mvp * vec4(a_position, 1.0);','gl_Position = u_mvp * vec4(point,1.0);');
export const IMMERSIVE_FRAGMENT_SHADER=GOLD_FRAGMENT_SHADER.replace('uniform float u_refinement;','uniform float u_refinement;\nuniform float u_storyProgress;').replace('gl_FragColor=vec4(displayColor(color),1.0);',`
  float formation=smoothstep(.26,.5,u_storyProgress);
  float veins=pow(max(0.0,sin(v_local.x*17.0+sin(v_local.y*31.0)*2.0)*sin(v_local.z*19.0+sin(v_local.x*11.0)*2.0)),16.0);
  float mineral=fract(sin(dot(v_local,vec3(127.1,311.7,74.7)))*43758.5453);
  vec3 rock=vec3(.11,.105,.085)*(.4+.7*NoL)*(.65+.45*mineral)+gold*veins*.5;
  float heat=smoothstep(.22,.32,u_storyProgress)*(1.0-smoothstep(.36,.48,u_storyProgress));
  color=mix(rock,color,formation)+vec3(.7,.16,.02)*heat;
  gl_FragColor=vec4(displayColor(color),1.0);`);

export function renderBudget(samples:readonly number[]){
  const values=samples.filter(value=>Number.isFinite(value)&&value>=0);
  if(values.length<90)return false;
  const sorted=[...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length*.9)]>40;
}
