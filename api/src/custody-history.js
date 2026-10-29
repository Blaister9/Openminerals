import {createHash} from 'node:crypto';
import {DomainError} from './domain.js';
import {accountError} from './account-auth.js';

export const LOT_HISTORY_KINDS=['OPENING_BALANCE','ALLOCATION_OPENING','LOT_REGISTERED','BUY','IMPORT','SELL','MARKET_TRANSFER','DELIVERY'];
const copy=value=>structuredClone(value),has=(value,key)=>Object.hasOwn(value,key);
const fail=(condition,message='El historial del lote DEMO no concuerda.')=>{if(!condition)throw new DomainError(message,'INVALID_CUSTODY_HISTORY');};
const amount=value=>Number.isSafeInteger(value)&&value>=0;
const validId=value=>typeof value==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(value);
const date=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
const eventId=(mine,sequence)=>`lot-move-${createHash('sha256').update(JSON.stringify([mine.id,sequence])).digest('hex').slice(0,32)}`;
const balances=(mine,lot)=>{
  const allocatedMg=mine.custody.allocations.filter(item=>item.lotId===lot.id).reduce((sum,item)=>sum+item.mg,0);
  const deliveredMg=lot.deliveredMg??0;
  return {originalWeightMg:lot.weightMg,deliveredMg,activeWeightMg:lot.weightMg-deliveredMg,allocatedMg,availableMg:lot.weightMg-deliveredMg-allocatedMg};
};
function sameBalances(left,right){return Object.keys(right).every(key=>left?.[key]===right[key]);}

// Called only on a transaction-local mine, after its lot/allocation mutation.
// The surrounding store's existing idempotency check runs before this helper.
export function recordLotMovement(mine,kind,lotId,mg,{at=new Date().toISOString(),accountId,counterpartyId,referenceId,references}={}){
  if(!mine.custody.history)return; // Initial legacy allocation precedes baseline.
  const history=mine.custody.history,lot=mine.custody.lots.find(item=>item.id===lotId);
  fail(lot&&LOT_HISTORY_KINDS.includes(kind)&&amount(mg)&&date(at));
  const sequence=history.nextSequence++;
  history.movements.push({id:eventId(mine,sequence),sequence,lotId,metal:lot.metal,kind,mg,at,
    ...(accountId?{accountId}:{}),...(counterpartyId?{counterpartyId}:{}),...(referenceId?{referenceId}:{}),
    ...(references?{references:copy(references)}:accountId&&referenceId?{references:[{accountId,id:referenceId}]}:{}),balancesAfter:balances(mine,lot)});
}

// Existing records have no trustworthy allocation/release chronology. Preserve
// them unchanged and declare an opening snapshot instead of inventing trades.
export function ensureLotHistory(mine,accounts,now){
  if(has(mine.custody,'history')){validateLotHistory(mine,accounts);return {mine,changed:false};}
  const next=copy(mine);
  next.custody.history={version:1,startedAt:now,earlierHistoryUnavailable:true,nextSequence:1,movements:[]};
  for(const lot of next.custody.lots){
    recordLotMovement(next,'OPENING_BALANCE',lot.id,lot.weightMg,{at:now});
    const assigned=new Map();
    for(const allocation of next.custody.allocations.filter(item=>item.lotId===lot.id))assigned.set(allocation.accountId,(assigned.get(allocation.accountId)??0)+allocation.mg);
    for(const [accountId,mg] of assigned)recordLotMovement(next,'ALLOCATION_OPENING',lot.id,mg,{at:now,accountId});
  }
  validateLotHistory(next,accounts);return {mine:next,changed:true};
}

