import test from 'node:test';
import assert from 'node:assert/strict';
import {createStoryRenderer} from '../lib/scene-renderer.ts';
import {metalMaterial} from '../lib/metal-materials.ts';

// This mock checks ownership, failure cleanup and submitted GL work. The
// separate geological-render test compiles/rasterizes the actual shaders;
// neither test measures native GPU memory, frame rate or physical performance.
function mockGL(fault={}){
  const live={buffers:new Set(),shaders:new Set(),programs:new Set()};
  const attempts={buffers:0,shaders:0,programs:0},created={buffers:0,shaders:0,programs:0},deleted={buffers:0,shaders:0,programs:0};
  const draws=[],uploads=[],uniforms=new Map();let current=null,duplicateDeletes=0,frames=0;
  const make=kind=>{
    const index=++attempts[kind];if(fault[kind]===index)return null;
    const item={kind,index,attached:[]};created[kind]++;live[kind].add(item);return item;
  };
  const remove=(kind,item)=>{deleted[kind]++;if(!live[kind].delete(item))duplicateDeletes++;};
  const setUniform=(location,value)=>{
    assert.equal(location.program,current,'A uniform must belong to the active program.');
    let values=uniforms.get(current);if(!values){values={};uniforms.set(current,values);}values[location.name]=value;
  };
  const gl={
    VERTEX_SHADER:1,FRAGMENT_SHADER:2,COMPILE_STATUS:3,LINK_STATUS:4,ARRAY_BUFFER:5,STATIC_DRAW:6,FLOAT:7,
    DEPTH_TEST:8,LEQUAL:9,CULL_FACE:10,BACK:11,CCW:12,COLOR_BUFFER_BIT:16,DEPTH_BUFFER_BIT:32,
    BLEND:13,SRC_ALPHA:14,ONE_MINUS_SRC_ALPHA:15,TRIANGLES:17,NO_ERROR:0,
    drawingBufferWidth:360,drawingBufferHeight:640,
    createBuffer:()=>make('buffers'),createShader:()=>make('shaders'),createProgram:()=>make('programs'),
    deleteBuffer:item=>remove('buffers',item),deleteShader:item=>remove('shaders',item),deleteProgram:item=>remove('programs',item),
    shaderSource:(shader,source)=>{shader.source=source;},compileShader:()=>{},
    getShaderParameter:shader=>fault.compile!==shader.index,getShaderInfoLog:()=>'mock shader error',
    attachShader:(program,shader)=>{program.attached.push(shader);},
    linkProgram:program=>{program.scene=program.attached.some(shader=>shader.source.includes('a_material'))?'mine':'subject';},
    getProgramParameter:program=>fault.link!==program.index,getProgramInfoLog:()=>'mock link error',
    getAttribLocation:(program,name)=>{
      if(fault.attribute===name&&(fault.scene===undefined||fault.scene===program.scene))return -1;
      if(name==='a_position')return 0;if(name==='a_normal')return 1;if(name==='a_material'&&program.scene==='mine')return 2;return -1;
    },
    getUniformLocation:(program,name)=>fault.uniform===name?null:{program,name},
    bindBuffer:()=>{},bufferData:(_target,data,usage)=>{
      assert.ok(data instanceof Float32Array);assert.equal(usage,gl.STATIC_DRAW);
      uploads.push(data.byteLength);if(fault.upload===uploads.length)throw Error('mock upload error');
    },
    enableVertexAttribArray:()=>{},vertexAttribPointer:()=>{},
    enable:()=>{},disable:()=>{},depthFunc:()=>{},cullFace:()=>{},frontFace:()=>{},
    clearColor:()=>{},clearDepth:()=>{},clear:()=>{},viewport:()=>{},blendFunc:()=>{},depthMask:()=>{},
    useProgram:program=>{assert.ok(live.programs.has(program));current=program;},
    uniform1f:(location,value)=>setUniform(location,value),uniform3f:(location,...values)=>setUniform(location,values),
    uniformMatrix4fv:(location,transpose,value)=>{assert.equal(transpose,false);assert.ok([...value].every(Number.isFinite));setUniform(location,[...value]);},
    drawArrays:(mode,first,count)=>{assert.equal(mode,gl.TRIANGLES);assert.ok(current);draws.push({scene:current.scene,first,count,uniforms:structuredClone(uniforms.get(current))});},
    flush:()=>{},endFrameEXP:()=>{frames++;},getError:()=>gl.NO_ERROR,isContextLost:()=>false,
  };
  return {gl,draws,uploads,created,attempts,deleted,get frames(){return frames;},assertReleased(){
    assert.deepEqual(Object.fromEntries(Object.entries(live).map(([key,values])=>[key,values.size])),{buffers:0,shaders:0,programs:0});
    assert.deepEqual(deleted,created);assert.equal(duplicateDeletes,0,'Dispose must never delete a GL handle twice.');
  }};
}

test('renderer compuesto conserva cinco buffers y libera cada recurso exactamente una vez',()=>{
  const mock=mockGL(),renderer=createStoryRenderer(mock.gl,true);
  assert.deepEqual(mock.created,{buffers:5,shaders:4,programs:2});assert.equal(mock.uploads.length,5);
  renderer.draw(0,0);renderer.draw(.2,.3);renderer.draw(.5,-.1);renderer.draw(1,0);
  const frameCount=mock.frames,drawCount=mock.draws.length,allocationCount={...mock.created};
  renderer.dispose();renderer.dispose();renderer.draw(.5,0);
  assert.equal(mock.frames,frameCount);assert.equal(mock.draws.length,drawCount);assert.deepEqual(mock.created,allocationCount);mock.assertReleased();
});

