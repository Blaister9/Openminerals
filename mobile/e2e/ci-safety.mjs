import {createHash} from 'node:crypto';
export const PACKAGE='com.openminerals.demo.mobile';
export const API='https://openminerals-api-demo.up.railway.app';
export const BASELINE={
  url:'https://github.com/Blaister9/Openminerals/releases/download/v0.1.3-demo/Openminerals-Demo-0.1.3-android.apk',
  sha256:'fda0953d11a6035100bef9f9c04d070053edc2ae47c31852803a020d89e6b7c7',
  certificate:'3ae9a19077ab3f434b5885981d35e3d29966e406e7438b8f0558c155d47e3e1c',
  code:4,name:'0.1.3',
};
export const SECRET_NAMES=['BUYER_A_ALIAS','BUYER_A_PASSWORD','BUYER_B_ALIAS','BUYER_B_PASSWORD','OPERATOR_ALIAS','OPERATOR_PASSWORD'].map(name=>'OPENMINERALS_QA_'+name);
export function requireSafe(condition,message){if(!condition)throw new Error(message);}
export function apkUrl(value){
  const url=new URL(value);
  requireSafe(url.protocol==='https:'&&!url.username&&!url.password&&!url.port&&!value.includes('?')&&!value.includes('#'),'APK URL must be public HTTPS without credentials or parameters.');
  requireSafe((url.hostname==='expo.dev'&&/^\/artifacts\/eas\/[A-Za-z0-9_-]+\.apk$/.test(url.pathname))||
    (url.hostname==='github.com'&&/^\/Blaister9\/Openminerals\/releases\/download\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\.apk$/.test(url.pathname)),'APK URL origin or path is not allowed.');
  requireSafe(url.href===value,'APK URL must be canonical.');
  return url.href;
}
export function sha(value){requireSafe(typeof value==='string'&&/^[a-f0-9]{64}$/.test(value),'Expected a lowercase SHA256.');return value;}
export function otaUpdateId(value){
  if(value===undefined||value==='')return null;
  requireSafe(typeof value==='string'&&value.length===36&&/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value),'Expected an optional canonical lowercase OTA update UUID.');
  return value;
}
export function nativeScenario(value){
  if(value===undefined||value==='')return 'full';
  requireSafe(['full','operator-navigation','profile-relaunch','asset-full','account-lifecycle','quality-network'].includes(value),'Expected a supported native scenario.');
  return value;
}
export const hash=data=>createHash('sha256').update(data).digest('hex');
export function fixtures(env){
  const values=SECRET_NAMES.map(name=>env[name]);
  requireSafe(values.every(value=>typeof value==='string'&&value.length>0),'Six private QA fixture secrets are required.');
  for(let i=0;i<values.length;i++)requireSafe(i%2?/^[A-Za-z0-9_-]{16,128}$/.test(values[i]):/^[a-z0-9_-]{3,40}$/.test(values[i]),'QA fixture secrets have an invalid format.');
  requireSafe(new Set(values).size===6,'QA fixture secrets must be distinct.');
  return {
    a:{alias:values[0],password:values[1],role:'buyer'},
    b:{alias:values[2],password:values[3],role:'buyer'},
    op:{alias:values[4],password:values[5],role:'operator'},
  };
}
export function emulatorGuard(env,devices,qemu){
  requireSafe(env.GITHUB_ACTIONS==='true'&&env.RUNNER_OS==='Linux','Native CI helper is restricted to a disposable Linux GitHub Actions runner.');
  const active=devices.trim().split(/\r?\n/).slice(1).map(line=>line.trim()).filter(Boolean);
  requireSafe(active.length===1&&/^emulator-\d+\s+device$/.test(active[0]),'Exactly one emulator and no physical Android device are allowed.');
  requireSafe(qemu.trim()==='1','Refusing to operate an Android device without emulator properties.');
  return active[0].split(/\s/)[0];
}
const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&apos;');
export function publicJunit(results,privateValues=[]){
  requireSafe(results.every(result=>/^[a-z0-9-]{3,70}$/.test(result.name)&&typeof result.ok==='boolean'&&Number.isFinite(result.seconds)&&result.seconds>=0),'Invalid public test result.');
  const text='<?xml version="1.0" encoding="UTF-8"?>\n<testsuite name="Openminerals native Android" tests="'+results.length+'" failures="'+results.filter(result=>!result.ok).length+'">\n'+
    results.map(result=>'  <testcase classname="Openminerals.android" name="'+escape(result.name)+'" time="'+result.seconds.toFixed(3)+'">'+(result.ok?'':'<failure message="Native assertion or infrastructure failed. Private diagnostics were not published."/>')+'</testcase>').join('\n')+'\n</testsuite>\n';
  requireSafe(privateValues.every(value=>!value||!text.includes(value)),'Refusing to publish a secret in JUnit.');
  return text;
}
export function manifest(text){
  const pkg=text.match(/^package: name='([^']+)' versionCode='(\d+)' versionName='([^']+)'/m);
  const sdk=text.match(/^sdkVersion:'(\d+)'/m);
  requireSafe(pkg&&sdk,'APK manifest could not be read.');
  return {package:pkg[1],code:Number(pkg[2]),name:pkg[3],minSdk:Number(sdk[1])};
}
export function certificate(text){
  const digests=[...text.matchAll(/certificate SHA-256 digest: ([a-f0-9]{64})/gi)].map(match=>match[1].toLowerCase());
  requireSafe(digests.length>0&&digests.every(value=>value===BASELINE.certificate),'APK signing certificate does not match the established demo.');
  return BASELINE.certificate;
}
export function cleanFixture(me,state,summary){
  requireSafe(me.demoOnly===true&&me.mine?.id?.startsWith('mine-')&&me.mine.name?.startsWith('Native QA DEMO '),'Only a separately provisioned Native QA DEMO mine is allowed.');
  if(state)requireSafe(state.walletMinor?.USDT===25000&&state.walletMinor.USD===60000&&Object.values(state.holdingsMg??{}).length===4&&Object.values(state.holdingsMg).every(value=>value===0)&&state.movements?.length===0&&Object.keys(state.receipts??{}).length===0&&state.offers?.length===0&&state.custodyRequests?.length===0,'Buyer fixtures must be unused with their initial demo balances.');
  if(summary)requireSafe(summary.inventoryMg?.XAU===5000&&summary.totalSupplyMg?.XAU===5000&&summary.allocatedMg?.XAU===0&&summary.accountCount===2,'QA mine must have exactly two unused buyers and 5g of gold.');
}
