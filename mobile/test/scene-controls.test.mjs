import test from 'node:test';
import assert from 'node:assert/strict';
import {advanceSceneOrbit} from '../lib/scene-controls.ts';

test('peek del túnel responde inmediatamente al invertir tras arrastrar más allá del límite',()=>{
 let value=advanceSceneOrbit({yaw:0,peek:0},400);assert.equal(value.peek,1.2);
 value=advanceSceneOrbit(value,-1);assert.ok(Math.abs(value.peek-1.188)<1e-10);
 value=advanceSceneOrbit(value,-400);assert.equal(value.peek,-1.2);
 value=advanceSceneOrbit(value,1);assert.ok(Math.abs(value.peek+1.188)<1e-10);
});
test('órbita conserva orientación periódica sin acumular valores enormes ni datos inválidos',()=>{
 let value={yaw:0,peek:0};for(let i=0;i<10000;i++)value=advanceSceneOrbit(value,400);
 assert.ok(Number.isFinite(value.yaw)&&Math.abs(value.yaw)<Math.PI*2);assert.equal(value.peek,1.2);
 const original={yaw:.2,peek:.2};assert.deepEqual(advanceSceneOrbit(original,NaN),original);assert.deepEqual(original,{yaw:.2,peek:.2});
 const turned=advanceSceneOrbit(original,30),back=advanceSceneOrbit(turned,-30);assert.ok(Math.abs(back.yaw-original.yaw)<1e-12);assert.ok(Math.abs(back.peek-original.peek)<1e-12);
});
