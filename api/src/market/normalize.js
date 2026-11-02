import {createHash} from 'node:crypto';

export const TROY_OUNCE_GRAMS=31.1034768;
export const METAL_NAMES={XAU:'gold',XAG:'silver',XPT:'platinum',XPD:'palladium'};
export const PERIOD_DAYS={'24h':1,'7d':7,'30d':30,'1y':365};
export class MarketError extends Error {
  constructor(code,status=503){super(({QUOTE_EXPIRED:'La cotización venció. Solicita una nueva antes de confirmar.',QUOTE_NOT_AVAILABLE:'Cotización no disponible. Solicita una nueva.',FRESH_MARKET_REFERENCE_REQUIRED:'Falta una referencia reciente de metal o USDT/USD. Solicita una nueva cuando se actualice.',BID_ASK_REQUIRED:'El proveedor no publicó bid/ask válidos.',MARKET_STORAGE_PERMISSION_REQUIRED:'Referencias pendientes de habilitación contractual.',METALS_NOT_CONFIGURED:'Proveedor de metales sin configurar.'})[code]??'Referencia de mercado no disponible ('+code+').');this.code=code;this.status=status;}
}
export function positive(value){
  const n=typeof value==='number'?value:typeof value==='string'&&/^\d+(\.\d+)?$/.test(value)?Number(value):NaN;
  if(!Number.isFinite(n)||n<=0||n>1e12)throw new MarketError('INVALID_PROVIDER_DATA');
  return n;
}
export function timestamp(value,now=Date.now()){
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value)||!Number.isFinite(Date.parse(value))||new Date(value.slice(0,10)+'T00:00:00Z').toISOString().slice(0,10)!==value.slice(0,10)||Date.parse(value)>now+60_000)throw new MarketError('INVALID_PROVIDER_DATE');
  return new Date(value).toISOString();
}
export function metalCode(code){if(!Object.hasOwn(METAL_NAMES,code))throw new MarketError('INVALID_METAL',400);return code;}
export function periodDays(period){if(!Object.hasOwn(PERIOD_DAYS,period))throw new MarketError('INVALID_PERIOD',400);return PERIOD_DAYS[period];}
export function quoteId(value){return createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0,32);}
export function pricePerGram(value,unit='toz',direction='currency-per-metal'){
  let price=positive(value);
  if(direction==='metal-per-currency')price=1/price;
  else if(direction!=='currency-per-metal')throw new MarketError('INVALID_PROVIDER_DIRECTION');
  if(unit==='toz')return price/TROY_OUNCE_GRAMS;
  if(unit==='g')return price;
  throw new MarketError('INVALID_PROVIDER_UNIT');
}
export function normalizeSpot(code,data,now=Date.now()){
  metalCode(code);
  if(data?.status!=='success'||data.currency!=='USD'||data.metal!==METAL_NAMES[code])throw new MarketError('INVALID_PROVIDER_DATA');
  const at=timestamp(data.timestamp,now),rate=data.rate;
  if(!rate||typeof rate!=='object'||Array.isArray(rate))throw new MarketError('INVALID_PROVIDER_DATA');
  const field=name=>rate?.[name]===undefined||rate[name]===null?null:pricePerGram(rate[name],data.unit);
  const reference=field('price'),bid=field('bid'),ask=field('ask'),high=field('high'),low=field('low');
  if(reference===null||bid!==null&&ask!==null&&bid>ask||low!==null&&high!==null&&low>high)throw new MarketError('INVALID_PROVIDER_DATA');
  const change=rate.change_percent===null||rate.change_percent===undefined?null:rate.change_percent;
  if(change!==null&&(typeof change!=='number'||!Number.isFinite(change)||Math.abs(change)>1e6))throw new MarketError('INVALID_PROVIDER_DATA');
  const value={metal:code,provider:'metals.dev',sourceUrl:'https://metals.dev/docs',asOf:at,currency:'USD',unit:'g',direction:'currency-per-metal',reference,bid,ask,high,low,changePercent:change,changeBasis:'previous-market-day',marketState:'unknown',providerDelaySeconds:60,frequencyVerified:false};
  return {...value,id:quoteId(value),perTroyOunce:reference*TROY_OUNCE_GRAMS};
}
export function normalizeHistory(code,data,start,end,now=Date.now()){
  metalCode(code);
  if(data?.status!=='success'||data.currency!=='USD'||data.unit!=='toz'||!data.rates||typeof data.rates!=='object'||Array.isArray(data.rates))throw new MarketError('INVALID_PROVIDER_DATA');
  return Object.entries(data.rates).sort(([a],[b])=>a.localeCompare(b)).flatMap(([date,row])=>{
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||date<start||date>end||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date||Date.parse(date+'T00:00:00Z')>now)throw new MarketError('INVALID_PROVIDER_DATE');
    const raw=row?.metals?.[METAL_NAMES[code]];
    // Missing trading dates stay absent. No forward filling, interpolation or zero prices.
    return raw===undefined||raw===null?[]:[{date,value:pricePerGram(raw)}];
  });
}
export function normalizeFiat(rows,now=Date.now()){
  if(!Array.isArray(rows))throw new MarketError('INVALID_PROVIDER_DATA');
  return ['EUR','COP'].map(quote=>{
    const row=rows.find(row=>row.base==='USD'&&row.quote===quote);
    if(!row||!/^\d{4}-\d{2}-\d{2}$/.test(row.date))throw new MarketError('INVALID_FX_RATE');
    const value={base:'USD',quote,rate:positive(row.rate),asOf:timestamp(row.date+'T00:00:00Z',now),timestampPrecision:'date',provider:'frankfurter-v2-blended',sourceUrl:'https://frankfurter.dev/',frequency:'daily',marketState:'unknown'};
    return {...value,id:quoteId(value)};
  });
}
export function normalizeUsdt(data,now=Date.now()){
  const rate=positive(data?.price),bid=positive(data?.bid),ask=positive(data?.ask);
  if(bid>ask)throw new MarketError('INVALID_FX_RATE');
  const value={base:'USDT',quote:'USD',rate,bid,ask,asOf:timestamp(data.time,now),timestampPrecision:'trade-time',provider:'coinbase-exchange',sourceUrl:'https://api.exchange.coinbase.com/products/USDT-USD/ticker',frequencyVerified:false,marketState:'unknown'};
  return {...value,id:quoteId(value)};
}
