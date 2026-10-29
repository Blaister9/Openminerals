import test from 'node:test';
import assert from 'node:assert/strict';
import {seedState} from '../../api/src/domain.js';
import {seedMine} from '../../api/src/shared-mine.js';
import {ensureCustody,custodyView,custodyCertificate,releaseCustody} from '../../api/src/custody.js';
import {certificatePath,custodyDocumentKind,custodyGrams,custodyMetalName,custodyStatus,parseCustodySummary,parseCustodyCertificate,validCertificateId} from '../lib/custody.ts';

function fixture(){
  const mine=seedMine();
  const alice={id:'custody-buyer-alice-001',alias:'alice_demo',role:'buyer',mineId:mine.id,state:seedState()};
  const bob={id:'custody-buyer-bob-0001',alias:'bob_demo',role:'buyer',mineId:mine.id,state:seedState()};
  const operator={id:'custody-operator-00001',alias:'operator_demo',role:'operator',mineId:mine.id};
  alice.state.holdingsMg.XAU=1000;bob.state.holdingsMg.XAU=500;mine.inventoryMg.XAU-=1500;
  const accounts=[alice,bob,operator];
  return {mine:ensureCustody(mine,accounts,'2026-10-28T12:00:00Z').mine,alice,bob,operator,accounts};
}

test('custodia presenta el DTO real de comprador con asignaciones propias y sin identidades ajenas',()=>{
  const f=fixture(),raw=custodyView(f.mine,f.accounts,f.alice);
  const data=parseCustodySummary(raw,false,f.alice.id);
  assert.equal(data.lots.length,1);assert.equal(data.allocations.length,1);
  assert.equal(data.allocations[0].account.id,f.alice.id);
  assert.equal(data.lots[0].purity,'99.99% DEMO');
  assert.equal(data.lots[0].allocatedMg,1000);
  // Other buyers' assignments are omitted from the buyer-facing count.
  assert.ok(data.lots[0].availableMg+data.lots[0].allocatedMg<data.lots[0].weightMg);
  assert.equal(JSON.stringify(data).includes(f.bob.id),false);
  assert.equal(JSON.stringify(data).includes(f.bob.alias),false);
  assert.ok(data.lots[0].documents.every(document=>document.demoOnly===true));
});

test('operador presenta todos los lotes de su mina y cantidades conciliadas',()=>{
  const f=fixture(),data=parseCustodySummary(custodyView(f.mine,f.accounts,f.operator),true,f.operator.id);
  assert.equal(data.lots.length,4);assert.equal(data.allocations.length,2);
  for(const lot of data.lots)assert.equal(lot.allocatedMg+lot.availableMg,lot.weightMg);
  assert.equal(data.totals.XAU.allocatedMg,1500);
  assert.equal(data.allocations[0].account.alias,'alice_demo');
});

test('respuesta incompleta, rol cambiado o asignación ajena se rechazan antes de mostrarse',()=>{
  const f=fixture(),raw=custodyView(f.mine,f.accounts,f.alice);
  for(const mutate of [
    value=>{value.demoOnly=false;},
    value=>{value.view='operator';},
    value=>{value.allocations[0].account.id=f.bob.id;},
    value=>{value.allocations[0].metal='XAG';},
    value=>{value.lots[0].documents[0].demoOnly=false;},
    value=>{value.lots[0].availableMg=value.lots[0].weightMg+1;},
    value=>{value.lots[0].purityBps=10001;},
    value=>{value.lots[0].weightMg=NaN;},
  ]){
    const changed=structuredClone(raw);mutate(changed);
    assert.throws(()=>parseCustodySummary(changed,false,f.alice.id));
  }
  const operator=custodyView(f.mine,f.accounts,f.operator);operator.lots[0].availableMg--;
  assert.throws(()=>parseCustodySummary(operator,true,f.operator.id));
});

