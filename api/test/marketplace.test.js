import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {createStore} from '../src/store.js';
import {createApiServer} from '../src/server.js';
import {marketQuote} from '../src/marketplace.js';
import {seedState,applyCommand} from '../src/domain.js';

const PASSWORD='Exclusive-marketplace-unit-123';
const command=(action,body={})=>({action,...body,requestId:randomUUID()});
async function fixture(){
  const store=await createStore(''),mine=await store.createMine({name:'Mercado DEMO aislado',initialInventoryMg:{XAU:1000,XAG:1000,XPT:1000,XPD:1000}}),users={};
  for(const [name,role] of [['seller','buyer'],['a','buyer'],['b','buyer'],['op','operator']])users[name]=await store.createAccount({alias:`market_${name}`,password:PASSWORD,mineId:mine.id,role});
  return {store,mine,...users};
}
async function publish(f,{metal='XAU',grams='0.500',price='140.00'}={}){
  await f.store.mutateAccount(f.seller.id,command('buy',{metal,grams}));
  const result=await f.store.mutateAccount(f.seller.id,command('offer',{metal,grams,...(price===null?{}:{price})}));
  return result.receipt.offer;
}
const allocationByLot=custody=>Object.fromEntries(custody.allocations.filter(item=>item.mg).map(item=>[item.lotId,item.mg]));

test('marketplace: cotización entera, precio inválido/neto cero y ofertas legacy sin precio',()=>{
  assert.deepEqual(marketQuote(100,101,120),{baseMinor:11,feeMinor:1,sellerNetMinor:10,feeBps:120});
  assert.throws(()=>marketQuote(100,1,120));assert.throws(()=>marketQuote(1_000_000_000,10_000_000_000,120));
  let state=applyCommand(seedState(),command('buy',{metal:'XAU',grams:'0.100'})).state;
  for(const price of ['0.00','0.01','1,25','-1','1e3'])assert.throws(()=>applyCommand(state,command('offer',{metal:'XAU',grams:'0.100',price})));
  const legacy=applyCommand(state,command('offer',{metal:'XAU',grams:'0.100'}));assert.equal(legacy.receipt.offer.priceMinorPerGram,undefined);
});

