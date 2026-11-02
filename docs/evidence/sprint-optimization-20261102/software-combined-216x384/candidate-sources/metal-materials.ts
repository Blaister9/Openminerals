import type {Vec3} from './gold-bar-3d.ts';

export type MetalCode='XAU'|'XAG'|'XPT'|'XPD';
export type MetalMaterial={reflectance:Vec3;roughness:number;symbol:string;label:string};

// Linear reflectance and surface-finish presets for this DEMO renderer. These
// are visual approximations, not measured optical constants or assay results.
// Finish depends on manufacture/polish, not a claim about intrinsic roughness.
// RSC primary appearance references: gold is yellow; Ag, Pt and Pd are bright
// neutral metals. Their identity must also be named/engraved, never color-only.
// https://periodic-table.rsc.org/element/79/gold
// https://periodic-table.rsc.org/element/47/silver
// https://periodic-table.rsc.org/element/78/platinum
// https://periodic-table.rsc.org/element/46/palladium
const materials:Record<MetalCode,MetalMaterial>={
  XAU:{reflectance:[.98,.77,.35],roughness:.24,symbol:'Au',label:'Oro'},
  XAG:{reflectance:[.96,.96,.95],roughness:.20,symbol:'Ag',label:'Plata'},
  XPT:{reflectance:[.67,.67,.66],roughness:.27,symbol:'Pt',label:'Platino'},
  XPD:{reflectance:[.72,.72,.71],roughness:.25,symbol:'Pd',label:'Paladio'},
};

export function metalMaterial(code:MetalCode):MetalMaterial{
  if(!Object.hasOwn(materials,code))throw new Error('Metal de demostración no disponible.');
  const value=materials[code];
  return {...value,reflectance:[value.reflectance[0],value.reflectance[1],value.reflectance[2]]};
}
