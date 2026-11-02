import test from 'node:test';
import assert from 'node:assert/strict';
import {R4,profilePair,hwuiFrameStats,parseSurfaceLatency,presentationStats,memoryStats,threadCpuTicks,threadCpuDelta} from '../e2e/mine-profile.mjs';

test('profile arms fix 030 and r4 identities and reject incomplete r5 provenance',()=>{
  const [stable,r4]=profilePair();assert.equal(stable.code,6);assert.equal(r4,R4);assert.equal(r4.code,4);
  assert.throws(()=>profilePair('other'));assert.throws(()=>profilePair('r4-candidate',{}));
  const pair=profilePair('r4-candidate',{versionCode:5,version:'0.4.0',revision:'r5',sourceCommit:'a'.repeat(40),apkUrl:R4.url,apkSha256:'b'.repeat(64),certificateSha256:R4.certificate});assert.equal(pair[0],R4);assert.equal(pair[1].code,5);
});
test('HWUI reports exact captured durations and summary jank independently',()=>{
  const text='Total frames rendered: 10\nJanky frames: 4 (40%)\nFlags,IntendedVsync,Vsync,FrameCompleted,\n0,1000000,1000000,11000000,\n0,20000000,20000000,50000000,\n1,10000000,10000000,50000000,\n0,40000000,40000000,9223372036854775807,\n';
  const result=hwuiFrameStats(text,1000);assert.equal(result.p50Ms,10);assert.equal(result.p95Ms,30);assert.equal(result.capturedFrames,2);assert.equal(result.rejectedRows,2);assert.equal(result.capturedSlowPercent,50);assert.equal(result.totalJankyUiPercent,40);assert.equal(result.uiFramesPerTraceSecond,10);
  assert.equal(hwuiFrameStats('',1000).p95Ms,null);assert.equal(hwuiFrameStats('',1000).totalUiFrames,null);
});
test('surface parser excludes zero and pending timestamps and deduplicates presentations',()=>{
  const parsed=parseSurfaceLatency('16666667\n1 100000000000 2\n1 100016666667 2\n1 100016666667 2\n1 9223372036854775807 2\n0 0 0\n');assert.equal(parsed.timestamps.length,2);
  const stats=presentationStats([...parsed.timestamps,'100033333334'],parsed.refreshNs);assert.equal(stats.available,true);assert.ok(Math.abs(stats.observedFps-60)<.001);assert.equal(stats.slowPercent,0);
  assert.equal(presentationStats([],null).available,false);assert.equal(presentationStats([],null).observedFps,null);
});
test('memory uses only valid PSS and calls the maximum sampled peak',()=>{
  const stats=memoryStats([{pssKiB:100},{pssKiB:null},{pssKiB:200},{pssKiB:300},{pssKiB:400}]);assert.equal(stats.samples,4);assert.equal(stats.sampledPeakPssKiB,400);assert.equal(stats.sustainedMedianPssKiB,300);assert.equal(stats.sustainedP95PssKiB,400);assert.equal(memoryStats([]).sampledPeakPssKiB,null);
});
test('thread CPU retains only known threads and matched monotonic tick deltas',()=>{
  const row=(tid,name,user,system)=>`${tid} (${name}) S 1 2 3 4 5 6 7 8 9 10 ${user} ${system} 0 0`;
  const before=threadCpuTicks([row(1,'mqt_js',100,10),row(2,'RenderThread',20,5),row(3,'unknown',900,0)].join('\n'));
  const after=threadCpuTicks([row(1,'mqt_js',120,15),row(2,'RenderThread',25,7)].join('\n'));
  assert.equal(before.length,2);assert.deepEqual(threadCpuDelta(before,after).threadCpuTicks,{javascript:25,'hwui-render':7,gl:null});assert.equal(threadCpuDelta([],[]).available,false);
});
