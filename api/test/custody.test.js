import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {seedState,applyCommand} from '../src/domain.js';
import {seedMine} from '../src/shared-mine.js';
import {ensureCustody,validateCustody} from '../src/custody.js';
import {createStore} from '../src/store.js';
import {createApiServer} from '../src/server.js';

const PASSWORD='Only-custody-unit-tests-123';
const command=(action,metal,grams,requestId=randomUUID())=>({action,metal,grams,requestId});
async function fixture(inventory={XAU:1000,XAG:1000,XPT:1000,XPD:1000}){
  const store=await createStore('');
  const mine=await store.createMine({name:'Custodia exclusivamente DEMO',initialInventoryMg:inventory});
  const a=await store.createAccount({alias:'custody_buyer_a',password:PASSWORD,mineId:mine.id});
  const b=await store.createAccount({alias:'custody_buyer_b',password:PASSWORD,mineId:mine.id});
  const op=await store.createAccount({alias:'custody_operator',password:PASSWORD,mineId:mine.id,role:'operator'});
  return {store,mine,a,b,op};
}

test('custodia: migración aditiva asigna los cuatro metales previos y conserva estados/recibos',()=>{
  const mine=seedMine();let state=seedState();
  for(const metal of ['XAU','XAG','XPT','XPD']){
    state=applyCommand(state,command('buy',metal,'0.100')).state;mine.inventoryMg[metal]-=100;
  }
  const accounts=[{id:'buyer-before-custody',role:'buyer',alias:'buyer_before',state}];
  const original=structuredClone({mine,accounts});
  const migrated=ensureCustody(mine,accounts,'2026-10-28T00:00:00.000Z');
  assert.equal(migrated.changed,true);assert.equal(migrated.mine.custody.lots.length,4);
  assert.equal(migrated.mine.custody.allocations.length,4);assert.equal(migrated.mine.custody.certificates.length,4);
  assert.equal(validateCustody(migrated.mine,accounts),true);
  assert.deepEqual({mine,accounts},original);
  const replay=ensureCustody(migrated.mine,accounts,'2026-10-29T00:00:00.000Z');
  assert.equal(replay.changed,false);assert.deepEqual(replay.mine,migrated.mine);
});

test('custodia: migración rechaza conciliación anterior inválida sin reiniciar ni modificar datos',()=>{
  const mine=seedMine(),state=seedState();state.holdingsMg.XAU=100;
  const accounts=[{id:'buyer-inconsistent',role:'buyer',state}],before=structuredClone({mine,accounts});
  assert.throws(()=>ensureCustody(mine,accounts),{code:'INVALID_CUSTODY'});
  assert.deepEqual({mine,accounts},before);assert.equal(Object.hasOwn(mine,'custody'),false);
  const valid=ensureCustody(seedMine(),[]).mine;valid.custody.lots[0].weightMg++;
  assert.throws(()=>ensureCustody(valid,[]),{code:'INVALID_CUSTODY'});
});

test('custodia: compras concurrentes no sobreasignan lotes y replay conserva certificados',async()=>{
  const f=await fixture();
  try{
    const commands=[command('buy','XAU','0.750'),command('buy','XAU','0.750')];
    const outcomes=await Promise.allSettled([f.store.mutateAccount(f.a.id,commands[0]),f.store.mutateAccount(f.b.id,commands[1])]);
    assert.equal(outcomes.filter(item=>item.status==='fulfilled').length,1);
    assert.equal(outcomes.find(item=>item.status==='rejected').reason.code,'INSUFFICIENT_INVENTORY');
    const winner=outcomes.findIndex(item=>item.status==='fulfilled'),account=[f.a,f.b][winner];
    const original=outcomes[winner].value;
    assert.equal(original.receipt.certificateIds.length,1);
    const replay=await f.store.mutateAccount(account.id,commands[winner]);
    assert.deepEqual(replay.receipt,{...original.receipt,replayed:true});
    const custody=await f.store.getCustody(f.op.id,'operator');
    assert.equal(custody.allocations.length,1);assert.equal(custody.totals.XAU.allocatedMg,750);assert.equal(custody.totals.XAU.availableMg,250);
    assert.ok(custody.lots.every(lot=>lot.allocatedMg<=lot.weightMg&&lot.allocatedMg+lot.availableMg===lot.weightMg));
    const own=await f.store.getCustody(account.id);assert.equal(own.allocations.length,1);
    const other=await f.store.getCustody([f.a,f.b][1-winner].id);assert.equal(other.allocations.length,0);assert.equal(other.lots.length,0);
  }finally{await f.store.close();}
});

