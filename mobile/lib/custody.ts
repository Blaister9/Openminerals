export type CustodyMetal='XAU'|'XAG'|'XPT'|'XPD';
export type CustodyDocument={id:string;title:string;kind:'DEMO_ASSAY'|'DEMO_ORIGIN'|'DEMO_RECORD';content:string;demoOnly:true};
export type CustodyLot={
  id:string;metal:CustodyMetal;purityBps:number;purity:string;weightMg:number;originalWeightMg:number;deliveredMg:number;activeWeightMg:number;location:string;
  status:'REGISTERED_DEMO';documents:CustodyDocument[];allocatedMg:number;availableMg:number;demoOnly:true;
};
export type CustodyAllocation={
  id:string;lotId:string;account:{id:string;alias:string};metal:CustodyMetal;mg:number;certificateId:string;
  createdAt:string;status:'ACTIVE'|'RELEASED';demoOnly:true;
};
export type CustodySummary={
  demoOnly:true;disclaimer:string;mine:{id:string;name:string};view:'buyer'|'operator';
  lots:CustodyLot[];allocations:CustodyAllocation[];
  totals:Record<CustodyMetal,{weightMg:number;deliveredMg:number;activeWeightMg:number;allocatedMg:number;availableMg:number}>;
};
export type CustodyCertificate={
  id:string;demoOnly:true;label:string;disclaimer:string;mine:{id:string;name:string};account:{id:string;alias:string};
  lot:CustodyLot;issuedMg:number;allocatedMg:number;status:'ACTIVE'|'PARTIALLY_RELEASED'|'RELEASED';issuedAt:string;verifyPath:string;
};
type RecordValue=Record<string,unknown>;
const names:Record<CustodyMetal,string>={XAU:'Oro',XAG:'Plata',XPT:'Platino',XPD:'Paladio'};
export const custodyMetals=Object.keys(names) as CustodyMetal[];
const invalid=()=>new Error('La respuesta de custodia demo está incompleta. Actualiza para volver a consultarla.');
function object(value:unknown):RecordValue {
  if(!value||typeof value!=='object'||Array.isArray(value))throw invalid();
  return value as RecordValue;
}
function text(value:unknown,max=500):string {
  if(typeof value!=='string'||!value.trim()||value.length>max)throw invalid();
  return value;
}
function id(value:unknown):string {
  if(typeof value!=='string'||!validCertificateId(value))throw invalid();
  return value;
}
function number(value:unknown):number {
  if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw invalid();
  return value;
}
function date(value:unknown):string {
  if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw invalid();
  return value;
}
function demo(value:RecordValue){if(value.demoOnly!==true)throw invalid();}
function metal(value:unknown):CustodyMetal {
  if(typeof value!=='string'||!Object.hasOwn(names,value))throw invalid();
  return value as CustodyMetal;
}
function list<T>(value:unknown,parse:(entry:unknown)=>T):T[] {
  if(!Array.isArray(value))throw invalid();
  return value.map(parse);
}
function mine(value:unknown){const item=object(value);return {id:id(item.id),name:text(item.name,200)};}
function account(value:unknown){const item=object(value);return {id:id(item.id),alias:text(item.alias,40)};}
function document(value:unknown):CustodyDocument {
  const item=object(value);demo(item);
  if(!['DEMO_ASSAY','DEMO_ORIGIN','DEMO_RECORD'].includes(String(item.kind)))throw invalid();
  return {id:id(item.id),title:text(item.title,200),kind:item.kind as CustodyDocument['kind'],content:text(item.content,10000),demoOnly:true};
}
function quantities(item:RecordValue){
  const weightMg=number(item.weightMg),allocatedMg=number(item.allocatedMg),availableMg=number(item.availableMg);
  const hasDelivery=item.deliveredMg!==undefined||item.activeWeightMg!==undefined;
  const deliveredMg=hasDelivery?number(item.deliveredMg):0,activeWeightMg=hasDelivery?number(item.activeWeightMg):weightMg;
  // Buyer allocatedMg includes only that account. Other buyers' allocations
  // are intentionally omitted, so their visible figures need not sum to weight.
  if(deliveredMg+activeWeightMg!==weightMg||allocatedMg+availableMg>activeWeightMg)throw invalid();
  return {weightMg,deliveredMg,activeWeightMg,allocatedMg,availableMg};
}
function lot(value:unknown):CustodyLot {
  const item=object(value);demo(item);
  const purityBps=number(item.purityBps);
  if(purityBps<=0||purityBps>10000||item.status!=='REGISTERED_DEMO')throw invalid();
  const amounts=quantities(item),originalWeightMg=item.originalWeightMg===undefined?amounts.weightMg:number(item.originalWeightMg);
  if(originalWeightMg!==amounts.weightMg)throw invalid();
  return {id:id(item.id),metal:metal(item.metal),purityBps,purity:text(item.purity,80),...amounts,originalWeightMg,
    location:text(item.location,200),status:'REGISTERED_DEMO',documents:list(item.documents,document),demoOnly:true};
}
function allocation(value:unknown):CustodyAllocation {
  const item=object(value);demo(item);
  if(!['ACTIVE','RELEASED'].includes(String(item.status)))throw invalid();
  const mg=number(item.mg);
  if((item.status==='RELEASED'&&mg!==0)||(item.status==='ACTIVE'&&mg===0))throw invalid();
  return {id:id(item.id),lotId:id(item.lotId),account:account(item.account),metal:metal(item.metal),mg,
    certificateId:id(item.certificateId),createdAt:date(item.createdAt),status:item.status as CustodyAllocation['status'],demoOnly:true};
}
export function validCertificateId(value:string):boolean{return /^[A-Za-z0-9_-]{1,128}$/.test(value);}
export function certificatePath(value:string):string {
  const trimmed=value.trim();
  if(!validCertificateId(trimmed))throw new Error('Introduce el identificador de un certificado demo, sin espacios ni enlaces.');
  return `/api/demo/certificates/${encodeURIComponent(trimmed)}`;
}
export function parseCustodySummary(value:unknown,operator:boolean,accountId:string):CustodySummary {
  const item=object(value);demo(item);
  const view=operator?'operator':'buyer';
  if(item.view!==view)throw invalid();
  const lots=list(item.lots,lot),allocations=list(item.allocations,allocation);
  if(operator&&lots.some(entry=>entry.allocatedMg+entry.availableMg!==entry.activeWeightMg))throw invalid();
  const ids=new Set(lots.map(entry=>entry.id));
  if(ids.size!==lots.length||new Set(allocations.map(entry=>entry.id)).size!==allocations.length||
    allocations.some(entry=>!ids.has(entry.lotId)||lots.find(candidate=>candidate.id===entry.lotId)?.metal!==entry.metal||(!operator&&entry.account.id!==accountId)))throw invalid();
  const totals=object(item.totals);
  const checkedTotals=Object.fromEntries(custodyMetals.map(key=>[key,quantities(object(totals[key]))])) as CustodySummary['totals'];
  if(operator&&custodyMetals.some(key=>checkedTotals[key].allocatedMg+checkedTotals[key].availableMg!==checkedTotals[key].activeWeightMg))throw invalid();
  return {demoOnly:true,disclaimer:text(item.disclaimer,2000),mine:mine(item.mine),view,lots,allocations,totals:checkedTotals};
}
export function parseCustodyCertificate(value:unknown,requestedId:string,operator:boolean,accountId:string):CustodyCertificate {
  const item=object(value);demo(item);
  if(item.id!==requestedId||!['ACTIVE','PARTIALLY_RELEASED','RELEASED'].includes(String(item.status)))throw invalid();
  const owner=account(item.account),issuedMg=number(item.issuedMg),allocatedMg=number(item.allocatedMg);
  if((!operator&&owner.id!==accountId)||issuedMg===0||allocatedMg>issuedMg||
    (item.status==='RELEASED'&&allocatedMg!==0)||(item.status==='ACTIVE'&&allocatedMg!==issuedMg)||
    (item.status==='PARTIALLY_RELEASED'&&(allocatedMg===0||allocatedMg===issuedMg))||item.verifyPath!==certificatePath(requestedId))throw invalid();
  return {id:id(item.id),demoOnly:true,label:text(item.label,200),disclaimer:text(item.disclaimer,2000),mine:mine(item.mine),
    account:owner,lot:lot(item.lot),issuedMg,allocatedMg,status:item.status as CustodyCertificate['status'],issuedAt:date(item.issuedAt),verifyPath:item.verifyPath as string};
}
export function custodyMetalName(value:CustodyMetal):string{return names[value];}
export function custodyGrams(value:number):string {
  return `${(value/1000).toLocaleString('es-CO',{minimumFractionDigits:3,maximumFractionDigits:3})} g`;
}
export function custodyStatus(value:CustodyCertificate['status']|CustodyLot['status']):string {
  return {REGISTERED_DEMO:'Lote registrado en la demo',ACTIVE:'Asignación activa',PARTIALLY_RELEASED:'Asignación parcialmente liberada',RELEASED:'Asignación liberada'}[value];
}
export function custodyDocumentKind(value:CustodyDocument['kind']):string {
  return {DEMO_ASSAY:'Ensayo ficticio',DEMO_ORIGIN:'Origen ficticio',DEMO_RECORD:'Registro ficticio'}[value];
}
