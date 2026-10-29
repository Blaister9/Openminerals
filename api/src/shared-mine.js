import {METALS,DEMO_RATES,DomainError,seedState,applyCommand,parseGrams,deliveryIsActive} from './domain.js';
import {stockMetadata} from './custody.js';

export const DEFAULT_MINE_ID='openminerals-demo-v1';
const MAX_MG=1_000_000_000;
const metals=Object.keys(METALS);
const copy=value=>structuredClone(value);
const fail=(condition,message,code='INVALID_MINE_STATE')=>{
  if(!condition)throw new DomainError(message,code);
};
const validMg=value=>Number.isSafeInteger(value)&&value>=0&&value<=MAX_MG;
const record=fn=>Object.fromEntries(metals.map(m=>[m,fn(m)]));
const newest=(a,b)=>a.at===b.at?(a.id===b.id?0:a.id>b.id?-1:1):a.at>b.at?-1:1;

// The operator can inspect mine operations, without seeing a buyer's private
// wallet or unrelated positions. Stored receipts remain unchanged.
export function operatorReceiptView(receipt){
  const result=copy(receipt);
  delete result.balancesAfter;
  return {...result,operatorView:true};
}

export function seedMine(id=DEFAULT_MINE_ID,name='Mina de demostración'){
  fail(typeof id==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(id),'Mina de demostración inválida');
  fail(typeof name==='string'&&name.trim().length>0&&name.trim().length<=80,'Nombre de mina inválido');
  return {
    id,name:name.trim(),demoOnly:true,
    inventoryMg:record(m=>METALS[m].inventoryMg),
    totalSupplyMg:record(m=>METALS[m].inventoryMg),
    priceCentsPerGram:record(m=>METALS[m].quoteCentsPerGram),
    demoRates:copy(DEMO_RATES),feesBps:copy(seedState().feesBps),
    stockReceipts:{},stockSignatures:{},
  };
}

function validateMine(mine){
  fail(mine&&typeof mine.id==='string','Mina de demostración inválida');
  for(const m of metals){
    fail(validMg(mine.inventoryMg?.[m])&&validMg(mine.totalSupplyMg?.[m])&&
      mine.inventoryMg[m]<=mine.totalSupplyMg[m],'Inventario de demostración inconsistente');
  }
}

export function accountStateForMine(state,mine){
  validateMine(mine);
  return {...copy(state),inventoryMg:copy(mine.inventoryMg),
    priceCentsPerGram:copy(mine.priceCentsPerGram),demoRates:copy(mine.demoRates),feesBps:copy(mine.feesBps)};
}

// Preserve the original session. Its allocation is debited exactly once by the
// transactional store, which also claims that legacy session exclusively.
export function importLegacyState(legacy,mine){
  validateMine(mine);
  const next=copy(mine);
  for(const m of metals){
    const mg=legacy.holdingsMg?.[m];
    fail(validMg(mg),'La posición anterior no es válida para vincularla');
    fail(mg<=next.inventoryMg[m],
      'No hay inventario demo disponible para vincular todos tus metales. Tu sesión anterior no cambió.',
      'INSUFFICIENT_INVENTORY');
    next.inventoryMg[m]-=mg;
  }
  return {state:accountStateForMine(legacy,next),mine:next};
}

export function applyAccountCommand(state,mine,command,{accountId}={}){
  validateMine(mine);
  fail(typeof accountId==='string'&&accountId.length>0,'Cuenta de demostración inválida');
  const result=applyCommand(accountStateForMine(state,mine),command);
  const nextMine=copy(mine);
  if(!result.changed)return {...result,mine:nextMine};
  nextMine.inventoryMg=copy(result.state.inventoryMg);
  validateMine(nextMine);
  const receipt={...result.receipt,mineId:mine.id,accountId};
  result.state.receipts[command.requestId]=copy(receipt);
  return {state:result.state,mine:nextMine,receipt:copy(receipt),changed:true};
}

