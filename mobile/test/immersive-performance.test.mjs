import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAndroidPerformance} from '../e2e/immersive-performance.mjs';
test('Android performance retains measured values from both meminfo formats without publishing raw dumps',()=>{
  const measured=parseAndroidPerformance({before:'TOTAL PSS: 132768 TOTAL RSS: 200000',after:'  TOTAL   140768    90000  50000\n',gfx:'Total frames rendered: 420\nJanky frames: 7 (1.6%)\n50th percentile: 7ms\n90th percentile: 17ms\n95th percentile: 22ms',start:'Status: ok\nTotalTime: 1092\nWaitTime: 1101'});
  assert.deepEqual(measured,{coldStartTotalMs:1092,coldStartWaitMs:1101,pssBeforeKiB:132768,pssAfterKiB:140768,uiFrames:420,jankyUiFrames:7,uiFrameP50Ms:7,uiFrameP90Ms:17,uiFrameP95Ms:22});
  assert.ok(Object.values(parseAndroidPerformance({before:'unavailable',after:'',gfx:'',start:''})).every(value=>value===null));
});
