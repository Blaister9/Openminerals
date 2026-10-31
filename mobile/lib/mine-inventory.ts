import {custodyMetals,type CustodyMetal} from './custody.ts';

export type MineInventory={
  inventoryMg:Record<CustodyMetal,number>;allocatedMg:Record<CustodyMetal,number>;
  reservedMg:Record<CustodyMetal,number>;deliveryCommittedMg:Record<CustodyMetal,number>;
  totalSupplyMg:Record<CustodyMetal,number>;reconciled:true;
};
const keys=['inventoryMg','allocatedMg','reservedMg','deliveryCommittedMg','totalSupplyMg'] as const;
const invalid=()=>new Error('El inventario de la mina está incompleto o no concuerda. Actualiza antes de operar.');

/** Missing commitments are unknown, never an invented zero. */
export function parseMineInventory(raw:unknown):MineInventory{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))throw invalid();
  const source=raw as MineInventory;
  if(source.reconciled!==true||keys.some(key=>!source[key]||custodyMetals.some(metal=>{
    const value=source[key][metal];
    return !Number.isSafeInteger(value)||value<0||value>1_000_000_000;
  }))||custodyMetals.some(metal=>source.inventoryMg[metal]+source.allocatedMg[metal]!==source.totalSupplyMg[metal]||
    source.reservedMg[metal]>source.allocatedMg[metal]||source.deliveryCommittedMg[metal]>source.reservedMg[metal]))throw invalid();
  return {reconciled:true,...Object.fromEntries(keys.map(key=>[key,Object.fromEntries(custodyMetals.map(metal=>[metal,source[key][metal]]))]))} as MineInventory;
}

export function mineInventoryIsReconciled(raw:unknown):boolean{
  try{parseMineInventory(raw);return true;}catch{return false;}
}