export function applyStockCommand(mine,command,{accountId,alias}={},now=new Date().toISOString()){
  validateMine(mine);
  const {metal,grams,reason,requestId}=command;
  fail(typeof requestId==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(requestId)&&
    !['__proto__','constructor','prototype'].includes(requestId),'Identificador de operación inválido','INVALID_OPERATION');
  fail(typeof accountId==='string'&&accountId.length>0&&typeof alias==='string','Operador inválido');
  fail(Object.hasOwn(METALS,metal),'Metal inválido','INVALID_OPERATION');
  fail(typeof reason==='string'&&reason.trim().length>=3&&reason.trim().length<=160,
    'Escribe un motivo ficticio de 3 a 160 caracteres','INVALID_OPERATION');
  const mg=parseGrams(grams);
  const metadata=stockMetadata(command);
  // Preserve signatures from 0.1.3 for commands that have no new metadata.
  const signature=JSON.stringify([metal,grams,reason,accountId,...(Object.keys(metadata).length?[metadata]:[])]);
  if(Object.hasOwn(mine.stockReceipts,requestId)){
    fail(mine.stockSignatures[requestId]===signature,
      'Identificador reutilizado con otros parámetros','INVALID_OPERATION');
    return {mine:copy(mine),receipt:{...copy(mine.stockReceipts[requestId]),replayed:true},changed:false};
  }
  const next=copy(mine);
  fail(next.totalSupplyMg[metal]+mg<=MAX_MG,'El ingreso supera el límite de la demostración','INVALID_OPERATION');
  next.inventoryMg[metal]+=mg;
  next.totalSupplyMg[metal]+=mg;
  const receipt={
    id:requestId,action:'stock',status:'COMPLETED',at:now,demoOnly:true,
    metal,mg,reason:reason.trim(),actor:{id:accountId,alias},
    inventoryAfterMg:copy(next.inventoryMg),totalSupplyAfterMg:copy(next.totalSupplyMg),
  };
  next.stockReceipts[requestId]=copy(receipt);
  next.stockSignatures[requestId]=signature;
  return {mine:next,receipt:copy(receipt),changed:true};
}

function reservations(state,metal){
  return state.offers.filter(o=>o.metal===metal&&o.status==='OPEN').reduce((n,o)=>n+o.mg,0)+
    state.custodyRequests.filter(d=>d.metal===metal&&deliveryIsActive(d.status)).reduce((n,d)=>n+d.mg,0);
}

export function summarizeMine(mine,accounts){
  validateMine(mine);
  const buyers=accounts.filter(a=>a.role==='buyer');
  const allocatedMg=record(m=>buyers.reduce((n,a)=>n+a.state.holdingsMg[m],0));
  const reservedMg=record(m=>buyers.reduce((n,a)=>n+reservations(a.state,m),0));
  for(const m of metals){
    fail(validMg(allocatedMg[m])&&validMg(reservedMg[m])&&reservedMg[m]<=allocatedMg[m]&&
      mine.inventoryMg[m]+allocatedMg[m]===mine.totalSupplyMg[m],
      'Los gramos del inventario compartido no concuerdan');
  }
  const allOperations=buyers.flatMap(a=>Object.values(a.state.receipts)
    .filter(r=>r.mineId===mine.id&&r.accountId===a.id)
    .map(receipt=>({account:{id:a.id,alias:a.alias},receipt:operatorReceiptView(receipt)})));
  const trades=allOperations.filter(o=>['buy','sell','market_buy'].includes(o.receipt.action));
  const fees=allOperations.filter(o=>['buy','sell','market_sell'].includes(o.receipt.action));
  const operations=allOperations.filter(o=>['buy','sell','offer','cancel_offer','delivery','cancel_delivery','market_buy','market_sell','delivery_quote','delivery_accept','delivery_reject','delivery_transition'].includes(o.receipt.action))
    .sort((a,b)=>newest(a.receipt,b.receipt)||b.account.id.localeCompare(a.account.id)).slice(0,20);
  const pendingOffers=buyers.flatMap(a=>a.state.offers.filter(o=>o.status==='OPEN')
    .map(offer=>({account:{id:a.id,alias:a.alias},offer:copy(offer)})));
  const pendingDeliveries=buyers.flatMap(a=>a.state.custodyRequests.filter(d=>deliveryIsActive(d.status))
    .map(delivery=>({account:{id:a.id,alias:a.alias},delivery:copy(delivery)})));
  return {
    mine:{id:mine.id,name:mine.name},demoOnly:true,reconciled:true,
    inventoryMg:copy(mine.inventoryMg),totalSupplyMg:copy(mine.totalSupplyMg),allocatedMg,reservedMg,
    accountCount:buyers.length,transactionCount:trades.length,
    demoFeesCollectedMinor:fees.reduce((n,o)=>n+(o.receipt.feeMinor||0),0),
    operations,offersOpen:pendingOffers.length,deliveriesPending:pendingDeliveries.length,
    pendingOffers:pendingOffers.slice(0,100),pendingDeliveries:pendingDeliveries.slice(0,100),
    stockAdjustments:Object.values(mine.stockReceipts).sort(newest).slice(0,20).map(copy),
  };
}
