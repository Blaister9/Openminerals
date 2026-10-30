import test from 'node:test';
import assert from 'node:assert/strict';
import {immersivePose,immersiveMatrices,chapterAt,immersiveTravel,immersiveChapters,renderBudget} from '../lib/immersive-story.ts';
import {goldBarMatrices,transformPoint,createGoldBarMesh} from '../lib/gold-bar-3d.ts';
test('recorrido: cámara continua, reversible y finita en todas las transiciones y tamaños',()=>{
  const before=structuredClone(immersiveChapters),mesh=createGoldBarMesh();
  for(const aspect of [.4,.65,1,2])for(let index=0;index<=600;index++){
    const progress=index/600,pose=immersivePose(progress),matrices=goldBarMatrices(pose,aspect);
    assert.deepEqual(immersivePose(progress),pose,'Returning to a scroll offset restores exactly the same pose.');
    assert.ok([...matrices.mvp].every(Number.isFinite));assert.ok(matrices.camera.every(Number.isFinite));
    for(let vertex=0;vertex<mesh.positions.length;vertex+=120){const projected=transformPoint(matrices.mvp,[mesh.positions[vertex],mesh.positions[vertex+1],mesh.positions[vertex+2]]);assert.ok(projected.every(Number.isFinite));}
    if(index>0){const previous=immersivePose((index-1)/600);assert.ok(Math.abs(previous.distance-pose.distance)<.03);assert.ok(Math.abs(previous.yaw-pose.yaw)<.05);}
  }
  assert.deepEqual(immersiveChapters,before);assert.equal(immersiveChapters.length,7);
  for(const value of [NaN,-Infinity,Infinity,-100,100])assert.ok(Object.values(immersivePose(value)).flat().every(Number.isFinite));
  assert.equal(chapterAt(-1),0);assert.equal(chapterAt(1),6);assert.equal(immersiveTravel(0),1800);assert.ok(immersiveTravel(4000)<=3900);
});
test('presupuesto: coste aislado no desactiva 3D; ventana sostenida lenta sí',()=>{
  assert.equal(renderBudget([100]),false);assert.equal(renderBudget(Array(120).fill(7)),false);assert.equal(renderBudget([...Array(119).fill(7),200]),false);assert.equal(renderBudget(Array(120).fill(55)),true);
  assert.equal(renderBudget([NaN,Infinity,...Array(89).fill(100)]),false);
});
test('suelo inmersivo deja visible el volumen mineral y converge al apoyo del lingote',()=>{
  for(const progress of [0,.12,.26,.33,.4,.49,.5,.8,1]){
    const pose=immersivePose(progress),before=structuredClone(pose),base=goldBarMatrices(pose,.56),scene=immersiveMatrices(pose,.56,progress);
    assert.deepEqual(pose,before);assert.deepEqual(scene.model,base.model);assert.deepEqual(scene.mvp,base.mvp);
    assert.ok([...scene.floorMvp].every(Number.isFinite));assert.ok(scene.floorModel[13]<=base.floorModel[13]);
    if(progress===0)assert.ok(base.floorModel[13]-scene.floorModel[13]>1.2);
    if(progress>=.66){assert.deepEqual(scene.floorModel,base.floorModel);assert.deepEqual(scene.floorMvp,base.floorMvp);}
  }
});
