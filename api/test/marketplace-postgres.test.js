import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createStore} from '../src/store.js';

const databaseUrl=process.env.TEST_DATABASE_URL,PASSWORD='Exclusive-marketplace-pg-123';
const cmd=(action,body={})=>({action,...body,requestId:randomUUID()});
test('PostgreSQL marketplace: liquidación atómica, lotes exactos, concurrencia y recibos',{
  skip:databaseUrl?false:'Falta TEST_DATABASE_URL; marketplace PostgreSQL no se ha probado',timeout:120000,
},async t=>{
  const {default:pg}=await import('pg'),schema=`om_market_test_${randomUUID().replaceAll('-','')}`;
  const admin=new pg.Pool({connectionString:databaseUrl,max:1,connectionTimeoutMillis:8000});
  const scoped=new URL(databaseUrl);scoped.searchParams.set('options',`-c search_path=${schema}`);
  let a,b,mine,seller,buyerA,buyerB,operator,originalTrade,originalCommand,originalSellerReceipt,login;
  try{
    await admin.query(`CREATE SCHEMA "${schema}"`);[a,b]=await Promise.all([createStore(scoped.toString()),createStore(scoped.toString())]);
    mine=await a.createMine({name:'Mercado PG aislado',initialInventoryMg:{XAU:1000,XAG:0,XPT:0,XPD:0}});
    seller=await a.createAccount({alias:'pg_market_seller',password:PASSWORD,mineId:mine.id});buyerA=await a.createAccount({alias:'pg_market_a',password:PASSWORD,mineId:mine.id});buyerB=await b.createAccount({alias:'pg_market_b',password:PASSWORD,mineId:mine.id});operator=await a.createAccount({alias:'pg_market_op',password:PASSWORD,mineId:mine.id,role:'operator'});
    const stock=await a.mutateStock(operator.id,{metal:'XAU',grams:'2.000',reason:'Segundo lote PG DEMO',requestId:randomUUID()});
    await a.mutateAccount(seller.id,cmd('buy',{metal:'XAU',grams:'1.500'}));
    await t.test('transferencia conserva lotes de origen e inventario, y cobra una comisión única',async()=>{
      const offered=await a.mutateAccount(seller.id,cmd('offer',{metal:'XAU',grams:'1.000',price:'140.00'}));
      const beforeSeller=await a.getAccountState(seller.id),beforeBuyer=await b.getAccountState(buyerA.id),beforeMine=await a.getMineSummary(operator.id);
      const sellerLots=await a.getCustody(seller.id),sourceLot=sellerLots.lots.find(lot=>lot.id!==stock.receipt.lotId).id;
      originalCommand=cmd('market_buy',{sellerId:seller.id,offerId:offered.receipt.offer.id});originalTrade=await b.mutateAccount(buyerA.id,originalCommand);
      const afterSeller=await a.getAccountState(seller.id),afterBuyer=await b.getAccountState(buyerA.id),afterMine=await a.getMineSummary(operator.id);
      originalSellerReceipt=Object.values(afterSeller.receipts).find(receipt=>receipt.action==='market_sell');
      assert.equal(originalSellerReceipt.tradeId,originalTrade.receipt.tradeId);assert.equal(originalSellerReceipt.feeMinor,168);
      assert.equal(beforeBuyer.walletMinor.USDT+beforeSeller.walletMinor.USDT,afterBuyer.walletMinor.USDT+afterSeller.walletMinor.USDT+168);
      assert.equal(afterSeller.holdingsMg.XAU+afterBuyer.holdingsMg.XAU,1500);
      assert.deepEqual(afterMine.inventoryMg,beforeMine.inventoryMg);assert.deepEqual(afterMine.totalSupplyMg,beforeMine.totalSupplyMg);assert.deepEqual(afterMine.allocatedMg,beforeMine.allocatedMg);
      assert.equal(afterMine.transactionCount,beforeMine.transactionCount+1);assert.equal(afterMine.demoFeesCollectedMinor,beforeMine.demoFeesCollectedMinor+168);
      const custody=await b.getCustody(buyerA.id);assert.equal(custody.allocations.length,1);assert.equal(custody.allocations[0].lotId,sourceLot);assert.equal(custody.allocations[0].mg,1000);
      assert.equal((await a.getCertificate(buyerA.id,originalTrade.receipt.certificateIds[0])).lot.id,sourceLot);
      const viewed=await a.getMineReceipt(operator.id,seller.id,originalSellerReceipt.id);assert.equal(viewed.balancesAfter,undefined);assert.equal(viewed.operatorView,true);
    });
    await t.test('dos compradores concurrentes solo llenan la oferta una vez; replay no transfiere de nuevo',async()=>{
      const offered=await a.mutateAccount(seller.id,cmd('offer',{metal:'XAU',grams:'0.200',price:'140.00'})),key=randomUUID();
      const command={action:'market_buy',sellerId:seller.id,offerId:offered.receipt.offer.id,requestId:key};
      const outcomes=await Promise.allSettled([a.mutateAccount(buyerA.id,command),b.mutateAccount(buyerB.id,command)]);
      assert.equal(outcomes.filter(item=>item.status==='fulfilled').length,1);assert.equal(outcomes.find(item=>item.status==='rejected').reason.code,'OFFER_UNAVAILABLE');
      const winner=[buyerA,buyerB][outcomes.findIndex(item=>item.status==='fulfilled')],before=await a.getCustody(operator.id,'operator'),summary=await b.getMineSummary(operator.id);
      const replays=await Promise.all([a.mutateAccount(winner.id,command),b.mutateAccount(winner.id,command)]);assert.ok(replays.every(item=>item.receipt.replayed&&item.changed===false));
      assert.deepEqual(await b.getCustody(operator.id,'operator'),before);assert.deepEqual(await a.getMineSummary(operator.id),summary);
      await assert.rejects(a.mutateAccount(winner.id,{...command,offerId:'offer-999999'}));
    });
    await t.test('cancelación frente a compra no liquida una oferta cancelada ni libera gramos dos veces',async()=>{
      const offered=await a.mutateAccount(seller.id,cmd('offer',{metal:'XAU',grams:'0.100',price:'140.00'}));
      const before=await a.getMineSummary(operator.id),beforeBuyer=await a.getAccountState(buyerA.id);
      const outcomes=await Promise.allSettled([a.mutateAccount(seller.id,cmd('cancel_offer',{offerId:offered.receipt.offer.id})),b.mutateAccount(buyerA.id,cmd('market_buy',{sellerId:seller.id,offerId:offered.receipt.offer.id}))]);
      assert.equal(outcomes.filter(item=>item.status==='fulfilled').length,1);
      const state=await a.getAccountState(seller.id),offer=state.offers.find(item=>item.id===offered.receipt.offer.id),after=await a.getMineSummary(operator.id);
      assert.ok(['FILLED','CANCELLED'].includes(offer.status));assert.deepEqual(after.inventoryMg,before.inventoryMg);assert.equal(after.reservedMg.XAU,0);
      assert.equal(after.transactionCount,before.transactionCount+(offer.status==='FILLED'?1:0));
      if(offer.status==='CANCELLED')assert.deepEqual(await b.getAccountState(buyerA.id),beforeBuyer);
    });
    await t.test('fondos insuficientes, roles, legacy sin precio y minas ajenas rechazan sin cambios',async()=>{
      const offered=await a.mutateAccount(seller.id,cmd('offer',{metal:'XAU',grams:'0.100',price:'140.00'}));
      const current=await b.getAccountState(buyerB.id),amount=`${Math.floor(current.walletMinor.USDT/100)}.${String(current.walletMinor.USDT%100).padStart(2,'0')}`;
      await b.mutateAccount(buyerB.id,cmd('withdraw',{currency:'USDT',amount}));
      const before=await a.getMineSummary(operator.id),sellerBefore=await a.getAccountState(seller.id),buyerBefore=await b.getAccountState(buyerB.id);
      await assert.rejects(b.mutateAccount(buyerB.id,cmd('market_buy',{sellerId:seller.id,offerId:offered.receipt.offer.id})),{code:'INSUFFICIENT_BALANCE'});
      await assert.rejects(a.mutateAccount(seller.id,cmd('market_buy',{sellerId:seller.id,offerId:offered.receipt.offer.id})),{code:'OWN_OFFER'});
      await assert.rejects(a.mutateAccount(operator.id,cmd('market_buy',{sellerId:seller.id,offerId:offered.receipt.offer.id})),{status:403});
      assert.deepEqual(await a.getMineSummary(operator.id),before);assert.deepEqual(await a.getAccountState(seller.id),sellerBefore);assert.deepEqual(await b.getAccountState(buyerB.id),buyerBefore);
      const otherMine=await a.createMine({name:'Otra mina PG mercado'}),other=await b.createAccount({alias:'pg_market_other',password:PASSWORD,mineId:otherMine.id});
      await assert.rejects(b.mutateAccount(other.id,cmd('market_buy',{sellerId:seller.id,offerId:offered.receipt.offer.id})),{status:404});assert.equal((await b.getMarketplace(other.id)).offers.length,0);
      const legacy=await a.mutateAccount(seller.id,cmd('offer',{metal:'XAU',grams:'0.100'}));
      await assert.rejects(a.mutateAccount(buyerA.id,cmd('market_buy',{sellerId:seller.id,offerId:legacy.receipt.offer.id})),{code:'LEGACY_NO_PRICE'});
      await a.mutateAccount(seller.id,cmd('cancel_offer',{offerId:legacy.receipt.offer.id}));
    });
    await t.test('reconectar conserva token, recibos originales, historial privado y replay idempotente',async()=>{
      login=await a.loginAccount(buyerA.alias,PASSWORD);const before=await a.getAccountState(buyerA.id),sellerBefore=await b.getAccountState(seller.id),custody=await a.getCustody(operator.id,'operator');
      await a.close();a=await createStore(scoped.toString());assert.equal((await a.authenticate(login.token)).account.id,buyerA.id);
      const replay=await a.mutateAccount(buyerA.id,originalCommand);assert.deepEqual(replay.receipt,{...originalTrade.receipt,replayed:true});
      assert.deepEqual(await a.getAccountState(buyerA.id),before);assert.deepEqual(await b.getAccountState(seller.id),sellerBefore);assert.deepEqual(await a.getCustody(operator.id,'operator'),custody);
      assert.deepEqual(before.receipts[originalTrade.receipt.id],originalTrade.receipt);assert.equal(sellerBefore.receipts[originalSellerReceipt.id].tradeId,originalTrade.receipt.tradeId);
      assert.equal(Object.hasOwn((await b.getAccountState(buyerB.id)).receipts,originalTrade.receipt.id),false);
      const summary=await a.getMineSummary(operator.id),states=await Promise.all([seller,buyerA,buyerB].map(account=>a.getAccountState(account.id)));
      const receipts=states.flatMap(state=>Object.values(state.receipts));
      assert.equal(summary.demoFeesCollectedMinor,receipts.filter(receipt=>['buy','sell','market_sell'].includes(receipt.action)).reduce((sum,receipt)=>sum+(receipt.feeMinor||0),0));
      assert.equal(summary.transactionCount,receipts.filter(receipt=>['buy','sell','market_buy'].includes(receipt.action)).length);
    });
  }finally{
    try{if(a)await a.close();if(b)await b.close();}
    finally{try{await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);}finally{await admin.end();}}
  }
});
