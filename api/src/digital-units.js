import {createHash} from 'node:crypto';
import {DomainError,METALS} from './domain.js';
import {validateCustody} from './custody.js';
import {validateIntake} from './intake.js';
import {accountError} from './account-auth.js';

// One unit represents ONE MILLIGRAM OF GROSS LOT MASS, never fine metal.
// Custody remains authoritative. No public mint/burn/transfer command exists.
export const DIGITAL_UNITS_DISCLAIMER='UNIDADES DIGITALES DEMO · Registro interno simulado, sin blockchain, activos reales ni acreditación de propiedad o metal físico.';
const copy=value=>structuredClone(value);
const fail=condition=>{if(!condition)throw new DomainError('Las unidades digitales DEMO no concuerdan con su respaldo.','INVALID_DIGITAL_UNITS');};
const integer=n=>Number.isSafeInteger(n)&&n>=0&&n<=1_000_000_000;
const canonical=value=>JSON.stringify(sort(value));
function sort(value){return Array.isArray(value)?value.map(sort):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,sort(value[key])])):value;}
const hash=value=>createHash('sha256').update(canonical(value)).digest('hex');
const equal=(a,b)=>canonical(a)===canonical(b);
const key=parts=>JSON.stringify(parts);
const balanceKey=item=>key([item.seriesId,item.ownerId,item.allocationId,item.certificateId]);
const reserveKey=item=>key([item.seriesId,item.ownerId,item.reservationId,item.kind,item.referenceId]);
// Binary order is independent of the Windows/Linux process locale.
const ordered=items=>items.toSorted((a,b)=>{const left=canonical(a),right=canonical(b);return left<right?-1:left>right?1:0;});
function seriesFor(mine){
  validateIntake(mine);
  return mine.custody.lots.map(lot=>({
    id:'demo-series-'+hash([mine.id,lot.id,lot.metal,lot.purityBps,'gross-mg']).slice(0,32),
    mineId:mine.id,lotId:lot.id,metal:lot.metal,purityBps:lot.purityBps,unit:'mg',massBasis:'gross-lot-mass',
    originalMg:lot.weightMg,eligibleMg:lot.weightMg-lot.deliveredMg,
    eligibility:'REGISTERED_CUSTODY_DEMO',documentsHash:hash(lot.documents),demoOnly:true,
  }));
}
function target(mine,series){
  const byLot=new Map(series.map(item=>[item.lotId,item.id]));
  const balances=mine.custody.allocations.filter(item=>item.mg>0).map(item=>({seriesId:byLot.get(item.lotId),ownerId:item.accountId,allocationId:item.id,certificateId:item.certificateId,units:item.mg}));
  const reservations=(mine.custody.reservations?.items??[]).filter(item=>item.status==='ACTIVE').flatMap(item=>item.pieces.map(piece=>({seriesId:byLot.get(piece.lotId),ownerId:item.accountId,reservationId:item.id,kind:item.kind,referenceId:item.referenceId,units:piece.mg})));
  return {balances:ordered(balances),reservations:ordered(reservations)};
}
function add(map,k,delta,item){const next=(map.get(k)?.units??0)+delta;fail(integer(next));if(next===0)map.delete(k);else map.set(k,{...item,units:next});}
function replay(ledger){
  fail(ledger?.version===1&&ledger.demoOnly===true&&ledger.network==='offchain-demo'&&ledger.unit==='mg'&&Array.isArray(ledger.series)&&Array.isArray(ledger.events));
  const series=new Map(ledger.series.map(item=>[item.id,item]));fail(series.size===ledger.series.length);
  const balances=new Map(),reservations=new Map();let previousHash=null;
  for(const [index,event] of ledger.events.entries()){
    const {eventHash,...body}=event;
    fail(event.sequence===index+1&&event.previousHash===previousHash&&eventHash===hash(body)&&event.id==='demo-unit-'+hash([ledger.mineId,event.sequence]).slice(0,32));
    fail(event.demoOnly===true&&series.has(event.seriesId)&&integer(event.units)&&event.units>0&&Number.isFinite(Date.parse(event.at))&&typeof event.operationId==='string');
    const change=(party,delta)=>{
      fail(party&&typeof party.ownerId==='string'&&typeof party.allocationId==='string'&&typeof party.certificateId==='string');
      const item={seriesId:event.seriesId,...party};add(balances,balanceKey(item),delta,item);
    };
    if(['ISSUE','OPENING_ISSUE'].includes(event.type)){fail(!event.from&&!!event.to);change(event.to,event.units);}
    else if(event.type==='CANCEL'){fail(!!event.from&&!event.to);change(event.from,-event.units);}
    else if(event.type==='TRANSFER'){fail(event.from&&event.to&&!equal(event.from,event.to));change(event.from,-event.units);change(event.to,event.units);}
    else if(['RESERVE','RELEASE'].includes(event.type)){
      const item={seriesId:event.seriesId,...event.reservation};
      fail(!event.from&&!event.to&&typeof item.ownerId==='string'&&typeof item.reservationId==='string'&&['OFFER','DELIVERY'].includes(item.kind)&&typeof item.referenceId==='string');
      add(reservations,reserveKey(item),event.type==='RESERVE'?event.units:-event.units,item);
    }else fail(false);
    const active=series.get(event.seriesId);
    const supply=[...balances.values()].filter(item=>item.seriesId===active.id).reduce((sum,item)=>sum+item.units,0);
    fail(integer(active.originalMg)&&supply<=active.originalMg);
    const owned=new Map(),reserved=new Map();
    for(const item of balances.values())if(item.seriesId===active.id)owned.set(item.ownerId,(owned.get(item.ownerId)??0)+item.units);
    for(const item of reservations.values())if(item.seriesId===active.id)reserved.set(item.ownerId,(reserved.get(item.ownerId)??0)+item.units);
    for(const [ownerId,units] of reserved)fail(units<=(owned.get(ownerId)??0));
    previousHash=eventHash;
  }
  fail(ledger.headHash===previousHash&&equal(ordered([...balances.values()]),ledger.balances)&&equal(ordered([...reservations.values()]),ledger.reservations));
  return {balances,reservations};
}
export function validateDigitalUnits(mine,accounts){
  validateCustody(mine,accounts);validateIntake(mine);
  const ledger=mine.digitalUnits;replay(ledger);fail(ledger.mineId===mine.id);
  fail(equal(ordered(ledger.series),ordered(seriesFor(mine))));
  fail(equal({balances:ledger.balances,reservations:ledger.reservations},target(mine,ledger.series)));
  for(const series of ledger.series){
    const supply=ledger.balances.filter(item=>item.seriesId===series.id).reduce((sum,item)=>sum+item.units,0);
    fail(integer(series.eligibleMg)&&supply<=series.eligibleMg);
    for(const ownerId of new Set(ledger.balances.map(item=>item.ownerId))){
      const owned=ledger.balances.filter(item=>item.seriesId===series.id&&item.ownerId===ownerId).reduce((sum,item)=>sum+item.units,0);
      const reserved=ledger.reservations.filter(item=>item.seriesId===series.id&&item.ownerId===ownerId).reduce((sum,item)=>sum+item.units,0);
      fail(reserved<=owned);
    }
  }
  return true;
}

