import test from 'node:test';
import assert from 'node:assert/strict';
import {createStoryRenderer} from '../lib/scene-renderer.ts';
import {metalMaterial} from '../lib/metal-materials.ts';
import {IMMERSIVE_FRAGMENT_SHADER,IMMERSIVE_FRAGMENT_SHADER_DERIVATIVES} from '../lib/immersive-story.ts';

// This mock checks ownership, failure cleanup and submitted GL work. The
// separate geological-render test compiles/rasterizes the actual shaders;
// neither test measures native GPU memory, frame rate or physical performance.
function mockGL(fault={}){
  const live={buffers:new Set(),shaders:new Set(),programs:new Set()};
  const attempts={buffers:0,shaders:0,programs:0},created={buffers:0,shaders:0,programs:0},deleted={buffers:0,shaders:0,programs:0};
  const draws=[],uploads=[],blends=[],uniforms=new Map();let current=null,duplicateDeletes=0,frames=0;
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
    BLEND:13,SRC_ALPHA:14,ONE_MINUS_SRC_ALPHA:15,TRIANGLES:17,ONE:18,NO_ERROR:0,
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
    clearColor:()=>{},clearDepth:()=>{},clear:()=>{},viewport:()=>{},depthMask:()=>{},
    blendFunc:(...factors)=>blends.push({separate:false,factors}),
    blendFuncSeparate:(...factors)=>blends.push({separate:true,factors}),
    useProgram:program=>{assert.ok(live.programs.has(program));current=program;},
    uniform1f:(location,value)=>setUniform(location,value),uniform3f:(location,...values)=>setUniform(location,values),
    uniformMatrix4fv:(location,transpose,value)=>{assert.equal(transpose,false);assert.ok([...value].every(Number.isFinite));setUniform(location,[...value]);},
    drawArrays:(mode,first,count)=>{assert.equal(mode,gl.TRIANGLES);assert.ok(current);draws.push({scene:current.scene,first,count,uniforms:structuredClone(uniforms.get(current))});},
    flush:()=>{},endFrameEXP:()=>{frames++;},getError:()=>gl.NO_ERROR,isContextLost:()=>false,
  };
  return {gl,draws,uploads,blends,created,attempts,deleted,get frames(){return frames;},assertReleased(){
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

test('mezcla color con SRC_ALPHA y conserva alfa de destino opaco mediante factores separados',()=>{
  const mock=mockGL(),renderer=createStoryRenderer(mock.gl,true);
  try{
    for(const progress of [0,.12,.3,.35,.4,.7,1]){
      const from=mock.blends.length;renderer.draw(progress,0);
      assert.deepEqual(mock.blends.slice(from),[{separate:true,factors:[mock.gl.SRC_ALPHA,mock.gl.ONE_MINUS_SRC_ALPHA,mock.gl.ONE,mock.gl.ONE_MINUS_SRC_ALPHA]}]);
    }
    // Contract of the submitted alpha factors, not a substitute for the real
    // WebGL readPixels(alpha===255) check. Opaque clear + source-over alpha is
    // A_out = A_src * ONE + 1 * (1 - A_src), including dust and both fades.
  }finally{renderer.dispose();mock.assertReleased();}
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

test('native draw waits for finish and its submitted frame before returning, without accumulating batches',()=>{
  const mock=mockGL(),events=[];let batch=[],backlog=[],clock=0,gpuPending=0,completedDraws=0;
  const draw=mock.gl.drawArrays,end=mock.gl.endFrameEXP;
  mock.gl.drawArrays=(...args)=>{draw(...args);batch.push(()=>{clock+=1;gpuPending++;completedDraws++;});};
  mock.gl.finish=()=>{events.push('finish');batch.push(()=>{clock+=gpuPending*8;gpuPending=0;});};
  mock.gl.endFrameEXP=()=>{events.push('endFrameEXP');backlog.push(batch);batch=[];end();};
  mock.gl.flushEXP=()=>{
    events.push('flushEXP');backlog.push(batch);batch=[];
    for(const work of backlog)for(const operation of work)operation();backlog=[];clock+=2;
  };
  mock.gl.flush=()=>assert.fail('The native completion path must use the blocking Expo barrier.');
  const renderer=createStoryRenderer(mock.gl,true);
  try{
    for(const progress of [0,.12,.35,.5,1,.35,.12,0]){
      const start=clock,offset=events.length;renderer.draw(progress,0);
      assert.deepEqual(events.slice(offset),['finish','endFrameEXP','flushEXP']);
      assert.ok(clock>start,'Native completion work must occur before draw returns.');
      assert.equal(gpuPending,0);assert.equal(backlog.length,0);assert.equal(batch.length,0);
      assert.equal(completedDraws,mock.draws.length,'Every submitted draw completes before the next frame.');
    }
    const before=events.length;renderer.dispose();renderer.draw(.5,0);assert.equal(events.length,before);
  }finally{renderer.dispose();mock.assertReleased();}
});

test('browser path retains flush/endFrame behavior and never invokes finish',()=>{
  const mock=mockGL(),events=[],end=mock.gl.endFrameEXP;
  mock.gl.finish=()=>assert.fail('Offline/browser rendering must not add a native completion wait.');
  mock.gl.flush=()=>events.push('flush');mock.gl.endFrameEXP=()=>{events.push('endFrameEXP');end();};
  const renderer=createStoryRenderer(mock.gl,true);
  try{renderer.draw(0,0);assert.deepEqual(events,['flush','endFrameEXP']);}
  finally{renderer.dispose();mock.assertReleased();}
});

for(const availability of ['supported','missing','throws'])test('grabado por derivadas selecciona capacidad antes de compilar: '+availability,()=>{
  const mock=mockGL(),events=[],sources=[],setSource=mock.gl.shaderSource;
  mock.gl.getExtension=name=>{events.push('extension');assert.equal(name,'OES_standard_derivatives');if(availability==='throws')throw Error('unsupported query');return availability==='supported'?{}:null;};
  mock.gl.shaderSource=(shader,source)=>{events.push('source');sources.push(source);setSource(shader,source);};
  const renderer=createStoryRenderer(mock.gl,true);
  try{
    assert.equal(events[0],'extension','Capability must be enabled before shader compilation.');
    assert.ok(sources.includes(availability==='supported'?IMMERSIVE_FRAGMENT_SHADER_DERIVATIVES:IMMERSIVE_FRAGMENT_SHADER));
    renderer.draw(.67,0,'XPD');assert.deepEqual(mock.created,{buffers:5,shaders:4,programs:2});
  }finally{renderer.dispose();mock.assertReleased();}
});

test('visor normal no consulta ni incorpora la capacidad de grabado preview',()=>{
  const mock=mockGL();mock.gl.getExtension=()=>assert.fail('Ordinary metal viewers retain their shader path.');
  const renderer=createStoryRenderer(mock.gl,false);try{renderer.draw(.5,0,'XAU');}finally{renderer.dispose();mock.assertReleased();}
});

test('a failed native completion barrier propagates so the owning component can select its fallback',()=>{
  const mock=mockGL();mock.gl.finish=()=>{};mock.gl.flushEXP=()=>{throw Error('native barrier failed');};
  const renderer=createStoryRenderer(mock.gl,true);
  try{assert.throws(()=>renderer.draw(0,0),/native barrier failed/);}
  finally{renderer.dispose();mock.assertReleased();}
});
