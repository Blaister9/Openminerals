import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {once} from 'node:events';
import {createAndroidPushController,pushInstallationStorageKey} from '../lib/android-push.ts';
import {decimalPrice,noticeFromPush} from '../lib/notifications.ts';
import {createAccountClient} from '../lib/account-client.ts';
import {createStore} from '../../api/src/store.js';
import {createApiServer} from '../../api/src/server.js';
const projectId='f41440f0-e14a-4fc9-9e2a-30aa50100990';
function storage(){const data=new Map();return {data,async getItem(key){return data.get(key)??null;},async setItem(key,value){data.set(key,value);},async removeItem(key){data.delete(key);}};}
function pushFixture(options={}){
  const saved=options.storage??storage(),calls=[],state={permission:{status:'granted',canAskAgain:true},token:'ExpoPushToken[mobile_demo_token_only]',requestResult:{status:'granted',canAskAgain:true}};
  const native={async channel(){calls.push('channel');},async permission(){calls.push('permission');return state.permission;},async request(){calls.push('request');return state.requestResult;},async token(){calls.push('token');return state.token;}};
  const controller=createAndroidPushController({api:'https://alerts.example.invalid',accountId:options.accountId??'account-demo-a',projectId:options.projectId===null?undefined:projectId,storage:saved,uuid:randomUUID,native,...options,
    register:async body=>{calls.push({register:body});},release:async body=>{calls.push({release:body});}});
  return {saved,calls,state,native,controller};
}
test('push Android: permiso solo por acción explícita, canal primero y bloqueo al no poder preguntar',async()=>{
  const f=pushFixture();f.state.permission={status:'denied',canAskAgain:true};f.state.requestResult={status:'denied',canAskAgain:true};
  assert.equal(await f.controller.sync({enabled:true}),'denied');assert.equal(f.calls.includes('request'),false);
  assert.equal(await f.controller.sync({enabled:true,requestPermission:true}),'denied');assert.equal(f.calls.filter(item=>item==='request').length,1);assert.equal(f.calls[0],'channel');
  f.state.permission={status:'denied',canAskAgain:false};assert.equal(await f.controller.sync({enabled:true,requestPermission:true}),'settings-required');assert.equal(f.calls.filter(item=>item==='request').length,1);
  assert.equal(f.calls.some(item=>item.register),false);
});
test('push Android: instalación segura estable, token renovado y separación de cuentas',async()=>{
  const f=pushFixture();assert.equal(await f.controller.sync({enabled:true,requestPermission:true}),'registered');
  const first=f.calls.find(item=>item.register).register;f.state.token='ExpoPushToken[new_mobile_demo_token]';await f.controller.sync({enabled:true});
  const second=f.calls.filter(item=>item.register).at(-1).register;assert.equal(first.installationId,second.installationId);assert.equal(first.installationKey,second.installationKey);assert.notEqual(first.token,second.token);assert.equal(second.reactivate,false);
  assert.equal(JSON.stringify([...f.saved.data.values()]).includes('ExpoPushToken'),false);
  const other=pushFixture({storage:f.saved,accountId:'account-demo-b'});assert.equal(await other.controller.sync({enabled:false}),'disabled');assert.ok(other.calls.some(item=>item.release));assert.equal(other.calls.some(item=>item.register),false);
  f.controller.cancel();assert.equal(await f.controller.sync({enabled:true}),'busy');
});
test('push Android: revocación de permiso libera el registro; configuración ausente y cancelación no piden token',async()=>{
  const f=pushFixture();await f.controller.sync({enabled:true});f.state.permission={status:'denied',canAskAgain:false};await f.controller.sync({enabled:true});assert.ok(f.calls.some(item=>item.release));
  const missing=pushFixture({projectId:null});await assert.rejects(missing.controller.sync({enabled:true,requestPermission:true}),/proyecto Expo/);assert.equal(missing.calls.length,0);
  let done;const gated=pushFixture();gated.native.permission=()=>new Promise(resolve=>done=resolve);
  const pending=gated.controller.sync({enabled:true});await new Promise(resolve=>setTimeout(resolve,10));gated.controller.cancel();done({status:'granted'});assert.equal(await pending,'cancelled');assert.equal(gated.calls.some(item=>item.register),false);
});
test('push Android: instalación corrupta no se sustituye silenciosamente y payload ajeno/URL se ignoran',async()=>{
  const f=pushFixture();await f.saved.setItem(pushInstallationStorageKey('https://alerts.example.invalid'),'{}');await assert.rejects(f.controller.sync({enabled:true}),/identificación push/);
  const id='notice-'+'a'.repeat(40);assert.equal(noticeFromPush({demoOnly:true,accountId:'a',notificationId:id},'a'),id);
  for(const value of [{demoOnly:true,accountId:'b',notificationId:id},{accountId:'a',notificationId:id},{demoOnly:true,accountId:'a',notificationId:'https://example.com'}])assert.equal(noticeFromPush(value,'a'),null);
  assert.equal(decimalPrice('0,000001'),'0.000001');for(const value of ['0','-1','1e2','NaN','1.1234567'])assert.throws(()=>decimalPrice(value));
});
test('preview de notificaciones: identidad y runtime independientes; configuración comercial inalterada',()=>{
  const config=JSON.parse(readFileSync(new URL('../app.json',import.meta.url),'utf8')).expo,resolve=createRequire(import.meta.url)('../app.config.js');
  const names=['OPENMINERALS_NOTIFICATIONS_PREVIEW','EXPO_PUBLIC_NOTIFICATIONS','EXPO_PUBLIC_NOTIFICATIONS_PROJECT_ID','NOTIFICATIONS_API_URL','EXPO_PUBLIC_API_URL','EAS_BUILD','EAS_BUILD_PROFILE'],old=Object.fromEntries(names.map(name=>[name,process.env[name]]));
  try{
    for(const name of names)delete process.env[name];const baseline=structuredClone(config);
    assert.deepEqual(resolve({config}),{...config,extra:{...config.extra,demoOnly:true}});assert.deepEqual(config,baseline);
    process.env.EXPO_PUBLIC_NOTIFICATIONS='1';assert.throws(()=>resolve({config}),/independent/);
    process.env.OPENMINERALS_NOTIFICATIONS_PREVIEW='1';process.env.EXPO_PUBLIC_API_URL='https://alerts.example.invalid';process.env.NOTIFICATIONS_API_URL=process.env.EXPO_PUBLIC_API_URL;
    const isolated=resolve({config});assert.equal(isolated.android.package,'com.openminerals.demo.notificationspreview');assert.equal(isolated.runtimeVersion,'notifications-demo-0.3.0-v1');assert.equal(isolated.updates.enabled,false);assert.equal(isolated.extra.eas,undefined);
    for(const url of ['https://openminerals-api-demo.up.railway.app/','https://openminerals-market-api-market-reference.up.railway.app','https://user:secret@alerts.example.invalid']){process.env.EXPO_PUBLIC_API_URL=url;process.env.NOTIFICATIONS_API_URL=url;assert.throws(()=>resolve({config}),/isolated/);}
    process.env.EXPO_PUBLIC_API_URL='https://alerts.example.invalid';process.env.NOTIFICATIONS_API_URL=process.env.EXPO_PUBLIC_API_URL;process.env.EAS_BUILD='true';assert.throws(()=>resolve({config}),/project/);
    process.env.EXPO_PUBLIC_NOTIFICATIONS_PROJECT_ID=config.extra.eas.projectId;assert.throws(()=>resolve({config}),/separate/);
    process.env.EXPO_PUBLIC_NOTIFICATIONS_PROJECT_ID=projectId;assert.equal(resolve({config}).extra.eas.projectId,projectId);
  }finally{for(const name of names)if(old[name]===undefined)delete process.env[name];else process.env[name]=old[name];}
});
test('cliente móvil: centro/lectura/alertas persisten por cuenta y preferencias respetan operación pendiente',async()=>{
  const store=await createStore('',{notificationsEnabled:true}),server=createApiServer(store);server.listen(0,'127.0.0.1');await once(server,'listening');
  let loseBuy=false;
  const api=`http://127.0.0.1:${server.address().port}`,saved=storage(),auth=storage(),options={api,storage:saved,authStorage:auth,uuid:randomUUID,fetchImpl:async(url,init)=>{const response=await fetch(url,init);if(loseBuy&&url.endsWith('/buy')){loseBuy=false;await response.json();throw new TypeError('Lost committed buy response');}return response;}};
  try{
    await store.registerAccount({alias:'mobile_notices_a',password:'Notifications-mobile-tests-123'});
    const client=createAccountClient(options);await client.login('mobile_notices_a','Notifications-mobile-tests-123');await client.submit('buy',{metal:'XAG',grams:'0.100'},'Compra DEMO');
    const center=await client.getNotifications();assert.equal(center.unreadCount,1);await client.readNotifications({id:center.items[0].id});
    await client.notificationPreferences({offers:false});await client.savePriceAlert({id:randomUUID(),metal:'XAU',direction:'above',threshold:'100',enabled:true,source:'demo'});await client.demoPriceSample({sampleId:randomUUID(),metal:'XAU',price:'101',source:'demo'});
    const restored=createAccountClient(options);await restored.initialize();const result=await restored.getNotifications();assert.equal(result.preferences.offers,false);assert.equal(result.alerts.length,1);assert.equal(result.unreadCount,1);
    assert.ok(result.items.some(item=>item.type==='PRICE_ALERT'&&item.price.demoOnly));
    loseBuy=true;await assert.rejects(client.submit('buy',{metal:'XAG',grams:'0.100'},'Compra con respuesta perdida DEMO'));assert.ok(client.getPending());
    await assert.rejects(client.notificationPreferences({push:true}),/pendiente/);
    const committed=await client.getNotifications();await client.retry();assert.deepEqual(await client.getNotifications(),committed);await client.notificationPreferences({push:false});
    await client.logout();await assert.rejects(client.getNotifications());
  }finally{server.close();await once(server,'close');await store.close();}
});
