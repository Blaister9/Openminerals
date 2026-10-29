import {createHash} from 'node:crypto';
import {readFile,writeFile,realpath} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

// Targeted local mitigation for GHSA-gcqx-w48m-w2h4. Upstream deepmerge remains
// 4.3.1 and npm audit must keep reporting it until a reviewed upstream fix exists.
// Both target and source keys are rejected before reading their values. This
// protects the default recursive merge path, not arbitrary customMerge,
// arrayMerge or clone:false behavior supplied by trusted application code.
export const DEEPMERGE_VERSION='4.3.1';
export const DEEPMERGE_ENTRIES={
  'index.js':{
    original:'12440c84957c1990ea2d5e33dc0091722dc1dc1585c6d20e0c780e568ffa9d30',
    patched:'7cf8a222b27b25e3b421f50a29a46e93212cd2b05f7bb792e0ec3f98dd7b185f',
  },
  'dist/cjs.js':{
    original:'2e5160f84a1141bd927264afe4d15766f1e6cf07daef182b37ff53fea121de7d',
    patched:'6bf2c015f50eee14d0ac2d074ddc8774f2db27f6873b1f197dead9b3851a1bd3',
  },
  'dist/umd.js':{
    original:'f33e6596482d1fb5c7c427f8ef92f2aa849eea9223acd974176b2fb27ddbf73a',
    patched:'4924dce4c76a6c7900d1ce76186fcdeadb13739ae6afa2877115f41ddfd3d543',
  },
};
const digest=source=>createHash('sha256').update(source).digest('hex');
const normalized=source=>source.replace(/\r\n/g,'\n');
const within=(root,target)=>{const relative=path.relative(root,target);return relative!==''&&!relative.startsWith(`..${path.sep}`)&&relative!=='..'&&!path.isAbsolute(relative);};
export function patchDeepmergeSource(entry,source){
  const expected=DEEPMERGE_ENTRIES[entry];if(!expected)throw new Error(`Unsupported deepmerge entry: ${entry}`);
  const original=normalized(source),hash=digest(original);
  if(hash===expected.patched)return {source:original,changed:false};
  if(hash!==expected.original)throw new Error(`Unrecognized deepmerge ${entry} source (${hash}); review the toolchain patch before building.`);
  const guard=/^(\t*)function propertyIsUnsafe\(target, key\) \{\n/m;
  const targetCopy=/^(\t*)getKeys\(target\)\.forEach\(function\(key\) \{\n/m;
  const patched=original
    .replace(guard,(_,indent)=>`${indent}function propertyIsUnsafe(target, key) {\n${indent}\tif (key === '__proto__' || key === 'constructor' || key === 'prototype') return true;\n`)
    .replace(targetCopy,(_,indent)=>`${indent}getKeys(target).forEach(function(key) {\n${indent}\tif (propertyIsUnsafe(target, key)) return;\n`);
  if(digest(patched)!==expected.patched)throw new Error(`The deepmerge ${entry} patch did not produce its reviewed hash.`);
  return {source:patched,changed:true};
}
export async function patchDeepmergePackage(packageDirectory,{checkOnly=false}={}){
  const metadata=JSON.parse(await readFile(path.join(packageDirectory,'package.json'),'utf8'));
  if(metadata.name!=='deepmerge'||metadata.version!==DEEPMERGE_VERSION)throw new Error(`Expected deepmerge ${DEEPMERGE_VERSION}; received ${metadata.name}@${metadata.version}. Review the mitigation before updating it.`);
  // Validate every entry before changing any. A failed install is never treated
  // as a usable build; retrying is safe even after an interrupted write.
  const entries=await Promise.all(Object.keys(DEEPMERGE_ENTRIES).map(async entry=>({entry,...patchDeepmergeSource(entry,await readFile(path.join(packageDirectory,entry),'utf8'))})));
  if(checkOnly&&entries.some(entry=>entry.changed))throw new Error('The deepmerge mitigation is missing. Run npm ci with lifecycle scripts enabled.');
  for(const entry of entries)if(entry.changed)await writeFile(path.join(packageDirectory,entry.entry),entry.source,'utf8');
  return {version:metadata.version,entries:entries.length,patched:entries.filter(entry=>entry.changed).length};
}
export async function patchToolchain({projectRoot=fileURLToPath(new URL('..',import.meta.url)),checkOnly=false}={}){
  const root=await realpath(projectRoot),lock=JSON.parse(await readFile(path.join(root,'package-lock.json'),'utf8'));
  const packages=Object.keys(lock.packages??{}).filter(key=>/(?:^|\/)node_modules\/deepmerge$/.test(key));
  if(!packages.length)throw new Error('No locked deepmerge package found; review this toolchain before building.');
  const results=[];
  for(const lockedPath of packages){
    const logical=path.resolve(root,...lockedPath.split('/'));
    if(!within(root,logical)||!lockedPath.startsWith('node_modules/'))throw new Error('A locked deepmerge path is outside this project.');
    const directory=await realpath(logical);
    if(!within(root,directory))throw new Error('A deepmerge symlink points outside this project.');
    results.push(await patchDeepmergePackage(directory,{checkOnly}));
  }
  return {packages:results.length,entries:results.reduce((sum,result)=>sum+result.entries,0),patched:results.reduce((sum,result)=>sum+result.patched,0),version:DEEPMERGE_VERSION};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  try{
    const result=await patchToolchain({checkOnly:process.argv.includes('--check')});
    process.stdout.write(`deepmerge ${result.version}: ${result.packages} locked package(s), ${result.entries} verified entries, ${result.patched} patched. Upstream advisory remains visible in npm audit.\n`);
  }catch(error){process.stderr.write(`Toolchain mitigation failed: ${error.message}\n`);process.exitCode=1;}
}
