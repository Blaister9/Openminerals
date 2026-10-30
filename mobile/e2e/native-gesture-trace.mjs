import {createHash} from 'node:crypto';
import {requireSafe} from './ci-safety.mjs';

// Freeze the input workload independently of scene copy, renderer and recorder.
// Preparation, accessibility assertions and screenshots belong outside this trace.
const specification={
  protocol:'openminerals-native-gesture-trace-v1',
  coordinateSpace:'effective portrait display pixels',
  xFraction:0.8,lowerYFraction:0.8,upperYFraction:0.18,
  swipeDurationMs:1800,settleMs:250,
  segments:[{name:'advance',direction:'UP',count:3},{name:'reverse',direction:'DOWN',count:4},{name:'complete',direction:'UP',count:8}],
};
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export function nativeGestureTrace(display){
  requireSafe(typeof display==='string','The gesture trace requires display dimensions.');
  const physical=/Physical size:\s*(\d+)x(\d+)/.exec(display);
  const override=/Override size:\s*(\d+)x(\d+)/.exec(display);
  const size=override??physical;
  const width=Number(size?.[1]),height=Number(size?.[2]);
  requireSafe(Number.isInteger(width)&&Number.isInteger(height)&&width>=320&&width<=4320&&height>width&&height<=8192,'The fixed trace requires a bounded portrait display.');
  const x=Math.round(width*specification.xFraction),lower=Math.round(height*specification.lowerYFraction),upper=Math.round(height*specification.upperYFraction);
  const gestures=specification.segments.flatMap(segment=>Array.from({length:segment.count},()=>({
    segment:segment.name,direction:segment.direction,
    args:['shell','input','touchscreen','swipe',String(x),String(segment.direction==='UP'?lower:upper),String(x),String(segment.direction==='UP'?upper:lower),String(specification.swipeDurationMs)],
    settleMs:specification.settleMs,
  })));
  const compiled={display:{width,height},gestures};
  return {protocol:specification.protocol,specificationSha256:digest(specification),compiledSha256:digest(compiled),...compiled,gestureCount:gestures.length,plannedDurationMs:gestures.length*(specification.swipeDurationMs+specification.settleMs)};
}

export async function executeNativeGestureTrace({trace,adb,wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),now=()=>performance.now()}){
  const startedAt=new Date().toISOString(),started=now(),events=[];
  for(const [index,gesture] of trace.gestures.entries()){
    const startMs=now()-started;
    await adb(...gesture.args);
    const inputCompletedMs=now()-started;
    await wait(gesture.settleMs);
    events.push({index,segment:gesture.segment,direction:gesture.direction,startMs:Number(startMs.toFixed(3)),inputCompletedMs:Number(inputCompletedMs.toFixed(3)),completedMs:Number((now()-started).toFixed(3))});
  }
  return {startedAt,completedAt:new Date().toISOString(),observedDurationMs:Number((now()-started).toFixed(3)),events};
}
