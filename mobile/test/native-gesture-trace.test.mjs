import test from 'node:test';
import assert from 'node:assert/strict';
import {nativeGestureTrace,executeNativeGestureTrace} from '../e2e/native-gesture-trace.mjs';

test('Android comparison freezes identical input for recorded, unrecorded and light profiles',async()=>{
  const trace=nativeGestureTrace('Physical size: 1080x1920');
  assert.equal(trace.gestureCount,15);
  assert.equal(trace.plannedDurationMs,30750);
  assert.deepEqual(trace.gestures.map(item=>item.direction),[...Array(3).fill('UP'),...Array(4).fill('DOWN'),...Array(8).fill('UP')]);
  assert.deepEqual(trace.gestures[0].args,['shell','input','touchscreen','swipe','864','1536','864','346','1800']);
  assert.deepEqual(trace.gestures[3].args,['shell','input','touchscreen','swipe','864','346','864','1536','1800']);
  assert.equal(trace.compiledSha256,nativeGestureTrace('Physical size: 1080x1920').compiledSha256);
  assert.notEqual(trace.compiledSha256,nativeGestureTrace('Physical size: 720x1280').compiledSha256);
  assert.equal(trace.specificationSha256,nativeGestureTrace('Physical size: 720x1280').specificationSha256);
  let clock=0;const commands=[],waits=[];
  const result=await executeNativeGestureTrace({trace,adb:(...args)=>{commands.push(args);clock+=1800;},wait:async ms=>{waits.push(ms);clock+=ms;},now:()=>clock});
  assert.deepEqual(commands,trace.gestures.map(item=>item.args));
  assert.deepEqual(waits,Array(15).fill(250));
  assert.equal(result.events.length,15);assert.equal(result.observedDurationMs,30750);
  assert.equal(result.events.at(-1).completedMs,30750);
});

test('Android comparison uses effective display dimensions and rejects missing or landscape sizes',()=>{
  const overridden=nativeGestureTrace('Physical size: 1080x1920\nOverride size: 720x1280');
  assert.deepEqual(overridden.display,{width:720,height:1280});
  for(const bad of ['',null,'Physical size: 1920x1080','Physical size: 0x0','Physical size: 1080x999999','Physical size: 200x400'])assert.throws(()=>nativeGestureTrace(bad));
});

test('A failed native swipe aborts comparison without silently shortening the workload',async()=>{
  let called=0;
  await assert.rejects(executeNativeGestureTrace({trace:nativeGestureTrace('Physical size: 1080x1920'),adb:()=>{if(++called===4)throw Error('Input failed');},wait:async()=>{}}),/Input failed/);
  assert.equal(called,4);
});
