import test from 'node:test';
import assert from 'node:assert/strict';
import {parseAndroidPerformance} from '../e2e/immersive-performance.mjs';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import {requireSafe,PACKAGE} from '../e2e/ci-safety.mjs';
test('Android performance retains measured values from both meminfo formats without publishing raw dumps',()=>{
  const measured=parseAndroidPerformance({before:'TOTAL PSS: 132768 TOTAL RSS: 200000',after:'  TOTAL   140768    90000  50000\n',gfx:'Total frames rendered: 420\nJanky frames: 7 (1.6%)\n50th percentile: 7ms\n90th percentile: 17ms\n95th percentile: 22ms',start:'Status: ok\nTotalTime: 1092\nWaitTime: 1101'});
  assert.deepEqual(measured,{coldStartTotalMs:1092,coldStartWaitMs:1101,pssBeforeKiB:132768,pssAfterKiB:140768,uiFrames:420,jankyUiFrames:7,uiFrameP50Ms:7,uiFrameP90Ms:17,uiFrameP95Ms:22});
  assert.ok(Object.values(parseAndroidPerformance({before:'unavailable',after:'',gfx:'',start:''})).every(value=>value===null));
});

for(const failure of [false,true])test('Recording prepares a valid frame and stops before options, including video failure='+failure,async()=>{
  const text=await readFile(new URL('../e2e/immersive-performance.mjs',import.meta.url),'utf8'),ast=ts.createSourceFile('immersive-performance.mjs',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const declaration=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='runImmersivePerformance');assert.ok(declaration);
  const events=[],reports=new Map();let app=false,recorder=false,child;
  const adb=(...args)=>{
    events.push(['adb',...args]);
    if(args.includes('resolve-activity'))return PACKAGE+'/.MainActivity';
    if(args.includes('force-stop')){app=false;return '';}
    if(args.includes('pidof'))return args.at(-1)==='screenrecord'?(recorder?'2000':''):(app?'1000':'');
    if(args.includes('start')){app=true;return 'Status: ok\nTotalTime: 100\nWaitTime: 120';}
    if(args.includes('meminfo'))return 'TOTAL PSS: 100000';
    if(args.includes('gfxinfo'))return 'Total frames rendered: 10\nJanky frames: 1\n50th percentile: 10ms';
    if(args.includes('kill')){recorder=false;child.exitCode=0;return '';}
    if(args[0]==='exec-out')return '<hierarchy/>';
    return '';
  };
  const header=Buffer.alloc(1024);header.write('ftyp',4);
  const context=vm.createContext({
    process:{env:{GITHUB_ACTIONS:'true',RUNNER_OS:'Linux'}},PACKAGE,requireSafe,parseAndroidPerformance,
    randomUUID:()=> '00000000-0000-4000-8000-000000000000',join:(...parts)=>parts.join('/'),
    setTimeout:callback=>{queueMicrotask(callback);return 0;},
    spawn:()=>{events.push(['record-start']);recorder=true;child={exitCode:null,on(){},kill(){events.push(['record-kill']);recorder=false;}};return child;},
    once:async()=>[],writeFile:async(file,data)=>reports.set(file,data),stat:async()=>({size:1024}),readFile:async()=>header,
  });
  vm.runInContext(declaration.getText(ast).replace(/^export\s+/,'')+'\nthis.execute=runImmersivePerformance;',context);
  const maestro=async name=>{events.push(['maestro',name]);if(failure&&name==='story-video')throw Error('Real video assertion failed');};
  const work=context.execute({adb,serial:'emulator-5554',published:'/tmp/native-unit',maestro});
  if(failure)await assert.rejects(work,/Real video assertion failed/);else await work;
  const start=events.findIndex(event=>event[0]==='record-start'),stop=events.findIndex(event=>event.includes('kill')&&event.includes('-INT'));
  assert.ok(start>events.findIndex(event=>event[0]==='maestro'&&event[1]==='story-video-prepare'));
  assert.ok(start>events.findIndex(event=>event[0]==='maestro'&&event[1]==='story'));
  assert.ok(stop>start);assert.equal(recorder,false);
  assert.deepEqual(events.slice(start,stop).filter(event=>event[0]==='maestro').map(event=>event[1]),['story-video']);
  const exit=events.findIndex(event=>event[0]==='maestro'&&event[1]==='story-exit');
  if(failure){assert.equal(exit,-1);assert.equal(reports.has('/tmp/native-unit/immersive-performance.json'),false);}
  else{
    assert.ok(exit>stop);const report=JSON.parse(reports.get('/tmp/native-unit/immersive-performance.json'));
    assert.equal(report.videoStartsAfterReadyFrame,true);assert.equal(report.videoIncludesMenus,false);assert.equal(report.videoIncludesColdStart,false);
    assert.equal(report.phonePerformanceAcceptance,false);assert.match(report.measurementScope,/exit excluded/);
  }
});
