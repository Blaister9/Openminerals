import {custodyMetals,type CustodyMetal} from './custody.ts';
export type IntakeStage='PRODUCED_DEMO'|'VERIFYING_DEMO'|'RECEIVED_DEMO';
export type IntakeBatch={id:string;metal:CustodyMetal;mg:number;status:IntakeStage;demoOnly:true;lotId?:string;createdAt:string};
export type IntakeSummary={demoOnly:true;batches:IntakeBatch[];totals:Record<CustodyMetal,{producedMg:number;pendingVerificationMg:number;receivedMg:number;deliveredMg:number}>;availability?:{inventoryMg:Record<CustodyMetal,number>;allocatedMg:Record<CustodyMetal,number>;reservedMg:Record<CustodyMetal,number>;deliveryCommittedMg:Record<CustodyMetal,number>;totalSupplyMg:Record<CustodyMetal,number>;reconciled:true}};
export const intakeLabels:Record<IntakeStage,string>={PRODUCED_DEMO:'Producido DEMO',VERIFYING_DEMO:'Pendiente de verificación',RECEIVED_DEMO:'Recibido en custodia DEMO'};
export function parseIntake(raw:unknown):IntakeSummary{
  const invalid=()=>new Error('La recepción DEMO devolvió datos incompletos.');
  if(!raw||typeof raw!=='object')throw invalid();const data=raw as IntakeSummary;
  const amount=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
  if(data.demoOnly!==true||!Array.isArray(data.batches)||!data.totals||custodyMetals.some(key=>!data.totals[key]||['producedMg','pendingVerificationMg','receivedMg','deliveredMg'].some(field=>!amount(data.totals[key][field as keyof IntakeSummary['totals'][CustodyMetal]]))))throw invalid();
  if(data.batches.some(item=>!/^batch-[a-f0-9]{32}$/.test(item.id)||!custodyMetals.includes(item.metal)||!amount(item.mg)||item.mg===0||!Object.hasOwn(intakeLabels,item.status)||item.demoOnly!==true))throw invalid();
  let availability:IntakeSummary['availability'];
  if(data.availability){
    const source=data.availability,keys=['inventoryMg','allocatedMg','reservedMg','deliveryCommittedMg','totalSupplyMg'] as const;
    if(source.reconciled!==true||keys.some(key=>!source[key]||custodyMetals.some(metal=>!amount(source[key][metal])))||custodyMetals.some(metal=>source.inventoryMg[metal]+source.allocatedMg[metal]!==source.totalSupplyMg[metal]||source.reservedMg[metal]>source.allocatedMg[metal]||source.deliveryCommittedMg[metal]>source.reservedMg[metal]))throw invalid();
    availability={reconciled:true,...Object.fromEntries(keys.map(key=>[key,Object.fromEntries(custodyMetals.map(metal=>[metal,source[key][metal]]))]))} as IntakeSummary['availability'];
  }
  // Keep only fields rendered by this view; never persist the response.
  return {demoOnly:true,availability,batches:data.batches.map(({id,metal,mg,status,demoOnly,lotId,createdAt})=>({id,metal,mg,status,demoOnly,lotId,createdAt})),totals:Object.fromEntries(custodyMetals.map(key=>{const {producedMg,pendingVerificationMg,receivedMg,deliveredMg}=data.totals[key];return [key,{producedMg,pendingVerificationMg,receivedMg,deliveredMg}];})) as IntakeSummary['totals']};
}
