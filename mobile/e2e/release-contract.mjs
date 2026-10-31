import {isDeepStrictEqual} from 'node:util';
import {PACKAGE,requireSafe} from './ci-safety.mjs';

export const RELEASE={version:'0.3.0',code:6,buildSourceCommit:'eae7f6ad57f5a667c2bf40775a4cb30f1c0dd8b6'};
export const RELEASE_BASELINE={
  url:'https://github.com/Blaister9/Openminerals/releases/download/v0.2.0-demo/Openminerals-Demo-0.2.0-android.apk',
  sha256:'c35719bf44fdc5a1237249be7e80d6d3102e57ee58f0cd0d9b5af3c66f32d83f',
  code:5,name:'0.2.0',
};
export function releaseScenario(value,ota){
  requireSafe(ota===undefined||ota==='','Standalone release acceptance must not request an OTA.');
  requireSafe(['clean-commerce','upgrade-buyer','upgrade-operator','accounts-wallets'].includes(value),'Invalid standalone release scenario.');
  return value;
}
export function validateReleaseConfig(app){
  requireSafe(app.version===RELEASE.version&&app.android?.versionCode===RELEASE.code&&app.android.package===PACKAGE,'Expected standalone 0.3.0/versionCode6 source.');
  requireSafe(app.runtimeVersion?.policy==='appVersion'&&app.updates?.enabled===true,'Release requires its isolated app-version runtime and embedded-source detector.');
}
export function validateReleaseManifest(info,kind,badging,files=''){
  const expected=kind==='baseline'?RELEASE_BASELINE:RELEASE;
  requireSafe(['baseline','new'].includes(kind)&&info.package===PACKAGE&&info.code===expected.code&&info.name===(expected.name??expected.version)&&info.minSdk<=29,'Release APK package, version or minimum SDK differs.');
  requireSafe(!/^application-debuggable\b/m.test(badging),'A standalone release APK must not be debuggable.');
  if(kind==='new')for(const abi of ['arm64-v8a','x86_64'])requireSafe(new RegExp('^lib/'+abi+'/.+\\.so$','m').test(files),'Release APK requires phone and emulator native libraries.');
}
export function apkRuntimeVersion(xml,resources=''){
  const lines=xml.split(/\r?\n/),entries=[];
  for(let index=0;index<lines.length;index++)if(/^\s*E: meta-data\b/.test(lines[index])){
    const indent=lines[index].search(/\S/);let end=index+1;
    while(end<lines.length&&!(/^\s*E:/.test(lines[end])&&lines[end].search(/\S/)<=indent))end++;
    const block=lines.slice(index,end).join('\n');
    if(/android:name(?:\([^)]*\))?="expo\.modules\.updates\.EXPO_RUNTIME_VERSION"/.test(block))entries.push(block);
  }
  requireSafe(entries.length===1,'Exactly one native Expo runtime metadata entry is required.');
  const value=/android:value(?:\([^)]*\))?=(?:"([^"\r\n]+)"|@(0x[a-f0-9]+))/i.exec(entries[0]);
  requireSafe(value,'Native Expo runtime metadata has no readable value.');
  if(value[1])return value[1];
  const resourceLines=resources.split(/\r?\n/),found=[];
  for(let index=0;index<resourceLines.length;index++)if(new RegExp('\\bresource '+value[2]+'\\b','i').test(resourceLines[index])){
    requireSafe(/:string\/expo_runtime_version\b/.test(resourceLines[index]),'Native runtime references an unexpected string resource.');
    let end=index+1;while(end<resourceLines.length&&!/\bresource 0x[a-f0-9]+\b/i.test(resourceLines[end]))end++;
    for(const match of resourceLines.slice(index,end).join('\n').matchAll(/\(string(?:8|16)\)\s+"([^"\r\n]+)"/g))found.push(match[1]);
  }
  const versions=[...new Set(found)];requireSafe(versions.length===1,'Native Expo runtime string resource is unresolved or ambiguous.');return versions[0];
}
const pick=(value,keys)=>Object.fromEntries(keys.map(key=>[key,value?.[key]]));
export function preservationProjection(snapshot){
  const stateKeys=['walletMinor','holdingsMg','movements','receipts','offers','custodyRequests'];
  return {
    wallets:{a:snapshot.a.walletMinor,b:snapshot.b.walletMinor},
    positions:{a:snapshot.a.holdingsMg,b:snapshot.b.holdingsMg},
    accountRecords:{a:pick(snapshot.a,stateKeys.slice(2)),b:pick(snapshot.b,stateKeys.slice(2))},
    inventory:pick(snapshot.summary,['inventoryMg','allocatedMg','reservedMg','totalSupplyMg','demoFeesCollectedMinor','stockAdjustments','accountCount']),
    allocations:{a:snapshot.ca.allocations,b:snapshot.cb.allocations,totals:snapshot.cm.totals},
    history:{buyer:snapshot.history.items,a:snapshot.ha.items,b:snapshot.hb.items,mine:snapshot.hm.items},
    profile:snapshot.profile.profile,
    management:pick(snapshot.management,['kpis','history']),
  };
}
export function assertReleasePreserved(before,after){
  const previous=preservationProjection(before),current=preservationProjection(after),checks={};
  for(const key of Object.keys(previous)){
    checks[key+'Unchanged']=isDeepStrictEqual(previous[key],current[key]);
    requireSafe(checks[key+'Unchanged'],'APK replacement changed preserved '+key+'.');
  }
  return checks;
}
const tap=text=>({tapOn:text}),wait=visible=>({extendedWaitUntil:{visible,timeout:30000}});
const scroll=element=>({scrollUntilVisible:{element,direction:'DOWN',centerElement:true,timeout:30000}});
const document=(name,commands)=>JSON.stringify({appId:PACKAGE,name})+'\n---\n'+JSON.stringify(commands,null,2)+'\n';
export function embeddedFlow(version,operator=false){
  return document('Verify the active APK bundle without an explicit OTA action',[
    ...(operator?[wait('^Mina$'),{tapOn:{text:'^Cuenta$',index:1}}]:[wait('^Actividad$'),tap('^Actividad$')]),
    scroll({id:'demo-update-source'}),
    {assertVisible:{id:'demo-update-source',text:'^Versión incluida en el APK$'}},
    {assertVisible:'^Versión Android '+version.replaceAll('.','\\.')+'$'},
    tap(operator?'^Mina$':'^Actividad$'),
  ]);
}
export function authenticatedFlow(operator=false){
  return document('Require the preserved authenticated identity without entering a credential',[
    ...(operator?[wait('^Mina$')]:[wait('^Actividad$'),tap('^Actividad$')]),
    wait('^'+(operator?'Operador':'Comprador')+' · ${MAESTRO_LOGIN_ALIAS}$'),
    {assertNotVisible:'^Sesión sin cuenta$|^Sesión anterior · solo consulta$'},
  ]);
}
export function buyerPreservedFlow(){
  return document('Read preserved wallets positions receipts and source lots',[
    tap('^Billetera$'),{runFlow:{file:'wallet-balance-rail.yaml'}},wait('^USDT 287,89$'),
    {runFlow:{file:'custody-recheck.yaml'}},
    scroll({text:'(?i)^Ver comprobante: Compra de oro,.*'}),tap('(?i)^Ver comprobante: Compra de oro,.*'),wait('^Comprobante$'),
    scroll({text:'^USDT 157,10$'}),{assertVisible:'^Saldo USDT después$'},tap('Cerrar comprobante'),
  ]);
}
export function operatorPreservedFlow(){
  return document('Read preserved operator management without a buyer wallet',[
    {assertNotVisible:'^Billetera$'},tap('^Mina$'),
    {scrollUntilVisible:{element:{text:'^Panel gerencial$'},direction:'UP',centerElement:true,timeout:30000}},tap('^Panel gerencial$'),
    scroll({text:'^Actividad y control$'}),{assertVisible:'^Actividad y control$'},
    scroll({text:'^Gramos negociados por metal$'}),{assertVisible:'^Gramos negociados por metal$'},
    scroll({text:'(?i)^Ver comprobante de mina:.*'}),tap('(?i)^Ver comprobante de mina:.*'),wait('^Comprobante$'),
    {assertNotVisible:'^Saldo USDT después$'},tap('Cerrar comprobante'),
  ]);
}
