import test from 'node:test';
import assert from 'node:assert/strict';
import {createGoldBarMesh} from '../lib/gold-bar-3d.ts';
import {subdivideSpecimen} from '../lib/geological-specimen.ts';

test('curvatura mineral adicional conserva superficie, normales y presupuesto estático',()=>{
 const original=createGoldBarMesh(),snapshot=[...original.positions],refined=subdivideSpecimen(original);
 assert.equal(refined.triangleCount,1600);assert.equal(refined.vertexCount,4800);
 assert.deepEqual([...original.positions],snapshot);assert.ok([...refined.positions,...refined.normals].every(Number.isFinite));
 for(let at=0;at<refined.normals.length;at+=3)assert.ok(Math.abs(Math.hypot(...refined.normals.slice(at,at+3))-1)<1e-6);
 const bounds=mesh=>[0,1,2].flatMap(axis=>{const values=[];for(let i=axis;i<mesh.positions.length;i+=3)values.push(mesh.positions[i]);return [Math.min(...values),Math.max(...values)];});
 assert.deepEqual(bounds(refined),bounds(original));
 for(let at=0;at<refined.positions.length;at+=9){const p=refined.positions,a=[p[at+3]-p[at],p[at+4]-p[at+1],p[at+5]-p[at+2]],b=[p[at+6]-p[at],p[at+7]-p[at+1],p[at+8]-p[at+2]];assert.ok(Math.hypot(a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0])>1e-10);}
});
