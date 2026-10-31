import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile,writeFile,mkdir,mkdtemp,rm,realpath} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import os from 'node:os';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {DEEPMERGE_ENTRIES,DEEPMERGE_VERSION,patchDeepmergeSource,patchDeepmergePackage,patchToolchain} from '../scripts/patch-toolchain.mjs';

const projectRoot=fileURLToPath(new URL('..',import.meta.url)),require=createRequire(import.meta.url);
const packageRoot=path.dirname(require.resolve('deepmerge/package.json'));
const normalize=source=>source.replace(/\r\n/g,'\n'),digest=source=>createHash('sha256').update(normalize(source)).digest('hex');
const entries=Object.keys(DEEPMERGE_ENTRIES);
async function readEntry(directory,entry){return readFile(path.join(directory,entry),'utf8');}
async function implementation(entry,directory=packageRoot){
  const source=await readEntry(directory,entry),module={exports:{}};
  // index.js is the upstream build source, not npm's runtime main. Its dev-only
  // helper is bundled verbatim in dist/cjs.js; reuse that actual implementation.
  let mergeable;
  if(entry==='index.js'){
    const bundled=await readEntry(directory,'dist/cjs.js'),helper={module:{exports:{}}};
    vm.runInNewContext(bundled.slice(0,bundled.indexOf('function emptyTarget'))+'\nmodule.exports = isMergeableObject;',helper);
    mergeable=helper.module.exports;
  }
  vm.runInNewContext(source,{module,exports:module.exports,require(name){assert.equal(name,'is-mergeable-object');return mergeable;}},{filename:`deepmerge/${entry}`,timeout:1000});
  return module.exports;
}
function noDangerousOwnKeys(value){
  if(!value||typeof value!=='object')return;
  for(const key of Reflect.ownKeys(value)){
    assert.equal(['__proto__','constructor','prototype'].includes(key),false);
    noDangerousOwnKeys(value[key]);
  }
  assert.equal(Object.getPrototypeOf(value)?.toolchainPoisoned,undefined);
}
function poison(){return JSON.parse('{"__proto__":{"toolchainPoisoned":true},"constructor":{"prototype":{"toolchainPoisoned":true}},"prototype":{"toolchainPoisoned":true},"safe":1}');}
async function tempFixture(run){
  const directory=await mkdtemp(path.join(os.tmpdir(),'openminerals-toolchain-test-'));
  try{return await run(directory);}
  finally{
    const resolved=await realpath(directory),temporary=await realpath(os.tmpdir());
    assert.equal(path.dirname(resolved),temporary);assert.ok(path.basename(resolved).startsWith('openminerals-toolchain-test-'));
    await rm(resolved,{recursive:true,force:true});
  }
}
async function pristineCopy(directory){
  await mkdir(path.join(directory,'dist'),{recursive:true});
  await writeFile(path.join(directory,'package.json'),JSON.stringify({name:'deepmerge',version:DEEPMERGE_VERSION}));
  for(const entry of entries){
    const installed=normalize(await readEntry(packageRoot,entry));
    const original=installed
      .replace(/^\t*if \(key === '__proto__' \|\| key === 'constructor' \|\| key === 'prototype'\) return true;\n/m,'')
      .replace(/^\t*if \(propertyIsUnsafe\(target, key\)\) return;\n/m,'');
    // Fixture creation must reproduce the precise published 4.3.1 source.
    assert.equal(digest(original),DEEPMERGE_ENTRIES[entry].original);
    await writeFile(path.join(directory,entry),original);
  }
}

test('SDK57 toolchain uses the scoped Zod fix and retains the real deepmerge version',async()=>{
  const project=JSON.parse(await readFile(path.join(projectRoot,'package.json'),'utf8'));
  assert.equal(project.version,'0.3.0');assert.equal(project.overrides['@expo/cli'].zod,'4.6.7');assert.match(project.dependencies.expo,/57\./);
  assert.equal(project.dependencies['expo-updates'],'~57.0.26');assert.match(JSON.parse(await readFile(require.resolve('expo-updates/package.json'),'utf8')).version,/^57\./);
  const expoRequire=createRequire(require.resolve('expo/package.json')),cliPackage=expoRequire.resolve('@expo/cli/package.json'),cliRequire=createRequire(cliPackage);
  assert.equal(JSON.parse(await readFile(cliRequire.resolve('zod/package.json'),'utf8')).version,'4.6.7');
  assert.equal(JSON.parse(await readFile(path.join(packageRoot,'package.json'),'utf8')).version,'4.3.1');
});

test('postinstall verifies all locked deepmerge source/CJS/UMD entries and is idempotent',async()=>{
  for(const entry of entries)assert.equal(digest(await readEntry(packageRoot,entry)),DEEPMERGE_ENTRIES[entry].patched);
  const result=await patchToolchain({projectRoot,checkOnly:true});assert.equal(result.version,'4.3.1');assert.ok(result.packages>=1);assert.equal(result.entries,result.packages*3);assert.equal(result.patched,0);
});

