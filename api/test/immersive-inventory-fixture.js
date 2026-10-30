import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

export async function immersiveInventory(t,store,second=store){
  const password='Only-simulated-inventory-tests-2026';
  const mine=await store.createMine({name:'Inventario inmersivo DEMO',initialInventoryMg:{XAU:0,XAG:0,XPT:0,XPD:0}});
  const suffix=randomUUID().slice(0,8),a=await store.createAccount({alias:'intake_a_'+suffix,password,mineId:mine.id}),b=await store.createAccount({alias:'intake_b_'+suffix,password,mineId:mine.id}),op=await store.createAccount({alias:'intake_op_'+suffix,password,mineId:mine.id,role:'operator'});
  const cmd=(action,body={})=>({action,requestId:randomUUID(),...body});
  let batch,received,offer,lot;
  await t.test('producción y verificación no crean inventario vendible ni permiten comprar',async()=>{
    const body=cmd('intake_produce',{metal:'XAU',grams:'1.000',reason:'Producción ficticia controlada'});
    const concurrent=await Promise.all([store.mutateIntake(op.id,body),second.mutateIntake(op.id,body)]);
    assert.equal(concurrent.filter(item=>item.changed).length,1);batch=concurrent[0].receipt.batchId;
    assert.equal((await store.getIntake(op.id)).totals.XAU.producedMg,1000);
    assert.equal((await store.getMineSummary(op.id)).inventoryMg.XAU,0);
    await assert.rejects(store.mutateAccount(a.id,cmd('buy',{metal:'XAU',grams:'0.100'})),{code:'INSUFFICIENT_INVENTORY'});
    await assert.rejects(store.mutateIntake(op.id,cmd('intake_receive',{batchId:batch,reason:'No omitir verificación'})),{code:'INVALID_INTAKE'});
    await store.mutateIntake(op.id,cmd('intake_verify',{batchId:batch,reason:'Verificación exclusivamente DEMO'}));
    const view=await store.getIntake(op.id);assert.equal(view.totals.XAU.producedMg,0);assert.equal(view.totals.XAU.pendingVerificationMg,1000);assert.equal(view.totals.XAU.receivedMg,0);
    await assert.rejects(store.mutateAccount(a.id,cmd('buy',{metal:'XAU',grams:'0.100'})),{code:'INSUFFICIENT_INVENTORY'});
  });
  await t.test('recepción concurrente entra una vez, con un lote y referencia; no admite campos físicos',async()=>{
    const body=cmd('intake_receive',{batchId:batch,reason:'Recepción ficticia aprobada'});
    const results=await Promise.all([store.mutateIntake(op.id,body),second.mutateIntake(op.id,body)]);received=body;
    assert.equal(results.filter(item=>item.changed).length,1);lot=results[0].receipt.lotId;
    const view=await store.getIntake(op.id);assert.equal(view.batches.length,1);assert.equal(view.totals.XAU.pendingVerificationMg,0);assert.equal(view.totals.XAU.receivedMg,1000);
    assert.equal((await store.getMineSummary(op.id)).inventoryMg.XAU,1000);
    await assert.rejects(store.mutateIntake(op.id,{...body,reason:'Cambio de motivo'}));
    await assert.rejects(store.mutateIntake(op.id,cmd('intake_produce',{metal:'XAU',grams:'0.100',reason:'No ubicación',coordinates:[4,-74]})),{code:'INVALID_INTAKE'});
  });
  await t.test('reserva por lote protege gramos frente a venta y marketplace conserva suministro físico',async()=>{
    await store.mutateAccount(a.id,cmd('buy',{metal:'XAU',grams:'1.000'}));
    offer=(await store.mutateAccount(a.id,cmd('offer',{metal:'XAU',grams:'0.500',price:'140.00'}))).receipt.offer;
    await store.mutateAccount(a.id,cmd('sell',{metal:'XAU',grams:'0.500'}));
    await assert.rejects(store.mutateAccount(a.id,cmd('sell',{metal:'XAU',grams:'0.100'})));
    const before=await store.getMineSummary(op.id);
    assert.equal(before.reservedMg.XAU,500);
    assert.equal((await store.getCustody(a.id)).lots.find(item=>item.id===lot).reservedMg,500);
    const buy=cmd('market_buy',{sellerId:a.id,offerId:offer.id});
    await Promise.all([store.mutateAccount(b.id,buy),second.mutateAccount(b.id,buy)]);
    const after=await store.getMineSummary(op.id);
    assert.equal(after.totalSupplyMg.XAU,before.totalSupplyMg.XAU);assert.equal(after.inventoryMg.XAU,before.inventoryMg.XAU);assert.equal(after.reservedMg.XAU,0);
    assert.equal((await store.getCustody(b.id)).allocations.find(item=>item.mg>0).lotId,lot);
    const events=(await store.getLotHistory(op.id,lot,new URLSearchParams('includeReservations=1'))).items;
    assert.ok(events.some(item=>item.kind==='RESERVED'));assert.ok(events.some(item=>item.kind==='RESERVATION_RELEASED'));assert.ok(events.some(item=>item.kind==='MARKET_TRANSFER'));
  });
  await t.test('permisos: comprador sin recepción; otro operador no puede cambiar un lote de esta mina',async()=>{
    await assert.rejects(store.getIntake(a.id),{status:403});await assert.rejects(store.mutateIntake(a.id,received),{status:403});
    const other=await store.createMine({name:'Otra mina de permisos',initialInventoryMg:{XAU:0,XAG:0,XPT:0,XPD:0}}),outsider=await store.createAccount({alias:'intake_other_'+suffix,password,mineId:other.id,role:'operator'});
    await assert.rejects(store.mutateIntake(outsider.id,cmd('intake_receive',{batchId:batch,reason:'Otra mina no autorizada'})),{code:'INVALID_INTAKE'});
    assert.equal((await store.getIntake(outsider.id)).batches.length,0);
  });
  await t.test('dos lotes: vender gramos libres no consume el lote reservado para una oferta',async()=>{
    const addition=await store.mutateStock(op.id,{metal:'XAU',grams:'1.000',reason:'Segundo lote DEMO para aislamiento',requestId:randomUUID()});
    await store.mutateAccount(a.id,cmd('buy',{metal:'XAU',grams:'1.000'}));
    const currentOffer=(await store.mutateAccount(a.id,cmd('offer',{metal:'XAU',grams:'0.500',price:'140.00'}))).receipt.offer;
    await store.mutateAccount(a.id,cmd('sell',{metal:'XAU',grams:'0.500'}));
    const allocations=(await store.getCustody(a.id)).allocations;
    assert.equal(allocations.filter(item=>item.lotId===lot).reduce((sum,item)=>sum+item.mg,0),500);
    assert.equal(allocations.filter(item=>item.lotId===addition.receipt.lotId).reduce((sum,item)=>sum+item.mg,0),0);
    const before=await store.getMineSummary(op.id);
    await store.mutateAccount(b.id,cmd('market_buy',{sellerId:a.id,offerId:currentOffer.id}));
    const after=await store.getMineSummary(op.id);assert.deepEqual(after.totalSupplyMg,before.totalSupplyMg);assert.deepEqual(after.inventoryMg,before.inventoryMg);
    assert.equal((await store.getCustody(b.id)).allocations.filter(item=>item.lotId===lot).reduce((sum,item)=>sum+item.mg,0),1000);
  });
  return {op,a,b,mine,intake:await store.getIntake(op.id),custody:await store.getCustody(op.id,'operator')};
}
