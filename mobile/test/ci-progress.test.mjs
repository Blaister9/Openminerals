import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,readdir,rm} from 'node:fs/promises';
import {join,dirname,basename,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {createProgress,commandOutcome,publicCommand} from '../e2e/ci-progress.mjs';
import {adbBudget,runBounded} from '../e2e/ci-process.mjs';
const yaml=createRequire(import.meta.url)('yaml');
async function folder(t){
  const directory=await mkdtemp(join(tmpdir(),'openminerals-ci-progress-'));
  t.after(async()=>{
    assert.equal(dirname(resolve(directory)),resolve(tmpdir()));assert.ok(basename(directory).startsWith('openminerals-ci-progress-'));
    await rm(directory,{recursive:true,force:true});
  });
  return directory;
}
test('CI deadline: a process that ignores SIGTERM is killed by the OS deadline',()=>{
  const started=Date.now();
  const result=runBounded(process.execPath,['-e','process.on("SIGTERM",()=>{});process.stdout.write("ready");setInterval(()=>{},100);setTimeout(()=>process.exit(13),5000);'],{timeout:1500,encoding:'utf8',stdio:['ignore','pipe','pipe'],killSignal:'SIGTERM'});
  assert.equal(result.error?.code,'ETIMEDOUT');assert.equal(result.signal,'SIGKILL');
  assert.match(result.stdout,/ready/);assert.ok(Date.now()-started<4500);
  assert.deepEqual(commandOutcome(result),{status:'FAILED',exitCode:null,signal:'SIGKILL',reason:'process-timeout'});
});
test('CI deadline: install gets a larger bounded budget than readonly ADB, with serial flags handled',()=>{
  assert.equal(adbBudget(['-s','emulator-5554','install','-r','public.apk']),180000);
  assert.equal(adbBudget(['shell','dumpsys','package','com.openminerals.demo.mobile']),30000);
  assert.equal(adbBudget(['pull','remote','local']),30000);
  for(const args of [['devices'],['shell','getprop','ro.kernel.qemu'],['shell','settings','get','global','policy_control']])assert.equal(adbBudget(args),20000);
});
test('CI progress: START is durable before native commands and interruption never becomes PASS',async t=>{
  const directory=await folder(t),secret='PRIVATE_QA_TOKEN_MUST_STAY_OUT';
  const progress=createProgress(directory,'run',()=>[secret]);
  assert.deepEqual(await readdir(directory),[]);
  progress.stageStart('buyer-a-buy-and-certificate');
  progress.commandStart('/tmp/maestro',['--device','emulator-5554',secret],420000);
  const text=await readFile(join(directory,'progress.json'),'utf8'),snapshot=JSON.parse(text);
  assert.equal(snapshot.stage.status,'RUNNING');assert.equal(snapshot.command.status,'RUNNING');
  assert.equal(snapshot.command.timeoutSignal,'SIGKILL');assert.deepEqual(snapshot.completed,[]);
  assert.equal(text.includes(secret),false);
  const events=(await readFile(join(directory,'progress.ndjson'),'utf8')).trim().split('\n').map(JSON.parse);
  assert.deepEqual(events.map(event=>event.event),['stage-start','command-start']);
});
test('CI progress: timeout reason survives successful cleanup without publishing raw error data',async t=>{
  const directory=await folder(t),secret='PRIVATE_ERROR_PAYLOAD_012345';
  const progress=createProgress(directory,'run',()=>[secret]);
  progress.stageStart('legacy-seed-old-apk');progress.commandStart('maestro',[secret],420000);
  progress.commandEnd({status:null,signal:'SIGKILL',error:{code:'ETIMEDOUT',message:secret}});
  progress.commandStart('adb',['-s','emulator-5554','shell','settings','get','global','policy_control'],20000);
  progress.commandEnd({status:0});progress.stageEnd('legacy-seed-old-apk',false);
  const text=await readFile(join(directory,'progress.json'),'utf8'),snapshot=JSON.parse(text);
  assert.equal(snapshot.stage.status,'FAILED');assert.equal(snapshot.command.status,'PASSED');
  assert.equal(snapshot.lastFailure.program,'maestro');assert.equal(snapshot.lastFailure.reason,'process-timeout');
  assert.equal(text.includes(secret),false);assert.equal((await readFile(join(directory,'progress.ndjson'),'utf8')).includes(secret),false);
});
test('CI progress: rejects private or malformed names and never includes command arguments or env',async t=>{
  const directory=await folder(t),secret='forbidden-private-stage';
  const progress=createProgress(directory,'run',()=>[secret]);
  assert.throws(()=>progress.stageStart(secret),/private progress/);
  assert.deepEqual(await readdir(directory),[]);
  assert.throws(()=>progress.stageStart('<script>'),/Invalid progress/);
  assert.deepEqual(publicCommand('/some/secret-binary',['--password',secret]),{program:'external-command',operation:'other'});
  assert.deepEqual(publicCommand('adb',['-s','private-serial','shell','input','text',secret]),{program:'adb',operation:'shell'});
});
test('CI logical flows: splits preserve one login and the financial sequence without cold relaunches',async()=>{
  const load=async name=>yaml.parseAllDocuments(await readFile(new URL('../e2e/native/'+name+'.yaml',import.meta.url),'utf8'))[1].toJSON();
  const buyers=await Promise.all(['buyer-a','buyer-a-buy','buyer-a-offer'].map(load)),operators=await Promise.all(['operator','operator-stock'].map(load));
  assert.equal(buyers.flat().filter(command=>command.runFlow?.file==='login.yaml').length,1);
  assert.equal(operators.flat().filter(command=>command.runFlow?.file==='login.yaml').length,1);
  assert.deepEqual(buyers[0].filter(command=>command.inputText).map(command=>command.inputText),['200']);
  assert.deepEqual(buyers[1].filter(command=>command.inputText).map(command=>command.inputText),['2']);
  assert.deepEqual(buyers[2].filter(command=>command.inputText).map(command=>command.inputText),['0.5','140']);
  assert.equal(buyers.flat().filter(command=>command.tapOn==='^Confirmar demo$').length,3);
  assert.equal(operators[0].filter(command=>command.tapOn==='^Confirmar demo$').length,3);
  assert.equal(operators[1].filter(command=>command.tapOn==='^Confirmar demo$').length,1);
  for(const commands of [buyers[1],buyers[2],operators[1]])assert.ok(commands.every(command=>!['launchApp','stopApp'].includes(command)&&!command.runFlow));
  const runner=await readFile(new URL('../e2e/ci-android.mjs',import.meta.url),'utf8');
  const stages=['buyer-a-login-conversion','buyer-a-buy-and-certificate','buyer-a-publish-priced-offer','buyer-b-marketplace-certificate','operator-delivery-lifecycle','operator-restock-management','api-verifies-native-wallets-lots-fees'];
  for(let i=1;i<stages.length;i++)assert.ok(runner.indexOf(stages[i-1])<runner.indexOf(stages[i]));
  assert.match(runner,/runStage\('api-verifies-native-wallets-lots-fees',verifyNative\)/);
});
