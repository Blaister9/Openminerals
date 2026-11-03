export type NotificationPreferences={enabled:boolean;push:boolean;purchases:boolean;sales:boolean;offers:boolean;deliveries:boolean;priceAlerts:boolean};
export type PriceAlert={id:string;metal:'XAU'|'XAG'|'XPT'|'XPD';direction:'above'|'below';thresholdMicros:number;enabled:boolean;source:'demo';currency:'USD';unit:'g';cooldownSeconds:number;demoOnly:true};
export type Notice={id:string;sequence:number;category:string;type:string;title:string;body:string;at:string;readAt:string|null;demoOnly:true;receiptId?:string;price?:{provider:string;source:'demo';micros:number;asOf:string;demoOnly:true}};
export type NotificationCenterData={demoOnly:true;items:Notice[];unreadCount:number;nextCursor:string|null;preferences:NotificationPreferences;alerts:PriceAlert[];devices:{id:string;platform:'android';active:boolean;updatedAt:string}[];push:{configured:boolean;delivery:string};priceSources:{demo:true;authorizedReferences:string[]}};
export type PushInstallation={installationId:string;installationKey:string;registeredAccountId:string|null};
export function parseNotificationCenter(value:unknown):NotificationCenterData{
  const data=value as NotificationCenterData;
  if(!data||data.demoOnly!==true||!Array.isArray(data.items)||!Array.isArray(data.alerts)||!Array.isArray(data.devices)||!Number.isSafeInteger(data.unreadCount)||data.unreadCount<0||!data.preferences||!['enabled','push','purchases','sales','offers','deliveries','priceAlerts'].every(key=>typeof data.preferences[key as keyof NotificationPreferences]==='boolean')||!data.push||typeof data.push.configured!=='boolean'||!data.priceSources||data.priceSources.demo!==true)throw new Error('Centro de notificaciones DEMO incompleto.');
  if(data.items.some(item=>item.demoOnly!==true||!/^notice-[a-f0-9]{40}$/.test(item.id)||typeof item.title!=='string'||typeof item.body!=='string'||!Number.isFinite(Date.parse(item.at))||(item.readAt!==null&&!Number.isFinite(Date.parse(item.readAt)))))throw new Error('Notificación DEMO inválida.');
  return data;
}
export function noticeFromPush(data:unknown,accountId:string):string|null{
  if(!data||typeof data!=='object')return null;
  const value=data as Record<string,unknown>;
  return value.demoOnly===true&&value.accountId===accountId&&typeof value.notificationId==='string'&&/^notice-[a-f0-9]{40}$/.test(value.notificationId)?value.notificationId:null;
}
export function decimalPrice(value:string):string{
  const clean=value.trim().replace(',','.');if(!/^(0|[1-9]\d{0,6})(\.\d{1,6})?$/.test(clean)||Number(clean)<=0||Number(clean)>1000000)throw new Error('Introduce un precio DEMO positivo en USD/g, hasta seis decimales.');return clean;
}
