export type SceneOrbit={yaw:number;peek:number};
export function advanceSceneOrbit(previous:SceneOrbit,deltaPixels:number):SceneOrbit {
 const yaw=Number.isFinite(previous.yaw)?previous.yaw:0,peek=Number.isFinite(previous.peek)?previous.peek:0;
 if(!Number.isFinite(deltaPixels))return {yaw,peek};
 const delta=deltaPixels*.012;
 return {yaw:(yaw+delta)%(Math.PI*2),peek:Math.max(-1.2,Math.min(1.2,peek+delta))};
}
