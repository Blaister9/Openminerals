import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createStore} from '../src/store.js';

const databaseUrl=process.env.TEST_DATABASE_URL,PASSWORD='Exclusive-delivery-pg-demo-123';
const cmd=(action,body={})=>({action,...body,requestId:randomUUID()});
const minor=value=>`${Math.floor(value/100)}.${String(value%100).padStart(2,'0')}`;
test('PostgreSQL entrega DEMO: ciclo durable, reservas, costes y suministro por lotes',{
  skip:databaseUrl?false:'Falta TEST_DATABASE_URL; entregas PostgreSQL no se han probado',timeout:120000,
},async t=>{
  const {default:pg}=await import('pg'),schema=`om_delivery_test_${randomUUID().replaceAll('-','')}`;
  const admin=new pg.Pool({connectionString:databaseUrl,max:1,connectionTimeoutMillis:8000});
  const scoped=new URL(databaseUrl);scoped.searchParams.set('options',`-c search_path=${schema}`);
  let a,b,mine,buyerA,buyerB,operator,delivery,quote,accept,accepted,finalCommand,finalReceipt,firstCertificate;
  const transition=status=>cmd('delivery_transition',{buyerId:buyerA.id,deliveryId:delivery.id,status,reason:'Estado exclusivamente ficticio de prueba'});
  try{
    await admin.query(`CREATE SCHEMA "${schema}"`);[a,b]=await Promise.all([createStore(scoped.toString()),createStore(scoped.toString())]);
    mine=await a.createMine({name:'Entrega PG aislada',initialInventoryMg:{XAU:1000,XAG:1000,XPT:1000,XPD:1000}});
    buyerA=await a.createAccount({alias:'pg_delivery_a',password:PASSWORD,mineId:mine.id});buyerB=await b.createAccount({alias:'pg_delivery_b',password:PASSWORD,mineId:mine.id});operator=await a.createAccount({alias:'pg_delivery_op',password:PASSWORD,mineId:mine.id,role:'operator'});
    const bought=await a.mutateAccount(buyerA.id,cmd('buy',{metal:'XAU',grams:'0.500'}));firstCertificate=bought.receipt.certificateIds[0];await b.mutateAccount(buyerB.id,cmd('buy',{metal:'XAU',grams:'0.200'}));
    await t.test('solicitud y cotización conservan snapshot y una sola reserva entre pools',async()=>{
      delivery=(await a.mutateAccount(buyerA.id,cmd('delivery',{metal:'XAU',grams:'0.300',jurisdiction:'DEMO_LOCAL'}))).receipt.delivery;
      const command=cmd('delivery_quote',{buyerId:buyerA.id,deliveryId:delivery.id,jurisdiction:'DEMO_LOCAL'});quote=await b.mutateDelivery(operator.id,command);
      const replays=await Promise.all([a.mutateDelivery(operator.id,command),b.mutateDelivery(operator.id,command)]);assert.ok(replays.every(item=>item.receipt.replayed&&item.changed===false));
      const summary=await a.getMineSummary(operator.id);assert.equal(summary.reservedMg.XAU,300);assert.equal(summary.allocatedMg.XAU,700);assert.equal(summary.inventoryMg.XAU,300);
      assert.equal((await a.getDeliveries(buyerA.id)).requests[0].quote.id,quote.receipt.quote.id);assert.equal(quote.receipt.balancesAfter,undefined);
      const view=await b.getDeliveries(operator.id,'operator');assert.equal(JSON.stringify(view).includes('walletMinor'),false);
      assert.deepEqual(await a.getMineCommand(operator.id,command.requestId),quote.receipt);
      await assert.rejects(a.mutateAccount(buyerA.id,cmd('sell',{metal:'XAU',grams:'0.300'})),{code:'INSUFFICIENT_HOLDING'});
    });
    await t.test('aceptaciones concurrentes con una clave cobran una sola vez y no liberan reserva',async()=>{
      const before=await a.getAccountState(buyerA.id);accept=cmd('delivery_accept',{deliveryId:delivery.id,quoteId:quote.receipt.quote.id});
      const results=await Promise.all([a.mutateAccount(buyerA.id,accept),b.mutateAccount(buyerA.id,accept)]);assert.equal(results.filter(item=>item.changed).length,1);assert.equal(results.filter(item=>item.receipt.replayed).length,1);accepted=results.find(item=>item.changed);
      const after=await b.getAccountState(buyerA.id);assert.equal(after.walletMinor.USDT,before.walletMinor.USDT-quote.receipt.quote.totalMinor);assert.equal(after.custodyRequests[0].status,'APPROVED');assert.equal((await a.getMineSummary(operator.id)).reservedMg.XAU,300);
      await assert.rejects(a.mutateAccount(buyerA.id,{...accept,quoteId:'quote-altered'}));
      await assert.rejects(b.mutateAccount(buyerA.id,cmd('cancel_delivery',{deliveryId:delivery.id})));
      await assert.rejects(a.mutateDelivery(operator.id,transition('DELIVERED_DEMO')),{code:'INVALID_DELIVERY_STATE'});
      assert.deepEqual(await a.getAccountState(buyerA.id),after);
    });
    await t.test('transiciones idempotentes finalizan una sola vez, sin cambiar peso original ni disponible',async()=>{
      const before=await a.getMineSummary(operator.id);
      for(const status of ['PREPARING','DISPATCHED_DEMO','DELIVERED_DEMO']){
        const command=transition(status),outcomes=await Promise.all([a.mutateDelivery(operator.id,command),b.mutateDelivery(operator.id,command)]);
        assert.equal(outcomes.filter(item=>item.changed).length,1);assert.equal(outcomes.filter(item=>item.receipt.replayed).length,1);
        if(status==='DELIVERED_DEMO'){finalCommand=command;finalReceipt=outcomes.find(item=>item.changed).receipt;}
        else assert.equal((await a.getMineSummary(operator.id)).reservedMg.XAU,300);
      }
      const after=await a.getMineSummary(operator.id),custody=await b.getCustody(operator.id,'operator'),state=await a.getAccountState(buyerA.id);
      assert.equal(state.holdingsMg.XAU,200);assert.equal(after.reservedMg.XAU,0);assert.equal(after.totalSupplyMg.XAU,700);assert.equal(after.inventoryMg.XAU,before.inventoryMg.XAU);
      assert.equal(after.inventoryMg.XAU+after.allocatedMg.XAU,700);assert.equal(custody.totals.XAU.weightMg,1000);assert.equal(custody.totals.XAU.deliveredMg,300);assert.equal(custody.totals.XAU.activeWeightMg,700);
      const cert=await a.getCertificate(buyerA.id,firstCertificate);assert.equal(cert.issuedMg,500);assert.equal(cert.allocatedMg,200);
      await assert.rejects(a.mutateDelivery(operator.id,transition('DELIVERED_DEMO')),{code:'INVALID_DELIVERY_STATE'});assert.deepEqual(await b.getMineSummary(operator.id),after);
    });
    await t.test('recotización, vencimiento y falta de saldo rechazan con rollback de cuenta/mina',async()=>{
      const second=(await b.mutateAccount(buyerB.id,cmd('delivery',{metal:'XAU',grams:'0.100'}))).receipt.delivery;
      const quoteCommand=jurisdiction=>cmd('delivery_quote',{buyerId:buyerB.id,deliveryId:second.id,jurisdiction});
      const q1=await a.mutateDelivery(operator.id,quoteCommand('DEMO_LOCAL')),q2=await b.mutateDelivery(operator.id,quoteCommand('DEMO_REGIONAL'));
      const before=await a.getAccountState(buyerB.id);
      await assert.rejects(a.mutateAccount(buyerB.id,cmd('delivery_accept',{deliveryId:second.id,quoteId:q1.receipt.quote.id})),{code:'STALE_QUOTE'});assert.deepEqual(await b.getAccountState(buyerB.id),before);
      const raw=(await admin.query(`SELECT state FROM "${schema}".demo_accounts WHERE id=$1`,[buyerB.id])).rows[0].state;raw.custodyRequests.find(item=>item.id===second.id).quote.expiresAt='2000-01-01T00:00:00.000Z';
      await admin.query(`UPDATE "${schema}".demo_accounts SET state=$2::jsonb WHERE id=$1`,[buyerB.id,JSON.stringify(raw)]);
      const expired=await b.getAccountState(buyerB.id);await assert.rejects(a.mutateAccount(buyerB.id,cmd('delivery_accept',{deliveryId:second.id,quoteId:q2.receipt.quote.id})),{code:'QUOTE_EXPIRED'});assert.deepEqual(await b.getAccountState(buyerB.id),expired);
      const fresh=await a.mutateDelivery(operator.id,quoteCommand('DEMO_LOCAL'));await b.mutateAccount(buyerB.id,cmd('withdraw',{currency:'USDT',amount:minor(expired.walletMinor.USDT)}));
      const empty=await b.getAccountState(buyerB.id),mineBefore=await a.getMineSummary(operator.id);
      await assert.rejects(a.mutateAccount(buyerB.id,cmd('delivery_accept',{deliveryId:second.id,quoteId:fresh.receipt.quote.id})),{code:'INSUFFICIENT_BALANCE'});assert.deepEqual(await b.getAccountState(buyerB.id),empty);assert.deepEqual(await a.getMineSummary(operator.id),mineBefore);
      const rejection=cmd('delivery_transition',{buyerId:buyerB.id,deliveryId:second.id,status:'REJECTED',reason:'Rechazo ficticio previo a aceptar'});await a.mutateDelivery(operator.id,rejection);await b.mutateDelivery(operator.id,rejection);assert.equal((await a.getMineSummary(operator.id)).reservedMg.XAU,0);
    });
    await t.test('los cuatro metales conservan peso histórico y retiran solo suministro activo entregado',async()=>{
      for(const metal of ['XAU','XAG','XPT','XPD']){
        if(metal!=='XAU')await a.mutateAccount(buyerA.id,cmd('buy',{metal,grams:'0.100'}));
        const request=(await a.mutateAccount(buyerA.id,cmd('delivery',{metal,grams:'0.100'}))).receipt.delivery;
        const q=await b.mutateDelivery(operator.id,cmd('delivery_quote',{buyerId:buyerA.id,deliveryId:request.id,jurisdiction:'DEMO_LOCAL'}));await a.mutateAccount(buyerA.id,cmd('delivery_accept',{deliveryId:request.id,quoteId:q.receipt.quote.id}));
        for(const status of ['PREPARING','DISPATCHED_DEMO','DELIVERED_DEMO'])await b.mutateDelivery(operator.id,cmd('delivery_transition',{buyerId:buyerA.id,deliveryId:request.id,status,reason:'Recorrido ficticio por metal'}));
      }
      const custody=await a.getCustody(operator.id,'operator'),summary=await b.getMineSummary(operator.id);
      for(const metal of ['XAU','XAG','XPT','XPD']){
        assert.equal(custody.totals[metal].weightMg,1000);assert.equal(custody.totals[metal].deliveredMg,metal==='XAU'?400:100);assert.equal(custody.totals[metal].activeWeightMg,summary.totalSupplyMg[metal]);assert.equal(summary.inventoryMg[metal]+summary.allocatedMg[metal],summary.totalSupplyMg[metal]);
      }
    });
    await t.test('colisión adversarial de recibo derivado revierte mina y comprador en PostgreSQL',async()=>{
      const request=(await a.mutateAccount(buyerA.id,cmd('delivery',{metal:'XAU',grams:'0.100'}))).receipt.delivery,operatorKey=randomUUID();
      const derived=`delivery-command-${createHash('sha256').update(JSON.stringify([operator.id,operatorKey])).digest('hex').slice(0,32)}`;
      const deposit=await b.mutateAccount(buyerA.id,{action:'deposit',currency:'USD',amount:'0.01',requestId:derived});
      const before=await a.getAccountState(buyerA.id),custody=await a.getCustody(operator.id,'operator'),summary=await b.getMineSummary(operator.id);
      await assert.rejects(a.mutateDelivery(operator.id,{action:'delivery_quote',buyerId:buyerA.id,deliveryId:request.id,jurisdiction:'DEMO_LOCAL',requestId:operatorKey}),{code:'RECEIPT_CONFLICT'});
      assert.deepEqual(await b.getAccountState(buyerA.id),before);assert.deepEqual(await a.getCustody(operator.id,'operator'),custody);assert.deepEqual(await b.getMineSummary(operator.id),summary);assert.deepEqual(before.receipts[derived],deposit.receipt);
      await assert.rejects(b.getMineCommand(operator.id,operatorKey),{status:404});
      await a.mutateAccount(buyerA.id,cmd('cancel_delivery',{deliveryId:request.id}));
    });
    await t.test('configuración auditable, permisos y recibos sobreviven reconexión sin exponer saldos',async()=>{
      const command=cmd('delivery_config',{jurisdiction:'DEMO_LOCAL',label:'Política PG ficticia',taxBps:'500',service:'2.00',preparation:'1.00',transport:'4.00',insuranceBps:'50',quoteValidityHours:'48',requirements:'Alias ficticio\nAceptar simulación',reason:'Cambio de política DEMO PG'});
      const configured=await a.mutateDelivery(operator.id,command),snapshot=await a.getDeliveries(operator.id,'operator');await b.mutateDelivery(operator.id,command);assert.deepEqual(await b.getDeliveries(operator.id,'operator'),snapshot);
      assert.equal(snapshot.audit.length,1);assert.equal(configured.receipt.mineId,mine.id);
      await assert.rejects(a.mutateDelivery(buyerA.id,command),{status:403});await assert.rejects(b.getDeliveries(buyerA.id,'operator'),{status:403});
      const otherMine=await a.createMine({name:'Otra mina entrega PG'}),other=await b.createAccount({alias:'pg_delivery_other',password:PASSWORD,mineId:otherMine.id,role:'operator'});
      await assert.rejects(b.mutateDelivery(other.id,{...finalCommand,requestId:randomUUID()}),{status:404});await assert.rejects(b.getMineCommand(other.id,finalCommand.requestId),{status:404});
      const login=await a.loginAccount(buyerA.alias,PASSWORD),before=await a.getAccountState(buyerA.id),custody=await a.getCustody(operator.id,'operator');await a.close();a=await createStore(scoped.toString());
      assert.equal((await a.authenticate(login.token)).account.id,buyerA.id);assert.deepEqual(await a.getMineCommand(operator.id,finalCommand.requestId),finalReceipt);
      const replay=await a.mutateAccount(buyerA.id,accept);assert.deepEqual(replay.receipt,{...accepted.receipt,replayed:true});await b.mutateDelivery(operator.id,finalCommand);
      assert.deepEqual(await a.getAccountState(buyerA.id),before);assert.deepEqual(await b.getCustody(operator.id,'operator'),custody);assert.equal(JSON.stringify(await a.getDeliveries(operator.id,'operator')).includes('walletMinor'),false);
    });
  }finally{
    try{if(a)await a.close();if(b)await b.close();}
    finally{try{await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);}finally{await admin.end();}}
  }
});