test('certificado real del dominio conserva id, propietario y estado activo, parcial y liberado',()=>{
  const f=fixture();
  const allocation=f.mine.custody.allocations.find(entry=>entry.accountId===f.alice.id),id=allocation.certificateId;
  let raw=custodyCertificate(f.mine,f.accounts,f.alice,id);
  assert.equal(parseCustodyCertificate(raw,id,false,f.alice.id).status,'ACTIVE');
  f.mine=releaseCustody(f.mine,f.alice.id,'XAU',400);f.alice.state.holdingsMg.XAU-=400;f.mine.inventoryMg.XAU+=400;
  raw=custodyCertificate(f.mine,f.accounts,f.alice,id);
  const partial=parseCustodyCertificate(raw,id,false,f.alice.id);
  assert.equal(partial.status,'PARTIALLY_RELEASED');assert.equal(partial.issuedMg,1000);assert.equal(partial.allocatedMg,600);
  f.mine=releaseCustody(f.mine,f.alice.id,'XAU',600);f.alice.state.holdingsMg.XAU-=600;f.mine.inventoryMg.XAU+=600;
  raw=custodyCertificate(f.mine,f.accounts,f.alice,id);
  assert.equal(parseCustodyCertificate(raw,id,false,f.alice.id).status,'RELEASED');
  assert.equal(parseCustodyCertificate(raw,id,true,f.operator.id).allocatedMg,0);
});

test('certificado recibido con id distinto, dueño ajeno o ruta externa no se presenta como consultado',()=>{
  const f=fixture(),id=f.mine.custody.allocations.find(entry=>entry.accountId===f.alice.id).certificateId;
  const raw=custodyCertificate(f.mine,f.accounts,f.alice,id);
  assert.throws(()=>parseCustodyCertificate(raw,'other-certificate',false,f.alice.id));
  assert.throws(()=>parseCustodyCertificate(raw,id,false,f.bob.id));
  assert.throws(()=>parseCustodyCertificate({...raw,verifyPath:'https://example.test/verify'},id,false,f.alice.id));
  assert.throws(()=>parseCustodyCertificate({...raw,demoOnly:false},id,false,f.alice.id));
  assert.throws(()=>parseCustodyCertificate({...raw,status:'ACTIVE',allocatedMg:raw.issuedMg+1},id,false,f.alice.id));
});

test('consulta por identificador no acepta enlaces ni segmentos de otra ruta',()=>{
  assert.equal(certificatePath(' certificate-123 '),'/api/demo/certificates/certificate-123');
  for(const id of ['', '../accounts/me','https://example.test','id?token=private','a b','a'.repeat(129)]){
    assert.equal(validCertificateId(id),false);assert.throws(()=>certificatePath(id));
  }
});

test('presentación identifica documentos y estados como registros de demostración',()=>{
  assert.equal(custodyMetalName('XAU'),'Oro');assert.equal(custodyGrams(1250),'1,250 g');
  assert.equal(custodyStatus('REGISTERED_DEMO'),'Lote registrado en la demo');
  assert.equal(custodyStatus('PARTIALLY_RELEASED'),'Asignación parcialmente liberada');
  assert.equal(custodyDocumentKind('DEMO_ASSAY'),'Ensayo ficticio');
  assert.equal(custodyDocumentKind('DEMO_ORIGIN'),'Origen ficticio');
});

test('parser conserva únicamente el contrato de custodia y no altera el DTO original',()=>{
  const f=fixture(),raw=custodyView(f.mine,f.accounts,f.alice),before=structuredClone(raw);
  raw.adminToken='must-not-be-displayed';raw.lots[0].internalData='private';
  const parsed=parseCustodySummary(raw,false,f.alice.id);
  assert.equal(JSON.stringify(parsed).includes('must-not-be-displayed'),false);
  assert.equal(JSON.stringify(parsed).includes('private'),false);
  parsed.lots[0].documents[0].content='changed';
  assert.equal(raw.lots[0].documents[0].content,before.lots[0].documents[0].content);
});
