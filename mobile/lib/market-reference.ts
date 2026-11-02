export type MetalCode='XAU'|'XAG'|'XPT'|'XPD';
export type ReferencePeriod='24h'|'7d'|'30d'|'1y';
export type ReferenceStatus='current'|'delayed'|'stale'|'unavailable'|'not-configured'|'disabled'|'unsupported';
export type MetalReference={id:string;metal:MetalCode;provider:string;asOf:string;currency:'USD';unit:'g';reference:number;perTroyOunce:number;bid:number|null;ask:number|null;high:number|null;low:number|null;changePercent:number|null;marketState:string;providerDelaySeconds:number;frequencyVerified:false};
export type ReferenceEnvelope<T>={status:ReferenceStatus;data:T|null;errorCode?:string|null;cacheUntil?:string;retrievedAt?:string};
export type HistoryReference={provider:string;start:string;end:string;granularity:'daily';points:{date:string;value:number}[]};
export type FxReference={base:string;quote:string;rate:number;provider:string;asOf:string};
export type ExchangeReference={fiat:ReferenceEnvelope<FxReference[]>;usdt:ReferenceEnvelope<FxReference>};
export type CommercialQuote={id:string;action:'buy'|'sell';metal:MetalCode;grams:string;mg:number;priceCentsPerGram:number;feeBps:number;spreadBps:number;currency:'USDT';unit:'g';baseMinor:number;feeMinor:number;totalMinor?:number;outputMinor?:number;issuedAt:string;expiresAt:string;demoOnly:true;reference:{provider:string;asOf:string};exchange:{provider:string;asOf:string}};
const states:ReferenceStatus[]=['current','delayed','stale','unavailable','not-configured','disabled','unsupported'];
const finite=(n:unknown)=>typeof n==='number'&&Number.isFinite(n)&&n>0;
const dated=(value:unknown)=>typeof value==='string'&&Number.isFinite(Date.parse(value));
export function parseReferenceEnvelope<T>(value:unknown,validate:(data:unknown)=>data is T):ReferenceEnvelope<T>{
  if(!value||typeof value!=='object')throw new Error('Referencia incompleta.');const row=value as ReferenceEnvelope<T>;
  if(!states.includes(row.status)||row.data!==null&&!validate(row.data)||['current','delayed','stale'].includes(row.status)&&row.data===null)throw new Error('Referencia inválida.');
  return row;
}
export function isMetalReference(value:unknown):value is MetalReference{
  if(!value||typeof value!=='object')return false;const row=value as MetalReference;
  return ['XAU','XAG','XPT','XPD'].includes(row.metal)&&row.currency==='USD'&&row.unit==='g'&&finite(row.reference)&&finite(row.perTroyOunce)&&dated(row.asOf)&&typeof row.provider==='string'&&['bid','ask','low','high'].every(key=>{const v=row[key as keyof MetalReference];return v===null||finite(v);})&&(row.changePercent===null||typeof row.changePercent==='number'&&Number.isFinite(row.changePercent));
}
export function isHistoryReference(value:unknown):value is HistoryReference{
  if(!value||typeof value!=='object')return false;const row=value as HistoryReference;
  return row.granularity==='daily'&&Array.isArray(row.points)&&row.points.every((p,i)=>/^\d{4}-\d{2}-\d{2}$/.test(p.date)&&finite(p.value)&&(i===0||row.points[i-1].date<p.date));
}
export function parseExchangeReference(value:unknown):ExchangeReference{
  const result=value as ExchangeReference;
  if(!result)throw new Error('Tasas de referencia incompletas.');
  const fx=(value:unknown):value is FxReference=>{const row=value as FxReference;return !!row&&finite(row.rate)&&dated(row.asOf)&&typeof row.provider==='string';};
  const fiat=(value:unknown):value is FxReference[]=>Array.isArray(value)&&value.length===2&&['EUR','COP'].every(currency=>value.some(row=>fx(row)&&row.base==='USD'&&row.quote===currency));
  const usdt=(value:unknown):value is FxReference=>fx(value)&&value.base==='USDT'&&value.quote==='USD';
  return {fiat:parseReferenceEnvelope(result.fiat,fiat),usdt:parseReferenceEnvelope(result.usdt,usdt)};
}
export function displayedStatus<T>(reference:ReferenceEnvelope<T>,now:number,maxAge:number):ReferenceStatus{
  const data=Array.isArray(reference.data)?reference.data:[reference.data];
  if(reference.status==='current'&&data.some(row=>row&&now-Date.parse((row as {asOf:string}).asOf)>maxAge))return 'delayed';
  return reference.status;
}
export function parseCommercialQuote(value:unknown):CommercialQuote{
  const row=value as CommercialQuote;
  if(!row||row.demoOnly!==true||row.currency!=='USDT'||row.unit!=='g'||typeof row.id!=='string'||!/^quote-[a-f0-9-]{36}$/.test(row.id)||!['buy','sell'].includes(row.action)||!['XAU','XAG','XPT','XPD'].includes(row.metal)||typeof row.grams!=='string'||![row.mg,row.priceCentsPerGram,row.baseMinor].every(v=>Number.isSafeInteger(v)&&v>0)||![row.feeBps,row.feeMinor,row.spreadBps].every(v=>Number.isSafeInteger(v)&&v>=0)||!dated(row.issuedAt)||!dated(row.expiresAt)||Date.parse(row.expiresAt)<=Date.parse(row.issuedAt)||!row.reference||typeof row.reference.provider!=='string'||!dated(row.reference.asOf)||!row.exchange||typeof row.exchange.provider!=='string'||!dated(row.exchange.asOf)||row.action==='buy'&&row.totalMinor!==row.baseMinor+row.feeMinor||row.action==='sell'&&row.outputMinor!==row.baseMinor-row.feeMinor)throw new Error('Cotización comercial incompleta. Solicita una nueva.');
  return row;
}
export function quoteCanConfirm(quote:CommercialQuote|null,now:number,disabled=false){return !!quote&&!disabled&&Date.parse(quote.expiresAt)>now;}
export function referenceStatusLabel(status:ReferenceStatus){return {current:'Referencia fechada · frecuencia sin verificar',delayed:'Datos retrasados',stale:'Última referencia · actualización fallida',unavailable:'Datos no disponibles','not-configured':'Proveedor pendiente de configuración',disabled:'Referencias desactivadas',unsupported:'Periodo no disponible con este proveedor'}[status];}
// No chart segment bridges an absent day. Isolated observations remain visible as dots.
export function historyPlot(points:{date:string;value:number}[],width:number,height:number){
  if(!points.length)return {dots:[],segments:[]};
  const min=Math.min(...points.map(p=>p.value)),max=Math.max(...points.map(p=>p.value)),start=Date.parse(points[0].date),end=Date.parse(points.at(-1)!.date);
  const dots=points.map(p=>({x:end===start?width/2:(Date.parse(p.date)-start)/(end-start)*width,y:max===min?height/2:height-(p.value-min)/(max-min)*height}));
  const segments=dots.slice(1).flatMap((dot,i)=>{if(Date.parse(points[i+1].date)-Date.parse(points[i].date)>1.5*86400000)return [];const a=dots[i],dx=dot.x-a.x,dy=dot.y-a.y;return [{x:(a.x+dot.x)/2,y:(a.y+dot.y)/2,length:Math.hypot(dx,dy),angle:Math.atan2(dy,dx)}];});
  return {dots,segments};
}
export function createReferenceReader(api:string,fetchImpl=fetch,now=Date.now){
  const cache=new Map<string,{until:number;value:unknown}>(),controllers=new Set<AbortController>();
  return {async get<T>(path:string):Promise<T>{
    if(!api)throw new Error('API de referencia sin configurar.');const hit=cache.get(path);if(hit&&hit.until>now())return hit.value as T;
    const controller=new AbortController();controllers.add(controller);const timer=setTimeout(()=>controller.abort(),12000);
    try{const response=await fetchImpl(api+path,{signal:controller.signal});if(!response.ok)throw new Error('No se pudo actualizar la referencia.');const value=await response.json();if(controller.signal.aborted)throw new Error('Consulta cancelada.');cache.set(path,{value,until:now()+60_000});return value as T;}
    finally{clearTimeout(timer);controllers.delete(controller);}
  },cancel(){for(const controller of controllers)controller.abort();controllers.clear();}};
}
