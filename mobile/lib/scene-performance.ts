// Completion costs include native queue/GPU waits when the ExpoGL barrier is
// available. They are wall-clock draw costs, not GPU-only timings or display FPS.
export const SCENE_COST_HISTORY=24;

export function sceneCostExceeded(samples:readonly number[],balanced:boolean):boolean {
  const window=balanced?24:12,threshold=balanced?40:20;
  const values=samples.filter(value=>Number.isFinite(value)&&value>=0).slice(-window);
  if(values.length<window)return false;
  values.sort((a,b)=>a-b);
  return values[Math.floor(values.length*.9)]>threshold;
}

export function isSoftwareSceneContext(gl:{flushEXP?:unknown;RENDERER?:number;getParameter?:(name:number)=>unknown}):boolean {
  // Browser/unknown strings retain the existing high tier. The native standard
  // RENDERER query avoids relying on emulator model names or private APIs.
  if(typeof gl.flushEXP!=='function'||typeof gl.RENDERER!=='number'||typeof gl.getParameter!=='function')return false;
  try{return /swiftshader|llvmpipe|softpipe|software (?:rasterizer|renderer)/i.test(String(gl.getParameter(gl.RENDERER)));}
  catch{return false;}
}
