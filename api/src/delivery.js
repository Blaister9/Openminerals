import {createHash} from 'node:crypto';
import {DomainError,METALS,availableHoldingMg,parseMoney} from './domain.js';
import {accountError} from './account-auth.js';
import {deliverCustody} from './custody.js';

export const DELIVERY_DISCLAIMER='ENTREGA DEMO · Cotizaciones, jurisdicciones, impuestos, seguros y despachos ficticios. No son tarifas legales ni acreditan transporte, entrega o custodia física.';
const copy=value=>structuredClone(value),MAX_MINOR=10_000_000_000;
const jurisdictions=['DEMO_LOCAL','DEMO_REGIONAL','DEMO_INTERNATIONAL'];
const fail=(condition,message,code='INVALID_DELIVERY')=>{if(!condition)throw new DomainError(message,code);};
const digest=(...parts)=>createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0,32);
const signature=command=>JSON.stringify(Object.keys(command).filter(key=>key!=='requestId').sort().map(key=>[key,command[key]]));
const ceil=(a,b)=>Number((a+b-1n)/b);
const preaccept=status=>['PENDING_QUOTE','QUOTED'].includes(status);
const integer=(value,min,max)=>Number.isSafeInteger(value)&&value>=min&&value<=max;
function key(command){fail(typeof command.requestId==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(command.requestId)&&!['__proto__','constructor','prototype'].includes(command.requestId),'Identificador de operación inválido.');}
function numeric(value,min,max,label){fail(typeof value==='string'&&/^(?:0|[1-9]\d{0,4})$/.test(value),`${label} inválido.`);const number=Number(value);fail(integer(number,min,max),`${label} fuera de límites.`);return number;}
function amount(value){
  fail(typeof value==='string'&&/^\d{1,7}(?:\.\d{1,2})?$/.test(value),'Importe de coste DEMO inválido.');
  const parsed=/^0+(?:\.0{1,2})?$/.test(value)?0:parseMoney(value);
  fail(parsed<=100_000_000,'Coste DEMO fuera de límites.');return parsed;
}
function reason(value){fail(typeof value==='string'&&value.trim().length>=3&&value.trim().length<=160,'Motivo DEMO de 3 a 160 caracteres requerido.');return value.trim();}
function balances(state){return {walletMinor:{...state.walletMinor},holdingsMg:{...state.holdingsMg},reservedMg:Object.fromEntries(Object.keys(METALS).map(metal=>[metal,state.holdingsMg[metal]-availableHoldingMg(state,metal)]))};}
function event(request,status,at,label){request.status=status;request.timeline=[...(request.timeline??[{status:'PENDING_QUOTE',at:request.createdAt,label:'Solicitud DEMO anterior conservada'}]),{status,at,label}];}
function history(state,receipt,receiptSignature){
  state.movements.unshift({id:`mov-${state.sequence++}`,type:receipt.action.toUpperCase(),label:receipt.label,metal:receipt.metal,mg:receipt.mg,deliveryId:receipt.deliveryId,at:receipt.at});state.movements=state.movements.slice(0,100);
  const completed={...receipt,balancesAfter:balances(state)};state.receipts[receipt.id]=copy(completed);state.signatures[receipt.id]=receiptSignature;return completed;
}
export function ensureDelivery(mine){
  const next=copy(mine);let changed=false;
  if(!Object.hasOwn(next,'delivery')){
    next.delivery={version:1,policyVersion:1,quoteValidityHours:24,jurisdictions:jurisdictions.map((id,index)=>({id,label:`Jurisdicción DEMO ${['A','B','C'][index]}`,taxBps:[0,500,1000][index],serviceMinor:200,preparationMinor:300,transportMinor:[500,1500,3000][index],insuranceBps:[0,50,100][index],requirements:['Usar exclusivamente alias e identificadores ficticios','Confirmar que no se enviará metal ni se aportará una dirección real'],demoOnly:true})),audit:[]};changed=true;
  }
  const config=next.delivery;
  fail(config?.version===1&&integer(config.policyVersion,1,1_000_000_000)&&integer(config.quoteValidityHours,1,168)&&Array.isArray(config.audit),'Configuración de entregas DEMO inválida.');
  fail(Array.isArray(config.jurisdictions)&&config.jurisdictions.length===jurisdictions.length&&new Set(config.jurisdictions.map(policy=>policy.id)).size===jurisdictions.length,'Jurisdicciones DEMO inválidas.');
  for(const policy of config.jurisdictions){
    fail(jurisdictions.includes(policy.id)&&typeof policy.label==='string'&&policy.label.length>=3&&policy.label.length<=80&&policy.demoOnly===true,'Jurisdicción DEMO inválida.');
    fail(integer(policy.taxBps,0,10000)&&integer(policy.insuranceBps,0,10000)&&['serviceMinor','preparationMinor','transportMinor'].every(field=>integer(policy[field],0,100_000_000)),'Costes de jurisdicción DEMO inválidos.');
    fail(Array.isArray(policy.requirements)&&policy.requirements.length>=1&&policy.requirements.length<=8&&policy.requirements.every(text=>typeof text==='string'&&text.length>=3&&text.length<=160),'Requisitos DEMO inválidos.');
  }
  for(const field of ['commandReceipts','commandSignatures'])if(!Object.hasOwn(next,field)){next[field]={};changed=true;}
  fail(next.commandReceipts&&typeof next.commandReceipts==='object'&&!Array.isArray(next.commandReceipts)&&next.commandSignatures&&typeof next.commandSignatures==='object'&&!Array.isArray(next.commandSignatures),'Comprobantes de comandos DEMO inválidos.');
  return {mine:next,changed};
}
export function deliveryQuote(mine,request,jurisdiction,quoteId,now=new Date().toISOString()){
  const policy=mine.delivery.jurisdictions.find(item=>item.id===jurisdiction);fail(policy,'Jurisdicción DEMO no disponible.');
  const metalValueMinor=ceil(BigInt(request.mg)*BigInt(mine.priceCentsPerGram[request.metal]),1000n);
  const insuranceMinor=ceil(BigInt(metalValueMinor)*BigInt(policy.insuranceBps),10000n);
  const subtotalMinor=policy.serviceMinor+policy.preparationMinor+policy.transportMinor+insuranceMinor;
  const taxMinor=ceil(BigInt(subtotalMinor)*BigInt(policy.taxBps),10000n),totalMinor=subtotalMinor+taxMinor;
  fail(Number.isSafeInteger(totalMinor)&&totalMinor>=0&&totalMinor<=MAX_MINOR,'Cotización DEMO fuera de límites.');
  return {id:quoteId,jurisdiction:{id:policy.id,label:policy.label},metalValueMinor,serviceMinor:policy.serviceMinor,preparationMinor:policy.preparationMinor,transportMinor:policy.transportMinor,insuranceMinor,taxMinor,subtotalMinor,totalMinor,taxBps:policy.taxBps,insuranceBps:policy.insuranceBps,currency:'USDT',requirements:copy(policy.requirements),createdAt:now,expiresAt:new Date(Date.parse(now)+mine.delivery.quoteValidityHours*3_600_000).toISOString(),policyVersion:mine.delivery.policyVersion,demoOnly:true};
}
function target(state,deliveryId){
  if(typeof deliveryId!=='string'||!/^delivery-\d{1,20}$/.test(deliveryId))throw accountError(400,'Identificador de entrega DEMO inválido.');
  const request=state.custodyRequests.find(item=>item.id===deliveryId);if(!request)throw accountError(404,'Solicitud DEMO no disponible.');return request;
}
export function applyBuyerDelivery(mine,account,command,now=new Date().toISOString()){
  key(command);const current=account.state;
  if(Object.hasOwn(current.receipts,command.requestId)){
    fail(current.signatures[command.requestId]===signature(command),'Identificador reutilizado con otros parámetros.');
    return {mine,state:current,receipt:{...copy(current.receipts[command.requestId]),replayed:true},changed:false};
  }
  fail(account.role==='buyer','Solo un comprador puede aceptar o rechazar una entrega DEMO.');
  fail(['delivery_accept','delivery_reject'].includes(command.action),'Acción de entrega DEMO inválida.');
  const state=copy(current),request=target(state,command.deliveryId);
  fail(preaccept(request.status),'La solicitud ya no permite aceptar o rechazar.','INVALID_DELIVERY_STATE');
  if(command.action==='delivery_accept'){
    fail(request.status==='QUOTED'&&request.quote&&command.quoteId===request.quote.id,'La cotización cambió; actualiza y revisa la vigente.','STALE_QUOTE');
    fail(Date.parse(request.quote.expiresAt)>Date.parse(now),'La cotización DEMO venció. Solicita otra cotización.','QUOTE_EXPIRED');
    fail(state.walletMinor.USDT>=request.quote.totalMinor,'USDT insuficiente para los costes DEMO.','INSUFFICIENT_BALANCE');
    state.walletMinor.USDT-=request.quote.totalMinor;request.paidMinor=request.quote.totalMinor;request.paidAt=now;request.acceptedQuoteId=request.quote.id;
    event(request,'APPROVED',now,'Comprador aceptó cotización y requisitos DEMO');
  }else event(request,'REJECTED',now,'Comprador rechazó la solicitud DEMO');
  const receipt=history(state,{id:command.requestId,action:command.action,status:'COMPLETED',at:now,demoOnly:true,mineId:mine.id,accountId:account.id,receiptVersion:2,
    metal:request.metal,mg:request.mg,deliveryId:request.id,deliveryStatus:request.status,delivery:copy(request),quote:request.quote?copy(request.quote):null,
    ...(command.action==='delivery_accept'?{currency:'USDT',totalMinor:request.paidMinor,requirementsAcknowledged:true}:{}),label:command.action==='delivery_accept'?'Cotización de entrega DEMO aceptada':'Solicitud de entrega DEMO rechazada'},signature(command));
  return {mine,state,receipt,changed:true};
}
export function operatorDeliveryReplay(mine,actor,command){
  key(command);const commandKey=`${actor.id}:${command.requestId}`;
  if(!Object.hasOwn(mine.commandReceipts,commandKey))return null;
  fail(mine.commandSignatures[commandKey]===signature(command),'Identificador reutilizado con otros parámetros.');
  return {...copy(mine.commandReceipts[commandKey]),replayed:true};
}
export function applyOperatorDelivery(mine,actor,buyer,command,now=new Date().toISOString()){
  key(command);let next=copy(mine),state=buyer?copy(buyer.state):null;
  let request,quote,deliveredLots;
  const common={id:command.requestId,action:command.action,status:'COMPLETED',at:now,demoOnly:true,mineId:mine.id,actor:{id:actor.id,alias:actor.alias},accountId:buyer?.id??actor.id,receiptVersion:2};
  let receipt;
  if(command.action==='delivery_config'){
    const policy=next.delivery.jurisdictions.find(item=>item.id===command.jurisdiction);fail(policy,'Jurisdicción DEMO no disponible.');
    const auditReason=reason(command.reason);fail(typeof command.label==='string'&&command.label.trim().length>=3&&command.label.trim().length<=80,'Etiqueta de jurisdicción DEMO inválida.');
    fail(typeof command.requirements==='string'&&command.requirements.length<=1288,'Requisitos DEMO inválidos.');
    const requirements=command.requirements.split(/\r?\n/).map(text=>text.trim()).filter(Boolean);fail(requirements.length>=1&&requirements.length<=8&&requirements.every(text=>text.length>=3&&text.length<=160),'Escribe de 1 a 8 requisitos DEMO de 3 a 160 caracteres.');
    Object.assign(policy,{label:command.label.trim(),taxBps:numeric(command.taxBps,0,10000,'Cargo jurisdiccional DEMO'),insuranceBps:numeric(command.insuranceBps,0,10000,'Seguro DEMO'),serviceMinor:amount(command.service),preparationMinor:amount(command.preparation),transportMinor:amount(command.transport),requirements});
    next.delivery.quoteValidityHours=numeric(command.quoteValidityHours,1,168,'Vigencia de cotización');next.delivery.policyVersion++;
    next.delivery.audit.push({id:command.requestId,at:now,actor:common.actor,jurisdiction:policy.id,reason:auditReason,policyVersion:next.delivery.policyVersion});
    receipt={...common,label:'Política de entrega DEMO actualizada',jurisdiction:policy.id,reason:auditReason,policy:copy(policy),quoteValidityHours:next.delivery.quoteValidityHours,policyVersion:next.delivery.policyVersion};
  }else{
    fail(buyer?.role==='buyer'&&buyer.mineId===mine.id,'Comprador DEMO no disponible en esta mina.');request=target(state,command.deliveryId);
    if(command.action==='delivery_quote'){
      fail(preaccept(request.status),'La solicitud no permite cotizar.','INVALID_DELIVERY_STATE');
      quote=deliveryQuote(next,request,command.jurisdiction,`quote-${digest(actor.id,command.requestId)}`,now);
      request.quote=copy(quote);request.jurisdiction=command.jurisdiction;event(request,'QUOTED',now,'Operador preparó una cotización DEMO');
      receipt={...common,label:'Cotización de entrega DEMO preparada',quote:copy(quote)};
    }else{
      fail(command.action==='delivery_transition','Acción de entrega DEMO inválida.');const transitionReason=reason(command.reason);
      const transitions={APPROVED:'PREPARING',PREPARING:'DISPATCHED_DEMO',DISPATCHED_DEMO:'DELIVERED_DEMO'};
      fail(command.status==='REJECTED'?preaccept(request.status):transitions[request.status]===command.status,'Transición de entrega DEMO no permitida.','INVALID_DELIVERY_STATE');
      event(request,command.status,now,`Operador: ${transitionReason}`);
      if(command.status==='DELIVERED_DEMO'){
        state.holdingsMg[request.metal]-=request.mg;fail(availableHoldingMg(state,request.metal)>=0,'La entrega excede los gramos asignados.');
        ({mine:next,deliveredLots}=deliverCustody(next,buyer.id,request.metal,request.mg));request.deliveredLots=copy(deliveredLots);request.deliveredAt=now;
      }
      receipt={...common,label:`Entrega DEMO: ${command.status}`,reason:transitionReason,quote:request.quote?copy(request.quote):null,...(deliveredLots?{deliveredLots}: {})};
    }
    receipt={...receipt,metal:request.metal,mg:request.mg,deliveryId:request.id,deliveryStatus:request.status,delivery:copy(request)};
    const buyerReceipt={...receipt,id:`delivery-command-${digest(actor.id,command.requestId)}`};
    fail(!Object.hasOwn(state.receipts,buyerReceipt.id),'El identificador del comprobante de entrega DEMO ya existe.','RECEIPT_CONFLICT');
    history(state,buyerReceipt,JSON.stringify([['operatorCommand',actor.id],['requestId',command.requestId]]));
  }
  const commandKey=`${actor.id}:${command.requestId}`;next.commandReceipts[commandKey]=copy(receipt);next.commandSignatures[commandKey]=signature(command);
  return {mine:next,state,receipt,changed:true};
}
export function deliveryView(mine,accounts,viewer){
  const operator=viewer.role==='operator';
  const requests=accounts.filter(account=>account.role==='buyer'&&(operator||account.id===viewer.id)).flatMap(account=>account.state.custodyRequests.map(request=>({...copy(request),account:{id:account.id,alias:account.alias},jurisdiction:request.jurisdiction??'DEMO_LOCAL',quote:request.quote??null,timeline:request.timeline??[{status:'PENDING_QUOTE',at:request.createdAt,label:'Solicitud DEMO anterior conservada'}],paidMinor:request.paidMinor??0,demoOnly:true}))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.account.id.localeCompare(b.account.id)||a.id.localeCompare(b.id));
  return {demoOnly:true,disclaimer:DELIVERY_DISCLAIMER,mine:{id:mine.id,name:mine.name},view:operator?'operator':'buyer',currency:'USDT',availableMg:operator?copy(mine.inventoryMg):Object.fromEntries(Object.keys(METALS).map(metal=>[metal,availableHoldingMg(viewer.state,metal)])),
    policies:{version:mine.delivery.policyVersion,quoteValidityHours:mine.delivery.quoteValidityHours,jurisdictions:copy(mine.delivery.jurisdictions)},requests,audit:operator?copy(mine.delivery.audit).reverse():[]};
}
