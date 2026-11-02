import test from 'node:test';
import assert from 'node:assert/strict';
import {R4,profilePair,hwuiFrameStats,parseSurfaceLatency,selectPresentationSurface,presentationStats,memoryStats,threadCpuTicks,threadCpuDelta,shaderMarkerCounts,collectShaderMarkers,anonymousProfilePng} from '../e2e/mine-profile.mjs';

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
test('HWUI aggregates ordered wall-clock segments without changing total-frame percentiles',()=>{
  const text='Flags,IntendedVsync,HandleInputStart,SyncQueued,SyncStart,IssueDrawCommandsStart,SwapBuffers,FrameCompleted,\n0,1000000,2000000,5000000,7000000,9000000,13000000,20000000,\n0,21000000,22000000,30000000,31000000,33000000,39000000,45000000,\n';
  const result=hwuiFrameStats(text,1000),s=result.wallClockSegments;
  assert.equal(result.p50Ms,19);assert.equal(result.p95Ms,24);assert.equal(result.capturedFrames,2);
  assert.deepEqual(Object.fromEntries(Object.entries(s).map(([name,value])=>[name,[value.p50Ms,value.p95Ms,value.capturedSamples,value.missingOrInvalidRows]])),{uiWork:[3,8,2,0],renderThreadQueue:[1,2,2,0],renderSubmission:[4,6,2,0],postSwap:[6,7,2,0]});
  assert.ok(Object.values(s).every(segment=>segment.available&&segment.metric.startsWith('HWUI wall-clock')));assert.match(result.segmentInterpretation,/not pure thread CPU or isolated GPU/);
  assert.ok(Object.values(s).every(segment=>!Object.hasOwn(segment,'timestamps')&&!Object.hasOwn(segment,'durations')),'Publish only aggregate counts and percentiles.');
});
test('HWUI missing platform columns leave segments unavailable while totals remain valid',()=>{
  const result=hwuiFrameStats('Flags,IntendedVsync,SwapBuffers,FrameCompleted,\n0,1000000,16000000,20000000,\n',1000);
  assert.equal(result.p95Ms,19);assert.equal(result.capturedFrames,1);assert.equal(result.wallClockSegments.postSwap.p95Ms,4);
  for(const name of ['uiWork','renderThreadQueue','renderSubmission']){assert.equal(result.wallClockSegments[name].available,false);assert.equal(result.wallClockSegments[name].capturedSamples,0);assert.equal(result.wallClockSegments[name].missingOrInvalidRows,1);assert.equal(result.wallClockSegments[name].p95Ms,null);}
});
test('HWUI rejects reversed zero sentinel and out-of-frame segment timestamps independently',()=>{
  const header='Flags,IntendedVsync,HandleInputStart,SyncQueued,SyncStart,IssueDrawCommandsStart,SwapBuffers,FrameCompleted,\n';
  const result=hwuiFrameStats(header+'0,1000000,0,5000000,4000000,9000000,8000000,20000000,\n0,21000000,22000000,50000000,9223372036854775807,33000000,NaN,45000000,\n1,1000000,2000000,3000000,4000000,5000000,6000000,20000000,\n',1000);
  assert.equal(result.capturedFrames,2);assert.equal(result.rejectedRows,1);assert.equal(result.p50Ms,19);assert.equal(result.p95Ms,24);
  assert.equal(result.wallClockSegments.uiWork.capturedSamples,0);assert.equal(result.wallClockSegments.renderThreadQueue.capturedSamples,0);assert.equal(result.wallClockSegments.renderSubmission.capturedSamples,0);assert.equal(result.wallClockSegments.postSwap.capturedSamples,1);assert.equal(result.wallClockSegments.postSwap.p95Ms,12);
  const zero=hwuiFrameStats(header+'0,1000000,2000000,2000000,2000000,2000000,2000000,20000000,\n',1000);assert.equal(zero.wallClockSegments.uiWork.p95Ms,0);assert.equal(zero.wallClockSegments.renderThreadQueue.p95Ms,0);assert.equal(zero.wallClockSegments.renderSubmission.p95Ms,0);
});
test('surface parser excludes zero and pending timestamps and deduplicates presentations',()=>{
  const parsed=parseSurfaceLatency('16666667\n1 100000000000 2\n1 100016666667 2\n1 100016666667 2\n1 9223372036854775807 2\n0 0 0\n');assert.equal(parsed.timestamps.length,2);
  const stats=presentationStats([...parsed.timestamps,'100033333334'],parsed.refreshNs);assert.equal(stats.available,true);assert.ok(Math.abs(stats.observedFps-60)<.001);assert.equal(stats.slowPercent,0);
  assert.equal(presentationStats([],null).available,false);assert.equal(presentationStats([],null).observedFps,null);
});
test('surface selector prefers one exact package MainActivity SurfaceView',()=>{
  const pkg=R4.package,window=pkg+'/'+pkg+'.MainActivity#0',view='SurfaceView - '+window;
  assert.deepEqual(selectPresentationSurface(window+'\n'+view,pkg),{surface:view,kind:'surfaceview',reason:null,matchedSurfaceViews:1,matchedAppWindows:1});
  assert.equal(selectPresentationSurface(view+'\n'+view,pkg).kind,'surfaceview','Repeated listing lines are one layer.');
  assert.equal(selectPresentationSurface(view+'\n'+view.replace('#0','#1')+'\n'+window,pkg).reason,'ambiguous-package-surfaceview','Ambiguous SurfaceViews cannot fall back to a window.');
});
test('TextureView fallback requires one exact app window and excludes backgrounds startup dim and other apps',()=>{
  const pkg=R4.package,window=pkg+'/'+pkg+'.MainActivity#0';
  const noise=['Background for - '+window,'StartingWindow - '+window,'Dim Layer for '+window,'com.openminerals.demo.minepreview.evil/'+pkg+'.MainActivity#0',pkg+'/'+pkg+'.OtherActivity#0','com.other.demo/com.other.demo.MainActivity#0','StatusBar#0'];
  assert.equal(selectPresentationSurface(noise.join('\n'),pkg).surface,null);
  assert.equal(selectPresentationSurface([...noise,window].join('\n'),pkg).kind,'app-window');
  assert.equal(selectPresentationSurface(pkg+'/.MainActivity#0',pkg).kind,'app-window');
  assert.equal(selectPresentationSurface(window+'\n'+window.replace('#0','#1'),pkg).reason,'ambiguous-package-app-window');
  assert.throws(()=>selectPresentationSurface(window,'com.other.demo'));
});
test('app-window presentation identifies the UI and TextureView composite without a GL FPS claim',()=>{
  const stats=presentationStats(['1000000000','1016666667','1033333334'],16666667,'app-window');
  assert.equal(stats.scope,'app-window');assert.match(stats.metric,/UI and TextureView composite/);assert.equal(stats.expoGlFpsMeasured,false);assert.equal(stats.gpuExecutionTimeMeasured,false);assert.ok(Math.abs(stats.observedFps-60)<.001);
  assert.throws(()=>presentationStats([],null,'display'));
});
test('memory uses only valid PSS and calls the maximum sampled peak',()=>{
  const stats=memoryStats([{pssKiB:100},{pssKiB:null},{pssKiB:200},{pssKiB:300},{pssKiB:400}]);assert.equal(stats.samples,4);assert.equal(stats.sampledPeakPssKiB,400);assert.equal(stats.sustainedMedianPssKiB,300);assert.equal(stats.sustainedP95PssKiB,400);assert.equal(memoryStats([]).sampledPeakPssKiB,null);
});
test('thread CPU retains only known threads and matched monotonic tick deltas',()=>{
  const row=(tid,name,user,system)=>`${tid} (${name}) S 1 2 3 4 5 6 7 8 9 10 ${user} ${system} 0 0`;
  const before=threadCpuTicks([row(1,'mqt_v_js',100,10),row(2,'RenderThread',20,5),row(3,'unknown',900,0)].join('\n'));
  const after=threadCpuTicks([row(1,'mqt_v_js',120,15),row(2,'RenderThread',25,7)].join('\n'));
  assert.equal(before.length,2);assert.deepEqual(threadCpuDelta(before,after).threadCpuTicks,{javascript:25,'hwui-render':7,gl:null});assert.equal(threadCpuDelta([],[]).available,false);
});
test('shader diagnostics project only exact static marker counts and never raw log values',()=>{
  const log=['I/ReactNativeJS(123): [Openminerals 3D] engraving-derivatives','I/ReactNativeJS(123): [Openminerals 3D] engraving-finite-difference','I/ReactNativeJS(123): [Openminerals 3D] engraving-derivatives','I/ReactNativeJS(123): [Openminerals 3D] unknown-shader','I/ReactNativeJS(123): [Openminerals 3D] engraving-derivatives PRIVATE_SENTINEL','PRIVATE_SENTINEL'].join('\n');
  const counts=shaderMarkerCounts(log);assert.deepEqual(counts,{'engraving-derivatives':2,'engraving-finite-difference':1});assert.ok(!JSON.stringify(counts).includes('PRIVATE_SENTINEL'));assert.deepEqual(shaderMarkerCounts(''),{'engraving-derivatives':0,'engraving-finite-difference':0});
});
test('shader collector reads only the matching owned process and treats absent instrumentation without inference',async()=>{
  const base={packageName:R4.package,expectedPid:'123',readPid:()=> '123'};let calls=0;
  const observed=await collectShaderMarkers({...base,readLog:pid=>{assert.equal(pid,'123');calls++;return 'I/ReactNativeJS: [Openminerals 3D] engraving-derivatives';}});
  assert.equal(observed.collectionAvailable,true);assert.equal(observed.instrumentationObserved,true);assert.equal(observed.rawLogsPublished,false);assert.equal(calls,1);
  const r4=await collectShaderMarkers({...base,readLog:()=>''});assert.equal(r4.collectionAvailable,true);assert.equal(r4.instrumentationObserved,false);assert.match(r4.scope,/do not identify/);
  const changed=await collectShaderMarkers({...base,readPid:()=> '456',readLog:()=>{assert.fail('A replacement process must never be read.');}});assert.equal(changed.collectionAvailable,false);assert.equal(changed.instrumentationObserved,false);
  const failed=await collectShaderMarkers({...base,readLog:()=>{throw Error('PRIVATE_SENTINEL');}});assert.equal(failed.collectionAvailable,false);assert.ok(!JSON.stringify(failed).includes('PRIVATE_SENTINEL'));
});
test('anonymous screenshot projection validates bounded PNG bytes and closed trial filenames',()=>{
  const bytes=Buffer.alloc(1024);Buffer.from([137,80,78,71,13,10,26,10]).copy(bytes);
  const result=anonymousProfilePng('trial-2-3d-final.png',bytes);assert.equal(result.bytes,1024);assert.match(result.sha256,/^[a-f0-9]{64}$/);assert.equal(result.measuredTraceExcluded,true);assert.equal(result.anonymous,true);
  assert.throws(()=>anonymousProfilePng('../private.png',bytes));assert.throws(()=>anonymousProfilePng('trial-4-light-initial.png',bytes));assert.throws(()=>anonymousProfilePng('trial-0-light-initial.png',Buffer.alloc(1024)));assert.throws(()=>anonymousProfilePng('trial-0-light-initial.png',bytes.subarray(0,8)));assert.throws(()=>anonymousProfilePng('trial-0-light-initial.png',Buffer.alloc(10000001)));
});