// Called ONLY within the mine/account transaction, after custody/reservations.
// Existing ledgers are validated against the pre-command state by the store;
// this function validates their replay before applying the new custody delta.
export function syncDigitalUnits(mine,accounts,{at=new Date().toISOString(),actorId='system-demo',requestId='opening',action='OPENING'}={}){
  validateCustody(mine,accounts);validateIntake(mine);
  const next=copy(mine),opening=!Object.hasOwn(mine,'digitalUnits');
  const ledger=next.digitalUnits??={version:1,mineId:mine.id,demoOnly:true,network:'offchain-demo',unit:'mg',series:[],balances:[],reservations:[],events:[],headHash:null};
  replay(ledger);
  const series=seriesFor(mine),desired=target(mine,series);
  const oldSeries=new Map(ledger.series.map(item=>[item.id,item]));
  // Lot identity, purity and supporting DEMO documents cannot silently change.
  for(const old of oldSeries.values()){
    const current=series.find(item=>item.id===old.id);fail(current);
    fail(equal({...old,eligibleMg:current.eligibleMg},current)&&current.eligibleMg<=old.eligibleMg);
  }
  const operationId=key([actorId,requestId,action]);
  const emit=(type,seriesId,units,fields={})=>{
    if(!units)return;
    const sequence=ledger.events.length+1;
    const event={id:'demo-unit-'+hash([mine.id,sequence]).slice(0,32),sequence,type,seriesId,units,at,actorId,operationId,previousHash:ledger.headHash,demoOnly:true,...fields};
    event.eventHash=hash(event);ledger.headHash=event.eventHash;ledger.events.push(event);
  };
  const adjustReservations=(before,after,type)=>{
    const other=new Map(after.map(item=>[reserveKey(item),item.units]));
    for(const item of before){const delta=item.units-(other.get(reserveKey(item))??0);if(delta>0){const {seriesId,units,...reservation}=item;emit(type,seriesId,delta,{reservation});}}
  };
  // Release locks before transferring/burning their exact lot-backed units.
  adjustReservations(ledger.reservations,desired.reservations,'RELEASE');
  const oldBalances=new Map(ledger.balances.map(item=>[balanceKey(item),item]));
  const newBalances=new Map(desired.balances.map(item=>[balanceKey(item),item]));
  const debits=ledger.balances.map(item=>({...item,units:item.units-(newBalances.get(balanceKey(item))?.units??0)})).filter(item=>item.units>0);
  const credits=desired.balances.map(item=>({...item,units:item.units-(oldBalances.get(balanceKey(item))?.units??0)})).filter(item=>item.units>0);
  const party=({ownerId,allocationId,certificateId})=>({ownerId,allocationId,certificateId});
  for(const debit of debits){
    for(const credit of credits.filter(item=>item.seriesId===debit.seriesId&&item.units>0)){
      const units=Math.min(debit.units,credit.units);if(!units)break;
      emit('TRANSFER',debit.seriesId,units,{from:party(debit),to:party(credit)});debit.units-=units;credit.units-=units;
    }
    emit('CANCEL',debit.seriesId,debit.units,{from:party(debit),reason:action});
  }
  for(const credit of credits)emit(opening?'OPENING_ISSUE':'ISSUE',credit.seriesId,credit.units,{to:party(credit)});
  adjustReservations(desired.reservations,ledger.reservations,'RESERVE');
  ledger.series=series;ledger.balances=desired.balances;ledger.reservations=desired.reservations;
  validateDigitalUnits(next,accounts);
  return {mine:next,changed:opening||!equal(mine.digitalUnits,ledger)};
}

