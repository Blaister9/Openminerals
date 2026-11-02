import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {createFrameScheduler,goldRenderScale,scrollProgress} from '../lib/gold-bar-3d.ts';
import {isSoftwareSceneContext,sceneCostExceeded,SCENE_COST_HISTORY} from '../lib/scene-performance.ts';

// Execute GoldBar3D's actual closure, not a second implementation of its policy.
// The controlled clock models completed draw work, including a simulated native
// barrier wait. Renderer queue ordering is tested separately. This proves neither
// Android GPU timings, physical FPS nor the React/native lifecycle as a whole.
const source=await readFile(new URL('../components/GoldBar3D.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('GoldBar3D.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const declarations=new Map();let materialEffect,sessionEffect,drawEffect,allocationEffect;
function visit(node){
  if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name))declarations.set(node.name.text,node.initializer);
  if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useLayoutEffect'&&node.arguments[1]?.getText(ast)==='[metal]')materialEffect=node.arguments[0];
  if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useLayoutEffect'&&node.arguments[1]?.getText(ast)==='[surfacePresent,session,stop]')sessionEffect=node.arguments[0];
  if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useLayoutEffect'&&node.arguments[1]?.getText(ast)==='[enabled,balanced,surfacePresent,session,prepareRenderer,armWatchdog]')drawEffect=node.arguments[0];
  if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useLayoutEffect'&&node.arguments[1]?.getText(ast)==='[enabled,width]')allocationEffect=node.arguments[0];
  ts.forEachChild(node,visit);
}
visit(ast);
for(const name of ['stop','fail','createContext','renderScale'])assert.ok(declarations.get(name),'Missing actual GoldBar3D declaration: '+name);
assert.ok(materialEffect,'Material readiness must use the actual layout effect.');
const executable=ts.transpileModule([
  'this.stop='+declarations.get('stop').getText(ast)+';',
  'this.fail='+declarations.get('fail').getText(ast)+';',
  'this.armWatchdog='+declarations.get('armWatchdog').getText(ast)+';',
  'this.startScheduler='+declarations.get('startScheduler').getText(ast)+';',
  'this.prepareRenderer='+declarations.get('prepareRenderer').getText(ast)+';',
  'this.createContext='+declarations.get('createContext').getText(ast)+';',
  'this.renderScale='+declarations.get('renderScale').getText(ast)+';',
  'this.materialEffect='+materialEffect.getText(ast)+';',
  'this.sessionEffect='+sessionEffect.getText(ast)+';',
  'this.drawEffect='+drawEffect.getText(ast)+';',
  'this.allocationEffect='+allocationEffect.getText(ast)+';',
  'this.retry3D='+declarations.get('retry3D').getText(ast)+';',
].join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None},fileName:'GoldBar3D-policy.ts'}).outputText;

