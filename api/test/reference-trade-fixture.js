import {buildCommercialQuote} from '../src/market/quotes.js';

export const PASSWORD='Isolated-reference-demo-12345';
export function quoteService(now=Date.now()){
  return {enabled:true,storageAllowed:true,now:()=>now,quoteConfig:{ttlSeconds:90,buySpreadBps:100,sellSpreadBps:100,buyFeeBps:100,sellFeeBps:120},
    async spot(){return {status:'current',data:{id:'fixture-metal',provider:'fixture',asOf:new Date(now).toISOString(),marketState:'unknown',reference:100,bid:99,ask:101}};},
    async exchange(){return {usdt:{status:'current',data:{id:'fixture-fx',provider:'fixture',asOf:new Date(now).toISOString(),rate:0.98,bid:0.97,ask:0.99}}};},
  };
}
export async function fixture(store,suffix){
  const mine=await store.createMine({name:'Isolated reference DEMO '+suffix,initialInventoryMg:{XAU:1000}});
  const buyer=await store.createAccount({alias:'ref_buyer_'+suffix,password:PASSWORD,mineId:mine.id});
  const other=await store.createAccount({alias:'ref_other_'+suffix,password:PASSWORD,mineId:mine.id});
  const operator=await store.createAccount({alias:'ref_op_'+suffix,password:PASSWORD,mineId:mine.id,role:'operator'});
  const quote=await buildCommercialQuote(quoteService(),{action:'buy',metal:'XAU',grams:'0.750'});
  await store.rememberMarketQuote(buyer.id,quote);
  return {mine,buyer,other,operator,quote};
}