for(const [name,fault] of [
  ['primer shader no disponible',{shaders:1}],['compilación de fragmento de metal',{compile:2}],
  ['compilación de fragmento de mina tras subir metal',{compile:4}],['segundo programa no disponible',{programs:2}],
  ['enlace de mina después de crear ambos shaders',{link:2}],['atributo inicial ausente',{attribute:'a_position',scene:'subject'}],
  ['atributo de material de mina ausente',{attribute:'a_material',scene:'mine'}],['quinto buffer no disponible',{buffers:5}],
  ['subida de atributos de mina interrumpida',{upload:3}],['uniforme de opacidad ausente',{uniform:'u_opacity'}],
])test('fallo GL limpia la construcción parcial: '+name,()=>{
  const mock=mockGL(fault);assert.throws(()=>createStoryRenderer(mock.gl,true));mock.assertReleased();
  if(fault.attribute==='a_position')assert.equal(mock.attempts.buffers,0,'Validate the attribute before allocating its buffer.');
  assert.equal(mock.frames,0);assert.equal(mock.draws.length,0);
});

test('suelo de opacidad cero no añade un pase ni puede escribir profundidad invisible',()=>{
  const mock=mockGL(),renderer=createStoryRenderer(mock.gl,true);
  try{
    for(const progress of [.081,.12,.2,.28]){
      const from=mock.draws.length;renderer.draw(progress,0);
      const submitted=mock.draws.slice(from);assert.equal(submitted.length,2,'Only mine and extracted specimen are visible at '+progress);
      assert.equal(submitted.filter(draw=>draw.scene==='subject'&&draw.uniforms.u_surface===1).length,0,'Do not draw an invisible floor.');
      assert.ok(submitted.some(draw=>draw.scene==='mine'));assert.ok(submitted.some(draw=>draw.scene==='subject'&&draw.uniforms.u_surface===0));
    }
    const from=mock.draws.length;renderer.draw(.35,0);
    const floor=mock.draws.slice(from).find(draw=>draw.scene==='subject'&&draw.uniforms.u_surface===1);
    assert.ok(floor&&floor.uniforms.u_subjectOpacity>0&&floor.uniforms.u_subjectOpacity<1,'Visible floor still participates in the smooth transition.');
  }finally{renderer.dispose();mock.assertReleased();}
});

test('trabajo enviado varía por fase y no excede 7528 triángulos, tres draws ni 640KiB de atributos',()=>{
  const mock=mockGL(),renderer=createStoryRenderer(mock.gl,true),work=[];
  try{
    for(const progress of [0,.08,.12,.28,.35,.4,.5,1]){
      const from=mock.draws.length;renderer.draw(progress,0);const draws=mock.draws.slice(from);
      work.push({progress,draws:draws.length,triangles:draws.reduce((sum,draw)=>sum+draw.count/3,0),mine:draws.some(draw=>draw.scene==='mine')});
    }
    assert.equal(work[0].triangles,5926);assert.equal(work[0].draws,1);
    assert.equal(work.find(row=>row.progress===.12).triangles,7526);
    assert.equal(Math.max(...work.map(row=>row.triangles)),7528);assert.equal(Math.max(...work.map(row=>row.draws)),3);
    for(const row of work.filter(row=>row.progress>=.4)){assert.equal(row.mine,false);assert.equal(row.triangles,1602);assert.equal(row.draws,2);}
    assert.ok(mock.uploads.reduce((sum,bytes)=>sum+bytes,0)<=640*1024);
    assert.deepEqual(mock.created,{buffers:5,shaders:4,programs:2});assert.equal(mock.uploads.length,5,'Frames reuse the static buffers.');
  }finally{renderer.dispose();mock.assertReleased();}
});

test('cambiar entre cuatro metales actualiza color, acabado y símbolo sin reconstruir el contexto',()=>{
  const mock=mockGL(),renderer=createStoryRenderer(mock.gl,true);
  try{
    const codes=['XAU','XAG','XPT','XPD','XAU'];
    for(const code of codes){
      const from=mock.draws.length;renderer.draw(5/6,0,code);
      const subject=mock.draws.slice(from).find(draw=>draw.scene==='subject'&&draw.uniforms.u_surface===0),material=metalMaterial(code);
      assert.ok(subject);assert.deepEqual(subject.uniforms.u_metalColor,material.reflectance);assert.equal(subject.uniforms.u_roughness,material.roughness);
      assert.equal(subject.uniforms.u_metalKind,['XAU','XAG','XPT','XPD'].indexOf(code));assert.equal(subject.uniforms.u_subjectOpacity,1);
    }
    assert.deepEqual(mock.created,{buffers:5,shaders:4,programs:2});assert.equal(mock.uploads.length,5);
  }finally{renderer.dispose();mock.assertReleased();}
});

test('visor de metal fuera del relato conserva la malla de 400 triángulos y no crea recursos de mina',()=>{
  const mock=mockGL(),renderer=createStoryRenderer(mock.gl,false);
  try{
    for(const code of ['XAU','XAG','XPT','XPD'])renderer.draw(.5,0,code);
    assert.deepEqual(mock.created,{buffers:2,shaders:2,programs:1});assert.equal(mock.uploads.length,2);
    assert.ok(mock.draws.every(draw=>draw.scene==='subject'));assert.equal(mock.draws.length,8);
    assert.equal(mock.draws.reduce((sum,draw)=>sum+draw.count/3,0),402*4);
  }finally{renderer.dispose();mock.assertReleased();}
});