test('marketplace: liquidación transfiere lotes exactos, dos recibos privados y comisión única',async()=>{
  const f=await fixture();
  try{
    const stock=await f.store.mutateStock(f.op.id,{metal:'XAU',grams:'2.000',reason:'Segundo lote DEMO',requestId:randomUUID()});
    const originalBuy=await f.store.mutateAccount(f.seller.id,command('buy',{metal:'XAU',grams:'1.500'}));
    const offered=await f.store.mutateAccount(f.seller.id,command('offer',{metal:'XAU',grams:'1.000',price:'140.00'})),offer=offered.receipt.offer;
    const sellerBefore=await f.store.getAccountState(f.seller.id),buyerBefore=await f.store.getAccountState(f.a.id),mineBefore=await f.store.getMineSummary(f.op.id);
    const custodyBefore=await f.store.getCustody(f.seller.id),firstLot=custodyBefore.lots.find(lot=>lot.id!==stock.receipt.lotId).id;
    const catalog=await f.store.getMarketplace(f.a.id),entry=catalog.offers.find(item=>item.id===offer.id&&item.seller.id===f.seller.id);
    assert.equal(entry.priceMinorPerGram,14000);assert.equal(entry.baseMinor,14000);assert.equal(entry.feeMinor,168);assert.equal(entry.sellerNetMinor,13832);assert.equal(entry.canBuy,true);
    assert.equal(JSON.stringify(catalog).includes('walletMinor'),false);assert.equal(JSON.stringify(catalog).includes('balancesAfter'),false);
    const buy=command('market_buy',{sellerId:f.seller.id,offerId:offer.id}),trade=await f.store.mutateAccount(f.a.id,buy);
    const sellerAfter=await f.store.getAccountState(f.seller.id),buyerAfter=await f.store.getAccountState(f.a.id),mineAfter=await f.store.getMineSummary(f.op.id);
    const sellReceipt=Object.values(sellerAfter.receipts).find(receipt=>receipt.action==='market_sell');
    assert.equal(trade.receipt.action,'market_buy');assert.equal(sellReceipt.tradeId,trade.receipt.tradeId);
    assert.equal(sellerAfter.offers[0].status,'FILLED');assert.equal(trade.receipt.totalMinor,14000);assert.equal(sellReceipt.outputMinor,13832);
    assert.equal(buyerBefore.walletMinor.USDT+sellerBefore.walletMinor.USDT,buyerAfter.walletMinor.USDT+sellerAfter.walletMinor.USDT+168);
    assert.equal(buyerAfter.holdingsMg.XAU,1000);assert.equal(sellerAfter.holdingsMg.XAU,500);
    assert.deepEqual(mineAfter.inventoryMg,mineBefore.inventoryMg);assert.deepEqual(mineAfter.totalSupplyMg,mineBefore.totalSupplyMg);assert.deepEqual(mineAfter.allocatedMg,mineBefore.allocatedMg);
    assert.equal(mineAfter.transactionCount,mineBefore.transactionCount+1);assert.equal(mineAfter.demoFeesCollectedMinor,mineBefore.demoFeesCollectedMinor+168);
    assert.deepEqual(allocationByLot(await f.store.getCustody(f.a.id)),{[firstLot]:1000});
    assert.deepEqual(allocationByLot(await f.store.getCustody(f.seller.id)),{[stock.receipt.lotId]:500});
    const certificate=await f.store.getCertificate(f.a.id,trade.receipt.certificateIds[0]);assert.equal(certificate.lot.id,firstLot);assert.equal(certificate.allocatedMg,1000);
    assert.deepEqual(sellerAfter.receipts[originalBuy.receipt.id],originalBuy.receipt);assert.deepEqual(sellerAfter.receipts[offered.receipt.id],offered.receipt);
    assert.equal(trade.receipt.balancesAfter.walletMinor.USDT,buyerAfter.walletMinor.USDT);assert.equal(sellReceipt.balancesAfter.walletMinor.USDT,sellerAfter.walletMinor.USDT);
    for(const [accountId,receiptId] of [[f.a.id,trade.receipt.id],[f.seller.id,sellReceipt.id]]){
      const viewed=await f.store.getMineReceipt(f.op.id,accountId,receiptId);assert.equal(viewed.operatorView,true);assert.equal(viewed.balancesAfter,undefined);
    }
    const replay=await f.store.mutateAccount(f.a.id,buy);assert.deepEqual(replay.receipt,{...trade.receipt,replayed:true});
    assert.deepEqual(await f.store.getAccountState(f.a.id),buyerAfter);assert.deepEqual(await f.store.getAccountState(f.seller.id),sellerAfter);
    await assert.rejects(f.store.mutateAccount(f.a.id,{...buy,offerId:'offer-99999'}));
    assert.deepEqual(await f.store.getMineSummary(f.op.id),mineAfter);
  }finally{await f.store.close();}
});

