import type {Receipt,ReceiptMetal} from './receipt-presentation';

export type ManagementFilters={metal:string;action:string;status:string;buyer:string;fromDate:string;toDate:string};
export type ManagementQueryFilters={metal:string|null;action:string|null;status:string|null;buyer:string|null;from:string|null;to:string|null;limit:number;before:string|null};
export type ManagementMetal={originalWeightMg:number;deliveredMg:number;activeSupplyMg:number;availableMg:number;allocatedMg:number;reservedMg:number;reconciled:boolean};
export type ManagementBuyer={id:string;alias:string;holdingsMg:Record<ReceiptMetal,number>;reservedMg:Record<ReceiptMetal,number>;activeOffers:number;activeDeliveries:number};
export type ManagementReceipt=Receipt&{inventoryAfterMg?:Record<ReceiptMetal,number>;totalSupplyAfterMg?:Record<ReceiptMetal,number>;lotId?:string;purityBps?:number;location?:string};
export type ManagementEvent={id:string;at:string;label:string;action:string;metal:ReceiptMetal|null;status:string;buyer:{id:string;alias:string}|null;actor:{id:string;alias:string}|null;scope:'buyer'|'command'|'stock';ownerId:string;receiptPath:string;receipt:ManagementReceipt};
export type ManagementKpis={directBuys:number;directSells:number;marketplaceTrades:number;directBuyVolumeMinor:number;directSellVolumeMinor:number;marketplaceVolumeMinor:number;tradingFeesMinor:number;deliveryCostsCollectedMinor:number;stockEntries:number;stockMg:number;policyChanges:number;eventsMatched:number};
export type ManagementSummary={demoOnly:true;disclaimer:string;mine:{id:string;name:string};filters:ManagementQueryFilters;options:{metals:ReceiptMetal[];actions:string[];statuses:string[];buyers:{id:string;alias:string}[]};kpisScope:'filtered_history';snapshotScope:'current_mine';kpis:ManagementKpis;metals:Record<ReceiptMetal,ManagementMetal>;buyers:ManagementBuyer[];obligations:{offersOpen:number;offersMg:Record<ReceiptMetal,number>;deliveriesActive:number;deliveryMg:Record<ReceiptMetal,number>;paidDeliveryCostsMinor:number};history:{items:ManagementEvent[];total:number;nextCursor:string|null}};
const metals:ReceiptMetal[]=['XAU','XAG','XPT','XPD'];
const actions=new Set(['buy','sell','market_buy','market_sell','offer','cancel_offer','delivery','cancel_delivery','delivery_quote','delivery_accept','delivery_reject','delivery_transition','delivery_config','stock']);
const invalid=()=>new Error('El panel administrativo devolvió datos incompletos. Actualiza para volver a consultarlos.');
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw invalid();return value as Record<string,unknown>;}
function number(value:unknown):number{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw invalid();return value;}
function text(value:unknown,max=200):string{if(typeof value!=='string'||!value.trim()||value.length>max)throw invalid();return value;}
function id(value:unknown):string{if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(value))throw invalid();return value;}
function date(value:unknown):string{if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw invalid();return value;}
function list<T>(value:unknown,parse:(entry:unknown)=>T):T[]{if(!Array.isArray(value))throw invalid();return value.map(parse);}
function account(value:unknown){const item=object(value);return {id:id(item.id),alias:text(item.alias,40)};}
function metal(value:unknown):ReceiptMetal{if(!metals.some(entry=>entry===value))throw invalid();return value as ReceiptMetal;}
function metalRecord(value:unknown):Record<ReceiptMetal,number>{const record=object(value);return Object.fromEntries(metals.map(key=>[key,number(record[key])])) as Record<ReceiptMetal,number>;}
function action(value:unknown):string{if(typeof value!=='string'||!actions.has(value))throw invalid();return value;}
function receipt(value:unknown):ManagementReceipt{
  const item=object(value);if(item.demoOnly!==true)throw invalid();
  const result:ManagementReceipt={id:id(item.id),action:action(item.action),status:text(item.status,60),at:date(item.at),demoOnly:true,operatorView:true};
  if(item.label!==undefined)result.label=text(item.label,500);
  if(item.metal!==undefined)result.metal=metal(item.metal);
  for(const key of ['mg','priceCentsPerGram','baseMinor','feeMinor','totalMinor','outputMinor','paidMinor','purityBps','receiptVersion'] as const){if(item[key]!==undefined)result[key]=number(item[key]);}
  for(const key of ['offerId','deliveryId','tradeId','lotId'] as const){if(item[key]!==undefined)result[key]=id(item[key]);}
  if(item.deliveryStatus!==undefined)result.deliveryStatus=text(item.deliveryStatus,60);
  if(item.reason!==undefined)result.reason=text(item.reason,160);
  if(item.location!==undefined)result.location=text(item.location,200);
  if(item.actor!==undefined)result.actor=account(item.actor);
  if(item.counterparty!==undefined)result.counterparty=account(item.counterparty);
  if(item.certificateIds!==undefined)result.certificateIds=list(item.certificateIds,id);
  for(const key of ['offer','delivery'] as const){if(item[key]!==undefined){const reservation=object(item[key]);result[key]={id:id(reservation.id),metal:metal(reservation.metal),mg:number(reservation.mg),status:text(reservation.status,60)};}}
  if(item.inventoryAfterMg!==undefined)result.inventoryAfterMg=metalRecord(item.inventoryAfterMg);
  if(item.totalSupplyAfterMg!==undefined)result.totalSupplyAfterMg=metalRecord(item.totalSupplyAfterMg);
  // The full authorized receipt is re-read by the parent when opened. Wallet
  // snapshots, unrelated commands and unknown server fields are never retained.
  return result;
}
function event(value:unknown):ManagementEvent{
  const item=object(value),checkedReceipt=receipt(item.receipt),checkedAction=action(item.action),ownerId=id(item.ownerId);
  const buyer=item.buyer===null?null:account(item.buyer),actor=item.actor===null?null:account(item.actor);
  if(!['buyer','command','stock'].some(value=>value===item.scope)||(item.scope==='buyer'?ownerId!==buyer?.id:ownerId!=='mine'))throw invalid();
  const expectedPath=item.scope==='buyer'?`/api/demo/mine/receipts/${encodeURIComponent(ownerId)}/${encodeURIComponent(checkedReceipt.id)}`:
    `/api/demo/mine/commands/${encodeURIComponent(checkedReceipt.id)}?kind=${item.scope}${actor?`&actor=${encodeURIComponent(actor.id)}`:''}`;
  if(checkedAction!==checkedReceipt.action||item.receiptPath!==expectedPath)throw invalid();
  return {id:id(item.id),at:date(item.at),label:text(item.label,500),action:checkedAction,metal:item.metal===null?null:metal(item.metal),status:text(item.status,60),buyer,actor,scope:item.scope as ManagementEvent['scope'],ownerId,receiptPath:item.receiptPath,receipt:checkedReceipt};
}
export function managementInventoryReconciled(value:ManagementMetal):boolean{return value.reconciled&&value.originalWeightMg===value.activeSupplyMg+value.deliveredMg&&value.availableMg+value.allocatedMg===value.activeSupplyMg&&value.reservedMg<=value.allocatedMg;}
export function parseManagementSummary(value:unknown,expectedFilters?:ManagementQueryFilters):ManagementSummary{
  const item=object(value),mine=object(item.mine),options=object(item.options),kpis=object(item.kpis),inventory=object(item.metals),obligations=object(item.obligations),history=object(item.history),rawFilters=object(item.filters);
  if(item.demoOnly!==true||item.kpisScope!=='filtered_history'||item.snapshotScope!=='current_mine')throw invalid();
  const filters:ManagementQueryFilters={metal:null,action:null,status:null,buyer:null,from:null,to:null,limit:number(rawFilters.limit),before:null};
  if(filters.limit<1||filters.limit>50)throw invalid();
  for(const key of ['metal','action','status','buyer','before'] as const)filters[key]=rawFilters[key]===null?null:id(rawFilters[key]);
  for(const key of ['from','to'] as const)filters[key]=rawFilters[key]===null?null:date(rawFilters[key]);
  if(expectedFilters&&Object.keys(filters).some(key=>filters[key as keyof ManagementQueryFilters]!==expectedFilters[key as keyof ManagementQueryFilters]))throw new Error('El servidor devolvió otro filtro de actividad. Actualiza antes de continuar.');
  const checkedKpis=Object.fromEntries(['directBuys','directSells','marketplaceTrades','directBuyVolumeMinor','directSellVolumeMinor','marketplaceVolumeMinor','tradingFeesMinor','deliveryCostsCollectedMinor','stockEntries','stockMg','policyChanges','eventsMatched'].map(key=>[key,number(kpis[key])])) as ManagementKpis;
  const checkedMetals=Object.fromEntries(metals.map(key=>{
    const entry=object(inventory[key]);if(typeof entry.reconciled!=='boolean')throw invalid();
    return [key,{originalWeightMg:number(entry.originalWeightMg),deliveredMg:number(entry.deliveredMg),activeSupplyMg:number(entry.activeSupplyMg),availableMg:number(entry.availableMg),allocatedMg:number(entry.allocatedMg),reservedMg:number(entry.reservedMg),reconciled:entry.reconciled}];
  })) as ManagementSummary['metals'];
  const buyers=list(item.buyers,entry=>{const buyer=object(entry),identity=account(buyer),holdingsMg=metalRecord(buyer.holdingsMg),reservedMg=metalRecord(buyer.reservedMg);if(metals.some(key=>reservedMg[key]>holdingsMg[key]))throw invalid();return {...identity,holdingsMg,reservedMg,activeOffers:number(buyer.activeOffers),activeDeliveries:number(buyer.activeDeliveries)};});
  const items=list(history.items,event),total=number(history.total),nextCursor=history.nextCursor===null?null:id(history.nextCursor);
  if(new Set(items.map(entry=>entry.id)).size!==items.length||items.length>filters.limit||total<items.length||checkedKpis.eventsMatched!==total)throw invalid();
  return {demoOnly:true,disclaimer:text(item.disclaimer,2000),mine:{id:id(mine.id),name:text(mine.name)},filters,options:{metals:list(options.metals,metal),actions:list(options.actions,action),statuses:list(options.statuses,entry=>id(entry)),buyers:list(options.buyers,account)},kpisScope:'filtered_history',snapshotScope:'current_mine',kpis:checkedKpis,metals:checkedMetals,buyers,
    obligations:{offersOpen:number(obligations.offersOpen),offersMg:metalRecord(obligations.offersMg),deliveriesActive:number(obligations.deliveriesActive),deliveryMg:metalRecord(obligations.deliveryMg),paidDeliveryCostsMinor:number(obligations.paidDeliveryCostsMinor)},history:{items,total,nextCursor}};
}
export function emptyManagementFilters():ManagementFilters{return {metal:'',action:'',status:'',buyer:'',fromDate:'',toDate:''};}
function localDay(value:string,end:boolean):string{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))throw new Error('Escribe las fechas como AAAA-MM-DD.');
  const calendar=new Date(`${value}T00:00:00.000Z`);if(!Number.isFinite(calendar.getTime())||calendar.toISOString().slice(0,10)!==value)throw new Error('La fecha indicada no existe.');
  return new Date(`${value}T${end?'23:59:59.999':'00:00:00.000'}-05:00`).toISOString();
}
export function createManagementQuery(form:ManagementFilters,before:string|null=null,limit=20):{path:string;filters:ManagementQueryFilters}{
  if(!Number.isSafeInteger(limit)||limit<1||limit>50)throw new Error('El tamaño de página debe estar entre 1 y 50.');
  if(form.metal&&!metals.some(value=>value===form.metal))throw new Error('Elige un metal disponible.');
  if(form.action&&!actions.has(form.action))throw new Error('Elige un tipo de operación disponible.');
  for(const value of [form.status,form.buyer,before??''])if(value&&!/^[A-Za-z0-9_-]{1,128}$/.test(value))throw new Error('El filtro o cursor de actividad no es válido.');
  if(form.buyer&&!/^account-[A-Za-z0-9_-]{8,80}$/.test(form.buyer))throw new Error('Elige una cuenta compradora del listado.');
  if(before&&!/^operation-[a-f0-9]{32}$/.test(before))throw new Error('El cursor de actividad no es válido.');
  const from=form.fromDate?localDay(form.fromDate.trim(),false):null,to=form.toDate?localDay(form.toDate.trim(),true):null;
  if(from&&to&&Date.parse(from)>Date.parse(to))throw new Error('La fecha inicial debe ser anterior o igual a la final.');
  const filters:ManagementQueryFilters={metal:form.metal||null,action:form.action||null,status:form.status||null,buyer:form.buyer||null,from,to,limit,before};
  const query=Object.entries(filters).filter(([,value])=>value!==null).map(([key,value])=>`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`).join('&');
  return {path:`/api/demo/mine/management?${query}`,filters};
}
export function mergeManagementEvents(current:ManagementEvent[],next:ManagementEvent[]):ManagementEvent[]{
  const found=new Set<string>();return [...current,...next].filter(event=>{if(found.has(event.id))return false;found.add(event.id);return true;});
}
export function managementActionLabel(value:string):string{return {buy:'Compra directa',sell:'Venta directa',market_buy:'Compra en marketplace',market_sell:'Venta en marketplace',offer:'Publicar oferta',cancel_offer:'Cancelar oferta',delivery:'Solicitar entrega',cancel_delivery:'Cancelar entrega',delivery_quote:'Cotizar entrega',delivery_accept:'Aceptar cotización',delivery_reject:'Rechazar entrega',delivery_transition:'Avanzar entrega',delivery_config:'Configurar política',stock:'Ingreso de metal'}[value]??value;}
export function managementStatusLabel(value:string):string{return {COMPLETED:'Registrada',OPEN:'Oferta abierta',FILLED:'Oferta vendida',CANCELLED:'Cancelada',PENDING_QUOTE:'Pendiente de cotización',QUOTED:'Cotizada',APPROVED:'Aceptada',PREPARING:'En preparación',DISPATCHED_DEMO:'Despachada DEMO',DELIVERED_DEMO:'Entregada DEMO',REJECTED:'Rechazada'}[value]??value;}
