import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {createFrameScheduler,goldRenderScale,scrollProgress} from '../lib/gold-bar-3d.ts';
import {renderBudget} from '../lib/immersive-story.ts';

// Execute GoldBar3D's actual closure, not a second implementation of its policy.
// The controlled clock measures fake submission work only. This proves neither
// Android GPU timings, physical FPS nor the React/native lifecycle as a whole.
const source=await readFile(new URL('../components/GoldBar3D.tsx',import.meta.url),'utf8');
const ast=ts.createSourceFile('GoldBar3D.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
const declarations=new Map();let materialEffect;
function visit(node){
  if(ts.isVariableDeclaration(node)&&ts.isIdentifier(node.name))declarations.set(node.name.text,node.initializer);
  if(ts.isCallExpression(node)&&node.expression.getText(ast)==='useLayoutEffect'&&node.arguments[1]?.getText(ast)==='[metal]')materialEffect=node.arguments[0];
  ts.forEachChild(node,visit);
}
visit(ast);
for(const name of ['stop','fail','createContext','renderScale'])assert.ok(declarations.get(name),'Missing actual GoldBar3D declaration: '+name);
assert.ok(materialEffect,'Material readiness must use the actual layout effect.');
const executable=ts.transpileModule([
  'this.stop='+declarations.get('stop').getText(ast)+';',
  'this.fail='+declarations.get('fail').getText(ast)+';',
  'this.createContext='+declarations.get('createContext').getText(ast)+';',
  'this.renderScale='+declarations.get('renderScale').getText(ast)+';',
  'this.materialEffect='+materialEffect.getText(ast)+';',
].join('\n'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None},fileName:'GoldBar3D-policy.ts'}).outputText;

