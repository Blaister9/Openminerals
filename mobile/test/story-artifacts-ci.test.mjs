import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,readFile,readdir,writeFile,copyFile,rm} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {tmpdir} from 'node:os';
import vm from 'node:vm';
import ts from 'typescript';
import {requireSafe,anonymousScreenshotAllowed} from '../e2e/ci-safety.mjs';

const text=await readFile(new URL('../e2e/ci-android.mjs',import.meta.url),'utf8');
const ast=ts.createSourceFile('ci-android.mjs',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
const declaration=name=>{const node=ast.statements.find(value=>ts.isFunctionDeclaration(value)&&value.name?.text===name);assert.ok(node,name);return node.getText(ast);};
const expected=[...Array.from({length:7},(_,index)=>'safe-story-'+(index+1)+'.png'),'safe-reduced-motion.png'].sort();
const makeContext=({capture,work,privateRoot='',published=''})=>{
  const context=vm.createContext({readFile,readdir,copyFile,join,Buffer,requireSafe,anonymousScreenshotAllowed,privateRoot,published,
    adb:()=>{},serial:'emulator-5554',maestro:()=>{},runImmersivePerformance:work,...(capture?{captureSafeScreens:capture}:{})});
  vm.runInContext((capture?'':declaration('captureSafeScreens'))+'\n'+declaration('runAnonymousStory')+'\nthis.execute=runAnonymousStory;',context);
  return context;
};

for(const fails of [false,true])test('Anonymous PNGs are copied after narrative '+(fails?'failure':'success')+' without publishing unrelated private files',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'openminerals-safe-story-'));
  const scoped=()=>assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep+'openminerals-safe-story-'));
  scoped();
  const privateRoot=join(directory,'private'),published=join(directory,'public');
  const narrativeError=Error('Synthetic narrative failure'),png=Buffer.from([137,80,78,71,13,10,26,10]);
  try{
    const story=join(privateRoot,'story','screenshots','nested'),exit=join(privateRoot,'story-exit','screenshots');
    await Promise.all([mkdir(story,{recursive:true}),mkdir(exit,{recursive:true}),mkdir(published)]);
    await Promise.all(expected.filter(name=>name.startsWith('safe-story-')).map(name=>writeFile(join(story,name),png)));
    if(!fails)await writeFile(join(exit,'safe-reduced-motion.png'),png);
    await writeFile(join(story,'private-account.png'),Buffer.concat([png,Buffer.from('PRIVATE_UNIT_CAPTURE_SENTINEL')]));
    await writeFile(join(story,'safe-story-8.png'),png);
    await writeFile(join(story,'hierarchy.xml'),'PRIVATE_UNIT_CAPTURE_SENTINEL');
    const context=makeContext({privateRoot,published,work:async()=>{if(fails)throw narrativeError;}});
    if(fails)await assert.rejects(context.execute(),error=>error===narrativeError);else await context.execute();
    assert.deepEqual((await readdir(published)).sort(),fails?expected.filter(name=>name!=='safe-reduced-motion.png'):expected);
    for(const name of await readdir(published))assert.deepEqual(await readFile(join(published,name)),png);
  }finally{scoped();await rm(directory,{recursive:true,force:true});}
});

test('A screenshot-copy failure cannot replace an earlier narrative error and both approved directories are attempted',async()=>{
  const narrativeError=Error('Synthetic original cause'),copyError=Error('Synthetic private copy detail'),calls=[];
  const context=makeContext({work:async()=>{throw narrativeError;},capture:name=>{calls.push(name);if(name==='story')throw copyError;return ['safe-reduced-motion.png'];}});
  await assert.rejects(context.execute(),error=>error===narrativeError);
  assert.deepEqual(calls,['story','story-exit']);
});

test('Successful narrative still fails when required PNG copying fails or images are absent',async()=>{
  const detail='PRIVATE_UNIT_CAPTURE_SENTINEL';
  const broken=makeContext({work:async()=>{},capture:async()=>{throw Error(detail);}});
  await assert.rejects(broken.execute(),error=>error.message==='Required anonymous screenshots could not be safely copied.'&&!error.message.includes(detail));
  const missing=makeContext({work:async()=>{},capture:async()=>[]});
  await assert.rejects(missing.execute(),/Required anonymous narrative screenshots are missing/);
});

test('Anonymous artifact finalization stays in both story stages before registration or fixture credential entry',()=>{
  const run=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='run');assert.ok(run);
  const calls=[];function visit(node){if(ts.isCallExpression(node)&&node.expression.getText(ast)==='runStage')calls.push(node);ts.forEachChild(node,visit);}visit(run);
  const stories=calls.filter(node=>node.arguments[0]?.text==='native-story-and-reduced-motion');
  const registration=calls.find(node=>node.arguments[0]?.text==='native-registration-no-import');assert.ok(registration);
  assert.equal(stories.length,2);
  for(const node of stories){assert.equal(node.arguments[1].getText(ast),'runAnonymousStory');assert.ok(node.getStart(ast)<registration.getStart(ast));}
});