for(const entry of entries){
  test(`${entry}: rejects forbidden keys in target and source before reading them`,async()=>{
    const merge=await implementation(entry);
    for(const [target,source] of [[poison(),{}],[{},poison()],[poison(),poison()]]){
      const result=merge(target,source);noDangerousOwnKeys(result);assert.equal(result.safe,1);
    }
    for(const side of ['target','source'])for(const key of ['__proto__','constructor','prototype']){
      let reads=0;const object={safe:2};Object.defineProperty(object,key,{enumerable:true,get(){reads++;throw new Error('Forbidden getter executed');}});
      const result=side==='target'?merge(object,{}):merge({},object);assert.equal(reads,0);assert.equal(result.safe,2);noDangerousOwnKeys(result);
    }
    assert.equal(Object.prototype.toolchainPoisoned,undefined);
  });
  test(`${entry}: covers nested objects, arrays, null prototypes and deepmerge.all`,async()=>{
    const merge=await implementation(entry),target=Object.create(null),source=Object.create(null);
    for(const key of ['__proto__','constructor','prototype']){Object.defineProperty(target,key,{value:{toolchainPoisoned:true},enumerable:true});Object.defineProperty(source,key,{value:{toolchainPoisoned:true},enumerable:true});}
    target.safe=1;source.second=2;const nulls=merge(target,source);assert.equal(nulls.safe,1);assert.equal(nulls.second,2);noDangerousOwnKeys(nulls);
    const nested=merge({deep:{target:poison()},array:[poison()]},{deep:{source:poison()},array:[{nested:poison()}]});
    noDangerousOwnKeys(nested);assert.equal(nested.deep.target.safe,1);assert.equal(nested.array.length,2);
    noDangerousOwnKeys(merge.all([poison(),{nested:poison()},{array:[poison()]}]));
  });
  test(`${entry}: preserves regular objects, array concatenation, symbols and special values`,async()=>{
    const merge=await implementation(entry),symbol=Symbol('constructor'),date=new Date('2026-10-28T00:00:00Z'),regex=/demo/;
    const target={nested:{first:1},array:[{value:1}],date,regex,[symbol]:{first:3}},source={nested:{second:2},array:[2],[symbol]:{second:4}};
    const result=merge(target,source);
    assert.equal(result.nested.first,1);assert.equal(result.nested.second,2);assert.equal(result.array.length,2);assert.equal(result.array[0].value,1);assert.equal(result.array[1],2);
    assert.notEqual(result.array[0],target.array[0]);assert.notEqual(result.nested,target.nested);assert.equal(result.date,date);assert.equal(result.regex,regex);
    assert.equal(result[symbol].first,3);assert.equal(result[symbol].second,4);assert.deepEqual(target.nested,{first:1});assert.deepEqual(source.nested,{second:2});
  });
}

test('clean published sources reproduce the POC, then install mitigation fixes all three entries',async()=>tempFixture(async directory=>{
  await pristineCopy(directory);
  for(const entry of entries){const vulnerable=await implementation(entry,directory);assert.equal(Object.getPrototypeOf(vulnerable(poison(),{})).toolchainPoisoned,true);}
  assert.deepEqual(await patchDeepmergePackage(directory),{version:'4.3.1',entries:3,patched:3});
  for(const entry of entries){assert.equal(digest(await readEntry(directory,entry)),DEEPMERGE_ENTRIES[entry].patched);noDangerousOwnKeys((await implementation(entry,directory))(poison(),poison()));}
  assert.equal((await patchDeepmergePackage(directory)).patched,0);assert.equal((await patchDeepmergePackage(directory,{checkOnly:true})).patched,0);
}));

test('unknown versions or modified sources fail closed without partially rewriting the package',async()=>tempFixture(async directory=>{
  await pristineCopy(directory);await writeFile(path.join(directory,'package.json'),JSON.stringify({name:'deepmerge',version:'4.3.2'}));
  await assert.rejects(patchDeepmergePackage(directory),/Expected deepmerge 4.3.1/);
  for(const entry of entries)assert.equal(digest(await readEntry(directory,entry)),DEEPMERGE_ENTRIES[entry].original);
  await writeFile(path.join(directory,'package.json'),JSON.stringify({name:'deepmerge',version:'4.3.1'}));await writeFile(path.join(directory,'dist/cjs.js'),await readEntry(directory,'dist/cjs.js')+'\n// unexpected content\n');
  await assert.rejects(patchDeepmergePackage(directory),/Unrecognized deepmerge/);
  assert.equal(digest(await readEntry(directory,'index.js')),DEEPMERGE_ENTRIES['index.js'].original);assert.equal(digest(await readEntry(directory,'dist/umd.js')),DEEPMERGE_ENTRIES['dist/umd.js'].original);
}));

test('all nested locked copies are patched and out-of-project paths are rejected',async()=>tempFixture(async directory=>{
  const first='node_modules/deepmerge',second='node_modules/nested-tool/node_modules/deepmerge';
  await pristineCopy(path.join(directory,first));await pristineCopy(path.join(directory,second));
  await writeFile(path.join(directory,'package-lock.json'),JSON.stringify({packages:{[first]:{version:'4.3.1'},[second]:{version:'4.3.1'}}}));
  assert.deepEqual(await patchToolchain({projectRoot:directory}),{packages:2,entries:6,patched:6,version:'4.3.1'});
  assert.equal((await patchToolchain({projectRoot:directory,checkOnly:true})).patched,0);
  await writeFile(path.join(directory,'package-lock.json'),JSON.stringify({packages:{'../node_modules/deepmerge':{version:'4.3.1'}}}));
  await assert.rejects(patchToolchain({projectRoot:directory}),/outside this project/);
}));

test('check-only detects skipped lifecycle scripts and source guards tolerate Windows line endings',async()=>tempFixture(async directory=>{
  await pristineCopy(directory);await assert.rejects(patchDeepmergePackage(directory,{checkOnly:true}),/lifecycle scripts enabled/);
  for(const entry of entries){
    const original=await readEntry(directory,entry),result=patchDeepmergeSource(entry,original.replace(/\n/g,'\r\n'));
    assert.equal(result.changed,true);assert.equal(digest(result.source),DEEPMERGE_ENTRIES[entry].patched);assert.equal(patchDeepmergeSource(entry,result.source).changed,false);
  }
  assert.throws(()=>patchDeepmergeSource('../unexpected.js',''),/Unsupported deepmerge entry/);
}));