const ref=current=>({current});
function fixture(){
  return {
    clock:0,cost:5,waitCost:0,nextId:0,frames:new Map(),timers:new Map(),events:[],renderers:[],balancedChanges:[],softwareChanges:[],allocations:[],readyChanges:[],failures:[],failureReasons:[],retries:[],warnings:[],limitedCalls:0,
    throwCreate:false,throwDraw:false,
    refs:{renderer:ref(null),glContext:ref(null),scheduler:ref(null),timeout:ref(null),currentSession:ref(null),latest:ref({startY:100,endY:1100,enabled:true,surfacePresent:true,balanced:false}),
      lastScroll:ref(350),drag:ref(.3),minePeek:ref(.2),metalRef:ref('XAU'),readyRef:ref(false),samples:ref([]),limited:ref(false),limitCallback:ref(null),resourceSession:ref(null),readinessAttempt:ref(null),timeoutRetries:ref(0)},
  };
}
function mount({balanced=false,software=false,cinematic=true,enabled=true,surfacePresent=true,state=fixture(),gl={}}={}){
  const expected=Symbol('test GL session'),schedulerOptions=[];state.refs.currentSession.current=expected;
  state.refs.latest.current={...state.refs.latest.current,enabled,surfacePresent,balanced};
  state.refs.limitCallback.current=()=>{state.limitedCalls++;state.events.push('limited');};
  const context=vm.createContext({
    ...state.refs,balanced,software,cinematic,session:expected,enabled,surfacePresent,width:360,height:640,PixelRatio:{get:()=>3},goldRenderScale,scrollProgress,isSoftwareSceneContext,sceneCostExceeded,SCENE_COST_HISTORY,
    useCallback:callback=>callback,
    performance:{now:()=>state.clock},
    requestAnimationFrame:callback=>{const id=++state.nextId;state.frames.set(id,callback);return id;},
    cancelAnimationFrame:id=>state.frames.delete(id),
    setTimeout:callback=>{const id=++state.nextId;state.timers.set(id,callback);return id;},
    clearTimeout:id=>state.timers.delete(id),
    createFrameScheduler:options=>{schedulerOptions.push(options);return createFrameScheduler(options);},
    createStoryRenderer:(_gl,mode)=>{
      state.events.push('create renderer');if(state.throwCreate)throw Error('simulated shader creation failure');
      const next={mode,draws:[],disposed:0,draw(...args){
        assert.equal(next.disposed,0,'A disposed context must not draw.');state.events.push('draw start');state.clock+=state.cost;
        if(state.waitCost){state.events.push('native completion wait');state.clock+=state.waitCost;}
        if(state.throwDraw)throw Error('simulated draw failure');next.draws.push(args);state.events.push('draw complete');
      },dispose(){next.disposed++;state.events.push('dispose renderer');}};
      state.renderers.push(next);return next;
    },
    setBalanced:value=>{state.balancedChanges.push(value);state.events.push('balanced');},
    setSoftware:value=>{state.softwareChanges.push(value);state.events.push('software');},
    setAllocated:value=>state.allocations.push(value),
    setReady:value=>{state.readyChanges.push(value);state.events.push('ready '+value);},
    setFailure:value=>{state.failures.push(value);state.events.push('failure '+value);},
    setFailureReason:value=>state.failureReasons.push(value),
    setRetry:update=>state.retries.push(typeof update==='function'?update(state.retries.at(-1)??0):update),
    console:{warn:value=>state.warnings.push(value)},
  });
  vm.runInContext(executable,context,{filename:'GoldBar3D-policy-extracted.js'});
  return {
    state,context,expected,schedulerOptions,
    create(){context.createContext(gl,expected);},
    pause(){state.refs.latest.current.enabled=false;context.enabled=false;context.drawEffect();},
    resume(){state.refs.latest.current.enabled=true;context.enabled=true;context.drawEffect();},
    frame(elapsed=50){
      const entry=state.frames.entries().next().value;assert.ok(entry,'A real scheduler callback must be queued.');
      state.frames.delete(entry[0]);state.clock+=elapsed;entry[1]();
    },
    render(count,cost=state.cost){
      state.cost=cost;
      for(let i=0;i<count;i++){state.refs.scheduler.current.invalidate();this.frame();}
    },
    stop(){context.stop();},
  };
}

test('cierre real adapta cadencia tras12 costes sin reemplazar superficie y solicita ligero tras24',()=>{
  const high=mount();high.create();
  try{
    assert.equal(high.schedulerOptions[0].maxFps,60);
    high.render(11,25);assert.equal(high.state.balancedChanges.length,0);assert.equal(high.state.limitedCalls,0);
    high.render(1,25);assert.deepEqual(high.state.balancedChanges,[true]);assert.equal(high.state.limitedCalls,0,'The first tier must not skip directly to light.');
    high.state.refs.latest.current.balanced=true;high.context.balanced=true;high.context.drawEffect();
    assert.equal(high.state.renderers.length,1);assert.equal(high.state.renderers[0].disposed,0,'Cadence adaptation retains native resources.');
    assert.equal(high.schedulerOptions.at(-1).maxFps,30);
    assert.equal(high.state.refs.samples.current.length,0,'The balanced tier gets its own sample window.');
    high.render(23,45);assert.equal(high.state.limitedCalls,0);
    high.render(1,45);assert.equal(high.state.limitedCalls,1);assert.equal(high.state.refs.limited.current,true);
    high.render(5,45);assert.equal(high.state.limitedCalls,1,'The light callback is emitted only once.');
  }finally{high.stop();}
  assert.equal(high.state.frames.size,0);assert.equal(high.state.timers.size,0);
});

