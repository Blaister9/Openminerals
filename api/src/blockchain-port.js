import {accountError} from './account-auth.js';

/** Future port; implementations must resolve account IDs to verified TESTNET
 * wallets and durably deduplicate eventId before any external submission.
 * @typedef {{eventId:string,network:string,status:'PENDING'|'CONFIRMED'|'FAILED'|'REORGED',transactionHash:string|null,confirmations:number}} DemoChainReceipt
 * @typedef {{submitIntent:(intent:object)=>Promise<DemoChainReceipt>,getReceipt:(eventId:string)=>Promise<DemoChainReceipt>}} DemoBlockchainPort
 */
export function demoBlockchainIntent(event,series){
  if(event?.demoOnly!==true||series?.demoOnly!==true||event.seriesId!==series.id||!['ISSUE','OPENING_ISSUE','TRANSFER','CANCEL','RESERVE','RELEASE'].includes(event.type)||!Number.isSafeInteger(event.units)||event.units<1||!/^[a-f0-9]{64}$/.test(event.eventHash))throw accountError(422,'Intento blockchain DEMO inválido.');
  return {schema:'openminerals-demo-intent/v1',demoOnly:true,network:'unconfigured-testnet',status:'NOT_SUBMITTED',
    eventId:event.id,eventHash:event.eventHash,operationId:event.operationId,sequence:event.sequence,type:event.type,seriesId:series.id,lotId:series.lotId,metal:series.metal,purityBps:series.purityBps,
    quantity:String(event.units),quantityUnit:'mg',massBasis:'gross-lot-mass',fromAccountId:event.from?.ownerId??null,toAccountId:event.to?.ownerId??null,reservation:event.reservation??null};
}
/** @returns {DemoBlockchainPort} No network, keys, contracts or fake receipts. */
export function disconnectedDemoBlockchainPort(){
  const blocked=async()=>{throw accountError(503,'Blockchain DEMO sin conectar. No se ha emitido ningún activo.','BLOCKCHAIN_NOT_CONNECTED');};
  return {submitIntent:blocked,getReceipt:blocked};
}