export function parseDigitalQuery(params){
  for(const name of params.keys())if(!['after','limit'].includes(name)||params.getAll(name).length!==1)throw accountError(400,'Consulta de unidades DEMO inválida.');
  const number=(name,fallback,max)=>{const raw=params.get(name);if(raw===null)return fallback;if(!/^(0|[1-9]\d{0,9})$/.test(raw)||Number(raw)>max)throw accountError(400,'Paginación de unidades DEMO inválida.');return Number(raw);};
  const after=number('after',0,1_000_000_000),limit=number('limit',50,100);if(limit<1)throw accountError(400,'Límite de unidades DEMO inválido.');return {after,limit};
}
export function digitalUnitsView(mine,accounts,viewer,query){
  validateDigitalUnits(mine,accounts);
  const ledger=mine.digitalUnits,operator=viewer.role==='operator';
  const balances=ledger.balances.filter(item=>operator||item.ownerId===viewer.id),reservations=ledger.reservations.filter(item=>operator||item.ownerId===viewer.id);
  const visible=ledger.events.filter(item=>operator||item.from?.ownerId===viewer.id||item.to?.ownerId===viewer.id||item.reservation?.ownerId===viewer.id);
  const events=visible.filter(item=>item.sequence>query.after).slice(0,query.limit);
  const series=ledger.series.filter(item=>operator||balances.some(balance=>balance.seriesId===item.id)||visible.some(event=>event.seriesId===item.id));
  return {demoOnly:true,disclaimer:DIGITAL_UNITS_DISCLAIMER,network:ledger.network,unit:ledger.unit,massBasis:'gross-lot-mass',mineId:mine.id,view:operator?'operator':'buyer',
    series:copy(series),balances:copy(balances),reservations:copy(reservations),events:copy(events),nextAfter:events.at(-1)?.sequence??query.after,hasMore:visible.some(item=>item.sequence>(events.at(-1)?.sequence??query.after)),
    reconciliation:{ok:true,scope:operator?'mine':'own-positions',metals:Object.fromEntries(Object.keys(METALS).map(metal=>{
      const ids=new Set(series.filter(item=>item.metal===metal).map(item=>item.id));
      const outstandingUnits=balances.filter(item=>ids.has(item.seriesId)).reduce((sum,item)=>sum+item.units,0),reservedUnits=reservations.filter(item=>ids.has(item.seriesId)).reduce((sum,item)=>sum+item.units,0);
      const eligibleMg=series.filter(item=>item.metal===metal).reduce((sum,item)=>sum+item.eligibleMg,0);
      return [metal,{outstandingUnits,reservedUnits,availableUnits:outstandingUnits-reservedUnits,...(operator?{eligibleMg,unissuedUnits:eligibleMg-outstandingUnits,inventoryMg:mine.inventoryMg[metal]}:{})}];
    }))},...(operator?{headHash:ledger.headHash}:{})};
}