test('el coste inclusivo observa la espera nativa aunque encolar el frame solo cueste1ms',()=>{
  const view=mount();view.state.waitCost=24;view.create();
  try{
    view.render(12,1);assert.deepEqual(view.state.balancedChanges,[true]);
    assert.deepEqual([...view.state.refs.samples.current],Array(12).fill(25));
    assert.ok(view.state.events.indexOf('native completion wait')<view.state.events.indexOf('ready true'));
  }finally{view.stop();}
});

test('umbrales reales son estrictos: 20ms conserva calidad y 40ms conserva modo equilibrado',()=>{
  const high=mount(),balanced=mount({balanced:true});high.create();balanced.create();
  try{
    high.render(12,20);assert.equal(high.state.balancedChanges.length,0);
    balanced.render(24,40);assert.equal(balanced.state.limitedCalls,0);
  }finally{high.stop();balanced.stop();}
  const aboveHigh=mount(),aboveBalanced=mount({balanced:true});aboveHigh.create();aboveBalanced.create();
  try{
    aboveHigh.render(12,20.01);assert.deepEqual(aboveHigh.state.balancedChanges,[true]);
    aboveBalanced.render(24,40.01);assert.equal(aboveBalanced.state.limitedCalls,1);
  }finally{aboveHigh.stop();aboveBalanced.stop();}
});

test('picos aislados no degradan y el historial de costes permanece acotado a24 muestras',()=>{
  for(const balanced of [false,true]){
    const view=mount({balanced});view.create();
    try{
      for(let i=0;i<150;i++)view.render(1,i%30===0?160:5);
      assert.equal(view.state.balancedChanges.length,0);assert.equal(view.state.limitedCalls,0);
      assert.equal(view.state.refs.samples.current.length,24);assert.deepEqual(view.state.readyChanges,[false,true]);
    }finally{view.stop();}
  }
});

test('software nativo se remonta en equilibrado a384 antes de crear shaders o dibujar',()=>{
  const gl={flushEXP(){},RENDERER:1,getParameter:()=>'Android Emulator OpenGL ES Translator (Google SwiftShader)'};
  const initial=mount({gl});initial.create();
  try{
    assert.deepEqual(initial.state.softwareChanges,[true]);assert.deepEqual(initial.state.balancedChanges,[true]);
    assert.equal(initial.state.renderers.length,0);assert.equal(initial.state.frames.size,0);assert.equal(initial.state.timers.size,1);
    const software=mount({balanced:true,software:true,state:initial.state,gl});software.create();
    assert.equal(software.schedulerOptions[0].maxFps,30);assert.equal(software.context.renderScale,initial.context.renderScale*.375);
    assert.ok(640*3*software.context.renderScale<=384);software.frame();assert.equal(initial.state.readyChanges.at(-1),true);software.stop();
  }finally{initial.stop();}
});

test('ready llega después del frame y el cambio de metal espera el frame con sus uniforms',()=>{
  const view=mount();view.create();
  try{
    assert.equal(view.state.refs.readyRef.current,false);assert.deepEqual(view.state.readyChanges,[false]);assert.equal(view.state.timers.size,1);
    view.frame();assert.deepEqual(view.state.readyChanges,[false,true]);assert.equal(view.state.timers.size,0);
    assert.ok(view.state.events.indexOf('draw complete')<view.state.events.indexOf('ready true'));
    assert.deepEqual(view.state.renderers[0].draws[0],[.25,.3,'XAU',.2]);
    view.state.refs.metalRef.current='XAG';view.context.materialEffect();
    assert.equal(view.state.refs.readyRef.current,false);assert.deepEqual(view.state.readyChanges,[false,true,false]);
    view.frame();assert.deepEqual(view.state.renderers[0].draws.at(-1),[.25,.3,'XAG',.2]);assert.deepEqual(view.state.readyChanges,[false,true,false,true]);
  }finally{view.stop();}
});

