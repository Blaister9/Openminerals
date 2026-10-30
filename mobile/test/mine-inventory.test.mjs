import test from 'node:test';
import assert from 'node:assert/strict';
import {parseMineInventory,mineInventoryIsReconciled} from '../lib/mine-inventory.ts';
import {parseIntake,intakeProductionQuote} from '../lib/intake.ts';

const metals=['XAU','XAG','XPT','XPD'];
const record=amount=>Object.fromEntries(metals.map(metal=>[metal,metal==='XAU'?amount:0]));
const inventory=()=>({inventoryMg:record(900),allocatedMg:record(100),reservedMg:record(50),deliveryCommittedMg:record(20),totalSupplyMg:record(1000),reconciled:true});
const intake=()=>({demoOnly:true,batches:[],totals:Object.fromEntries(metals.map(metal=>[metal,{producedMg:0,pendingVerificationMg:0,receivedMg:metal==='XAU'?1100:0,deliveredMg:metal==='XAU'?100:0}])),availability:inventory()});

test('inventario móvil exige un compromiso informado y conciliado; nunca lo supone cero',()=>{
  const valid=inventory();assert.equal(mineInventoryIsReconciled(valid),true);
  for(const mutate of [
    value=>{delete value.deliveryCommittedMg;},value=>{delete value.deliveryCommittedMg.XAU;},
    value=>{value.deliveryCommittedMg.XAU=51;},value=>{value.reservedMg.XAU=101;},
    value=>{value.inventoryMg.XAU=901;},value=>{value.reconciled=false;},
  ]){const raw=structuredClone(valid);mutate(raw);assert.throws(()=>parseMineInventory(raw));assert.equal(mineInventoryIsReconciled(raw),false);}
});

test('proyección de cantidades no conserva campos operativos desconocidos ni referencias compartidas',()=>{
  const raw={...inventory(),operational:{coordinates:'sensitive-canary'}};
  raw.inventoryMg.privateLocation='sensitive-canary';
  const parsed=parseMineInventory(raw);assert.equal(JSON.stringify(parsed).includes('sensitive-canary'),false);
  parsed.inventoryMg.XAU=0;assert.equal(raw.inventoryMg.XAU,900);
});

test('recepción rechaza masas acumuladas que no concuerdan con el suministro activo',()=>{
  const raw=intake();assert.equal(parseIntake(raw).totals.XAU.receivedMg,1100);
  for(const mutate of [value=>{value.totals.XAU.deliveredMg=1101;},value=>{value.totals.XAU.receivedMg=1099;},value=>{value.totals.XAU.producedMg=100;}]){
    const changed=structuredClone(raw);mutate(changed);assert.throws(()=>parseIntake(changed));
  }
});

test('recibido acumulado puede superar el cap de suministro activo después de ciclos de salida',()=>{
  const raw=intake();raw.totals.XAU.deliveredMg=1_000_000_000;raw.totals.XAU.receivedMg=1_000_001_000;
  assert.equal(parseIntake(raw).availability.totalSupplyMg.XAU,1000);
});

test('producción con coma conserva los gramos exactos y excluye la capacidad ya pendiente',()=>{
  const raw=intake();raw.availability.inventoryMg.XAU=999_999_500;raw.availability.allocatedMg.XAU=0;raw.availability.reservedMg.XAU=0;raw.availability.deliveryCommittedMg.XAU=0;raw.availability.totalSupplyMg.XAU=999_999_500;
  raw.totals.XAU={producedMg:200,pendingVerificationMg:200,receivedMg:999_999_500,deliveredMg:0};
  raw.batches=[{id:'batch-'+ 'a'.repeat(32),metal:'XAU',mg:200,status:'PRODUCED_DEMO',demoOnly:true,createdAt:'2026-10-30T12:00:00Z'},{id:'batch-'+ 'b'.repeat(32),metal:'XAU',mg:200,status:'VERIFYING_DEMO',demoOnly:true,createdAt:'2026-10-30T12:00:00Z'}];
  const parsed=parseIntake(raw);
  assert.deepEqual(intakeProductionQuote('0,1',parsed,'XAU'),{mg:100,grams:'0.1',capacityMg:100});
  for(const input of ['0.200','1000000000','1e3','0.000','-0.1'])assert.equal(intakeProductionQuote(input,parsed,'XAU'),null);
});

test('sin disponibilidad no se habilita producción y una recepción sin lote no se presenta como recibida',()=>{
  const raw=intake();delete raw.availability;
  assert.equal(intakeProductionQuote('1.000',parseIntake(raw),'XAU'),null);
  const received={id:'batch-'+ 'c'.repeat(32),metal:'XAU',mg:100,status:'RECEIVED_DEMO',demoOnly:true,createdAt:'2026-10-30T12:00:00Z'};
  assert.throws(()=>parseIntake({...raw,batches:[received]}));
});
