import {createHash} from 'node:crypto';
import {accountError,tokenHash} from './account-auth.js';
import {METALS} from './domain.js';

const clone=value=>structuredClone(value),digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const defaults={enabled:true,push:false,purchases:true,sales:true,offers:true,deliveries:true,priceAlerts:true};
const doc=()=>({version:1,preferences:{...defaults},items:[],alerts:[],samples:{}});
const fail=(condition,message='Notificación DEMO inválida.',status=400,code='INVALID_NOTIFICATION')=>{if(!condition)throw accountError(status,message,code);};
const uuid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
const deviceKey=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const publicDevice=device=>({id:device.id,platform:'android',active:device.active,updatedAt:device.updatedAt});
const accountKey=id=>'account:'+id,deviceId=id=>'device:'+id;
const enabled=(document,category)=>document.preferences.enabled&&document.preferences[category];

export function parseNotificationQuery(params){
  for(const name of params.keys())fail(['before','limit','unread'].includes(name)&&params.getAll(name).length===1);
  const raw=params.get('limit')??'30';fail(/^[1-9]\d?$|^100$/.test(raw));
  const before=params.get('before');if(before!==null)fail(/^notice-[a-f0-9]{40}$/.test(before));
  const unread=params.get('unread');fail(unread===null||['true','false'].includes(unread));
  return {limit:Number(raw),before,unread:unread==='true'};
}
export function priceMicros(value){
  fail(typeof value==='string'&&/^(0|[1-9]\d{0,6})(\.\d{1,6})?$/.test(value),'Precio DEMO inválido: USD/g, hasta seis decimales.');
  const [whole,fraction='']=value.split('.'),amount=Number(BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0')));
  fail(Number.isSafeInteger(amount)&&amount>0&&amount<=1_000_000_000_000,'Precio DEMO fuera de límites.');return amount;
}
export function notificationServices(adapter,{notificationsEnabled=false,pushSendEnabled=false,pushTransport=null,now=Date.now}={}){
  const required=()=>fail(notificationsEnabled,'Notificaciones DEMO desactivadas.',503,'NOTIFICATIONS_DISABLED');
  async function context(tx,accountId){const account=await tx.account(accountId);fail(account,'Inicia sesión de nuevo.',401,'UNAUTHORIZED');await tx.lockNotifications();return {account,document:await tx.notificationGet(accountKey(accountId))??doc()};}
  const save=(tx,accountId,document)=>tx.notificationPut(accountKey(accountId),document);
  async function append(tx,accountId,notice){
    const {document}=await context(tx,accountId);
    const id='notice-'+digest([accountId,notice.eventId]).slice(0,40);
    if(!enabled(document,notice.category)||document.items.some(item=>item.id===id))return false;
    const item={id,sequence:(document.items.at(-1)?.sequence??0)+1,category:notice.category,type:notice.type,title:notice.title,body:notice.body,
      at:notice.at??new Date(now()).toISOString(),readAt:null,demoOnly:true,...(notice.receiptId?{receiptId:notice.receiptId}:{}),...(notice.price?{price:notice.price}:{})};
    document.items.push(item);await save(tx,accountId,document);
    if(document.preferences.push){
      for(const device of await tx.notificationScan('device:')){
        if(device.accountId!==accountId||!device.active||!device.token)continue;
        const jobId='push:'+digest([id,device.id,device.sessionHash]);
        if(!await tx.notificationGet(jobId))await tx.notificationPut(jobId,{id:jobId,accountId,noticeId:id,category:item.category,deviceId:device.id,deviceRevision:device.revision,
          sessionHash:device.sessionHash,status:'READY',attempts:0,nextAt:now(),expiresAt:now()+86400000,ticketId:null,lease:null});
      }
    }
    return true;
  }
  async function receipt(tx,accountId,value){
    if(!notificationsEnabled)return;
    const map={buy:['purchases','PURCHASE','Compra DEMO completada'],market_buy:['purchases','PURCHASE','Compra de oferta DEMO completada'],sell:['sales','SALE','Venta DEMO completada'],market_sell:['offers','OFFER_ACCEPTED','Tu oferta DEMO fue aceptada']};
    let entry=map[value.action];
    if(['delivery','cancel_delivery','delivery_quote','delivery_accept','delivery_reject','delivery_transition'].includes(value.action))entry=['deliveries','DELIVERY_CHANGED','Entrega DEMO actualizada'];
    if(!entry)return;
    const [category,type,title]=entry;
    await append(tx,accountId,{eventId:value.id,receiptId:value.id,category,type,title,body:category==='deliveries'?`Estado DEMO: ${value.deliveryStatus??value.delivery?.status??(value.action==='cancel_delivery'?'CANCELLED':'PENDING_QUOTE')}.`:'Consulta el comprobante de esta operación simulada.',at:value.at});
    if(['delivery','cancel_delivery','delivery_accept','delivery_reject'].includes(value.action)){
      const buyer=await tx.account(accountId);
      for(const operator of (await tx.accountsForMine(buyer.mineId)).filter(account=>account.role==='operator'))await append(tx,operator.id,{eventId:accountId+':'+value.id,category:'deliveries',type:'DELIVERY_CHANGED',title:'Solicitud de entrega DEMO actualizada',body:'Un comprador actualizó su solicitud simulada.',at:value.at});
    }
  }
  async function revoke(tx,predicate,manual=false){
    await tx.lockNotifications();
    for(const device of await tx.notificationScan('device:'))if(predicate(device)){device.active=false;device.token=null;device.disabledByUser=device.disabledByUser||manual;device.revision++;device.updatedAt=new Date(now()).toISOString();await tx.notificationPut(deviceId(device.id),device);}
  }
  const services={
    async getNotifications(accountId,params=new URLSearchParams()){
      required();const query=parseNotificationQuery(params);
      return adapter.tx(async tx=>{
        const {document}=await context(tx,accountId);let items=[...document.items].reverse();
        if(query.before){const index=items.findIndex(item=>item.id===query.before);fail(index>=0,'Cursor de notificación no disponible.',404);items=items.slice(index+1);}
        if(query.unread)items=items.filter(item=>!item.readAt);
        const page=items.slice(0,query.limit),devices=(await tx.notificationScan('device:')).filter(item=>item.accountId===accountId).map(publicDevice);
        return {demoOnly:true,items:clone(page),unreadCount:document.items.filter(item=>!item.readAt).length,nextCursor:items.length>query.limit?page.at(-1).id:null,
          preferences:clone(document.preferences),alerts:clone(document.alerts),devices,push:{configured:pushSendEnabled&&!!pushTransport,delivery:'not-guaranteed'},priceSources:{demo:true,authorizedReferences:[]}};
      });
    },
    async notificationPreferences(accountId,patch){
      required();fail(patch&&typeof patch==='object'&&!Array.isArray(patch)&&Object.keys(patch).length>0&&Object.entries(patch).every(([key,value])=>Object.hasOwn(defaults,key)&&typeof value==='boolean'));
      return adapter.tx(async tx=>{const {document}=await context(tx,accountId);Object.assign(document.preferences,patch);await save(tx,accountId,document);return {demoOnly:true,preferences:clone(document.preferences)};});
    },
    async readNotifications(accountId,{id,all=false}={}){
      required();fail((all===true&&id===undefined)||(all===false&&typeof id==='string'&&/^notice-[a-f0-9]{40}$/.test(id)));
      return adapter.tx(async tx=>{const {document}=await context(tx,accountId);const items=all?document.items:document.items.filter(item=>item.id===id);fail(all||items.length===1,'Notificación no disponible.',404);
        for(const item of items)if(!item.readAt)item.readAt=new Date(now()).toISOString();await save(tx,accountId,document);return {demoOnly:true,unreadCount:document.items.filter(item=>!item.readAt).length};});
    },
    async registerPushDevice(accountId,sessionHash,body){
      required();fail(body&&uuid(body.installationId)&&deviceKey(body.installationKey)&&body.platform==='android'&&body.permission==='granted'&&body.consent===true&&typeof body.token==='string'&&/^(Exponent|Expo)PushToken\[[A-Za-z0-9_-]{10,200}\]$/.test(body.token));
      return adapter.tx(async tx=>{
        const {document}=await context(tx,accountId),auth=await tx.auth(sessionHash);
        fail(document.preferences.enabled&&document.preferences.push,'Activa primero la preferencia push.',409,'PUSH_NOT_ENABLED');
        fail(auth?.accountId===accountId&&Date.parse(auth.expiresAt)>now(),'Sesión del dispositivo vencida.',401);
        const previous=await tx.notificationGet(deviceId(body.installationId));
        fail(!previous||previous.keyHash===tokenHash(body.installationKey),'El dispositivo no pertenece a esta instalación.',403);
        fail(!previous?.disabledByUser||body.reactivate===true,'Dispositivo revocado. Actívalo expresamente de nuevo.',409,'DEVICE_REVOKED');
        const devices=await tx.notificationScan('device:');
        fail(!devices.some(item=>item.id!==body.installationId&&item.active&&item.token===body.token),'El token ya está vinculado a otra instalación.',409,'DEVICE_CONFLICT');
        fail(devices.filter(item=>item.accountId===accountId&&item.active&&item.id!==body.installationId).length<10,'Límite de diez dispositivos por cuenta.',429);
        const unchanged=previous?.active&&previous.accountId===accountId&&previous.sessionHash===sessionHash&&previous.token===body.token;
        const device={id:body.installationId,keyHash:tokenHash(body.installationKey),accountId,sessionHash,token:body.token,platform:'android',active:true,disabledByUser:false,revision:unchanged?previous.revision:(previous?.revision??0)+1,updatedAt:new Date(now()).toISOString()};
        await tx.notificationPut(deviceId(device.id),device);
        if(previous?.accountId===accountId&&previous.sessionHash===sessionHash){
          for(const job of await tx.notificationScan('push:'))if(job.deviceId===device.id&&job.status==='READY'&&job.sessionHash===sessionHash){job.deviceRevision=device.revision;await tx.notificationPut(job.id,job);}
        }
        return {demoOnly:true,device:publicDevice(device)};
      });
    },
    async revokePushDevice(accountId,id){required();fail(uuid(id));return adapter.tx(async tx=>{await context(tx,accountId);const device=await tx.notificationGet(deviceId(id));fail(device?.accountId===accountId,'Dispositivo no disponible.',404);await revoke(tx,item=>item.id===id,true);return {demoOnly:true,revoked:true};});},
    async releasePushInstallation(accountId,body){required();fail(body&&uuid(body.installationId)&&deviceKey(body.installationKey));return adapter.tx(async tx=>{await context(tx,accountId);const previous=await tx.notificationGet(deviceId(body.installationId));fail(!previous||previous.keyHash===tokenHash(body.installationKey),'Prueba de instalación inválida.',403);if(previous)await revoke(tx,item=>item.id===body.installationId);return {demoOnly:true,released:true};});},
    async savePriceAlert(accountId,body){
      required();fail(body&&uuid(body.id)&&Object.hasOwn(METALS,body.metal)&&['above','below'].includes(body.direction)&&typeof body.enabled==='boolean'&&body.source==='demo','Solo se admiten alertas de precios DEMO; fuentes reales sin autorización.',400,'PRICE_SOURCE_NOT_AUTHORIZED');
      const thresholdMicros=priceMicros(body.threshold),cooldownSeconds=body.cooldownSeconds??300;fail(Number.isInteger(cooldownSeconds)&&cooldownSeconds>=60&&cooldownSeconds<=86400);
      return adapter.tx(async tx=>{const {document}=await context(tx,accountId);fail(document.alerts.length<20||document.alerts.some(item=>item.id===body.id),'Límite de veinte alertas.',429);
        const index=document.alerts.findIndex(item=>item.id===body.id),previous=document.alerts[index];
        const definition={id:body.id,metal:body.metal,direction:body.direction,thresholdMicros,enabled:body.enabled,source:'demo',currency:'USD',unit:'g',cooldownSeconds,demoOnly:true};
        const same=previous&&Object.entries(definition).every(([key,value])=>previous[key]===value);
        const alert=same?previous:{...definition,lastCondition:false,lastTriggeredAt:null};
        if(index>=0)document.alerts[index]=alert;else document.alerts.push(alert);await save(tx,accountId,document);return {demoOnly:true,alert:clone(alert)};});
    },
    async demoPriceSample(accountId,body){
      required();fail(body&&uuid(body.sampleId)&&Object.hasOwn(METALS,body.metal)&&body.source==='demo','La muestra debe estar identificada como DEMO.');
      const micros=priceMicros(body.price);
      return adapter.tx(async tx=>{
        const {document}=await context(tx,accountId),previous=document.samples[body.sampleId];
        if(previous){fail(previous.micros===micros&&previous.metal===body.metal,'Muestra reutilizada con otro precio.',409);return {demoOnly:true,replayed:true,triggered:0};}
        fail(Object.keys(document.samples).length<1000,'Límite de mil muestras manuales DEMO por cuenta de pruebas.',429);
        const sample={sampleId:body.sampleId,micros,asOf:new Date(now()).toISOString(),provider:'manual-demo',source:'demo',currency:'USD',unit:'g',metal:body.metal,demoOnly:true};
        let triggered=0;const pending=[];
        for(const alert of document.alerts.filter(item=>item.enabled&&item.metal===body.metal&&item.source==='demo')){
          const condition=alert.direction==='above'?micros>=alert.thresholdMicros:micros<=alert.thresholdMicros;
          if(condition&&!alert.lastCondition&&(!alert.lastTriggeredAt||now()-Date.parse(alert.lastTriggeredAt)>=alert.cooldownSeconds*1000)&&enabled(document,'priceAlerts')){
            alert.lastTriggeredAt=sample.asOf;triggered++;pending.push({eventId:'price:'+alert.id+':'+body.sampleId,category:'priceAlerts',type:'PRICE_ALERT',title:'Alerta de precio DEMO',body:`${body.metal}: umbral alcanzado con un precio ficticio USD/g.`,price:sample,at:sample.asOf});
          }
          alert.lastCondition=condition;
        }
        document.samples[body.sampleId]=sample;await save(tx,accountId,document);
        for(const notice of pending)await append(tx,accountId,notice);
        return {demoOnly:true,triggered,sample};
      });
    },
    async deletePriceAlert(accountId,id){required();fail(uuid(id));return adapter.tx(async tx=>{const {document}=await context(tx,accountId);fail(document.alerts.some(item=>item.id===id),'Alerta no disponible.',404);document.alerts=document.alerts.filter(item=>item.id!==id);await save(tx,accountId,document);return {demoOnly:true,deleted:true};});},
  };
  // Decorate the EXISTING transaction, not a post-commit callback. Failed
  // notification persistence rolls back the operation too; replay emits nothing.
  const decorated={...adapter,tx:work=>adapter.tx(async tx=>{
    if(!notificationsEnabled)return work(tx);
    const saveAccount=tx.saveAccountState.bind(tx),deleteAuth=tx.deleteAuth.bind(tx),deleteAll=tx.deleteAccountAuth.bind(tx);
    tx.saveAccountState=async(id,state)=>{const previous=await tx.account(id);await saveAccount(id,state);for(const [key,value] of Object.entries(state.receipts))if(!Object.hasOwn(previous.state.receipts,key))await receipt(tx,id,value);};
    tx.deleteAuth=async hash=>{await deleteAuth(hash);await revoke(tx,item=>item.sessionHash===hash);};
    tx.deleteAccountAuth=async id=>{await deleteAll(id);await revoke(tx,item=>item.accountId===id);};
    return work(tx);
  })};
  return {services,decorated,required,now,pushSendEnabled,pushTransport,context};
}
