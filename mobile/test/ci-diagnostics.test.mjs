import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {collectFailureDiagnostic,failureDiagnostic,flowSelectors} from '../e2e/ci-diagnostics.mjs';

const canaries=['qa_private_alias_canary','Private_password_canary_234','private_bearer_token_canary_abcdefghijklmnopqrstuvwxyz'];
const selectors=flowSelectors('- tapOn: ^Posiciones$\n- assertVisible: ^Comprobante$\n- inputText: ${MAESTRO_LOGIN_PASSWORD}\n');
async function temporary(fn){
  const directory=await mkdtemp(join(tmpdir(),'openminerals-diagnostic-unit-'));
  try{return await fn(directory);}finally{
    assert.ok(resolve(directory).startsWith(resolve(tmpdir())+sep+'openminerals-diagnostic-unit-'));
    await rm(directory,{recursive:true,force:true});
  }
}
function noSecrets(value){const text=JSON.stringify(value);for(const secret of canaries)assert.equal(text.includes(secret),false);return text;}

test('Native diagnostics: exception before a long stack retains its static selector',()=>{
  const diagnostic=failureDiagnostic('Error: Element not found: ^Posiciones$ '+canaries.join(' ')+'\n'+Array(240).fill('  at java.internal.nonprivate.Frame.method(Frame.java:1)').join('\n'),selectors);
  assert.equal(diagnostic.category,'selector-not-found');
  assert.deepEqual(diagnostic.expectedSelectorsFromFlow,['^Posiciones$']);
  noSecrets(diagnostic);
});

test('Native diagnostics: flow and CLI validation have closed categories without raw messages',()=>{
  assert.equal(failureDiagnostic('Invalid Flow: Unknown command '+canaries.join(' '),selectors).category,'flow-definition-error');
  assert.equal(failureDiagnostic('com.fasterxml.jackson.databind.exc.UnrecognizedPropertyException: Unrecognized field '+canaries[1],selectors).category,'flow-definition-error');
  const diagnostic=failureDiagnostic('Unmatched arguments: '+canaries.join(' '),selectors);
  assert.equal(diagnostic.category,'cli-configuration-error');
  assert.deepEqual(diagnostic.expectedSelectorsFromFlow,[]);noSecrets(diagnostic);
});

test('Native diagnostics: private JUnit and Maestro command model identify the failed execution safely',async()=>temporary(async directory=>{
  const nested=join(directory,'screenshots','2026-10-29_044556','Buyer A publishes priced05g peer offer');
  await mkdir(nested,{recursive:true});
  await writeFile(join(directory,'console.txt'),'[Failed] Buyer A publishes priced05g peer offer (10s)\n'+canaries.join(' '));
  // Maestro 2.12 writes the failure message as element text, not necessarily an
  // attribute. Neither testcase attributes nor message text may be published.
  await writeFile(join(directory,'raw-report.xml'),'<testsuite><testcase classname="'+canaries[0]+'" file="'+canaries[1]+'"><failure>Element not found: ^Posiciones$ '+canaries.join(' ')+'</failure></testcase></testsuite>');
  await writeFile(join(nested,'maestro.log'),'Private environment '+canaries.join(' '));
  await writeFile(join(nested,'commands.json'),JSON.stringify([
    {command:{applyConfigurationCommand:{env:{alias:canaries[0],password:canaries[1],token:canaries[2]}}},metadata:{status:'COMPLETED'}},
    {command:{tapOnElement:{selector:{textRegex:'${MAESTRO_LOGIN_ALIAS}'}}},metadata:{status:'COMPLETED',evaluatedCommand:{tapOnElement:{selector:{textRegex:canaries[0]}}}}},
    {command:{inputTextCommand:{text:canaries[1]}},metadata:{status:'COMPLETED'}},
    {command:{scrollUntilVisible:{selector:{textRegex:'^Posiciones$'}}},metadata:{status:'FAILED',error:{message:'Element not found: ^Posiciones$ '+canaries[0],debugMessage:canaries[2]},artifacts:[{type:'SCREENSHOT',path:canaries[1]}]}},
    {command:{[canaries[0]]:{text:canaries[1]}},metadata:{status:canaries[2]}},
  ]));
  const diagnostic=await collectFailureDiagnostic(directory,selectors);
  assert.equal(diagnostic.category,'selector-not-found');
  assert.deepEqual(diagnostic.diagnosticSources,{console:true,junit:true,commands:true,maestroLog:true});
  assert.deepEqual(diagnostic.firstFailedCommand,{index:4,type:'scroll-until-visible',status:'FAILED',selector:'^Posiciones$'});
  assert.equal(diagnostic.recentCommands[1].selector,undefined);
  assert.deepEqual(diagnostic.recentCommands[2],{index:3,type:'input-text',status:'COMPLETED'});
  assert.deepEqual(diagnostic.recentCommands[4],{index:5,type:'other',status:'UNKNOWN'});
  assert.equal(diagnostic.rawDiagnosticsPublished,false);
  assert.doesNotMatch(noSecrets(diagnostic),/evaluatedCommand|debugMessage|SCREENSHOT|artifacts|textRegex|private_bearer/);
}));