test('marketplace: compradores concurrentes liquidan una vez y no comparten claves idempotentes',async()=>{
  const f=await fixture();
  try{
    const offer=await publish(f),key=randomUUID();
    const buys=[f.a,f.b].map(buyer=>f.store.mutateAccount(buyer.id,{action:'market_buy',sellerId:f.seller.id,offerId:offer.id,requestId:key}));
    const outcomes=await Promise.allSettled(buys);assert.equal(outcomes.filter(item=>item.status==='fulfilled').length,1);assert.equal(outcomes.find(item=>item.status==='rejected').reason.code,'OFFER_UNAVAILABLE');
    const winner=outcomes.findIndex(item=>item.status==='fulfilled'),user=[f.a,f.b][winner];
    const before=await f.store.getCustody(f.op.id,'operator');
    const replays=await Promise.all([1,2].map(()=>f.store.mutateAccount(user.id,{action:'market_buy',sellerId:f.seller.id,offerId:offer.id,requestId:key})));
    assert.ok(replays.every(item=>item.changed===false&&item.receipt.replayed));assert.deepEqual(await f.store.getCustody(f.op.id,'operator'),before);
    assert.equal(before.allocations.filter(item=>item.account.id===user.id&&item.mg>0).length,1);
    assert.equal((await f.store.getMineSummary(f.op.id)).transactionCount,2);
  }finally{await f.store.close();}
});

test('marketplace: saldo insuficiente, oferta propia, legacy y otra mina no mutan datos',async()=>{
  const f=await fixture();
  try{
    const offer=await publish(f);await f.store.mutateAccount(f.a.id,command('withdraw',{currency:'USDT',amount:'250.00'}));
    const buyerBefore=await f.store.getAccountState(f.a.id),sellerBefore=await f.store.getAccountState(f.seller.id),mineBefore=await f.store.getMineSummary(f.op.id);
    await assert.rejects(f.store.mutateAccount(f.a.id,command('market_buy',{sellerId:f.seller.id,offerId:offer.id})),{code:'INSUFFICIENT_BALANCE'});
    await assert.rejects(f.store.mutateAccount(f.seller.id,command('market_buy',{sellerId:f.seller.id,offerId:offer.id})),{code:'OWN_OFFER'});
    await assert.rejects(f.store.mutateAccount(f.op.id,command('market_buy',{sellerId:f.seller.id,offerId:offer.id})),{status:403});
    assert.deepEqual(await f.store.getAccountState(f.a.id),buyerBefore);assert.deepEqual(await f.store.getAccountState(f.seller.id),sellerBefore);assert.deepEqual(await f.store.getMineSummary(f.op.id),mineBefore);
    const otherMine=await f.store.createMine({name:'Otra mina mercado'}),other=await f.store.createAccount({alias:'market_other',password:PASSWORD,mineId:otherMine.id});
    await assert.rejects(f.store.mutateAccount(other.id,command('market_buy',{sellerId:f.seller.id,offerId:offer.id})),{status:404});assert.equal((await f.store.getMarketplace(other.id)).offers.length,0);
    const legacy=await publish(f,{grams:'0.100',price:null});const catalog=await f.store.getMarketplace(f.b.id),entry=catalog.offers.find(item=>item.id===legacy.id);
    assert.equal(entry.canBuy,false);assert.equal(entry.priceMinorPerGram,null);assert.equal(entry.unavailableReason,'LEGACY_NO_PRICE');
    await assert.rejects(f.store.mutateAccount(f.b.id,command('market_buy',{sellerId:f.seller.id,offerId:legacy.id})),{code:'LEGACY_NO_PRICE'});
    await f.store.mutateAccount(f.seller.id,command('cancel_offer',{offerId:legacy.id}));assert.equal((await f.store.getMarketplace(f.b.id)).offers.some(item=>item.id===legacy.id),false);
  }finally{await f.store.close();}
});

