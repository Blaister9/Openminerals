import {createHash} from 'node:crypto';
import {DomainError,METALS,parseGrams} from './domain.js';
import {accountError} from './account-auth.js';

// This is a simulated allocation record, never proof of physical custody.
export const CUSTODY_DISCLAIMER='SIMULADO · Lotes, documentos y certificados DEMO sin valor legal. No acreditan metal, propiedad ni custodia física.';
const metals=Object.keys(METALS),copy=value=>structuredClone(value);
const id=(prefix,...parts)=>`${prefix}-${createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0,32)}`;
const fail=(condition,message='La asignación de custodia DEMO no concuerda.')=>{if(!condition)throw new DomainError(message,'INVALID_CUSTODY');};
const integer=value=>Number.isSafeInteger(value)&&value>=0&&value<=1_000_000_000;
const record=fn=>Object.fromEntries(metals.map(metal=>[metal,fn(metal)]));
const has=(object,key)=>Object.hasOwn(object,key);
const delivered=lot=>has(lot,'deliveredMg')?lot.deliveredMg:0;
const defaultPurity={XAU:9999,XAG:9990,XPT:9995,XPD:9995};
const documentKinds=['DEMO_ASSAY','DEMO_ORIGIN','DEMO_RECORD'];

export function stockMetadata(command){
  const metadata={};
  if(has(command,'purityBps')){
    const purityBps=typeof command.purityBps==='string'&&/^[1-9]\d{0,4}$/.test(command.purityBps)?Number(command.purityBps):command.purityBps;
    fail(Number.isSafeInteger(purityBps)&&purityBps>0&&purityBps<=10000,'Pureza DEMO inválida.');
    metadata.purityBps=purityBps;
  }
  if(has(command,'location')){
    fail(typeof command.location==='string'&&command.location.trim().length>=3&&command.location.trim().length<=120,'Ubicación DEMO inválida.');
    metadata.location=command.location.trim();
  }
  const simpleDocument=has(command,'documentTitle')||has(command,'documentContent');
  fail(!(simpleDocument&&has(command,'documents')),'Usa un único formato de documentos DEMO.');
  if(simpleDocument)fail(has(command,'documentTitle')&&has(command,'documentContent'),'Completa título y contenido del documento DEMO.');
  if(has(command,'documents')||simpleDocument){
    const documents=simpleDocument?[{title:command.documentTitle,kind:'DEMO_RECORD',content:command.documentContent}]:command.documents;
    fail(Array.isArray(documents)&&documents.length<=8,'Documentos DEMO inválidos.');
    metadata.documents=documents.map(document=>{
      fail(document&&typeof document==='object'&&!Array.isArray(document)&&Object.keys(document).every(key=>['title','kind','content'].includes(key)),'Documento DEMO inválido.');
      fail(typeof document.title==='string'&&document.title.trim().length>=3&&document.title.trim().length<=100,'Título de documento DEMO inválido.');
      fail(documentKinds.includes(document.kind),'Tipo de documento DEMO inválido.');
      fail(typeof document.content==='string'&&document.content.trim().length>=3&&document.content.trim().length<=2000,'Contenido de documento DEMO inválido.');
      return {title:document.title.trim(),kind:document.kind,content:document.content.trim()};
    });
  }
  return metadata;
}

function makeLot(mine,metal,weightMg,source,metadata={},createdAt=new Date().toISOString()){
  const lotId=id('lot',mine.id,metal,source);
  const documents=(metadata.documents?.length?metadata.documents:[
    {title:'Registro ilustrativo DEMO',kind:'DEMO_RECORD',content:'Registro sintético de demostración. No representa ensayo, recepción física, título de propiedad ni reserva auditada.'},
  ]).map((document,index)=>({id:id('document',lotId,index),...document,demoOnly:true}));
  return {id:lotId,metal,purityBps:metadata.purityBps??defaultPurity[metal],weightMg,deliveredMg:0,
    location:`DEMO · ${metadata.location??'Bóveda ilustrativa sin ubicación física'}`,status:'REGISTERED_DEMO',documents,createdAt,demoOnly:true};
}

