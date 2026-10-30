import {createHash} from 'node:crypto';
import {DomainError,deliveryIsActive} from './domain.js';
import {recordLotMovement} from './custody-history.js';

const copy=value=>structuredClone(value);
const fail=condition=>{if(!condition)throw new DomainError('Las reservas por lote DEMO no concuerdan.','INVALID_RESERVATIONS');};
export const reservationId=(accountId,kind,referenceId)=>createHash('sha256').update(JSON.stringify([accountId,kind,referenceId])).digest('hex');
export function reservedInLot(mine,accountId,lotId){
  return (mine.custody.reservations?.items??[]).filter(item=>item.status==='ACTIVE'&&item.accountId===accountId).flatMap(item=>item.pieces).filter(piece=>piece.lotId===lotId).reduce((sum,piece)=>sum+piece.mg,0);
}
export function reservationPieces(mine,accountId,kind,referenceId){
  const items=mine.custody.reservations?.items;
  if(!items)return null;
  const item=items.find(value=>value.id===reservationId(accountId,kind,referenceId)&&value.status==='ACTIVE');
  fail(item);return copy(item.pieces);
}
const desiredReservations=accounts=>accounts.filter(account=>account.role==='buyer').flatMap(account=>[
  ...account.state.offers.filter(item=>item.status==='OPEN').map(item=>({...item,kind:'OFFER'})),
  ...account.state.custodyRequests.filter(item=>deliveryIsActive(item.status)).map(item=>({...item,kind:'DELIVERY'})),
].map(item=>({id:reservationId(account.id,item.kind,item.id),accountId:account.id,referenceId:item.id,kind:item.kind,metal:item.metal,mg:item.mg})));

// Called under the existing mine lock after a command. Opening reservations
// describe current state; they do not invent a historical reservation date.
export function syncReservations(mine,accounts,{at=new Date().toISOString(),referenceId}={}){
  const next=copy(mine),opening=!next.custody.reservations;
  if(opening)next.custody.reservations={version:1,items:[]};
  const desired=desiredReservations(accounts),items=next.custody.reservations.items;
  let changed=opening;
  for(const item of items.filter(item=>item.status==='ACTIVE')){
    if(desired.some(value=>value.id===item.id))continue;
    item.status='RELEASED';changed=true;
    for(const piece of item.pieces)recordLotMovement(next,'RESERVATION_RELEASED',piece.lotId,piece.mg,{at,accountId:item.accountId,referenceId});
  }
  for(const target of desired){
    const existing=items.find(item=>item.id===target.id);
    if(existing){fail(existing.status==='ACTIVE'&&existing.mg===target.mg&&existing.metal===target.metal);continue;}
    const pieces=[];let remaining=target.mg;
    for(const lot of next.custody.lots.filter(lot=>lot.metal===target.metal)){
      const assigned=next.custody.allocations.filter(item=>item.lotId===lot.id&&item.accountId===target.accountId).reduce((sum,item)=>sum+item.mg,0);
      const take=Math.min(remaining,assigned-reservedInLot(next,target.accountId,lot.id));
      if(take>0){pieces.push({lotId:lot.id,mg:take});remaining-=take;}
      if(!remaining)break;
    }
    fail(remaining===0);items.push({...target,pieces,status:'ACTIVE',at});changed=true;
    for(const piece of pieces)recordLotMovement(next,opening?'RESERVATION_OPENING':'RESERVED',piece.lotId,piece.mg,{at,accountId:target.accountId,referenceId});
  }
  validateReservations(next,accounts);return {mine:next,changed};
}
export function validateReservations(mine,accounts){
  if(!mine.custody.reservations)return true;
  const {version,items}=mine.custody.reservations;
  fail(version===1&&Array.isArray(items)&&new Set(items.map(item=>item.id)).size===items.length);
  const desired=desiredReservations(accounts),active=items.filter(item=>item.status==='ACTIVE');
  fail(desired.length===active.length);
  for(const item of items){
    fail(['ACTIVE','RELEASED'].includes(item.status)&&Array.isArray(item.pieces)&&item.pieces.every(piece=>Number.isSafeInteger(piece.mg)&&piece.mg>0&&mine.custody.lots.some(lot=>lot.id===piece.lotId&&lot.metal===item.metal))&&item.pieces.reduce((sum,piece)=>sum+piece.mg,0)===item.mg);
    if(item.status==='ACTIVE')fail(desired.some(value=>value.id===item.id&&value.mg===item.mg&&value.metal===item.metal));
  }
  for(const account of accounts.filter(item=>item.role==='buyer'))for(const lot of mine.custody.lots){
    const assigned=mine.custody.allocations.filter(item=>item.accountId===account.id&&item.lotId===lot.id).reduce((sum,item)=>sum+item.mg,0);
    fail(reservedInLot(mine,account.id,lot.id)<=assigned);
  }
  return true;
}
