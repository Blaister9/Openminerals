import assert from 'node:assert/strict';
import {lotFixture,lotJourney,lotCommand} from './lot-history-fixture.js';

export const command=lotCommand;
export async function digitalJourney(store,tag){
  const f=await lotFixture(store,tag),commands=await lotJourney(f);
  const view=await store.getDigitalUnits(f.op.id,new URLSearchParams('limit=100'));
  const gold=view.reconciliation.metals.XAU;
  assert.deepEqual(gold,{outstandingUnits:300,reservedUnits:0,availableUnits:300,eligibleMg:3800,unissuedUnits:3500,inventoryMg:3500});
  assert.equal(view.reconciliation.ok,true);assert.equal(view.network,'offchain-demo');
  assert.equal(view.events.filter(item=>item.type==='ISSUE').reduce((sum,item)=>sum+item.units,0),600);
  assert.equal(view.events.filter(item=>item.type==='TRANSFER').reduce((sum,item)=>sum+item.units,0),500);
  assert.equal(view.events.filter(item=>item.type==='CANCEL').reduce((sum,item)=>sum+item.units,0),300);
  assert.ok(view.events.some(item=>item.type==='CANCEL'&&item.reason==='delivery_transition'));
  for(const series of view.series){
    assert.equal(series.massBasis,'gross-lot-mass');assert.equal(series.demoOnly,true);
    assert.ok(view.balances.filter(item=>item.seriesId===series.id).reduce((sum,item)=>sum+item.units,0)<=series.eligibleMg);
  }
  for(const balance of view.balances){
    const certificate=await store.getCertificate(balance.ownerId,balance.certificateId);
    assert.equal(certificate.allocatedMg,balance.units);assert.equal(certificate.lot.id,view.series.find(item=>item.id===balance.seriesId).lotId);
  }
  // Durable replay preserves exactly the audit head and all event identities.
  for(const [accountId,cmd] of [[f.a.id,commands.first],[f.a.id,commands.second],[f.b.id,commands.market],[f.a.id,commands.sell]])assert.equal((await store.mutateAccount(accountId,cmd)).changed,false);
  assert.equal((await store.mutateDelivery(f.op.id,commands.delivered)).changed,false);
  assert.equal((await store.mutateStock(f.op.id,commands.stock)).changed,false);
  assert.deepEqual(await store.getDigitalUnits(f.op.id,new URLSearchParams('limit=100')),view);
  return {...f,commands,view};
}
export async function digitalRaces(a,b,tag){
  const mine=await a.createMine({name:'Concurrencia de unidades exclusivamente DEMO',initialInventoryMg:{XAU:1000}});
  const password='Digital-race-tests-only-123';
  const [one,two,three,op]=await Promise.all([['one','buyer'],['two','buyer'],['three','buyer'],['op','operator']].map(([name,role])=>a.createAccount({alias:`digital_${tag}_${name}`,password,mineId:mine.id,role})));
  const buy=command('buy',{metal:'XAU',grams:'0.600'});
  const outcomes=await Promise.allSettled([a.mutateAccount(one.id,buy),b.mutateAccount(two.id,command('buy',{metal:'XAU',grams:'0.600'}))]);
  assert.equal(outcomes.filter(item=>item.status==='fulfilled').length,1);assert.equal(outcomes.find(item=>item.status==='rejected').reason.code,'INSUFFICIENT_INVENTORY');
  const seller=outcomes[0].status==='fulfilled'?one:two;
  const issued=await a.getDigitalUnits(op.id);assert.equal(issued.reconciliation.metals.XAU.outstandingUnits,600);
  const reserve=await Promise.allSettled([
    a.mutateAccount(seller.id,command('offer',{metal:'XAU',grams:'0.500',price:'140.00'})),
    b.mutateAccount(seller.id,command('delivery',{metal:'XAU',grams:'0.500'})),
  ]);
  assert.equal(reserve.filter(item=>item.status==='fulfilled').length,1);
  assert.equal((await a.getDigitalUnits(op.id)).reconciliation.metals.XAU.reservedUnits,500);
  const winner=reserve.find(item=>item.status==='fulfilled').value;
  await a.mutateAccount(seller.id,command(winner.receipt.offer?'cancel_offer':'cancel_delivery',winner.receipt.offer?{offerId:winner.receipt.offer.id}:{deliveryId:winner.receipt.delivery.id}));
  const offer=(await a.mutateAccount(seller.id,command('offer',{metal:'XAU',grams:'0.500',price:'140.00'}))).receipt.offer;
  const buyers=[one,two,three].filter(item=>item.id!==seller.id);
  const trades=await Promise.allSettled(buyers.map((buyer,i)=>(i?a:b).mutateAccount(buyer.id,command('market_buy',{sellerId:seller.id,offerId:offer.id}))));
  assert.equal(trades.filter(item=>item.status==='fulfilled').length,1);assert.equal(trades.find(item=>item.status==='rejected').reason.code,'OFFER_UNAVAILABLE');
  const market=trades.find(item=>item.status==='fulfilled').value;
  const purchaser=buyers[trades.findIndex(item=>item.status==='fulfilled')];
  const sold=command('sell',{metal:'XAU',grams:'0.200'});
  const replays=await Promise.all([a.mutateAccount(purchaser.id,sold),b.mutateAccount(purchaser.id,sold)]);
  assert.equal(replays.filter(item=>item.changed).length,1);
  const final=await a.getDigitalUnits(op.id,new URLSearchParams('limit=100'));
  assert.equal(final.reconciliation.metals.XAU.outstandingUnits,400);assert.equal(final.reconciliation.metals.XAU.reservedUnits,0);
  assert.equal(final.events.filter(item=>item.type==='TRANSFER').reduce((sum,item)=>sum+item.units,0),500);
  assert.equal(final.events.filter(item=>item.type==='CANCEL').reduce((sum,item)=>sum+item.units,0),200);
  await assert.rejects(a.mutateAccount(purchaser.id,{...sold,grams:'0.100'}));
  assert.deepEqual(await b.getDigitalUnits(op.id,new URLSearchParams('limit=100')),final);
  return {mine,op,purchaser,final,market};
}