export function allocateCustody(mine,account,metal,mg,source,now=new Date().toISOString()){
  const next=copy(mine),created=[];
  fail(integer(mg)&&has(METALS,metal));
  let remaining=mg;
  for(const lot of next.custody.lots.filter(lot=>lot.metal===metal)){
    if(!remaining)break;
    const allocated=next.custody.allocations.filter(allocation=>allocation.lotId===lot.id).reduce((sum,allocation)=>sum+allocation.mg,0);
    const amount=Math.min(remaining,lot.weightMg-delivered(lot)-allocated);
    if(amount<=0)continue;
    const allocationId=id('allocation',account.id,lot.id,source),certificateId=id('certificate',allocationId);
    fail(!next.custody.allocations.some(allocation=>allocation.id===allocationId),'La asignación DEMO ya existe.');
    const allocation={id:allocationId,lotId:lot.id,accountId:account.id,metal,mg:amount,certificateId,createdAt:now};
    next.custody.allocations.push(allocation);
    next.custody.certificates.push({id:certificateId,allocationId,issuedMg:amount,issuedAt:now,demoOnly:true});
    created.push(allocation);remaining-=amount;
  }
  fail(remaining===0,'No hay capacidad de lotes DEMO para asignar los gramos.');
  return {mine:next,allocations:copy(created)};
}

export function releaseCustody(mine,accountId,metal,mg){
  const next=copy(mine);let remaining=mg;
  fail(integer(mg)&&has(METALS,metal));
  for(const allocation of next.custody.allocations){
    if(allocation.accountId!==accountId||allocation.metal!==metal||!remaining)continue;
    const released=Math.min(allocation.mg,remaining);allocation.mg-=released;remaining-=released;
  }
  fail(remaining===0,'La posición no tiene asignación DEMO suficiente para vender.');
  return next;
}

// A marketplace transfer preserves the seller's exact source lots. It must not
// allocate unrelated free inventory, since no grams enter or leave the mine.
export function transferCustody(mine,sellerId,buyer,metal,mg,source,now){
  const next=copy(mine),pieces=[];let remaining=mg;
  fail(integer(mg)&&has(METALS,metal)&&sellerId!==buyer.id);
  for(const allocation of next.custody.allocations){
    if(allocation.accountId!==sellerId||allocation.metal!==metal||!remaining)continue;
    const amount=Math.min(allocation.mg,remaining);if(!amount)continue;
    allocation.mg-=amount;remaining-=amount;pieces.push({lotId:allocation.lotId,sourceId:allocation.id,mg:amount});
  }
  fail(remaining===0,'La oferta no tiene asignaciones de lote DEMO suficientes.');
  const created=pieces.map(piece=>{
    const allocationId=id('allocation',buyer.id,piece.lotId,source,piece.sourceId),certificateId=id('certificate',allocationId);
    fail(!next.custody.allocations.some(allocation=>allocation.id===allocationId),'La transferencia de lote DEMO ya existe.');
    const allocation={id:allocationId,lotId:piece.lotId,accountId:buyer.id,metal,mg:piece.mg,certificateId,createdAt:now};
    next.custody.allocations.push(allocation);next.custody.certificates.push({id:certificateId,allocationId,issuedMg:piece.mg,issuedAt:now,demoOnly:true});
    return allocation;
  });
  return {mine:next,allocations:copy(created)};
}

export function deliverCustody(mine,accountId,metal,mg){
  const next=copy(mine),pieces=[];let remaining=mg;
  fail(integer(mg)&&has(METALS,metal));
  for(const allocation of next.custody.allocations){
    if(allocation.accountId!==accountId||allocation.metal!==metal||!remaining)continue;
    const amount=Math.min(allocation.mg,remaining);if(!amount)continue;
    const lot=next.custody.lots.find(item=>item.id===allocation.lotId);
    allocation.mg-=amount;lot.deliveredMg=delivered(lot)+amount;remaining-=amount;
    pieces.push({lotId:lot.id,mg:amount});
  }
  fail(remaining===0,'La entrega no tiene asignaciones de lote DEMO suficientes.');
  next.totalSupplyMg[metal]-=mg;
  return {mine:next,deliveredLots:pieces};
}

export function addStockLot(mine,command,now){
  const next=copy(mine),lot=makeLot(mine,command.metal,parseGrams(command.grams),`stock:${command.requestId}`,stockMetadata(command),now);
  fail(!next.custody.lots.some(existing=>existing.id===lot.id),'El lote DEMO ya existe.');
  next.custody.lots.push(lot);return {mine:next,lot:copy(lot)};
}