const ref=current=>({current});
function fixture(){
  return {
    clock:0,cost:5,nextId:0,frames:new Map(),timers:new Map(),events:[],renderers:[],balancedChanges:[],readyChanges:[],failures:[],limitedCalls:0,
    throwCreate:false,throwDraw:false,
    refs:{renderer:ref(null),scheduler:ref(null),timeout:ref(null),currentSession:ref(null),latest:ref({startY:100,endY:1100,enabled:true}),
      lastScroll:ref(350),drag:ref(.3),minePeek:ref(.2),metalRef:ref('XAU'),readyRef:ref(false),samples:ref([]),limited:ref(false),limitCallback:ref(null)},
  };
}
function mount({balanced=false,cinematic=true,state=fixture()}={}){
  const expected=Symbol('test GL session'),schedulerOptions=[];state.refs.currentSession.current=expected;
  state.refs.limitCallback.current=()=>{state.limitedCalls++;state.events.push('limited');};
  const context=vm.createContext({
    ...state.refs,balanced,cinematic,width:360,height:640,PixelRatio:{get:()=>3},goldRenderScale,scrollProgress,renderBudget,
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
        if(state.throwDraw)throw Error('simulated draw failure');next.draws.push(args);state.events.push('draw complete');
      },dispose(){next.disposed++;state.events.push('dispose renderer');}};
      state.renderers.push(next);return next;
    },
    setBalanced:value=>{state.balancedChanges.push(value);state.events.push('balanced');},
    setReady:value=>{state.readyChanges.push(value);state.events.push('ready '+value);},
    setFailure:value=>{state.failures.push(value);state.events.push('failure '+value);},
  });
  vm.runInContext(executable,context,{filename:'GoldBar3D-policy-extracted.js'});
  return {
    state,context,expected,schedulerOptions,
    create(){context.createContext({},expected);},
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

test('cierre real adapta 60 a 30 y 75% de resolución, después solicita ligero tras 90 muestras equilibradas',()=>{
  const high=mount();high.create();
  try{
    assert.equal(high.schedulerOptions[0].maxFps,60);
    high.render(44,25);assert.equal(high.state.balancedChanges.length,0);assert.equal(high.state.limitedCalls,0);
    high.render(1,25);assert.deepEqual(high.state.balancedChanges,[true]);assert.equal(high.state.limitedCalls,0,'The first tier must not skip directly to light.');
    const balanced=mount({balanced:true,state:high.state});balanced.create();
    assert.equal(high.state.renderers[0].disposed,1,'Recreation releases the previous renderer.');
    assert.equal(balanced.schedulerOptions[0].maxFps,30);assert.equal(balanced.context.renderScale,high.context.renderScale*.75);
    assert.equal(high.state.refs.samples.current.length,0,'The balanced tier gets its own sample window.');
    balanced.render(89,45);assert.equal(high.state.limitedCalls,0);
    balanced.render(1,45);assert.equal(high.state.limitedCalls,1);assert.equal(high.state.refs.limited.current,true);
    balanced.render(5,45);assert.equal(high.state.limitedCalls,1,'The light callback is emitted only once.');
  }finally{high.stop();}
  assert.equal(high.state.frames.size,0);assert.equal(high.state.timers.size,0);
});

test('umbrales reales son estrictos: 20ms conserva calidad y 40ms conserva modo equilibrado',()=>{
  const high=mount(),balanced=mount({balanced:true});high.create();balanced.create();
  try{
    high.render(45,20);assert.equal(high.state.balancedChanges.length,0);
    balanced.render(90,40);assert.equal(balanced.state.limitedCalls,0);
  }finally{high.stop();balanced.stop();}
  const aboveHigh=mount(),aboveBalanced=mount({balanced:true});aboveHigh.create();aboveBalanced.create();
  try{
    aboveHigh.render(45,20.01);assert.deepEqual(aboveHigh.state.balancedChanges,[true]);
    aboveBalanced.render(90,40.01);assert.equal(aboveBalanced.state.limitedCalls,1);
  }finally{aboveHigh.stop();aboveBalanced.stop();}
});

test('picos aislados no degradan y el historial de costes permanece acotado a 120 muestras',()=>{
  for(const balanced of [false,true]){
    const view=mount({balanced});view.create();
    try{
      for(let i=0;i<150;i++)view.render(1,i%30===0?160:5);
      assert.equal(view.state.balancedChanges.length,0);assert.equal(view.state.limitedCalls,0);
      assert.equal(view.state.refs.samples.current.length,120);assert.deepEqual(view.state.readyChanges,[true]);
    }finally{view.stop();}
  }
});

test('ready llega después del frame y el cambio de metal espera el frame con sus uniforms',()=>{
  const view=mount();view.create();
  try{
    assert.equal(view.state.refs.readyRef.current,false);assert.deepEqual(view.state.readyChanges,[]);assert.equal(view.state.timers.size,1);
    view.frame();assert.deepEqual(view.state.readyChanges,[true]);assert.equal(view.state.timers.size,0);
    assert.ok(view.state.events.indexOf('draw complete')<view.state.events.indexOf('ready true'));
    assert.deepEqual(view.state.renderers[0].draws[0],[.25,.3,'XAU',.2]);
    view.state.refs.metalRef.current='XAG';view.context.materialEffect();
    assert.equal(view.state.refs.readyRef.current,false);assert.deepEqual(view.state.readyChanges,[true,false]);
    view.frame();assert.deepEqual(view.state.renderers[0].draws.at(-1),[.25,.3,'XAG',.2]);assert.deepEqual(view.state.readyChanges,[true,false,true]);
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
    assert.deepEqual(previous.state.failures,[]);assert.deepEqual(previous.state.readyChanges,[]);
    assert.equal(previous.state.refs.timeout.current,watchdog);assert.ok(previous.state.timers.has(watchdog));
    current.frame();assert.equal(next.draws.length,1);assert.deepEqual(previous.state.readyChanges,[true]);
  }finally{current.stop();}
});

test('error de draw activo usa el onError real, libera scheduler/renderer y nunca anuncia ready',()=>{
  const view=mount();view.state.throwDraw=true;view.create();view.frame();
  assert.equal(view.state.renderers[0].disposed,1);assert.equal(view.state.refs.renderer.current,null);assert.equal(view.state.refs.scheduler.current,null);
  assert.equal(view.state.frames.size,0);assert.equal(view.state.timers.size,0);assert.deepEqual(view.state.failures,[true]);assert.deepEqual(view.state.readyChanges,[false]);
  assert.equal(view.state.limitedCalls,0);assert.equal(view.state.refs.readyRef.current,false);
});

test('error al crear renderer falla de forma controlada antes de programar un frame',()=>{
  const view=mount();view.state.throwCreate=true;view.create();
  assert.equal(view.state.renderers.length,0);assert.equal(view.state.frames.size,0);assert.equal(view.state.timers.size,0);
  assert.equal(view.state.refs.renderer.current,null);assert.equal(view.state.refs.scheduler.current,null);assert.deepEqual(view.state.failures,[true]);assert.deepEqual(view.state.readyChanges,[false]);
});
