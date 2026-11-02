import test from 'node:test';
import assert from 'node:assert/strict';
import {createFrameScheduler} from '../lib/gold-bar-3d.ts';

// A controlled refresh clock verifies scheduler cadence, not GPU/phone FPS.
function harness(cap){
  let clock=0,sequence=0;const frames=new Map(),draws=[];
  const scheduler=createFrameScheduler({
    request:callback=>{const id=++sequence;frames.set(id,callback);return id;},
    cancel:id=>frames.delete(id),draw:()=>draws.push(clock),onError:assert.fail,maxFps:cap,now:()=>clock,
  });
  return {scheduler,frames,draws,tick(time,invalidate=true){
    clock=time;if(invalidate)scheduler.invalidate();
    const callbacks=[...frames.values()];frames.clear();for(const callback of callbacks)callback();
    assert.ok(frames.size<=1,'Input changes still coalesce into one queued frame.');
  }};
}

test('60 budget maintains its average cadence at 60, 90 and 120 Hz without an idle loop',()=>{
  for(const hz of [60,90,120]){
    const view=harness(60);
    for(let frame=0;frame<hz*10;frame++)view.tick(frame*1000/hz);
    assert.ok(Math.abs(view.draws.length-600)<=1,`${hz} Hz submitted ${view.draws.length} draws in 10 seconds.`);
    view.tick(10000,false);assert.equal(view.frames.size,0,'Settled input must leave no RAF queued.');
    const count=view.draws.length;view.tick(20000,false);assert.equal(view.draws.length,count);view.scheduler.dispose();
  }
});

test('balanced 30 budget retains its strict threshold and cadence at common refresh rates',()=>{
  for(const hz of [60,90,120]){
    const view=harness(30);
    for(let frame=0;frame<hz*10;frame++)view.tick(frame*1000/hz);
    assert.ok(Math.abs(view.draws.length-300)<=1,`${hz} Hz submitted ${view.draws.length} draws in 10 seconds.`);view.scheduler.dispose();
  }
  const view=harness(30);view.tick(0);view.tick(33);assert.equal(view.draws.length,1);view.tick(1000/30);assert.equal(view.draws.length,2);view.scheduler.dispose();
});

test('rounded and jittered vsync timestamps keep the requested average without accumulating drift',()=>{
  for(const hz of [60,90,120])for(const cap of [30,60]){
    const view=harness(cap);
    for(let frame=0;frame<hz*10;frame++)view.tick(Math.round(frame*1000/hz)+(frame%2?.12:-.12));
    assert.ok(Math.abs(view.draws.length-cap*10)<=1,`${hz} Hz / ${cap} budget submitted ${view.draws.length} draws.`);view.scheduler.dispose();
  }
});

test('long idle and delayed callbacks rebase the deadline without a catch-up burst',()=>{
  for(const cap of [30,60]){
    const view=harness(cap),interval=1000/cap;
    for(let i=0;i<100;i++)view.scheduler.invalidate();assert.equal(view.frames.size,1);
    view.tick(0,false);assert.deepEqual(view.draws,[0]);assert.equal(view.frames.size,0);
    view.tick(10000);assert.deepEqual(view.draws,[0,10000]);assert.equal(view.frames.size,0);
    view.tick(10001);assert.equal(view.draws.length,2);assert.equal(view.frames.size,1);
    view.tick(20000,false);assert.deepEqual(view.draws,[0,10000,20000]);assert.equal(view.frames.size,0);
    view.tick(20001);assert.equal(view.draws.length,3);
    view.tick(20000+interval,false);assert.equal(view.draws.length,4);assert.equal(view.frames.size,0);
    view.scheduler.dispose();view.tick(30000);assert.equal(view.draws.length,4);assert.equal(view.frames.size,0);
  }
});