export function validateCustody(mine,accounts){
  const custody=mine.custody;
  fail(custody?.version===1&&Array.isArray(custody.lots)&&Array.isArray(custody.allocations)&&Array.isArray(custody.certificates),'Versión de custodia DEMO inválida.');
  const buyers=new Map(accounts.filter(account=>account.role==='buyer').map(account=>[account.id,account]));
  const lots=new Map(),allocations=new Map(),certificates=new Map();
  for(const lot of custody.lots){
    fail(typeof lot.id==='string'&&!lots.has(lot.id)&&has(METALS,lot.metal)&&integer(lot.weightMg)&&lot.weightMg>0);
    fail(integer(delivered(lot))&&delivered(lot)<=lot.weightMg);
    fail(Number.isSafeInteger(lot.purityBps)&&lot.purityBps>0&&lot.purityBps<=10000&&typeof lot.location==='string'&&lot.location.startsWith('DEMO · ')&&lot.status==='REGISTERED_DEMO'&&lot.demoOnly===true);
    fail(Array.isArray(lot.documents)&&lot.documents.length>0&&lot.documents.every(document=>document.demoOnly===true&&documentKinds.includes(document.kind)&&typeof document.id==='string'&&typeof document.title==='string'&&typeof document.content==='string'));
    lots.set(lot.id,lot);
  }
  for(const allocation of custody.allocations){
    const lot=lots.get(allocation.lotId);
    fail(typeof allocation.id==='string'&&!allocations.has(allocation.id)&&lot&&buyers.has(allocation.accountId)&&allocation.metal===lot.metal&&integer(allocation.mg));
    allocations.set(allocation.id,allocation);
  }
  for(const certificate of custody.certificates){
    const allocation=allocations.get(certificate.allocationId);
    fail(typeof certificate.id==='string'&&!certificates.has(certificate.id)&&allocation&&allocation.certificateId===certificate.id&&integer(certificate.issuedMg)&&certificate.issuedMg>0&&allocation.mg<=certificate.issuedMg&&certificate.demoOnly===true);
    certificates.set(certificate.id,certificate);
  }
  fail(custody.certificates.length===custody.allocations.length);
  for(const allocation of custody.allocations)fail(certificates.has(allocation.certificateId));
  for(const lot of custody.lots)fail(custody.allocations.filter(allocation=>allocation.lotId===lot.id).reduce((sum,allocation)=>sum+allocation.mg,0)<=lot.weightMg-delivered(lot));
  for(const metal of metals){
    const total=custody.lots.filter(lot=>lot.metal===metal).reduce((sum,lot)=>sum+lot.weightMg-delivered(lot),0);
    const allocated=custody.allocations.filter(allocation=>allocation.metal===metal).reduce((sum,allocation)=>sum+allocation.mg,0);
    fail(integer(mine.totalSupplyMg?.[metal])&&integer(mine.inventoryMg?.[metal])&&total===mine.totalSupplyMg[metal]&&total-allocated===mine.inventoryMg[metal]);
    for(const account of buyers.values()){
      const assigned=custody.allocations.filter(allocation=>allocation.accountId===account.id&&allocation.metal===metal).reduce((sum,allocation)=>sum+allocation.mg,0);
      fail(integer(account.state.holdingsMg?.[metal])&&assigned===account.state.holdingsMg[metal]);
    }
  }
  return true;
}

// Run only while the mine row is locked. No old state or receipt is rewritten.
export function ensureCustody(mine,accounts,now=new Date().toISOString()){
  if(has(mine,'custody')){
    validateCustody(mine,accounts);
    if(mine.custody.lots.every(lot=>has(lot,'deliveredMg')))return {mine,changed:false};
    const upgraded=copy(mine);for(const lot of upgraded.custody.lots)if(!has(lot,'deliveredMg'))lot.deliveredMg=0;
    return {mine:upgraded,changed:true};
  }
  let next=copy(mine);const buyers=accounts.filter(account=>account.role==='buyer').sort((a,b)=>a.id.localeCompare(b.id));
  for(const metal of metals){
    const allocated=buyers.reduce((sum,account)=>{fail(integer(account.state.holdingsMg?.[metal]));return sum+account.state.holdingsMg[metal];},0);
    fail(integer(mine.inventoryMg?.[metal])&&integer(mine.totalSupplyMg?.[metal])&&mine.inventoryMg[metal]+allocated===mine.totalSupplyMg[metal],'No se puede migrar custodia DEMO: el inventario y las posiciones anteriores no concuerdan.');
  }
  next.custody={version:1,lots:metals.filter(metal=>mine.totalSupplyMg[metal]>0).map(metal=>makeLot(mine,metal,mine.totalSupplyMg[metal],'migration',{},now)),allocations:[],certificates:[],migratedAt:now};
  for(const account of buyers)for(const metal of metals){
    const mg=account.state.holdingsMg[metal];if(mg)({mine:next}=allocateCustody(next,account,metal,mg,'migration',now));
  }
  validateCustody(next,accounts);return {mine:next,changed:true};
}

