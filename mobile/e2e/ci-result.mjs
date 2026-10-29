import {requireSafe} from './ci-safety.mjs';
// Persisted API results after the native commands; this does not run a UI.
export function verifyNativeSnapshot({a,b,summary,ca,cb,cm,management,profile,history}){
  requireSafe(a.walletMinor.USDT===28789&&a.walletMinor.USD===40000&&a.holdingsMg.XAU===500,'Buyer A native wallet, conversion or gold result is incorrect.');
  requireSafe(b.walletMinor.USDT===18000&&b.walletMinor.USD===60000&&b.holdingsMg.XAU===500,'Buyer B native peer settlement result is incorrect.');
  requireSafe(a.offers.length===1&&a.offers[0].status==='FILLED'&&a.custodyRequests.length===1&&a.custodyRequests[0].status==='DELIVERED_DEMO'&&a.custodyRequests[0].paidMinor===1000,'Native marketplace or complete delivery did not finish exactly once.');
  requireSafe(summary.reconciled===true&&summary.inventoryMg.XAU===4500&&summary.allocatedMg.XAU===1000&&summary.totalSupplyMg.XAU===5500&&summary.reservedMg.XAU===0&&summary.demoFeesCollectedMinor===461&&summary.stockAdjustments.length===1&&summary.stockAdjustments[0].mg===1000,'Native mine, stock, single trading fees or reservation conservation failed.');
  requireSafe(ca.allocations.filter(item=>item.mg>0).reduce((n,item)=>n+item.mg,0)===500&&cb.allocations.filter(item=>item.mg>0).reduce((n,item)=>n+item.mg,0)===500&&ca.allocations.some(one=>one.mg>0&&cb.allocations.some(two=>two.mg>0&&one.lotId===two.lotId)),'Native peer trade did not preserve the exact seller source lot.');
  requireSafe(cm.totals.XAU.weightMg===6000&&cm.totals.XAU.deliveredMg===500&&cm.totals.XAU.activeWeightMg===5500,'Native delivery did not preserve original lot weight.');
  const privateText=JSON.stringify(management);
  requireSafe(management.kpis.directBuys===1&&management.kpis.directSells===1&&management.kpis.marketplaceTrades===1&&management.kpis.tradingFeesMinor===461&&!['walletMinor','balancesAfter','passwordHash'].some(key=>privateText.includes('"'+key+'"')),'Native management metrics or wallet privacy failed.');
  requireSafe(profile.profile.displayName==='Comprador QA DEMO'&&profile.profile.preferredCurrency==='EUR'&&profile.profile.jurisdiction==='DEMO_REGIONAL','Native profile changes were not saved.');
  for(const action of ['buy','sell','offer','market_sell','delivery','delivery_accept'])requireSafe(history.items.some(item=>item.action===action),'Native buyer history is incomplete.');
}
