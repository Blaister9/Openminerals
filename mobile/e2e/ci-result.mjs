import {requireSafe} from './ci-safety.mjs';
// Persisted API results after the native commands; this does not run a UI.
export function verifyNativeSnapshot({a,b,summary,ca,cb,cm,management,profile,history,ha,hb,hm}){
  requireSafe(a.walletMinor.USDT===28789&&a.walletMinor.USD===40000&&a.holdingsMg.XAU===500,'Buyer A native wallet, conversion or gold result is incorrect.');
  requireSafe(b.walletMinor.USDT===18000&&b.walletMinor.USD===60000&&b.holdingsMg.XAU===500,'Buyer B native peer settlement result is incorrect.');
  requireSafe(a.offers.length===1&&a.offers[0].status==='FILLED'&&a.custodyRequests.length===1&&a.custodyRequests[0].status==='DELIVERED_DEMO'&&a.custodyRequests[0].paidMinor===1000,'Native marketplace or complete delivery did not finish exactly once.');
  requireSafe(summary.reconciled===true&&summary.inventoryMg.XAU===4500&&summary.allocatedMg.XAU===1000&&summary.totalSupplyMg.XAU===5500&&summary.reservedMg.XAU===0&&summary.demoFeesCollectedMinor===461&&summary.stockAdjustments.length===1&&summary.stockAdjustments[0].mg===1000,'Native mine, stock, single trading fees or reservation conservation failed.');
  requireSafe(ca.allocations.filter(item=>item.mg>0).reduce((n,item)=>n+item.mg,0)===500&&cb.allocations.filter(item=>item.mg>0).reduce((n,item)=>n+item.mg,0)===500&&ca.allocations.some(one=>one.mg>0&&cb.allocations.some(two=>two.mg>0&&one.lotId===two.lotId)),'Native peer trade did not preserve the exact seller source lot.');
  requireSafe(cm.totals.XAU.weightMg===6000&&cm.totals.XAU.deliveredMg===500&&cm.totals.XAU.activeWeightMg===5500,'Native delivery did not preserve original lot weight.');
  const privateText=JSON.stringify(management);
  requireSafe(management.kpis.directBuys===1&&management.kpis.directSells===1&&management.kpis.marketplaceTrades===1&&management.kpis.tradingFeesMinor===461&&!['walletMinor','balancesAfter','passwordHash'].some(key=>privateText.includes('"'+key+'"')),'Native management metrics or wallet privacy failed.');
  for(const metal of ['XAU','XAG','XPT','XPD']){
    const volumes=management.kpis.metalVolumesMg?.[metal],expected=metal==='XAU'?{directBuy:2000,directSell:500,marketplace:500}:{directBuy:0,directSell:0,marketplace:0};
    requireSafe(volumes&&Object.entries(expected).every(([key,value])=>volumes[key]===value),'Native per-metal quantities are incorrect or double counted.');
  }
  const aId=ca.allocations.find(item=>item.mg>0).account.id,bId=cb.allocations.find(item=>item.mg>0).account.id;
  requireSafe(ha?.demoOnly===true&&hb?.demoOnly===true&&hm?.demoOnly===true&&ha.view==='buyer'&&hb.view==='buyer'&&hm.view==='operator'&&ha.lot.id===hb.lot.id&&ha.lot.id===hm.lot.id,'Native lot history view is missing or scoped incorrectly.');
  for(const [kind,mg] of [['BUY',2000],['SELL',500],['MARKET_TRANSFER',500],['DELIVERY',500]])requireSafe(hm.items.filter(item=>item.kind===kind).length===1&&hm.items.find(item=>item.kind===kind).mg===mg,'Native lot history is incomplete or duplicated.');
  requireSafe(ha.items.every(item=>item.account?.id===aId&&!item.counterparty)&&hb.items.every(item=>item.account?.id===bId&&!item.counterparty)&&ha.items.find(item=>item.kind==='MARKET_TRANSFER')?.direction==='OUT'&&hb.items.find(item=>item.kind==='MARKET_TRANSFER')?.direction==='IN'&&!JSON.stringify(ha).includes(bId)&&!JSON.stringify(hb).includes(aId),'Native buyer lot history exposes another identity or loses transfer direction.');
  requireSafe(!['walletMinor','balancesAfter','passwordHash'].some(key=>JSON.stringify(hm).includes('"'+key+'"')),'Native operator lot history exposes private account data.');
  requireSafe(profile.profile.displayName==='Comprador QA DEMO'&&profile.profile.preferredCurrency==='EUR'&&profile.profile.jurisdiction==='DEMO_REGIONAL','Native profile changes were not saved.');
  for(const action of ['buy','sell','offer','market_sell','delivery','delivery_accept'])requireSafe(history.items.some(item=>item.action===action),'Native buyer history is incomplete.');
}