test('marketplace: cancelar y comprar en carrera tienen un solo resultado efectivo',async()=>{
  for(const buyFirst of [false,true]){
    const f=await fixture();
    try{
      const offer=await publish(f),buyerBefore=await f.store.getAccountState(f.a.id),mineBefore=await f.store.getMineSummary(f.op.id);
      const buy=()=>f.store.mutateAccount(f.a.id,command('market_buy',{sellerId:f.seller.id,offerId:offer.id})),cancel=()=>f.store.mutateAccount(f.seller.id,command('cancel_offer',{offerId:offer.id}));
      const outcomes=await Promise.allSettled(buyFirst?[buy(),cancel()]:[cancel(),buy()]);assert.equal(outcomes.filter(item=>item.status==='fulfilled').length,1);
      const after=await f.store.getAccountState(f.seller.id),buyerAfter=await f.store.getAccountState(f.a.id),mineAfter=await f.store.getMineSummary(f.op.id);
      assert.equal(after.offers[0].status,buyFirst?'FILLED':'CANCELLED');assert.equal(buyerAfter.holdingsMg.XAU,buyFirst?500:0);
      assert.equal(mineAfter.transactionCount,mineBefore.transactionCount+(buyFirst?1:0));assert.deepEqual(mineAfter.inventoryMg,mineBefore.inventoryMg);
      if(!buyFirst)assert.deepEqual(buyerAfter,buyerBefore);
    }finally{await f.store.close();}
  }
});

test('marketplace HTTP: contrato, autenticación, privacidad de historial y comprobantes',async()=>{
  const f=await fixture(),server=createApiServer(f.store);server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
  const request=async(path,token,body,key)=>{const response=await fetch(base+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:`Bearer ${token}`} :{}),...(body?{'Content-Type':'application/json'}:{}),...(key?{'Idempotency-Key':key}:{})},body:body?JSON.stringify(body):undefined});return {status:response.status,data:await response.json()};};
  try{
    const tokens={};for(const name of ['seller','a','b','op'])tokens[name]=(await f.store.loginAccount(f[name].alias,PASSWORD)).token;
    const bought=await request('/api/demo/buy',tokens.seller,{metal:'XAU',grams:'0.500'},randomUUID());assert.equal(bought.status,200);
    const published=await request('/api/demo/offer',tokens.seller,{metal:'XAU',grams:'0.500',price:'140.00'},randomUUID());assert.equal(published.status,200);const offer=published.data.receipt.offer;
    assert.equal((await request('/api/demo/marketplace')).status,401);assert.equal((await request('/api/demo/marketplace',tokens.op)).status,403);
    const catalog=await request('/api/demo/marketplace',tokens.a);assert.equal(catalog.status,200);assert.equal(catalog.data.offers[0].seller.alias,f.seller.alias);
    assert.equal((await request('/api/demo/marketplace',tokens.seller)).data.offers[0].canBuy,false);
    const key=randomUUID(),trade=await request('/api/demo/market_buy',tokens.a,{sellerId:f.seller.id,offerId:offer.id},key);assert.equal(trade.status,200);
    const replay=await request('/api/demo/market_buy',tokens.a,{sellerId:f.seller.id,offerId:offer.id},key);assert.equal(replay.data.receipt.replayed,true);
    assert.equal((await request(`/api/demo/receipts/${trade.data.receipt.id}`,tokens.b)).status,404);
    const history=await request('/api/demo/history?limit=20',tokens.seller);const sellerReceipt=history.data.items.find(item=>item.action==='market_sell');assert.equal(sellerReceipt.tradeId,trade.data.receipt.tradeId);
    assert.equal((await request(`/api/demo/receipts/${sellerReceipt.id}`,tokens.a)).status,404);
    const operator=await request(`/api/demo/mine/receipts/${f.seller.id}/${sellerReceipt.id}`,tokens.op);assert.equal(operator.status,200);assert.equal(operator.data.balancesAfter,undefined);
    assert.equal((await request('/api/demo/market_buy',tokens.op,{sellerId:f.seller.id,offerId:offer.id},randomUUID())).status,403);
    assert.equal((await request('/api/demo/market_buy',tokens.a,{sellerId:f.seller.id,offerId:offer.id,price:'0.01'},randomUUID())).status,400);
    assert.equal((await request('/api/demo/market_buy',tokens.a,{sellerId:{invalid:true},offerId:offer.id},randomUUID())).status,400);
  }finally{await new Promise(resolve=>server.close(resolve));await f.store.close();}
});
