import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {createStore} from '../src/store.js';
import {createApiServer} from '../src/server.js';
import {expoPushTransport} from '../src/notification-push.js';
import {priceMicros} from '../src/notifications.js';
import {lotFixture} from './lot-history-fixture.js';
import {command,notificationJourney,deviceFixture} from './notifications-fixture.js';

test('notificaciones DEMO: compras, ventas, oferta aceptada, entrega, historial, lectura, preferencias y replay',async()=>{
  const store=await createStore('',{notificationsEnabled:true});try{await notificationJourney(store,'notices');}finally{await store.close();}
});
test('alertas DEMO: cuatro metales, igualdad, precisión, rearme, cooldown, muestras idempotentes y fuentes bloqueadas',async()=>{
  let time=Date.now();const store=await createStore('',{notificationsEnabled:true,now:()=>time});
  try{
    const f=await lotFixture(store,'alerts'),alerts=[];
    assert.equal(priceMicros('0.000001'),1);assert.equal(priceMicros('10.123456'),10123456);
    for(const value of ['0','-1','NaN','1e2','1.1234567','1000001'])assert.throws(()=>priceMicros(value));
    for(const metal of ['XAU','XAG','XPT','XPD']){
      const alert={id:randomUUID(),metal,direction:metal==='XAG'?'below':'above',threshold:'10',enabled:true,source:'demo',cooldownSeconds:60};alerts.push(alert);await store.savePriceAlert(f.a.id,alert);
      const sample={sampleId:randomUUID(),metal,price:'10',source:'demo'};
      const results=await Promise.all([store.demoPriceSample(f.a.id,sample),store.demoPriceSample(f.a.id,sample)]);assert.equal(results.reduce((sum,item)=>sum+item.triggered,0),1);
      await store.demoPriceSample(f.a.id,{...sample,sampleId:randomUUID(),price:'10'});
      await assert.rejects(store.demoPriceSample(f.a.id,{...sample,price:'11'}),{status:409});
      await assert.rejects(store.savePriceAlert(f.a.id,{...alert,source:'metals.dev'}),{code:'PRICE_SOURCE_NOT_AUTHORIZED'});
    }
    assert.equal((await store.getNotifications(f.a.id)).items.length,4);
    const sample=price=>store.demoPriceSample(f.a.id,{sampleId:randomUUID(),metal:'XAU',price,source:'demo'});
    await sample('9');await sample('11');assert.equal((await store.getNotifications(f.a.id)).items.length,4);
    time+=61000;await sample('9');await sample('10');assert.equal((await store.getNotifications(f.a.id)).items.length,5);
    await store.notificationPreferences(f.a.id,{priceAlerts:false});time+=61000;await sample('9');await sample('10');assert.equal((await store.getNotifications(f.a.id)).items.length,5);
    await store.deletePriceAlert(f.a.id,alerts[0].id);await assert.rejects(store.deletePriceAlert(f.b.id,alerts[1].id),{status:404});
    assert.ok((await store.getNotifications(f.a.id)).items.every(item=>item.price.demoOnly&&item.price.provider==='manual-demo'));
  }finally{await store.close();}
});
test('push DEMO: consentimiento, token rotado, dueño/instalación, preferencias, logout y dispositivo revocado',async()=>{
  let calls=0;const transport={async send(messages){calls+=messages.length;return messages.map(()=>({status:'ok',id:randomUUID()}));},async receipts(){return {};}};
  const store=await createStore('',{notificationsEnabled:true,pushSendEnabled:true,pushTransport:transport});
  try{
    const f=await lotFixture(store,'devices'),device=await deviceFixture(store,f.a);
    await assert.rejects(store.registerPushDevice(f.a.id,device.hash,{...device.body,permission:'denied'}),{status:400});
    await assert.rejects(store.registerPushDevice(f.b.id,device.hash,device.body),{status:409});
    await assert.rejects(store.registerPushDevice(f.a.id,device.hash,{...device.body,installationKey:'a'.repeat(64)}),{status:403});
    await store.mutateAccount(f.a.id,command('buy',{metal:'XAG',grams:'0.100'}));
    await store.registerPushDevice(f.a.id,device.hash,{...device.body,reactivate:false}); // same registration must not invalidate queued jobs
    await Promise.all([store.dispatchNotifications(),store.dispatchNotifications()]);assert.equal(calls,1);
    const serialized=JSON.stringify(await store.getNotifications(f.a.id));for(const secret of [device.body.token,device.body.installationKey,device.hash])assert.equal(serialized.includes(secret),false);
    await store.mutateAccount(f.a.id,command('buy',{metal:'XAG',grams:'0.100'}));await store.notificationPreferences(f.a.id,{push:false});await store.dispatchNotifications();assert.equal(calls,1);
    await store.notificationPreferences(f.a.id,{push:true});await store.revokePushDevice(f.a.id,device.body.installationId);
    await assert.rejects(store.registerPushDevice(f.a.id,device.hash,{...device.body,reactivate:false}),{code:'DEVICE_REVOKED'});
    await store.registerPushDevice(f.a.id,device.hash,{...device.body,token:'ExpoPushToken[new_demo_token_rotated]',reactivate:true});
    await store.mutateAccount(f.a.id,command('buy',{metal:'XAG',grams:'0.100'}));await store.logoutAccount(device.auth.token);await store.dispatchNotifications();assert.equal(calls,1);
    assert.equal((await store.getNotifications(f.a.id)).devices[0].active,false);
  }finally{await store.close();}
});
test('push DEMO: reintento limitado, recibos persistentes y DeviceNotRegistered; nunca se confunde ticket con entrega',async()=>{
  let time=Date.now(),sends=0,receiptChecks=0,failOnce=true,unregistered=false;
  const transport={async send(messages){sends++;if(failOnce){failOnce=false;throw new Error('network timeout');}return messages.map(()=>({status:'ok',id:'ticket-demo'}));},async receipts(){receiptChecks++;return {'ticket-demo':unregistered?{status:'error',details:{error:'DeviceNotRegistered'}}:{status:'ok'}};}};
  const store=await createStore('',{notificationsEnabled:true,pushSendEnabled:true,pushTransport:transport,now:()=>time});
  try{
    const f=await lotFixture(store,'receipts');await deviceFixture(store,f.a);await store.mutateAccount(f.a.id,command('buy',{metal:'XAG',grams:'0.100'}));
    await store.dispatchNotifications();assert.equal(sends,1);await store.dispatchNotifications();assert.equal(sends,1);
    time+=61000;await store.dispatchNotifications();assert.equal(sends,2);assert.equal(receiptChecks,0);
    await store.dispatchNotifications();assert.equal(sends,2);time+=15*60000+1;await store.dispatchNotifications();assert.equal(receiptChecks,1);
    assert.equal((await store.getNotifications(f.a.id)).push.delivery,'not-guaranteed');
    await store.mutateAccount(f.a.id,command('buy',{metal:'XAG',grams:'0.100'}));await store.dispatchNotifications();unregistered=true;time+=15*60000+1;await store.dispatchNotifications();assert.equal((await store.getNotifications(f.a.id)).devices[0].active,false);
  }finally{await store.close();}
});
test('push DEMO: varios dispositivos, rotación previa al envío y cambio de cuenta no filtran avisos',async()=>{
  const delivered=[];const transport={async send(messages){delivered.push(...messages);return messages.map(()=>({status:'ok',id:randomUUID()}));},async receipts(){return {};}};
  const store=await createStore('',{notificationsEnabled:true,pushSendEnabled:true,pushTransport:transport});
  try{
    const f=await lotFixture(store,'multi_devices'),first=await deviceFixture(store,f.a),second=await deviceFixture(store,f.a);
    await store.mutateAccount(f.a.id,command('buy',{metal:'XAG',grams:'0.100'}));
    const rotated='ExpoPushToken[rotated_before_sending_demo]';await store.registerPushDevice(f.a.id,first.hash,{...first.body,token:rotated});
    await store.logoutAccount(second.auth.token);await store.dispatchNotifications();assert.equal(delivered.length,1);assert.equal(delivered[0].to,rotated);
    assert.equal(delivered[0].data.accountId,f.a.id);assert.equal(delivered[0].body.includes('XAG'),false);
    await store.mutateAccount(f.a.id,command('buy',{metal:'XAG',grams:'0.100'}));
    await assert.rejects(store.releasePushInstallation(f.b.id,{installationId:first.body.installationId,installationKey:'b'.repeat(64)}),{status:403});
    await store.releasePushInstallation(f.b.id,{installationId:first.body.installationId,installationKey:first.body.installationKey});await store.dispatchNotifications();assert.equal(delivered.length,1);
    assert.equal((await store.getNotifications(f.b.id)).items.length,0);
  }finally{await store.close();}
});
test('push DEMO: agota cinco intentos y no envía trabajos de más de 24 horas',async()=>{
  let time=Date.now(),attempts=0;const transport={async send(){attempts++;throw new Error('offline');},async receipts(){return {};}};
  const store=await createStore('',{notificationsEnabled:true,pushSendEnabled:true,pushTransport:transport,now:()=>time});
  try{
    const f=await lotFixture(store,'retry_limit');await deviceFixture(store,f.a);await store.mutateAccount(f.a.id,command('buy',{metal:'XAG',grams:'0.100'}));
    for(let i=0;i<8;i++){await store.dispatchNotifications();time+=3600001;}assert.equal(attempts,5);
    await store.mutateAccount(f.a.id,command('buy',{metal:'XAG',grams:'0.100'}));time+=86400001;await store.dispatchNotifications();assert.equal(attempts,5);
    assert.equal((await store.getNotifications(f.a.id)).items.length,2);
  }finally{await store.close();}
});
test('API de notificaciones: autenticación, campos/cursor inválidos, aislamiento y bandera apagada',async()=>{
  const store=await createStore('',{notificationsEnabled:true}),server=createApiServer(store);server.listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${server.address().port}`;
  const call=async(path,token,body)=>{const result=await fetch(base+'/api/demo/notifications'+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});return {status:result.status,data:await result.json()};};
  try{
    const account=await store.registerAccount({alias:'notices_http_demo',password:'Notices-http-tests-only-123'});
    assert.equal((await call('')).status,401);assert.equal((await call('','invalid')).status,401);assert.equal((await call('',account.token)).status,200);
    for(const suffix of ['?accountId=other','?limit=0','?limit=101','?before=invalid','?unread=other'])assert.equal((await call(suffix,account.token)).status,400);
    assert.equal((await call('/preferences',account.token,{push:true,accountId:'other'})).status,400);
    assert.equal((await call('/alerts',account.token,{id:randomUUID(),metal:'XAU',source:'real',threshold:'10',enabled:true,direction:'above'})).status,400);
  }finally{server.close();await once(server,'close');await store.close();}
  const disabled=await createStore('',{notificationsEnabled:false});try{const a=await disabled.registerAccount({alias:'notices_disabled_demo',password:'Disabled-tests-only-123'});await assert.rejects(disabled.getNotifications(a.account.id),{code:'NOTIFICATIONS_DISABLED'});assert.equal((await disabled.getAccountState(a.account.id)).holdingsMg.XAU,0);}finally{await disabled.close();}
});
test('transporte Expo: endpoint fijo, timeout, errores permanentes y ninguna credencial en payload',async()=>{
  let request;const transport=expoPushTransport({accessToken:'test-server-token-only',fetchImpl:async(url,init)=>{request={url,init};return {ok:true,json:async()=>({data:[{status:'ok',id:'ticket'}]})};}});
  await transport.send([{to:'ExpoPushToken[demo_token_only]'}]);assert.equal(request.url,'https://exp.host/--/api/v2/push/send');assert.equal(request.init.headers.Authorization,'Bearer test-server-token-only');assert.equal(request.init.body.includes('test-server-token-only'),false);
  const denied=expoPushTransport({fetchImpl:async()=>({ok:false,status:401})});await assert.rejects(denied.send([]),{permanent:true});
});