export function validateLotHistory(mine,accounts){
  if(!has(mine.custody,'history'))return true;
  const history=mine.custody.history,lots=new Map(mine.custody.lots.map(lot=>[lot.id,lot]));
  const buyers=new Set(accounts.filter(account=>account.role==='buyer').map(account=>account.id));
  fail(history?.version===1&&date(history.startedAt)&&history.earlierHistoryUnavailable===true&&Array.isArray(history.movements)&&history.nextSequence===history.movements.length+1);
  const current=new Map(),positions=new Map();
  const change=(accountId,lotId,delta)=>{const key=JSON.stringify([accountId,lotId]),next=(positions.get(key)??0)+delta;fail(buyers.has(accountId)&&amount(next));positions.set(key,next);};
  for(const [index,event] of history.movements.entries()){
    const lot=lots.get(event.lotId),previous=current.get(event.lotId);
    fail(lot&&event.id===eventId(mine,index+1)&&event.sequence===index+1&&LOT_HISTORY_KINDS.includes(event.kind)&&event.metal===lot.metal&&amount(event.mg)&&date(event.at));
    if(event.referenceId!==undefined)fail(validId(event.referenceId));
    if(event.references!==undefined)fail(Array.isArray(event.references)&&event.references.every(item=>buyers.has(item.accountId)&&validId(item.id)));
    let expected;
    if(['OPENING_BALANCE','LOT_REGISTERED'].includes(event.kind)){
      fail(!previous&&!event.accountId&&!event.counterpartyId&&event.mg===lot.weightMg);
      expected=event.balancesAfter;
      if(event.kind==='LOT_REGISTERED')fail(expected.allocatedMg===0&&expected.deliveredMg===0);
    }else{
      fail(previous&&buyers.has(event.accountId));expected={...previous};
      if(event.kind==='ALLOCATION_OPENING')change(event.accountId,lot.id,event.mg);
      else if(['BUY','IMPORT'].includes(event.kind)){change(event.accountId,lot.id,event.mg);expected.allocatedMg+=event.mg;expected.availableMg-=event.mg;}
      else if(event.kind==='SELL'){change(event.accountId,lot.id,-event.mg);expected.allocatedMg-=event.mg;expected.availableMg+=event.mg;}
      else if(event.kind==='MARKET_TRANSFER'){
        fail(event.accountId!==event.counterpartyId&&buyers.has(event.counterpartyId));
        change(event.accountId,lot.id,-event.mg);change(event.counterpartyId,lot.id,event.mg);
      }else if(event.kind==='DELIVERY'){
        change(event.accountId,lot.id,-event.mg);expected.allocatedMg-=event.mg;expected.activeWeightMg-=event.mg;expected.deliveredMg+=event.mg;
      }
    }
    fail(expected&&Object.values(expected).every(amount)&&expected.originalWeightMg===lot.weightMg&&expected.activeWeightMg+expected.deliveredMg===expected.originalWeightMg&&expected.availableMg+expected.allocatedMg===expected.activeWeightMg&&sameBalances(event.balancesAfter,expected));
    current.set(lot.id,expected);
  }
  for(const lot of lots.values())fail(sameBalances(current.get(lot.id),balances(mine,lot)));
  for(const accountId of buyers)for(const lot of lots.values()){
    const assigned=mine.custody.allocations.filter(item=>item.accountId===accountId&&item.lotId===lot.id).reduce((sum,item)=>sum+item.mg,0);
    fail((positions.get(JSON.stringify([accountId,lot.id]))??0)===assigned);
  }
  return true;
}

export function parseLotHistoryQuery(params=new URLSearchParams()){
  const invalid=()=>accountError(400,'Parámetros de historial de lote DEMO inválidos.','INVALID_LOT_HISTORY_QUERY');
  for(const field of params.keys())if(!['limit','before'].includes(field)||params.getAll(field).length!==1)throw invalid();
  const limit=params.get('limit')??'20',before=params.get('before');
  if(!/^[1-9]\d?$/.test(limit)||Number(limit)>50||before!==null&&!/^lot-move-[a-f0-9]{32}$/.test(before))throw invalid();
  return {limit:Number(limit),before};
}

export function lotHistoryView(mine,accounts,viewer,lotId,query=parseLotHistoryQuery()){
  const operator=viewer.role==='operator',lot=mine.custody.lots.find(item=>item.id===lotId);
  if(!lot||!operator&&!mine.custody.allocations.some(item=>item.lotId===lotId&&item.accountId===viewer.id))throw accountError(404,'Lote DEMO no disponible.');
  validateLotHistory(mine,accounts);
  const history=mine.custody.history,accountMap=new Map(accounts.map(account=>[account.id,account]));
  const publicAccount=id=>{const account=accountMap.get(id);return {id:account.id,alias:account.alias};};
  const events=history.movements.filter(event=>event.lotId===lot.id&&(operator||event.accountId===viewer.id||event.counterpartyId===viewer.id||event.kind==='LOT_REGISTERED')).toReversed();
  let start=0;if(query.before){const index=events.findIndex(event=>event.id===query.before);if(index<0)throw accountError(400,'Cursor de historial no disponible.','INVALID_LOT_HISTORY_QUERY');start=index+1;}
  const selected=events.slice(start,start+query.limit);
  const items=selected.map(event=>{
    const referenceId=operator?event.referenceId:event.references?.find(item=>item.accountId===viewer.id)?.id;
    return {id:event.id,at:event.at,kind:event.kind,mg:event.mg,
      ...(event.accountId?{account:publicAccount(operator?event.accountId:viewer.id)}:{}),
      ...(operator&&event.counterpartyId?{counterparty:publicAccount(event.counterpartyId)}:{}),
      ...(!operator&&event.kind==='MARKET_TRANSFER'?{direction:event.counterpartyId===viewer.id?'IN':'OUT'}:{}),...(referenceId?{referenceId}:{})};
  });
  return {demoOnly:true,disclaimer:'HISTORIAL DEMO · Movimientos de derechos simulados. El saldo inicial conserva el estado previo; no reconstruye operaciones anteriores ni acredita custodia física.',mine:{id:mine.id,name:mine.name},view:operator?'operator':'buyer',lot:{id:lot.id,metal:lot.metal},items,total:events.length,nextCursor:start+selected.length<events.length?selected.at(-1).id:null,historyStartedAt:history.startedAt,earlierHistoryUnavailable:history.earlierHistoryUnavailable};
}