test('sesión obsoleta no dibuja ni su onError elimina el renderer o el watchdog de la sesión nueva',()=>{
  const previous=mount();previous.create();
  const oldOptions=previous.schedulerOptions[0],oldTimer=[...previous.state.timers.values()][0];
  const current=mount({balanced:true,state:previous.state});current.create();
  try{
    assert.equal(previous.state.renderers[0].disposed,1);
    const next=previous.state.renderers[1],watchdog=previous.state.refs.timeout.current;
    oldOptions.draw();oldOptions.onError(Error('late native failure'));oldTimer();previous.context.createContext({},previous.expected);
    assert.equal(previous.state.renderers.length,2);assert.equal(next.disposed,0);assert.equal(next.draws.length,0);
    assert.deepEqual(previous.state.failures,[]);assert.ok(previous.state.readyChanges.every(value=>value===false));
    assert.equal(previous.state.refs.timeout.current,watchdog);assert.ok(previous.state.timers.has(watchdog));
    current.frame();assert.equal(next.draws.length,1);assert.equal(previous.state.readyChanges.at(-1),true);
  }finally{current.stop();}
});

test('error de draw activo usa el onError real, libera scheduler/renderer y nunca anuncia ready',()=>{
  const view=mount();view.state.throwDraw=true;view.create();view.frame();
  assert.equal(view.state.renderers[0].disposed,1);assert.equal(view.state.refs.renderer.current,null);assert.equal(view.state.refs.scheduler.current,null);
  assert.equal(view.state.frames.size,0);assert.equal(view.state.timers.size,0);assert.deepEqual(view.state.failures,[true]);assert.ok(view.state.readyChanges.every(value=>value===false));
  assert.equal(view.state.limitedCalls,0);assert.equal(view.state.refs.readyRef.current,false);
  assert.deepEqual(view.state.failureReasons,['draw']);assert.deepEqual(view.state.warnings,['[Openminerals 3D] draw']);
});

test('error al crear renderer falla de forma controlada antes de programar un frame',()=>{
  const view=mount();view.state.throwCreate=true;view.create();
  assert.equal(view.state.renderers.length,0);assert.equal(view.state.frames.size,0);assert.equal(view.state.timers.size,0);
  assert.equal(view.state.refs.renderer.current,null);assert.equal(view.state.refs.scheduler.current,null);assert.deepEqual(view.state.failures,[true]);assert.ok(view.state.readyChanges.every(value=>value===false));
  assert.deepEqual(view.state.failureReasons,['create']);
});

test('context timeout retries once, then keeps a reason and permits explicit manual recovery',()=>{
  const first=mount(),cleanupFirst=first.context.sessionEffect();first.context.drawEffect();const oldTimeout=[...first.state.timers.values()][0];
  oldTimeout();assert.deepEqual(first.state.retries,[1]);assert.equal(first.state.refs.timeoutRetries.current,1);assert.deepEqual(first.state.failures,[false]);
  assert.deepEqual(first.state.failureReasons,['context-timeout']);assert.equal(first.state.frames.size,0);
  const retry=mount({state:first.state}),cleanupRetry=retry.context.sessionEffect();retry.context.drawEffect();const secondTimeout=[...first.state.timers.values()][0];
  cleanupFirst();assert.equal(first.state.timers.size,1,'Old cleanup must not clear the new watchdog.');
  oldTimeout();assert.deepEqual(first.state.retries,[1],'A stale timeout cannot consume another attempt.');
  secondTimeout();assert.deepEqual(first.state.retries,[1]);assert.deepEqual(first.state.failures,[false,true]);assert.equal(first.state.timers.size,0);
  retry.context.retry3D();assert.deepEqual(first.state.retries,[1,2]);assert.equal(first.state.refs.timeoutRetries.current,0);assert.equal(first.state.failureReasons.at(-1),null);
  const manual=mount({state:first.state});manual.context.sessionEffect();manual.create();cleanupRetry();manual.frame();
  assert.equal(first.state.renderers.at(-1).disposed,0);assert.equal(first.state.readyChanges.at(-1),true);assert.equal(first.state.failureReasons.at(-1),null);
  assert.ok(first.state.warnings.every(value=>value==='[Openminerals 3D] context-timeout'));manual.stop();
});

