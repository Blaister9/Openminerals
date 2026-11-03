import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),configure=require('../app.config.js');
const base=JSON.parse(readFileSync(new URL('../app.json',import.meta.url),'utf8')).expo;
const eas=JSON.parse(readFileSync(new URL('../eas.json',import.meta.url),'utf8'));
const keys=['OPENMINERALS_MARKET_PREVIEW','EXPO_PUBLIC_MARKET_REFERENCE','EXPO_PUBLIC_API_URL','EAS_BUILD','EAS_BUILD_PROFILE'];
function withEnv(values,run){const saved=keys.map(key=>process.env[key]);try{for(const key of keys){if(values[key]===undefined)delete process.env[key];else process.env[key]=values[key];}return run();}finally{keys.forEach((key,i)=>{if(saved[i]===undefined)delete process.env[key];else process.env[key]=saved[i];});}}
test('market opt-in preserves commercial app identity, runtime, API and EAS channel defaults',()=>{
  withEnv({},()=>assert.deepEqual(configure({config:base}),base));
  assert.equal(eas.build.preview.channel,'demo');assert.equal(eas.build.preview.env.EXPO_PUBLIC_API_URL,'https://openminerals-api-demo.up.railway.app');
  assert.equal(base.android.package,'com.openminerals.demo.mobile');assert.equal(base.android.versionCode,6);
});
test('market profile resolves a separate Android application and rejects accidental stable activation',()=>{
  const profile=eas.build['market-reference'];assert.equal(profile.channel,'market-reference');
  withEnv(profile.env,()=>{const config=configure({config:base});assert.notEqual(config.android.package,base.android.package);assert.equal(config.android.package,'com.openminerals.demo.marketpreview');assert.equal(config.scheme,'openminerals-market-preview');assert.notDeepEqual(config.runtimeVersion,base.runtimeVersion);assert.equal(config.extra.marketApi,profile.env.EXPO_PUBLIC_API_URL);});
  withEnv({EXPO_PUBLIC_MARKET_REFERENCE:'1'},()=>assert.throws(()=>configure({config:base}),/separate/));
  withEnv({...profile.env,EXPO_PUBLIC_API_URL:eas.build.preview.env.EXPO_PUBLIC_API_URL},()=>assert.throws(()=>configure({config:base}),/isolated/));
});
test('commercial EAS builds retain the original HTTPS and credential/query protections',()=>{
  for(const api of ['http://localhost:3000','https://user:secret@api.example','https://api.example?key=test','https://127.0.0.1'])withEnv({EAS_BUILD:'true',EXPO_PUBLIC_API_URL:api},()=>assert.throws(()=>configure({config:base}),/HTTPS|credenciales/));
  withEnv({EAS_BUILD:'true',EXPO_PUBLIC_API_URL:eas.build.preview.env.EXPO_PUBLIC_API_URL},()=>assert.deepEqual(configure({config:base}),base));
});
