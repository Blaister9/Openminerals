import {createHash} from 'node:crypto';
import {DomainError,METALS,parseGrams} from './domain.js';
import {applyStockCommand} from './shared-mine.js';
import {addStockLot} from './custody.js';

const copy=value=>structuredClone(value),metals=Object.keys(METALS);
const fail=(condition,message)=>{if(!condition)throw new DomainError(message,'INVALID_INTAKE');};
const hash=value=>createHash('sha256').update(value).digest('hex').slice(0,32);
export function validateIntake(mine){
  if(!mine.intake)return true;
  const state=mine.intake,stages=['PRODUCED_DEMO','VERIFYING_DEMO','RECEIVED_DEMO'];
  fail(state.version===1&&Array.isArray(state.batches)&&new Set(state.batches.map(item=>item.id)).size===state.batches.length,'Estado de recepción DEMO inválido.');
  for(const batch of state.batches){
    const index=stages.indexOf(batch.status);
    fail(/^batch-[a-f0-9]{32}$/.test(batch.id)&&Object.hasOwn(METALS,batch.metal)&&Number.isSafeInteger(batch.mg)&&batch.mg>=100&&index>=0&&batch.demoOnly===true&&Array.isArray(batch.timeline)&&batch.timeline.length===index+1&&batch.timeline.every((event,i)=>event.status===stages[i]),'Secuencia de recepción DEMO inconsistente.');
    if(index===2)fail(mine.custody.lots.some(lot=>lot.id===batch.lotId&&lot.metal===batch.metal&&lot.weightMg===batch.mg),'La recepción DEMO no tiene su lote.');
    else fail(!batch.lotId,'La producción pendiente no puede tener un lote vendible.');
  }
  return true;
}
export function intakeView(mine){
  validateIntake(mine);
  const batches=mine.intake?.batches??[];
  const received=mine.custody.lots;
  return {demoOnly:true,disclaimer:'Recepciones y verificaciones exclusivamente simuladas. No acreditan producción ni custodia física.',batches:copy(batches).reverse(),
    totals:Object.fromEntries(metals.map(metal=>[metal,{
      producedMg:batches.filter(item=>item.metal===metal&&item.status==='PRODUCED_DEMO').reduce((sum,item)=>sum+item.mg,0),
      pendingVerificationMg:batches.filter(item=>item.metal===metal&&item.status==='VERIFYING_DEMO').reduce((sum,item)=>sum+item.mg,0),
      receivedMg:received.filter(item=>item.metal===metal).reduce((sum,item)=>sum+item.weightMg,0),
      deliveredMg:received.filter(item=>item.metal===metal).reduce((sum,item)=>sum+(item.deliveredMg??0),0),
    }]))};
}
export function applyIntake(mine,actor,command,now=new Date().toISOString()){
  const {action,requestId,reason}=command;
  fail(typeof requestId==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(requestId)&&!['__proto__','constructor','prototype'].includes(requestId),'Identificador de recepción inválido.');
  fail(['intake_produce','intake_verify','intake_receive'].includes(action),'Acción de recepción inválida.');
  fail(typeof reason==='string'&&reason.trim().length>=3&&reason.trim().length<=160,'Escribe un motivo DEMO de 3 a 160 caracteres.');
  const allowed=action==='intake_produce'?['action','requestId','metal','grams','reason']:['action','requestId','batchId','reason'];
  fail(Object.keys(command).every(key=>allowed.includes(key)),'La recepción DEMO no admite datos operativos sensibles.');
  let next=copy(mine);next.intake??={version:1,batches:[],receipts:{},signatures:{}};
  const signature=JSON.stringify([actor.id,...allowed.map(key=>[key,command[key]])]);
  if(Object.hasOwn(next.intake.receipts,requestId)){
    fail(next.intake.signatures[requestId]===signature,'Identificador reutilizado con otros parámetros.');
    return {mine:next,receipt:{...copy(next.intake.receipts[requestId]),replayed:true},changed:false};
  }
  let batch;
  if(action==='intake_produce'){
    fail(Object.hasOwn(METALS,command.metal),'Metal inválido.');const mg=parseGrams(command.grams);
    const pending=next.intake.batches.filter(item=>item.metal===command.metal&&item.status!=='RECEIVED_DEMO').reduce((sum,item)=>sum+item.mg,0);
    fail(pending+next.totalSupplyMg[command.metal]+mg<=1_000_000_000,'La cantidad supera el límite DEMO.');
    batch={id:`batch-${hash(mine.id+':'+requestId)}`,metal:command.metal,mg,status:'PRODUCED_DEMO',demoOnly:true,createdAt:now,timeline:[]};next.intake.batches.push(batch);
  }else{
    fail(typeof command.batchId==='string'&&/^batch-[a-f0-9]{32}$/.test(command.batchId),'Identificador de producción inválido.');
    batch=next.intake.batches.find(item=>item.id===command.batchId);fail(batch,'Producción DEMO no disponible en esta mina.');
    fail(batch.status===(action==='intake_verify'?'PRODUCED_DEMO':'VERIFYING_DEMO'),'La etapa de recepción no permite esta transición.');
    batch.status=action==='intake_verify'?'VERIFYING_DEMO':'RECEIVED_DEMO';
    if(action==='intake_receive'){
      const stock={metal:batch.metal,grams:(batch.mg/1000).toFixed(3),reason:reason.trim(),requestId:`receive-${hash(requestId)}`};
      const result=applyStockCommand(next,stock,{accountId:actor.id,alias:actor.alias},now);fail(result.changed,'La recepción ya tiene un registro de ingreso.');
      const added=addStockLot(result.mine,stock,now);next=added.mine;
      batch=next.intake.batches.find(item=>item.id===command.batchId);batch.lotId=added.lot.id;
      result.receipt.lotId=added.lot.id;next.stockReceipts[stock.requestId]=copy(result.receipt);
    }
  }
  const receipt={id:requestId,action,status:'COMPLETED',at:now,demoOnly:true,mineId:mine.id,batchId:batch.id,metal:batch.metal,mg:batch.mg,stage:batch.status,...(batch.lotId?{lotId:batch.lotId}:{}),reason:reason.trim(),actor:{id:actor.id,alias:actor.alias}};
  receipt.label={intake_produce:'Producción DEMO registrada',intake_verify:'Verificación DEMO registrada',intake_receive:'Recepción DEMO registrada'}[action];
  batch.timeline.push({status:batch.status,at:now,referenceId:requestId,reason:reason.trim()});
  next.intake.receipts[requestId]=copy(receipt);next.intake.signatures[requestId]=signature;
  validateIntake(next);return {mine:next,receipt,changed:true};
}