test('old layout cleanup and boundary errors cannot dispose a newly owned renderer',()=>{
  const first=mount(),cleanupFirst=first.context.sessionEffect();first.create();
  const next=mount({state:first.state});next.context.sessionEffect();next.create();
  const active=first.state.renderers.at(-1),watchdog=first.state.refs.timeout.current;
  cleanupFirst();first.context.fail(first.expected,'boundary');
  assert.equal(active.disposed,0);assert.equal(first.state.refs.timeout.current,watchdog);assert.ok(first.state.timers.has(watchdog));
  next.frame();assert.equal(first.state.readyChanges.at(-1),true);next.stop();
});

test('native view stays drawable below the opaque preparation cover until first completed frame',()=>{
  let native,cover,styles;
  const attribute=(opening,name)=>opening.attributes.properties.find(value=>ts.isJsxAttribute(value)&&value.name.getText(ast)===name);
  function inspect(node){
    if(ts.isJsxSelfClosingElement(node)&&node.tagName.getText(ast)==='NativeGLView')native=node;
    if(ts.isJsxElement(node)&&node.openingElement.tagName.getText(ast)==='View'&&attribute(node.openingElement,'style')?.initializer?.expression?.getText(ast)==='styles.fallback')cover=node;
    if(ts.isVariableDeclaration(node)&&node.name.getText(ast)==='styles')styles=node.initializer.arguments[0];
    ts.forEachChild(node,inspect);
  }
  inspect(ast);assert.ok(native&&cover&&styles);
  const nativeStyle=attribute(native,'style').initializer.expression;
  const opacity=nativeStyle.properties.find(prop=>prop.name?.getText(ast)==='opacity').initializer.getText(ast);
  assert.equal(vm.runInNewContext(opacity,{enabled:true}),1,'Context creation and every enabled frame remain drawable.');
  assert.equal(vm.runInNewContext(opacity,{enabled:false}),0,'Paused retained surface contributes no composited pixels.');
  assert.ok(native.end<cover.pos,'Native GL must precede its cover in JSX drawing order.');
  assert.match(cover.parent.getText(ast),/^\(!enabled\|\|!ready\)&&/);
  const fallbackStyle=styles.properties.find(prop=>prop.name.getText(ast)==='fallback').initializer;
  assert.equal(fallbackStyle.properties.find(prop=>prop.name.getText(ast)==='backgroundColor').initializer.text,'#0A0D10');
});

test('accessible values distinguish internal failure reasons from requested lightweight mode',()=>{
  const code='this.diagnostic=()=>'+declarations.get('diagnostic').getText(ast)+';';
  for(const reason of ['context-timeout','create','draw','boundary','unavailable']){
    const context=vm.createContext({failure:true,NativeGLView:true,internalReason:reason,reducedMotion:false,ready:false,balanced:false});
    vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);
    assert.equal(context.diagnostic(),'Vista ligera por fallo 3D: '+reason);
  }
  const context=vm.createContext({failure:false,NativeGLView:true,internalReason:null,reducedMotion:true,ready:false,balanced:false});
  vm.runInContext(ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,context);assert.equal(context.diagnostic(),'Vista ligera');
  assert.match(source,/cinematic&&failure&&NativeGLView&&!reducedMotion&&<View/);assert.match(source,/accessibilityLabel="Reintentar 3D"/);
});

test('light/reduced pauses retain the native context and renderer with zero idle RAF work',()=>{
  const gl={contextId:10},view=mount({gl});view.context.sessionEffect();view.create();view.frame();
  const retained=view.state.renderers[0],owner=view.state.refs.resourceSession.current;
  try{
    for(let cycle=0;cycle<8;cycle++){
      const staleDraw=view.schedulerOptions.at(-1).draw,previousDraws=retained.draws.length;
      view.pause();staleDraw();assert.equal(retained.draws.length,previousDraws);
      assert.equal(view.state.frames.size,0);assert.equal(view.state.timers.size,0);assert.equal(view.state.refs.scheduler.current,null);
      assert.equal(view.state.refs.glContext.current,gl);assert.equal(view.state.refs.renderer.current,retained);assert.equal(retained.disposed,0);assert.equal(view.state.refs.resourceSession.current,owner);
      view.state.refs.lastScroll.current=400+cycle*20;view.state.refs.metalRef.current=cycle%2?'XPT':'XAG';
      view.resume();assert.equal(view.state.refs.readyRef.current,false);view.frame();
      assert.equal(retained.draws.at(-1)[0],scrollProgress(400+cycle*20,100,1100));assert.equal(retained.draws.at(-1)[2],cycle%2?'XPT':'XAG');
      assert.equal(view.state.frames.size,0);assert.equal(view.state.timers.size,0);assert.equal(view.state.renderers.length,1);
    }
  }finally{view.stop();}
  assert.equal(retained.disposed,1);assert.equal(view.state.refs.glContext.current,null);
});