function lotView(lot,custody,accountId){
  const all=custody.allocations.filter(allocation=>allocation.lotId===lot.id);
  const allocatedMg=all.filter(allocation=>!accountId||allocation.accountId===accountId).reduce((sum,allocation)=>sum+allocation.mg,0);
  const deliveredMg=delivered(lot),activeWeightMg=lot.weightMg-deliveredMg;
  return {...copy(lot),originalWeightMg:lot.weightMg,deliveredMg,activeWeightMg,purity:`${(lot.purityBps/100).toFixed(2)}% DEMO`,allocatedMg,availableMg:activeWeightMg-all.reduce((sum,allocation)=>sum+allocation.mg,0)};
}
export function custodyView(mine,accounts,viewer){
  validateCustody(mine,accounts);
  const operator=viewer.role==='operator',accountMap=new Map(accounts.map(account=>[account.id,account]));
  const selected=mine.custody.allocations.filter(allocation=>operator||allocation.accountId===viewer.id);
  const lots=mine.custody.lots.filter(lot=>operator||selected.some(allocation=>allocation.lotId===lot.id)).map(lot=>lotView(lot,mine.custody,operator?undefined:viewer.id));
  const allocations=selected.map(allocation=>{const account=accountMap.get(allocation.accountId);const {accountId,...rest}=copy(allocation);return {...rest,account:{id:account.id,alias:account.alias},status:allocation.mg>0?'ACTIVE':'RELEASED',demoOnly:true};});
  return {demoOnly:true,disclaimer:CUSTODY_DISCLAIMER,mine:{id:mine.id,name:mine.name},view:operator?'operator':'buyer',lots,allocations,
    totals:record(metal=>({weightMg:lots.filter(lot=>lot.metal===metal).reduce((sum,lot)=>sum+lot.weightMg,0),deliveredMg:lots.filter(lot=>lot.metal===metal).reduce((sum,lot)=>sum+lot.deliveredMg,0),activeWeightMg:lots.filter(lot=>lot.metal===metal).reduce((sum,lot)=>sum+lot.activeWeightMg,0),allocatedMg:allocations.filter(allocation=>allocation.metal===metal).reduce((sum,allocation)=>sum+allocation.mg,0),availableMg:lots.filter(lot=>lot.metal===metal).reduce((sum,lot)=>sum+lot.availableMg,0)}))};
}
export function custodyCertificate(mine,accounts,viewer,certificateId){
  validateCustody(mine,accounts);
  const certificate=mine.custody.certificates.find(item=>item.id===certificateId);
  const allocation=certificate&&mine.custody.allocations.find(item=>item.id===certificate.allocationId);
  if(!allocation||(viewer.role!=='operator'&&allocation.accountId!==viewer.id))throw accountError(404,'Certificado DEMO no disponible.');
  const account=accounts.find(item=>item.id===allocation.accountId),lot=mine.custody.lots.find(item=>item.id===allocation.lotId);
  return {id:certificate.id,demoOnly:true,label:'CERTIFICADO DEMO — SIN VALOR LEGAL',disclaimer:CUSTODY_DISCLAIMER,mine:{id:mine.id,name:mine.name},account:{id:account.id,alias:account.alias},
    lot:lotView(lot,mine.custody,viewer.role==='operator'?undefined:viewer.id),issuedMg:certificate.issuedMg,allocatedMg:allocation.mg,status:allocation.mg===0?'RELEASED':allocation.mg===certificate.issuedMg?'ACTIVE':'PARTIALLY_RELEASED',issuedAt:certificate.issuedAt,verifyPath:`/api/demo/certificates/${certificate.id}`};
}
