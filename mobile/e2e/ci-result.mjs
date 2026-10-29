import {requireSafe} from './ci-safety.mjs';
import {nativeCase} from './native-case.mjs';
// Persisted API results after the native commands; this does not run a UI.
export function verifyNativeCommercialSnapshot({a,b,summary,ca,cb,cm,management,history,ha,hb,hm},metal='XAU'){
  const expectedCase=nativeCase(metal);
  requireSafe(a.walletMinor.USDT===expectedCase.finalA&&a.walletMinor.USD===40000&&a.holdingsMg[metal]===500,'Buyer A native wallet, conversion or metal result is incorrect.');
  requireSafe(b.walletMinor.USDT===expectedCase.finalB&&b.walletMinor.USD===60000&&b.holdingsMg[metal]===500,'Buyer B native peer settlement result is incorrect.');
  requireSafe(a.offers.length===1&&a.offers[0].status==='FILLED'&&a.custodyRequests.length===1&&a.custodyRequests[0].status==='DELIVERED_DEMO'&&a.custodyRequests[0].paidMinor===1000,'Native marketplace or complete delivery did not finish exactly once.');
  requireSafe(summary.reconciled===true&&summary.inventoryMg[metal]===4500&&summary.allocatedMg[metal]===1000&&summary.totalSupplyMg[metal]===5500&&summary.reservedMg[metal]===0&&summary.demoFeesCollectedMinor===expectedCase.fees&&summary.stockAdjustments.length===1&&summary.stockAdjustments[0].mg===1000&&summary.stockAdjustments[0].metal===metal,'Native mine, stock, single trading fees or reservation conservation failed.');
  requireSafe(ca.allocations.filter(item=>item.mg>0).reduce((n,item)=>n+item.mg,0)===500&&cb.allocations.filter(item=>item.mg>0).reduce((n,item)=>n+item.mg,0)===500&&ca.allocations.some(one=>one.mg>0&&cb.allocations.some(two=>two.mg>0&&one.lotId===two.lotId)),'Native peer trade did not preserve the exact seller source lot.');
  requireSafe(cm.totals[metal].weightMg===6000&&cm.totals[metal].deliveredMg===500&&cm.totals[metal].activeWeightMg===5500,'Native delivery did not preserve original lot weight.');
  const privateText=JSON.stringify(management);
  requireSafe(management.kpis.directBuys===1&&management.kpis.directSells===1&&management.kpis.marketplaceTrades===1&&management.kpis.tradingFeesMinor===expectedCase.fees&&!['walletMinor','balancesAfter','passwordHash'].some(key=>privateText.includes('"'+key+'"')),'Native management metrics or wallet privacy failed.');
  for(const code of ['XAU','XAG','XPT','XPD']){
    const volumes=management.kpis.metalVolumesMg?.[code],expected=code===metal?{directBuy:2000,directSell:500,marketplace:500}:{directBuy:0,directSell:0,marketplace:0};
    requireSafe(volumes&&Object.entries(expected).every(([key,value])=>volumes[key]===value),'Native per-metal quantities are incorrect or double counted.');
  }
  const aId=ca.allocations.find(item=>item.mg>0).account.id,bId=cb.allocations.find(item=>item.mg>0).account.id;
  requireSafe(ha?.demoOnly===true&&hb?.demoOnly===true&&hm?.demoOnly===true&&ha.view==='buyer'&&hb.view==='buyer'&&hm.view==='operator'&&ha.lot.id===hb.lot.id&&ha.lot.id===hm.lot.id,'Native lot history view is missing or scoped incorrectly.');
  for(const [kind,mg] of [['BUY',2000],['SELL',500],['MARKET_TRANSFER',500],['DELIVERY',500]])requireSafe(hm.items.filter(item=>item.kind===kind).length===1&&hm.items.find(item=>item.kind===kind).mg===mg,'Native lot history is incomplete or duplicated.');
  requireSafe(ha.items.every(item=>item.account?.id===aId&&!item.counterparty)&&hb.items.every(item=>item.account?.id===bId&&!item.counterparty)&&ha.items.find(item=>item.kind==='MARKET_TRANSFER')?.direction==='OUT'&&hb.items.find(item=>item.kind==='MARKET_TRANSFER')?.direction==='IN'&&!JSON.stringify(ha).includes(bId)&&!JSON.stringify(hb).includes(aId),'Native buyer lot history exposes another identity or loses transfer direction.');
  requireSafe(!['walletMinor','balancesAfter','passwordHash'].some(key=>JSON.stringify(hm).includes('"'+key+'"')),'Native operator lot history exposes private account data.');
  for(const action of ['buy','sell','offer','market_sell','delivery','delivery_accept'])requireSafe(history.items.some(item=>item.action===action),'Native buyer history is incomplete.');
}
export function verifyNativeSnapshot(snapshot,metal='XAU'){
  verifyNativeCommercialSnapshot(snapshot,metal);
  const {profile}=snapshot;
  requireSafe(profile.profile.displayName==='Comprador QA DEMO'&&profile.profile.preferredCurrency==='EUR'&&profile.profile.jurisdiction==='DEMO_REGIONAL','Native profile changes were not saved.');
}