test('custodia: venta libera asignación sin borrar certificado ni cambiar recibos previos',async()=>{
  const f=await fixture();
  try{
    const bought=await f.store.mutateAccount(f.a.id,command('buy','XAU','0.500'));
    const certificateId=bought.receipt.certificateIds[0];
    await f.store.mutateAccount(f.a.id,command('offer','XAU','0.200'));
    const before=await f.store.getCustody(f.a.id);
    await assert.rejects(f.store.mutateAccount(f.a.id,command('sell','XAU','0.400')),{code:'INSUFFICIENT_HOLDING'});
    assert.deepEqual(await f.store.getCustody(f.a.id),before);
    await f.store.mutateAccount(f.a.id,command('sell','XAU','0.300'));
    let certificate=await f.store.getCertificate(f.a.id,certificateId);
    assert.equal(certificate.issuedMg,500);assert.equal(certificate.allocatedMg,200);assert.equal(certificate.status,'PARTIALLY_RELEASED');
    const state=await f.store.getAccountState(f.a.id);
    await f.store.mutateAccount(f.a.id,{action:'cancel_offer',offerId:state.offers[0].id,requestId:randomUUID()});
    await f.store.mutateAccount(f.a.id,command('sell','XAU','0.200'));
    certificate=await f.store.getCertificate(f.a.id,certificateId);
    assert.equal(certificate.allocatedMg,0);assert.equal(certificate.status,'RELEASED');
    assert.equal(certificate.demoOnly,true);assert.match(certificate.label,/DEMO/);assert.match(certificate.disclaimer,/No acreditan/);
    assert.deepEqual((await f.store.getAccountState(f.a.id)).receipts[bought.receipt.id],bought.receipt);
    assert.equal((await f.store.getCustody(f.a.id)).allocations[0].status,'RELEASED');
  }finally{await f.store.close();}
});

test('custodia: stock crea lote documentado y distingue metadatos en idempotencia sin romper comandos previos',async()=>{
  const f=await fixture({XAU:0,XAG:0,XPT:0,XPD:0});
  try{
    const stock={metal:'XAU',grams:'1.000',reason:'Ingreso sintético',requestId:randomUUID(),purityBps:9990,location:'Bóveda ficticia A',documents:[{title:'Ensayo ilustrativo',kind:'DEMO_ASSAY',content:'Ensayo ficticio sin análisis de metal real.'}]};
    const added=await f.store.mutateStock(f.op.id,stock);
    const before=await f.store.getCustody(f.op.id,'operator');
    assert.equal(before.lots.length,1);assert.equal(before.lots[0].id,added.receipt.lotId);
    assert.equal(before.lots[0].purityBps,9990);assert.match(before.lots[0].location,/^DEMO/);assert.equal(before.lots[0].documents[0].demoOnly,true);
    const replay=await f.store.mutateStock(f.op.id,stock);assert.deepEqual(replay.receipt,{...added.receipt,replayed:true});
    for(const changed of [{purityBps:9980},{location:'Bóveda ficticia B'},{documents:[{title:'Otro ensayo',kind:'DEMO_ASSAY',content:'Contenido de prueba modificado.'}]}]){
      await assert.rejects(f.store.mutateStock(f.op.id,{...stock,...changed}));
      assert.deepEqual(await f.store.getCustody(f.op.id,'operator'),before);
    }
    await assert.rejects(f.store.mutateStock(f.op.id,{...stock,requestId:randomUUID(),purityBps:10001}),{code:'INVALID_CUSTODY'});
    const old={metal:'XAG',grams:'1.000',reason:'Comando compatible 0.1.3',requestId:randomUUID()};
    await f.store.mutateStock(f.op.id,old);const oldReplay=await f.store.mutateStock(f.op.id,old);assert.equal(oldReplay.receipt.replayed,true);
    assert.equal((await f.store.getCustody(f.op.id,'operator')).lots.length,2);
    const bought=await f.store.mutateAccount(f.a.id,command('buy','XAU','0.100'));
    const certificate=await f.store.getCertificate(f.a.id,bought.receipt.certificateIds[0]);assert.equal(certificate.lot.id,added.receipt.lotId);
    const simple={metal:'XPT',grams:'1.000',reason:'Lote desde app',purityBps:'9995',documentTitle:'Registro de app DEMO',documentContent:'Registro sintético aportado desde el formulario.',requestId:randomUUID()};
    const simpleAdded=await f.store.mutateStock(f.op.id,simple);
    const normalizedReplay=await f.store.mutateStock(f.op.id,{...simple,purityBps:9995});assert.equal(normalizedReplay.receipt.replayed,true);
    const simpleLot=(await f.store.getCustody(f.op.id,'operator')).lots.find(lot=>lot.id===simpleAdded.receipt.lotId);
    assert.equal(simpleLot.purityBps,9995);assert.equal(simpleLot.documents[0].kind,'DEMO_RECORD');assert.equal(simpleLot.documents[0].title,simple.documentTitle);
    for(const invalid of [{...simple,documentContent:undefined},{...simple,purityBps:'99.95'},{...simple,purityBps:'09995'},{...simple,documents:[]}]){
      await assert.rejects(f.store.mutateStock(f.op.id,{...invalid,requestId:randomUUID()}),{code:'INVALID_CUSTODY'});
    }
  }finally{await f.store.close();}
});

