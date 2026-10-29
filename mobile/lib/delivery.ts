import {normalizeDecimalInput,parsePositiveDecimal} from './presentation.ts';
import type {CustodyMetal} from './custody';

export const deliveryStatuses=['PENDING_QUOTE','QUOTED','APPROVED','PREPARING','DISPATCHED_DEMO','DELIVERED_DEMO','CANCELLED','REJECTED'] as const;
export type DeliveryStatus=typeof deliveryStatuses[number];
export type DeliveryPolicy={id:string;label:string;taxBps:number;serviceMinor:number;preparationMinor:number;transportMinor:number;insuranceBps:number;requirements:string[];demoOnly:true};
export type DeliveryCosts={metalValueMinor:number;serviceMinor:number;preparationMinor:number;transportMinor:number;insuranceMinor:number;taxMinor:number;subtotalMinor:number;totalMinor:number;taxBps:number;insuranceBps:number};
export type DeliveryQuote=DeliveryCosts&{id:string;jurisdiction:{id:string;label:string};currency:'USDT';requirements:string[];createdAt:string;expiresAt:string;policyVersion:number;demoOnly:true};
export type DeliveryRequest={id:string;account:{id:string;alias:string};metal:CustodyMetal;mg:number;status:DeliveryStatus;createdAt:string;jurisdiction:string;quote:DeliveryQuote|null;timeline:{status:DeliveryStatus;at:string;label:string}[];paidMinor:number;demoOnly:true};
export type DeliveryAudit={id:string;at:string;actor:{id:string;alias:string};jurisdiction:string;reason:string;policyVersion:number};
export type DeliverySummary={demoOnly:true;disclaimer:string;mine:{id:string;name:string};view:'buyer'|'operator';currency:'USDT';availableMg:Record<CustodyMetal,number>;policies:{version:number;quoteValidityHours:number;jurisdictions:DeliveryPolicy[]};requests:DeliveryRequest[];audit:DeliveryAudit[]};
export type DeliveryCommand={action:string;body:Record<string,string>;title:string;detail:string};
export type DeliveryPolicyForm={label:string;taxPercent:string;service:string;preparation:string;transport:string;insurancePercent:string;quoteValidityHours:string;requirements:string;reason:string};
const MAX_MINOR=10_000_000_000;
const metals:CustodyMetal[]=['XAU','XAG','XPT','XPD'];
const invalid=()=>new Error('La entrega demo devolvió datos incompletos. Actualiza antes de continuar.');
const integer=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw invalid();return value as Record<string,unknown>;}
function number(value:unknown,max=MAX_MINOR):number{if(!integer(value)||value>max)throw invalid();return value;}
function text(value:unknown,max=200):string{if(typeof value!=='string'||!value.trim()||value.length>max)throw invalid();return value;}
function id(value:unknown):string{if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(value))throw invalid();return value;}
function date(value:unknown):string{if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw invalid();return value;}
function status(value:unknown):DeliveryStatus{if(!deliveryStatuses.some(entry=>entry===value))throw invalid();return value as DeliveryStatus;}
function demo(value:Record<string,unknown>){if(value.demoOnly!==true)throw invalid();}
function list<T>(value:unknown,parse:(entry:unknown)=>T):T[]{if(!Array.isArray(value))throw invalid();return value.map(parse);}
function account(value:unknown){const item=object(value);return {id:id(item.id),alias:text(item.alias,40)};}
function requirements(value:unknown):string[]{const items=list(value,entry=>text(entry,160));if(items.length<1||items.length>8)throw invalid();return items;}
function policy(value:unknown):DeliveryPolicy{
  const item=object(value);demo(item);
  return {id:id(item.id),label:text(item.label,80),taxBps:number(item.taxBps,10000),serviceMinor:number(item.serviceMinor,100_000_000),preparationMinor:number(item.preparationMinor,100_000_000),transportMinor:number(item.transportMinor,100_000_000),insuranceBps:number(item.insuranceBps,10000),requirements:requirements(item.requirements),demoOnly:true};
}
const ceil=(value:bigint,by:bigint)=>(value+by-1n)/by;
export function quoteDeliveryCosts(input:{metalValueMinor:number;serviceMinor:number;preparationMinor:number;transportMinor:number;taxBps:number;insuranceBps:number}):DeliveryCosts|null{
  if(![input.metalValueMinor,input.serviceMinor,input.preparationMinor,input.transportMinor,input.taxBps,input.insuranceBps].every(integer)||input.taxBps>10000||input.insuranceBps>10000)return null;
  const insurance=ceil(BigInt(input.metalValueMinor)*BigInt(input.insuranceBps),10000n);
  const subtotal=BigInt(input.serviceMinor)+BigInt(input.preparationMinor)+BigInt(input.transportMinor)+insurance;
  const tax=ceil(subtotal*BigInt(input.taxBps),10000n),total=subtotal+tax;
  if(total>BigInt(MAX_MINOR))return null;
  return {...input,insuranceMinor:Number(insurance),subtotalMinor:Number(subtotal),taxMinor:Number(tax),totalMinor:Number(total)};
}
function quote(value:unknown):DeliveryQuote{
  const item=object(value);demo(item);const jurisdiction=object(item.jurisdiction);
  const costs=quoteDeliveryCosts({metalValueMinor:number(item.metalValueMinor,Number.MAX_SAFE_INTEGER),serviceMinor:number(item.serviceMinor),preparationMinor:number(item.preparationMinor),transportMinor:number(item.transportMinor),taxBps:number(item.taxBps,10000),insuranceBps:number(item.insuranceBps,10000)});
  if(!costs||['insuranceMinor','subtotalMinor','taxMinor','totalMinor'].some(key=>item[key]!==costs[key as keyof DeliveryCosts])||item.currency!=='USDT'||number(item.policyVersion)===0)throw invalid();
  const createdAt=date(item.createdAt),expiresAt=date(item.expiresAt);if(Date.parse(expiresAt)<=Date.parse(createdAt))throw invalid();
  return {id:id(item.id),jurisdiction:{id:id(jurisdiction.id),label:text(jurisdiction.label,80)},...costs,currency:'USDT',requirements:requirements(item.requirements),createdAt,expiresAt,policyVersion:number(item.policyVersion),demoOnly:true};
}
function request(value:unknown):DeliveryRequest{
  const item=object(value);demo(item);const currentStatus=status(item.status),mg=number(item.mg,1_000_000_000);
  if(!metals.some(entry=>entry===item.metal)||mg<100)throw invalid();
  const checkedQuote=item.quote===null?null:quote(item.quote),paidMinor=number(item.paidMinor);
  if(['QUOTED','APPROVED','PREPARING','DISPATCHED_DEMO','DELIVERED_DEMO'].includes(currentStatus)&&!checkedQuote)throw invalid();
  if(['APPROVED','PREPARING','DISPATCHED_DEMO','DELIVERED_DEMO'].includes(currentStatus)?paidMinor!==checkedQuote?.totalMinor:paidMinor!==0)throw invalid();
  return {id:id(item.id),account:account(item.account),metal:item.metal as CustodyMetal,mg,status:currentStatus,createdAt:date(item.createdAt),jurisdiction:id(item.jurisdiction),quote:checkedQuote,
    timeline:list(item.timeline,entry=>{const event=object(entry);return {status:status(event.status),at:date(event.at),label:text(event.label,500)};}),paidMinor,demoOnly:true};
}
export function parseDeliverySummary(value:unknown,operator:boolean,accountId:string):DeliverySummary{
  const item=object(value);demo(item);const mine=object(item.mine),policies=object(item.policies),available=object(item.availableMg),view=operator?'operator':'buyer';
  if(item.view!==view||item.currency!=='USDT')throw invalid();
  const jurisdictions=list(policies.jurisdictions,policy),version=number(policies.version),quoteValidityHours=number(policies.quoteValidityHours,168);
  if(!version||!quoteValidityHours||!jurisdictions.length||new Set(jurisdictions.map(entry=>entry.id)).size!==jurisdictions.length)throw invalid();
  const requests=list(item.requests,request),audit=list(item.audit,entry=>{const event=object(entry);return {id:id(event.id),at:date(event.at),actor:account(event.actor),jurisdiction:id(event.jurisdiction),reason:text(event.reason,160),policyVersion:number(event.policyVersion)};});
  if((!operator&&(requests.some(entry=>entry.account.id!==accountId)||audit.length>0))||new Set(requests.map(entry=>`${entry.account.id}:${entry.id}`)).size!==requests.length)throw invalid();
  return {demoOnly:true,disclaimer:text(item.disclaimer,2000),mine:{id:id(mine.id),name:text(mine.name,200)},view,currency:'USDT',availableMg:Object.fromEntries(metals.map(metal=>[metal,number(available[metal],1_000_000_000)])) as Record<CustodyMetal,number>,
    policies:{version,quoteValidityHours,jurisdictions},requests,audit};
}
export function deliveryStatusLabel(value:DeliveryStatus):string{
  return {PENDING_QUOTE:'Pendiente de cotización',QUOTED:'Cotización disponible',APPROVED:'Aceptada y pagada en demo',PREPARING:'En preparación simulada',DISPATCHED_DEMO:'Despachada en la simulación',DELIVERED_DEMO:'Entregada en la simulación',CANCELLED:'Cancelada',REJECTED:'Rechazada'}[value];
}
export function deliveryCanCancel(value:DeliveryStatus):boolean{return value==='PENDING_QUOTE'||value==='QUOTED';}
export function nextDeliveryStatus(value:DeliveryStatus):DeliveryStatus|null{return ({APPROVED:'PREPARING',PREPARING:'DISPATCHED_DEMO',DISPATCHED_DEMO:'DELIVERED_DEMO'} as Partial<Record<DeliveryStatus,DeliveryStatus>>)[value]??null;}
export function deliveryAcceptBlocked(request:DeliveryRequest,usdtMinor:number,acknowledged:readonly string[],now=Date.now()):string|null{
  if(request.status!=='QUOTED'||!request.quote)return 'La solicitud aún no tiene una cotización para aceptar.';
  if(Date.parse(request.quote.expiresAt)<=now)return 'La cotización venció. Pide al operador una nueva antes de aceptar.';
  if(!integer(usdtMinor)||request.quote.totalMinor>usdtMinor)return 'Tu saldo USDT no alcanza para pagar los costes simulados.';
  if(request.quote.requirements.some(requirement=>!acknowledged.includes(requirement)))return 'Confirma que leíste todos los requisitos ficticios antes de aceptar.';
  return null;
}
export function requestDeliveryCommand(metal:CustodyMetal,grams:string,policy:DeliveryPolicy,availableMg:number):DeliveryCommand{
  const units=parsePositiveDecimal(grams,3),mg=units===null?null:Math.round(units*1000);
  if(mg===null||mg<100)throw new Error('Introduce al menos 0,1 g y hasta tres decimales.');
  if(!integer(availableMg)||mg>availableMg)throw new Error('La solicitud supera tus gramos disponibles sin reservar.');
  return {action:'delivery',body:{metal,grams:normalizeDecimalInput(grams),jurisdiction:policy.id},title:'Solicitar entrega simulada',detail:`Se reservarán ${(mg/1000).toLocaleString('es-CO',{minimumFractionDigits:3,maximumFractionDigits:3})} g.\nJurisdicción ficticia: ${policy.label}.\nEl operador preparará una cotización DEMO. No se cobra todavía ni se crea un envío real.`};
}
export function acceptDeliveryCommand(request:DeliveryRequest,usdtMinor:number,acknowledged:readonly string[],now=Date.now()):DeliveryCommand{
  const blocked=deliveryAcceptBlocked(request,usdtMinor,acknowledged,now);if(blocked)throw new Error(blocked);
  const quote=request.quote!;
  return {action:'delivery_accept',body:{deliveryId:request.id,quoteId:quote.id},title:'Aceptar cotización demo',detail:`Costes ficticios: ${deliveryMoney(quote.totalMinor)}.\nSaldo USDT después: ${deliveryMoney(usdtMinor-quote.totalMinor)}.\nRequisitos ficticios leídos:\n${quote.requirements.map(value=>`• ${value}`).join('\n')}\nDespués de aceptar, no podrás cancelar esta solicitud en la demo. No hay transporte ni impuesto real.`};
}
export function transitionDeliveryCommand(request:DeliveryRequest,next:DeliveryStatus,reason:string):DeliveryCommand{
  const trimmed=reason.trim();if(trimmed.length<3||trimmed.length>160)throw new Error('Escribe un motivo ficticio de 3 a 160 caracteres.');
  if(next!==(nextDeliveryStatus(request.status))&&!(next==='REJECTED'&&deliveryCanCancel(request.status)))throw new Error('Esta transición no está disponible para el estado actual.');
  return {action:'mine/delivery_transition',body:{buyerId:request.account.id,deliveryId:request.id,status:next,reason:trimmed},title:`Registrar: ${deliveryStatusLabel(next).toLowerCase()}`,detail:`Comprador demo: ${request.account.alias}.\nMotivo: ${trimmed}.\nEste paso deja un registro ficticio. No acredita preparación, transporte ni recepción física.`};
}
function decimal(value:string,maxMinor:number):{normalized:string;minor:number}{
  const normalized=normalizeDecimalInput(value);
  if(!/^\d{1,10}(?:\.\d{1,2})?$/.test(normalized))throw new Error('Usa importes positivos o cero, con hasta dos decimales y sin separadores de miles.');
  const [whole,fraction='']=normalized.split('.'),minor=Number(whole)*100+Number(fraction.padEnd(2,'0'));
  if(!Number.isSafeInteger(minor)||minor>maxMinor)throw new Error('El importe o porcentaje supera el límite de la demostración.');
  return {normalized:`${Number(whole)}${fraction?`.${fraction}`:''}`,minor};
}
export function deliveryPolicyCommand(jurisdiction:string,form:DeliveryPolicyForm):DeliveryCommand{
  if(!['DEMO_LOCAL','DEMO_REGIONAL','DEMO_INTERNATIONAL'].includes(jurisdiction))throw new Error('Elige una jurisdicción ficticia disponible.');
  const label=form.label.trim(),reason=form.reason.trim(),lines=form.requirements.split(/\r?\n/).map(value=>value.trim()).filter(Boolean);
  if(label.length<3||label.length>80)throw new Error('El nombre ficticio debe tener de 3 a 80 caracteres.');
  if(reason.length<3||reason.length>160)throw new Error('Escribe un motivo ficticio de 3 a 160 caracteres.');
  if(lines.length<1||lines.length>8||lines.some(value=>value.length<3||value.length>160))throw new Error('Introduce de 1 a 8 requisitos ficticios, uno por línea, de 3 a 160 caracteres.');
  if(!/^\d{1,3}$/.test(form.quoteValidityHours.trim())||Number(form.quoteValidityHours)<1||Number(form.quoteValidityHours)>168)throw new Error('La vigencia debe ser de 1 a 168 horas.');
  const tax=decimal(form.taxPercent,10000),insurance=decimal(form.insurancePercent,10000),service=decimal(form.service,100_000_000),preparation=decimal(form.preparation,100_000_000),transport=decimal(form.transport,100_000_000);
  return {action:'mine/delivery_config',body:{jurisdiction,label,taxBps:String(tax.minor),service:service.normalized,preparation:preparation.normalized,transport:transport.normalized,insuranceBps:String(insurance.minor),quoteValidityHours:String(Number(form.quoteValidityHours)),requirements:lines.join('\n'),reason},title:'Actualizar política ficticia de entrega',detail:`${label}.\nServicio: ${deliveryMoney(service.minor)}; preparación: ${deliveryMoney(preparation.minor)}; transporte: ${deliveryMoney(transport.minor)}.\nSeguro demo: ${(insurance.minor/100).toLocaleString('es-CO')}%; impuesto demo: ${(tax.minor/100).toLocaleString('es-CO')}%.\nVigencia de nuevas cotizaciones: ${Number(form.quoteValidityHours)} horas.\nMotivo: ${reason}.\nLas cotizaciones emitidas conservan su desglose original. No son tarifas, impuestos ni requisitos legales reales.`};
}
export function deliveryMoney(minor:number):string{return `USDT ${(minor/100).toLocaleString('es-CO',{minimumFractionDigits:2,maximumFractionDigits:2})}`;}
export function deliveryPolicyInitialForm(policy:DeliveryPolicy,hours:number):DeliveryPolicyForm{
  return {label:policy.label,taxPercent:(policy.taxBps/100).toFixed(2),service:(policy.serviceMinor/100).toFixed(2),preparation:(policy.preparationMinor/100).toFixed(2),transport:(policy.transportMinor/100).toFixed(2),insurancePercent:(policy.insuranceBps/100).toFixed(2),quoteValidityHours:String(hours),requirements:policy.requirements.join('\n'),reason:''};
}