test('a reduced-only initial session never allocates a GL surface or creates GL resources',()=>{
  const view=mount({enabled:false,surfacePresent:false});view.context.allocationEffect();view.context.sessionEffect();view.context.drawEffect();view.create();
  assert.deepEqual(view.state.allocations,[]);assert.equal(view.state.refs.glContext.current,null);assert.equal(view.state.renderers.length,0);assert.equal(view.state.frames.size,0);assert.equal(view.state.timers.size,0);
  view.context.enabled=true;view.context.allocationEffect();assert.deepEqual(view.state.allocations,[true]);view.stop();
});

test('canceled readiness callbacks cannot fail a paused or resumed retained context',()=>{
  const view=mount();view.context.sessionEffect();view.create();const oldTimeout=[...view.state.timers.values()][0],retained=view.state.renderers[0];
  view.pause();oldTimeout();assert.deepEqual(view.state.failures,[]);assert.deepEqual(view.state.retries,[]);
  view.resume();const currentWatchdog=view.state.refs.timeout.current;oldTimeout();
  assert.equal(view.state.refs.timeout.current,currentWatchdog);assert.ok(view.state.timers.has(currentWatchdog));assert.equal(retained.disposed,0);
  view.frame();oldTimeout();assert.deepEqual(view.state.failures,[]);assert.equal(view.state.readyChanges.at(-1),true);view.stop();
});

test('context callback received while paused is cached and retired native IDs cannot replace it',()=>{
  const gl={contextId:20},view=mount({enabled:false,gl});view.context.sessionEffect();view.create();
  assert.equal(view.state.refs.glContext.current,gl);assert.equal(view.state.renderers.length,0);assert.equal(view.state.frames.size,0);assert.equal(view.state.timers.size,0);
  view.resume();view.frame();const first=view.state.renderers[0];view.pause();
  const replacement={contextId:21};view.context.createContext(replacement,view.expected);
  assert.equal(first.disposed,1);assert.equal(view.state.refs.glContext.current,replacement);assert.equal(view.state.renderers.length,1);
  view.context.createContext(gl,view.expected);assert.equal(view.state.refs.glContext.current,replacement);
  view.resume();view.frame();assert.equal(view.state.renderers.length,2);assert.equal(view.state.renderers[1].disposed,0);
  view.context.createContext(gl,view.expected);assert.equal(view.state.renderers[1].disposed,0);view.stop();
});

test('surface presence, native key and resource lifetime do not depend on draw-enabled or hardware cadence',()=>{
  const presence=declarations.get('surfacePresent').getText(ast),scale=declarations.get('renderScale').getText(ast);
  assert.doesNotMatch(presence,/\benabled\b|\breducedMotion\b|\bactive\b|\bbalanced\b/);assert.match(presence,/\ballocated\b/);
  assert.doesNotMatch(scale,/\bbalanced\b/);assert.match(scale,/software\?\.375:1/);
  let resourceDeps,nativeKey;
  function inspect(node){
    if(ts.isCallExpression(node)&&node.arguments[0]===sessionEffect)resourceDeps=node.arguments[1].getText(ast);
    if(ts.isJsxOpeningElement(node)&&node.tagName.getText(ast)==='GLBoundary')nativeKey=node.attributes.properties.find(value=>ts.isJsxAttribute(value)&&value.name.getText(ast)==='key').initializer.expression.getText(ast);
    ts.forEachChild(node,inspect);
  }
  inspect(ast);assert.equal(resourceDeps,'[surfacePresent,session,stop]');assert.doesNotMatch(nativeKey,/enabled|balanced|reducedMotion/);
});