test('custodia: importar legacy asigna una vez y conserva original consultable',async()=>{
  const store=await createStore('');
  try{
    const legacy=`legacy-${randomUUID()}`;await store.mutate(legacy,command('buy','XAG','1.000'));
    const original=await store.get(legacy);
    const imported=await store.registerAccount({alias:'custody_import',password:PASSWORD,legacySessionId:legacy});
    const custody=await store.getCustody(imported.account.id);assert.equal(custody.totals.XAG.allocatedMg,1000);assert.equal(custody.allocations.length,1);
    const certificate=await store.getCertificate(imported.account.id,custody.allocations[0].certificateId);assert.equal(certificate.issuedMg,1000);
    await assert.rejects(store.registerAccount({alias:'custody_import_twice',password:PASSWORD,legacySessionId:legacy}),{code:'LEGACY_CLAIMED'});
    assert.deepEqual(await store.getCustody(imported.account.id),custody);
    const archive=await store.get(legacy);assert.equal(archive.legacyReadOnly,true);delete archive.legacyReadOnly;assert.deepEqual(archive,original);
  }finally{await store.close();}
});

test('custodia HTTP: buyer solo propio, operador su mina, certificado ajeno 404 y roles 403',async()=>{
  const f=await fixture();const server=createApiServer(f.store);
  server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
  const request=async(path,token,body,key)=>{const response=await fetch(base+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(body?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()};};
  try{
    const a=await f.store.loginAccount(f.a.alias,PASSWORD),b=await f.store.loginAccount(f.b.alias,PASSWORD),op=await f.store.loginAccount(f.op.alias,PASSWORD);
    const otherMine=await f.store.createMine({name:'Otra mina DEMO'}),other=await f.store.createAccount({alias:'custody_other_op',password:PASSWORD,mineId:otherMine.id,role:'operator'});
    const otherToken=(await f.store.loginAccount(other.alias,PASSWORD)).token;
    const bought=await f.store.mutateAccount(f.a.id,command('buy','XAU','0.200'));const id=bought.receipt.certificateIds[0];
    assert.equal((await request('/api/demo/custody')).status,401);
    assert.equal((await request('/api/demo/custody',a.token)).data.view,'buyer');
    assert.equal((await request('/api/demo/mine/custody',op.token)).data.view,'operator');
    assert.equal((await request('/api/demo/mine/custody',a.token)).status,403);
    assert.equal((await request('/api/demo/custody',op.token)).status,403);
    const cert=(await request(`/api/demo/certificates/${id}`,a.token));assert.equal(cert.status,200);assert.equal(cert.data.id,id);assert.equal(cert.data.allocatedMg,200);
    assert.equal((await request(`/api/demo/certificates/${id}`,op.token)).status,200);
    assert.equal((await request(`/api/demo/certificates/${id}`,b.token)).status,404);
    assert.equal((await request(`/api/demo/certificates/${id}`,otherToken)).status,404);
    assert.equal((await request('/api/demo/certificates/not-a-real-id',a.token)).status,404);
    assert.equal((await request('/api/demo/custody','invalid-bearer')).status,401);
    const documented=await request('/api/demo/mine/stock',op.token,{metal:'XAG',grams:'0.100',reason:'Ingreso app DEMO',purityBps:'9990',location:'Ubicacion ilustrativa',documentTitle:'Documento simple DEMO',documentContent:'Texto de prueba del formulario de la mina.'},randomUUID());
    assert.equal(documented.status,200);assert.ok(documented.data.receipt.lotId);
    assert.equal((await request('/api/demo/mine/stock',op.token,{metal:'XAG',grams:'0.100',reason:'Ingreso incompleto',documentTitle:'Solo titulo'},randomUUID())).status,422);
  }finally{await new Promise(resolve=>server.close(resolve));await f.store.close();}
});
