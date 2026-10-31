import {custodyMetals,type CustodyMetal} from './custody.ts';
import {parseMineInventory,type MineInventory} from './mine-inventory.ts';
import {normalizeDecimalInput,parsePositiveDecimal} from './presentation.ts';
export type IntakeStage='PRODUCED_DEMO'|'VERIFYING_DEMO'|'RECEIVED_DEMO';
export type IntakeBatch={id:string;metal:CustodyMetal;mg:number;status:IntakeStage;demoOnly:true;lotId?:string;createdAt:string};
export type IntakeSummary={demoOnly:true;batches:IntakeBatch[];totals:Record<CustodyMetal,{producedMg:number;pendingVerificationMg:number;receivedMg:number;deliveredMg:number}>;availability?:MineInventory};
export const intakeLabels:Record<IntakeStage,string>={PRODUCED_DEMO:'Producido DEMO',VERIFYING_DEMO:'Pendiente de verificación',RECEIVED_DEMO:'Recibido en custodia DEMO'};
export function parseIntake(raw:unknown):IntakeSummary{
  const invalid=()=>new Error('La recepción DEMO devolvió datos incompletos.');
  if(!raw||typeof raw!=='object')throw invalid();const data=raw as IntakeSummary;
  const amount=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
  if(data.demoOnly!==true||!Array.isArray(data.batches)||!data.totals||custodyMetals.some(key=>!data.totals[key]||['producedMg','pendingVerificationMg','receivedMg','deliveredMg'].some(field=>!amount(data.totals[key][field as keyof IntakeSummary['totals'][CustodyMetal]]))))throw invalid();
  if(new Set(data.batches.map(item=>item?.id)).size!==data.batches.length||data.batches.some(item=>!item||!/^batch-[a-f0-9]{32}$/.test(item.id)||!custodyMetals.includes(item.metal)||!amount(item.mg)||item.mg===0||!Object.hasOwn(intakeLabels,item.status)||item.demoOnly!==true||typeof item.createdAt!=='string'||!Number.isFinite(Date.parse(item.createdAt))||
    (item.status==='RECEIVED_DEMO'?typeof item.lotId!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(item.lotId):item.lotId!==undefined)))throw invalid();
  if(custodyMetals.some(metal=>data.totals[metal].deliveredMg>data.totals[metal].receivedMg||
    data.batches.filter(item=>item.metal===metal&&item.status==='PRODUCED_DEMO').reduce((sum,item)=>sum+item.mg,0)!==data.totals[metal].producedMg||
    data.batches.filter(item=>item.metal===metal&&item.status==='VERIFYING_DEMO').reduce((sum,item)=>sum+item.mg,0)!==data.totals[metal].pendingVerificationMg))throw invalid();
  let availability:IntakeSummary['availability'];
  if(data.availability){
    availability=parseMineInventory(data.availability);
    if(custodyMetals.some(metal=>data.totals[metal].receivedMg-data.totals[metal].deliveredMg!==availability!.totalSupplyMg[metal]))throw invalid();
  }
  // Keep only fields rendered by this view; never persist the response.
  return {demoOnly:true,availability,batches:data.batches.map(({id,metal,mg,status,demoOnly,lotId,createdAt})=>({id,metal,mg,status,demoOnly,lotId,createdAt})),totals:Object.fromEntries(custodyMetals.map(key=>{const {producedMg,pendingVerificationMg,receivedMg,deliveredMg}=data.totals[key];return [key,{producedMg,pendingVerificationMg,receivedMg,deliveredMg}];})) as IntakeSummary['totals']};
}

/** A production declaration must fit the remaining simulation capacity. */
export function intakeProductionQuote(input:string,summary:IntakeSummary|null,metal:CustodyMetal){
  if(!summary?.availability)return null;
  const quantity=parsePositiveDecimal(input,3),mg=quantity===null?null:Math.round(quantity*1000);
  const capacityMg=Math.max(0,1_000_000_000-summary.availability.totalSupplyMg[metal]-summary.totals[metal].producedMg-summary.totals[metal].pendingVerificationMg);
  if(mg===null||!Number.isSafeInteger(mg)||mg<100||mg>capacityMg)return null;
  return {mg,grams:normalizeDecimalInput(input),capacityMg};
}
