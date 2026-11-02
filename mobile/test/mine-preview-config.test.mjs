import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const mobile=fileURLToPath(new URL('..',import.meta.url));
function resolve(overrides={}){
  const env={...process.env};
  for(const name of ['EAS_BUILD','EAS_BUILD_PROFILE','EAS_BUILD_PLATFORM','OPENMINERALS_MINE_PREVIEW','EXPO_PUBLIC_API_URL'])delete env[name];
  const result=spawnSync(process.execPath,['-e',"process.stdout.write(JSON.stringify(require('./app.config.js')()));"],{cwd:mobile,env:{...env,...overrides},encoding:'utf8'});
  return {status:result.status,config:result.status===0?JSON.parse(result.stdout):undefined,error:result.stderr};
}

test('mine preview: local and EAS configs isolate the application, runtime and update channel from both delivered APKs',async()=>{
  const stable=JSON.parse(await readFile(new URL('../app.json',import.meta.url),'utf8')).expo;
  assert.equal(stable.version,'0.3.0');assert.equal(stable.android.versionCode,6);assert.equal(stable.android.package,'com.openminerals.demo.mobile');
  const local=resolve(),build=resolve({EAS_BUILD:'true',EAS_BUILD_PROFILE:'mine-realism',EAS_BUILD_PLATFORM:'android',OPENMINERALS_MINE_PREVIEW:'1',EXPO_PUBLIC_API_URL:'https://openminerals-api-demo.up.railway.app'});
  assert.equal(local.status,0,local.error);assert.equal(build.status,0,build.error);assert.deepEqual(build.config,local.config);
  const app=local.config;
  assert.equal(app.android.package,'com.openminerals.demo.minepreview');assert.notEqual(app.android.package,stable.android.package);
  assert.equal(app.name,'Openminerals Mina Preview');assert.equal(app.scheme,'openminerals-mine-preview');assert.notEqual(app.scheme,stable.scheme);
  assert.equal(app.version,'0.4.0');assert.equal(app.runtimeVersion,'0.4.0');assert.notEqual(app.runtimeVersion,stable.version);assert.notEqual(app.runtimeVersion,'0.2.0');
  assert.equal(app.android.versionCode,2);assert.deepEqual(app.platforms,['android']);assert.equal(app.extra.demoOnly,true);
  assert.equal(app.updates.requestHeaders['expo-channel-name'],'mine-realism');assert.equal(app.updates.useEmbeddedUpdate,true);assert.equal(app.updates.disableAntiBrickingMeasures,false);assert.equal(app.updates.fallbackToCacheTimeout,0);
  assert.equal(app.extra.eas.projectId,stable.extra.eas.projectId);
});

test('mine preview: the delivered HTTPS build guard still rejects missing, local or credential-bearing API URLs',()=>{
  const env={EAS_BUILD_PROFILE:'mine-realism',OPENMINERALS_MINE_PREVIEW:'1'};
  for(const api of [undefined,'','invalid','http://example.com','https://localhost','https://127.0.0.1','https://[::1]','https://user:pass@example.com','https://example.com?token=demo','https://example.com#fragment']){
    const result=resolve({...env,...(api===undefined?{}:{EXPO_PUBLIC_API_URL:api})});assert.notEqual(result.status,0);assert.match(result.error,/EXPO_PUBLIC_API_URL/);
  }
  const valid=resolve({...env,EXPO_PUBLIC_API_URL:'https://openminerals-api-demo.up.railway.app'});assert.equal(valid.status,0,valid.error);
});

test('mine preview: legacy build profiles, missing opt-in and iOS fail before producing native configuration',()=>{
  for(const EAS_BUILD_PROFILE of ['preview','release-demo','production','development','ios-simulator','foreign']){
    const result=resolve({EAS_BUILD_PROFILE,OPENMINERALS_MINE_PREVIEW:'1'});assert.notEqual(result.status,0);assert.match(result.error,/cannot build the stable demo/);
  }
  for(const env of [{EAS_BUILD:'true'},{EAS_BUILD_PROFILE:'mine-realism'},{EAS_BUILD:'true',EAS_BUILD_PROFILE:'mine-realism',OPENMINERALS_MINE_PREVIEW:'0'}])assert.notEqual(resolve(env).status,0);
  const ios=resolve({EAS_BUILD_PROFILE:'mine-realism',OPENMINERALS_MINE_PREVIEW:'1',EAS_BUILD_PLATFORM:'ios'});assert.notEqual(ios.status,0);assert.match(ios.error,/Android only/);
});

test('mine preview: EAS profile cannot inherit the delivered channel and its public API remains HTTPS',async()=>{
  const eas=JSON.parse(await readFile(new URL('../eas.json',import.meta.url),'utf8'));
  const preview=eas.build['mine-realism'];
  assert.equal(preview.extends,undefined);assert.equal(preview.channel,'mine-realism');assert.equal(preview.environment,'preview');assert.equal(preview.distribution,'internal');assert.equal(preview.android.buildType,'apk');
  assert.equal(preview.env.OPENMINERALS_MINE_PREVIEW,'1');assert.equal(preview.env.EXPO_PUBLIC_API_URL,'https://openminerals-api-demo.up.railway.app');
  assert.deepEqual(Object.keys(preview.env).sort(),['EXPO_PUBLIC_API_URL','OPENMINERALS_MINE_PREVIEW']);
  assert.equal(eas.build.preview.channel,'demo');assert.equal(eas.build['release-demo'].extends,'preview');
});
