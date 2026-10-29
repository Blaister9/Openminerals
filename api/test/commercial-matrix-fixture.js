import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {METALS,CURRENCIES} from '../src/domain.js';

const PASSWORD='Exclusive-commercial-matrix-demo-789';
const command=(action,body)=>({action,...body,requestId:randomUUID()});
export async function commercialMatrix(t,first,second=first){
  const tag=randomUUID().slice(0,8),mine=await first.createMine({name:'Matriz comercial DEMO '+tag,initialInventoryMg:Object.fromEntries(Object.keys(METALS).map(code=>[code,25000]))});
  const a=await first.createAccount({alias:'matrix_'+tag+'_a',password:PASSWORD,mineId:mine.id}),b=await first.createAccount({alias:'matrix_'+tag+'_b',password:PASSWORD,mineId:mine.id}),op=await first.createAccount({alias:'matrix_'+tag+'_op',password:PASSWORD,mineId:mine.id,role:'operator'});
  for(const currency of CURRENCIES)await t.test(currency+': ingreso, retiro, doce pares de conversión e idempotencia',async()=>{
    const before=await first.getAccountState(a.id);
    await first.mutateAccount(a.id,command('deposit',{currency,amount:'1.25'}));
    await first.mutateAccount(a.id,command('withdraw',{currency,amount:'1.25'}));
    assert.deepEqual((await first.getAccountState(a.id)).walletMinor,before.walletMinor);
    for(const to of CURRENCIES.filter(code=>code!==currency)){
      const state=await first.getAccountState(a.id),amount=currency==='COP'?'10000.00':'1.00',minor=currency==='COP'?1000000:100;
      const convert=command('convert',{from:currency,to,amount}),expected=Math.floor(minor*state.demoRates[currency][to]/1000000);
      await first.mutateAccount(a.id,convert);
      const after=await first.getAccountState(a.id);
      assert.equal(after.walletMinor[currency],state.walletMinor[currency]-minor);assert.equal(after.walletMinor[to],state.walletMinor[to]+expected);
      await Promise.all([first.mutateAccount(a.id,convert),second.mutateAccount(a.id,convert)]);
      assert.deepEqual(await second.getAccountState(a.id),after);
    }
    const stable=await first.getAccountState(a.id);
    await assert.rejects(first.mutateAccount(a.id,command('withdraw',{currency,amount:'90000000.00'})));
    assert.deepEqual(await first.getAccountState(a.id),stable);
  });
  for(const metal of Object.keys(METALS))await t.test(metal+': compra, marketplace, venta, certificado, entrega, inventario y replay',async()=>{
    const buy=command('buy',{metal,grams:'0.500'});await first.mutateAccount(a.id,buy);
    const offer=await first.mutateAccount(a.id,command('offer',{metal,grams:'0.200',price:(METALS[metal].quoteCentsPerGram/100).toFixed(2)}));
    const reserved=await first.getAccountState(a.id);
    await assert.rejects(first.mutateAccount(a.id,command('sell',{metal,grams:'0.400'})));
    assert.deepEqual(await first.getAccountState(a.id),reserved);
    const fill=command('market_buy',{sellerId:a.id,offerId:offer.receipt.offer.id});
    await Promise.all([first.mutateAccount(b.id,fill),second.mutateAccount(b.id,fill)]);
    assert.equal((await first.getAccountState(b.id)).holdingsMg[metal],200);
    await first.mutateAccount(a.id,command('sell',{metal,grams:'0.100'}));
    const delivery=(await first.mutateAccount(a.id,command('delivery',{metal,grams:'0.100',jurisdiction:'DEMO_LOCAL'}))).receipt.delivery;
    const held=await first.getAccountState(a.id);
    await assert.rejects(first.mutateAccount(a.id,command('sell',{metal,grams:'0.200'})));
    assert.deepEqual(await first.getAccountState(a.id),held);
    const quote=(await first.mutateDelivery(op.id,command('delivery_quote',{buyerId:a.id,deliveryId:delivery.id,jurisdiction:'DEMO_LOCAL'}))).receipt.quote;
    const accept=command('delivery_accept',{deliveryId:delivery.id,quoteId:quote.id});await first.mutateAccount(a.id,accept);
    let final;
    for(const status of ['PREPARING','DISPATCHED_DEMO','DELIVERED_DEMO']){
      final=command('delivery_transition',{buyerId:a.id,deliveryId:delivery.id,status,reason:'Estado ficticio de la matriz de aceptación'});await first.mutateDelivery(op.id,final);
    }
    const beforeReplay=await first.getAccountState(a.id),custody=await first.getCustody(op.id,'operator');
    assert.equal(beforeReplay.holdingsMg[metal],100);assert.equal((await second.getAccountState(b.id)).holdingsMg[metal],200);
    assert.equal(custody.totals[metal].allocatedMg,300);assert.equal(custody.totals[metal].availableMg,24600);assert.equal(custody.totals[metal].deliveredMg,100);
    const own=await first.getCustody(a.id,'buyer'),allocation=own.allocations.find(item=>item.mg>0&&item.metal===metal);
    assert.ok(allocation);const certificate=await first.getCertificate(a.id,allocation.certificateId);assert.equal(certificate.demoOnly,true);
    await assert.rejects(first.getCertificate(b.id,allocation.certificateId),{status:404});
    const history=await first.getLotHistory(op.id,allocation.lotId);
    for(const kind of ['BUY','SELL','MARKET_TRANSFER','DELIVERY'])assert.equal(history.items.filter(item=>item.kind===kind).length,1);
    await Promise.all([second.mutateAccount(a.id,accept),second.mutateDelivery(op.id,final),first.mutateAccount(b.id,fill)]);
    assert.deepEqual(await first.getAccountState(a.id),beforeReplay);assert.deepEqual(await first.getLotHistory(op.id,allocation.lotId),history);
    const management=await first.getManagement(op.id);assert.deepEqual(management.kpis.metalVolumesMg[metal],{directBuy:500,directSell:100,marketplace:200});
    assert.equal(JSON.stringify(management).includes('walletMinor'),false);
    await assert.rejects(first.getManagement(a.id),{status:403});
  });
  let imported,importedState;
  await t.test('importación conserva las cuatro billeteras, cuatro metales y comprobantes; origen congelado',async()=>{
    const legacy='legacy-matrix-'+randomUUID();
    for(const currency of CURRENCIES)await first.mutate(legacy,command('deposit',{currency,amount:'1.25'}));
    for(const metal of Object.keys(METALS))await first.mutate(legacy,command('buy',{metal,grams:'0.100'}));
    const before=await first.get(legacy);
    imported=await first.createAccount({alias:'matrix_'+tag+'_import',password:PASSWORD,mineId:mine.id,legacySessionId:legacy});
    importedState=await second.getAccountState(imported.id);
    for(const key of ['walletMinor','holdingsMg','receipts','movements'])assert.deepEqual(importedState[key],before[key]);
    assert.deepEqual(await second.get(legacy),{...before,legacyReadOnly:true});
    await assert.rejects(second.mutate(legacy,command('deposit',{currency:'USD',amount:'1.00'})),{code:'LEGACY_CLAIMED'});
    await assert.rejects(second.createAccount({alias:'matrix_'+tag+'_duplicate',password:PASSWORD,mineId:mine.id,legacySessionId:legacy}),{code:'LEGACY_CLAIMED'});
    const custody=await first.getCustody(imported.id,'buyer');assert.equal(custody.allocations.filter(item=>item.mg>0).length,4);
    for(const metal of Object.keys(METALS))assert.equal((await first.getCustody(op.id,'operator')).totals[metal].allocatedMg,400);
  });
  await t.test('recuperación y perfil conservan el estado importado, rotan clave y revocan sesiones previas',async()=>{
    const login=await first.loginAccount(imported.alias,PASSWORD),profile={displayName:'Comprador matriz DEMO',preferredCurrency:'EUR',jurisdiction:'DEMO_REGIONAL'};
    await first.updateProfile(imported.id,profile);const setup=await first.setupRecovery(imported.id,PASSWORD);
    await assert.rejects(second.startRecovery(imported.alias,'x'.repeat(43)),{code:'RECOVERY_INVALID'});
    const challenge=await second.startRecovery(imported.alias,setup.recoveryKey),next='Exclusive-new-matrix-demo-987';
    const completed=await first.completeRecovery(challenge.token,next);assert.equal(completed.sessionsRevoked,true);
    await assert.rejects(second.authenticate(login.token),{status:401});await assert.rejects(first.loginAccount(imported.alias,PASSWORD),{status:401});
    const restored=await second.loginAccount(imported.alias,next);assert.equal(restored.account.id,imported.id);
    assert.deepEqual(await second.getAccountState(imported.id),importedState);assert.deepEqual((await second.getProfile(imported.id)).profile,profile);
    await assert.rejects(first.completeRecovery(challenge.token,next),{code:'RECOVERY_INVALID'});await assert.rejects(first.startRecovery(imported.alias,setup.recoveryKey),{code:'RECOVERY_INVALID'});
  });
  return {a,b,op,mine,state:await first.getAccountState(a.id),custody:await first.getCustody(op.id,'operator')};
}