test('Native diagnostics: command failure remains identifiable without a readable console message',async()=>temporary(async directory=>{
  await writeFile(join(directory,'commands.json'),JSON.stringify([{command:{tapOnElement:{selector:{textRegex:'^Posiciones$'}}},metadata:{status:'FAILED',error:{message:canaries[0]}}}]));
  const diagnostic=await collectFailureDiagnostic(directory,selectors);
  assert.equal(diagnostic.category,'command-execution-failed');
  assert.deepEqual(diagnostic.expectedSelectorsFromFlow,['^Posiciones$']);
  assert.equal(diagnostic.firstFailedCommand.type,'tap');noSecrets(diagnostic);
}));

test('Native diagnostics: malformed oversized and hierarchy files cannot publish raw values',async()=>temporary(async directory=>{
  await writeFile(join(directory,'commands.json'),'{bad-json '+canaries[0]);
  await writeFile(join(directory,'console.txt'),'x'.repeat(2*1024*1024+1)+canaries[1]);
  await mkdir(join(directory,'screen-hierarchy'));
  await writeFile(join(directory,'screen-hierarchy','commands.json'),JSON.stringify([{command:{tapOnElement:{selector:{textRegex:'^Posiciones$'}}},metadata:{status:'FAILED'}}]));
  await writeFile(join(directory,'raw-hierarchy.xml'),'<failure message="Element not found: ^Posiciones$">'+canaries[2]+'</failure>');
  const diagnostic=await collectFailureDiagnostic(directory,selectors);
  assert.equal(diagnostic.category,'native-command-failed');
  assert.equal(diagnostic.diagnosticSources.console,false);
  assert.equal(diagnostic.skippedDiagnosticFiles,2);
  assert.equal(diagnostic.firstFailedCommand,null);
  assert.deepEqual(diagnostic.recentCommands,[]);noSecrets(diagnostic);
}));

test('Native diagnostics: symlinked diagnostic roots and children are ignored',async()=>temporary(async directory=>{
  const outside=join(directory,'outside'),bundle=join(directory,'bundle');
  await mkdir(outside);await mkdir(bundle);
  await writeFile(join(outside,'console.txt'),'Element not found: ^Posiciones$ '+canaries.join(' '));
  const linked=join(bundle,'linked');await symlink(outside,linked,process.platform==='win32'?'junction':'dir');
  for(const root of [bundle,linked]){
    const diagnostic=await collectFailureDiagnostic(root,selectors);
    assert.deepEqual(diagnostic.diagnosticSources,{console:false,junit:false,commands:false,maestroLog:false});
    assert.deepEqual(diagnostic.recentStaticCommandLabels,[]);noSecrets(diagnostic);
  }
}));

test('Native diagnostics: wide directory trees stop at the global directory budget',async()=>temporary(async directory=>{
  for(let index=0;index<140;index++)await mkdir(join(directory,'private-'+index+'-'+canaries[0]));
  const diagnostic=await collectFailureDiagnostic(directory,selectors);
  assert.equal(diagnostic.diagnosticTraversalTruncated,true);
  assert.deepEqual(diagnostic.diagnosticSources,{console:false,junit:false,commands:false,maestroLog:false});
  assert.equal(diagnostic.firstFailedCommand,null);noSecrets(diagnostic);
}));

test('Native diagnostics: unrecognized files still consume the global entry budget',async()=>temporary(async directory=>{
  for(let index=0;index<2100;index++)await writeFile(join(directory,'private-'+index+'.png'),canaries[2]);
  const diagnostic=await collectFailureDiagnostic(directory,selectors);
  assert.equal(diagnostic.diagnosticTraversalTruncated,true);
  assert.equal(diagnostic.skippedDiagnosticFiles,0);
  assert.deepEqual(diagnostic.diagnosticSources,{console:false,junit:false,commands:false,maestroLog:false});
  assert.deepEqual(diagnostic.recentCommands,[]);noSecrets(diagnostic);
}));
