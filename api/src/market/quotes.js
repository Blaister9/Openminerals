import {randomUUID} from 'node:crypto';
import {DomainError,parseGrams} from '../domain.js';
import {MarketError,metalCode} from './normalize.js';

export async function buildCommercialQuote(service,{action,metal,grams}){
  if(!['buy','sell'].includes(action))throw new MarketError('INVALID_QUOTE_ACTION',400);
  metalCode(metal);const mg=parseGrams(grams);
  if(!service.storageAllowed)throw new MarketError('MARKET_STORAGE_PERMISSION_REQUIRED');
  const [spot,fx]=await Promise.all([service.spot(metal),service.exchange()]);
  if(spot.status!=='current'||fx.usdt.status!=='current')throw new MarketError('FRESH_MARKET_REFERENCE_REQUIRED',409);
  const data=spot.data,usdt=fx.usdt.data,now=service.now();
  if(now-Date.parse(data.asOf)>300_000||now-Date.parse(usdt.asOf)>120_000||data.marketState==='closed')throw new MarketError('FRESH_MARKET_REFERENCE_REQUIRED',409);
  const metalPrice=action==='buy'?data.ask:data.bid,fxPrice=action==='buy'?usdt.bid:usdt.ask;
  if(!(metalPrice>0)||!(fxPrice>0))throw new MarketError('BID_ASK_REQUIRED',409);
  const config=service.quoteConfig,spreadBps=action==='buy'?config.buySpreadBps:config.sellSpreadBps;
  const price=(metalPrice/fxPrice)*(1+(action==='buy'?1:-1)*spreadBps/10000)*100;
  const priceCentsPerGram=action==='buy'?Math.ceil(price):Math.floor(price);
  if(!Number.isSafeInteger(priceCentsPerGram)||priceCentsPerGram<=0||priceCentsPerGram>1e10)throw new MarketError('INVALID_COMMERCIAL_PRICE',422);
  const feeBps=action==='buy'?config.buyFeeBps:config.sellFeeBps;
  const baseMinor=Number((BigInt(mg)*BigInt(priceCentsPerGram)+999n)/1000n),feeMinor=Number((BigInt(baseMinor)*BigInt(feeBps)+9999n)/10000n);
  if(baseMinor<=feeMinor||baseMinor+feeMinor>1e10)throw new MarketError('INVALID_COMMERCIAL_PRICE',422);
  return {id:'quote-'+randomUUID(),action,metal,grams,mg,priceCentsPerGram,feeBps,baseMinor,feeMinor,...(action==='buy'?{totalMinor:baseMinor+feeMinor}:{outputMinor:baseMinor-feeMinor}),currency:'USDT',unit:'g',spreadBps,
    issuedAt:new Date(now).toISOString(),expiresAt:new Date(Math.min(now+config.ttlSeconds*1000,Date.parse(data.asOf)+300_000,Date.parse(usdt.asOf)+120_000)).toISOString(),
    reference:{id:data.id,provider:data.provider,asOf:data.asOf,usdPerGram:metalPrice,side:action==='buy'?'ask':'bid'},
    exchange:{id:usdt.id,provider:usdt.provider,asOf:usdt.asOf,usdPerUsdt:fxPrice,side:action==='buy'?'bid':'ask'},demoOnly:true};
}
export function resolveCommercialQuote(state,request,now=Date.now()){
  const {quoteId,requestId}=request;
  if(typeof quoteId!=='string'||!/^quote-[a-f0-9-]{36}$/.test(quoteId))throw new MarketError('INVALID_QUOTE_ID',400);
  const replay=state.receipts[requestId];
  if(replay&&replay.marketQuote?.id!==quoteId)throw new DomainError('Identificador reutilizado con otros parámetros');
  const quote=replay?.marketQuote??state.marketQuotes?.find(row=>row.id===quoteId);
  if(!quote)throw new MarketError('QUOTE_NOT_AVAILABLE',404);
  if(!replay&&Date.parse(quote.expiresAt)<=now)throw new MarketError('QUOTE_EXPIRED',409);
  return {command:{action:quote.action,metal:quote.metal,grams:quote.grams,quoteId,requestId},pricing:quote};
}
