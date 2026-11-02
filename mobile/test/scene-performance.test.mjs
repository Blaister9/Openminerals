import test from 'node:test';
import assert from 'node:assert/strict';
import {isSoftwareSceneContext,sceneCostExceeded,SCENE_COST_HISTORY} from '../lib/scene-performance.ts';

test('completion policy needs12 high or24 balanced samples and ignores isolated outliers',()=>{
  assert.equal(SCENE_COST_HISTORY,24);
  for(const balanced of [false,true]){
    const count=balanced?24:12,threshold=balanced?40:20;
    assert.equal(sceneCostExceeded(Array(count-1).fill(threshold+1),balanced),false);
    assert.equal(sceneCostExceeded(Array(count).fill(threshold),balanced),false);
    assert.equal(sceneCostExceeded(Array(count).fill(threshold+.01),balanced),true);
    assert.equal(sceneCostExceeded([200,...Array(count-1).fill(5)],balanced),false);
    assert.equal(sceneCostExceeded([...Array(count).fill(200),...Array(count).fill(5)],balanced),false,'Old slow draws must leave the rolling window.');
    assert.equal(sceneCostExceeded([...Array(count-1).fill(threshold+1),NaN,Infinity,-1],balanced),false);
  }
});

test('only explicit native software renderer strings choose the software tier',()=>{
  const context=renderer=>({flushEXP(){},RENDERER:7,getParameter:key=>{assert.equal(key,7);return renderer;}});
  for(const name of ['Google SwiftShader','llvmpipe (LLVM 15.0)','softpipe','Software rasterizer','software renderer'])assert.equal(isSoftwareSceneContext(context(name)),true);
  for(const name of ['Adreno (TM) 740','Mali-G78','Apple GPU','ANGLE','WebKit WebGL','',undefined])assert.equal(isSoftwareSceneContext(context(name)),false);
  assert.equal(isSoftwareSceneContext({...context('SwiftShader'),flushEXP:undefined}),false,'Browser raster checks keep their current path.');
  assert.equal(isSoftwareSceneContext({flushEXP(){},RENDERER:7,getParameter(){throw Error('query failed');}}),false);
  assert.equal(isSoftwareSceneContext({}),false);
});
