import test from 'node:test';
import assert from 'node:assert/strict';
import {createMineSceneMesh,mineSceneCamera,mineSceneVisibility,MINE_MATERIAL,MINE_TUNNEL_TRIANGLES,MINE_VERTEX_SHADER,MINE_FRAGMENT_SHADER} from '../lib/geological-scene.ts';
import {transformPoint} from '../lib/gold-bar-3d.ts';

const sub=(a,b)=>a.map((value,i)=>value-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const dot=(a,b)=>a.reduce((sum,value,i)=>sum+value*b[i],0);
const close=(a,b,epsilon=1e-5)=>assert.ok(Math.abs(a-b)<epsilon,`${a} differs from ${b}`);

test('geología DEMO estática tiene profundidad real y presupuesto acotado sin reconstrucción aleatoria',()=>{
  const mesh=createMineSceneMesh(),again=createMineSceneMesh();
  assert.ok(mesh.triangleCount>=3000&&mesh.triangleCount<=6000);
  assert.equal(mesh.vertexCount,mesh.triangleCount*3);
  assert.equal(mesh.positions.length,mesh.vertexCount*3);assert.equal(mesh.normals.length,mesh.positions.length);assert.equal(mesh.materials.length,mesh.vertexCount);
  for(const name of ['positions','normals','materials']){assert.ok(mesh[name] instanceof Float32Array);assert.ok([...mesh[name]].every(Number.isFinite));assert.deepEqual(mesh[name],again[name]);}
  assert.ok(mesh.positions.byteLength+mesh.normals.byteLength+mesh.materials.byteLength<512*1024,'Static GPU attributes must fit within 512 KiB.');
  const x=[],y=[],z=[];for(let i=0;i<mesh.positions.length;i+=3){x.push(mesh.positions[i]);y.push(mesh.positions[i+1]);z.push(mesh.positions[i+2]);}
  assert.ok(Math.max(...z)-Math.min(...z)>40,'A tunnel must extend into world-space depth.');
  assert.ok(Math.max(...x)-Math.min(...x)>5&&Math.max(...y)-Math.min(...y)>4,'Walls, ceiling and floor surround the camera.');
});

test('normales proceden de la geometría desplazada, son unitarias y coinciden con el winding de cada triángulo',()=>{
  const mesh=createMineSceneMesh();
  for(let i=0;i<mesh.positions.length;i+=9){
    const a=[...mesh.positions.slice(i,i+3)],b=[...mesh.positions.slice(i+3,i+6)],c=[...mesh.positions.slice(i+6,i+9)];
    const geometric=cross(sub(b,a),sub(c,a));assert.ok(Math.hypot(...geometric)>1e-8,'No degenerate triangles.');
    for(let corner=0;corner<3;corner++){
      const normal=[...mesh.normals.slice(i+corner*3,i+corner*3+3)];close(Math.hypot(...normal),1);
      assert.ok(dot(geometric,normal)>0,'CCW front faces and lighting normals must agree, including tunnel interior.');
    }
  }
});

test('túnel conserva winding interior, techo, suelo con relieve y AO de cavidades en los vértices',()=>{
  const mesh=createMineSceneMesh();let ceiling=0,floor=0;const floorHeights=new Set(),cavity=new Set();
  for(let triangle=0;triangle<MINE_TUNNEL_TRIANGLES;triangle++){
    const index=triangle*9,p=[0,1,2].map(axis=>(mesh.positions[index+axis]+mesh.positions[index+axis+3]+mesh.positions[index+axis+6])/3);
    const axis=[.35*Math.sin(p[2]*.13)+.12*Math.sin(p[2]*.37),.25+.2*Math.sin(p[2]*.15),p[2]];
    const n=[...mesh.normals.slice(index,index+3)];assert.ok(dot(n,sub(axis,p))>0,'Interior surfaces survive BACK-face culling.');
    if(p[1]>2.3){assert.ok(n[1]<0);ceiling++;}
    if(Math.floor(mesh.materials[triangle*3])===MINE_MATERIAL.floor){assert.ok(n[1]>0);floor++;floorHeights.add(p[1].toFixed(2));}
    for(let j=0;j<3;j++){const material=mesh.materials[triangle*3+j],ao=(material-Math.floor(material))/.49;assert.ok(ao>=.3&&ao<=1.00001);cavity.add(ao.toFixed(2));}
  }
  assert.ok(ceiling>100&&floor>100);assert.ok(floorHeights.size>15&&cavity.size>15,'Floor relief and cavity shading cannot collapse to a flat studio plane.');
});

test('roca, mena, cuarzo escaso, luminarias y polvo tienen materiales distintos sin dorar el túnel',()=>{
  const mesh=createMineSceneMesh(),counts=new Map();
  for(const packed of mesh.materials){const kind=Math.floor(packed);assert.ok(Object.values(MINE_MATERIAL).includes(kind));counts.set(kind,(counts.get(kind)||0)+1);}
  for(const kind of Object.values(MINE_MATERIAL))assert.ok(counts.get(kind)>0);
  assert.ok(counts.get(MINE_MATERIAL.quartz)/mesh.vertexCount<.04,'Quartz is a sparse inclusion.');
  assert.ok(counts.get(MINE_MATERIAL.ore)/mesh.vertexCount<.06,'Metal veins stay local to dark ore outcrops.');
  assert.ok(counts.get(MINE_MATERIAL.rock)+counts.get(MINE_MATERIAL.floor)>mesh.vertexCount*.8);
  assert.ok(counts.get(MINE_MATERIAL.dust)/6<=64,'Bound translucent particle overdraw.');
  assert.doesNotMatch(MINE_VERTEX_SHADER,/\bu_time\b|Date\.now|requestAnimationFrame/);
  assert.match(MINE_VERTEX_SHADER,/u_progress/);assert.match(MINE_FRAGMENT_SHADER,/u_opacity/);
});

test('cámara avanza dentro del túnel con perspectiva, arrastre acotado y retorno determinista',()=>{
  const progress=[0,.06,.12,.2,.3,.4],poses=progress.map(p=>mineSceneCamera(p,9/16));
  for(let i=1;i<poses.length;i++)assert.ok(poses[i].camera[2]<poses[i-1].camera[2]);
  assert.ok(poses[0].camera[2]-poses.at(-1).camera[2]>17,'Camera translation creates actual foreground/background parallax.');
  for(const p of progress)for(const aspect of [.35,9/16,1,2.4]){
    const {vp,camera}=mineSceneCamera(p,aspect);assert.equal(vp.length,16);assert.ok([...vp,...camera].every(Number.isFinite));
    const near=transformPoint(vp,[camera[0],camera[1],camera[2]-2]),far=transformPoint(vp,[camera[0],camera[1],camera[2]-12]);
    assert.ok(near[3]>0&&far[3]>near[3]);assert.ok(Math.abs(near[0]/near[3])<1&&Math.abs(near[1]/near[3])<1);
    assert.ok(near[2]/near[3]<far[2]/far[3]);assert.deepEqual(mineSceneCamera(p,aspect),{vp,camera});
  }
  assert.deepEqual(mineSceneCamera(.2,9/16).camera,mineSceneCamera(.2,9/16,100).camera);
  assert.notDeepEqual(mineSceneCamera(.2,9/16).vp,mineSceneCamera(.2,9/16,1).vp);
  assert.deepEqual(mineSceneCamera(.2,9/16,100),mineSceneCamera(.2,9/16,1.2));
  for(const values of [[NaN,NaN,NaN],[Infinity,0,-Infinity],[-1,-1,0],[2,9,0]])assert.ok([...mineSceneCamera(...values).vp].every(Number.isFinite));
  assert.deepEqual(mineSceneCamera(.12,9/16),poses[2]);
});

test('fundido de mina es continuo y reversible antes de completar la formación del lingote',()=>{
  assert.equal(mineSceneVisibility(0),1);assert.equal(mineSceneVisibility(.24),1);assert.equal(mineSceneVisibility(.4),0);assert.equal(mineSceneVisibility(1),0);
  let last=1;for(let i=0;i<=100;i++){const value=mineSceneVisibility(i/100);assert.ok(value>=0&&value<=last);last=value;}
  assert.ok(mineSceneVisibility(.3)>mineSceneVisibility(.35)&&mineSceneVisibility(.35)>0);
  const forward=[0,.27,.32,.39,.4,1].map(mineSceneVisibility),reverse=[1,.4,.39,.32,.27,0].map(mineSceneVisibility);
  assert.deepEqual(reverse,forward.toReversed());
  for(const boundary of [.24,.4])close(mineSceneVisibility(boundary-1e-6),mineSceneVisibility(boundary+1e-6));
  assert.equal(mineSceneVisibility(NaN),1);
});
