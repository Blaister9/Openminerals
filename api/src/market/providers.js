import {MarketError,METAL_NAMES,metalCode,normalizeSpot,normalizeHistory,normalizeFiat,normalizeUsdt} from './normalize.js';

// Provider contract: id, configured, spot(code), history(code,start,end).
// Business operations accept only normalized snapshots, never a provider response.
export function metalsDevProvider({apiKey,http,now=Date.now}={}){
  function url(path,params){
    if(!apiKey)throw new MarketError('METALS_NOT_CONFIGURED');
    const url=new URL('https://api.metals.dev/v1/'+path);url.search=new URLSearchParams({api_key:apiKey,...params});return url;
  }
  return {id:'metals.dev',configured:!!apiKey,
    async spot(code){metalCode(code);return normalizeSpot(code,await http('metals.dev',url('metal/spot',{metal:METAL_NAMES[code],currency:'USD'})),now());},
    async history(code,start,end){metalCode(code);return normalizeHistory(code,await http('metals.dev',url('timeseries',{start_date:start,end_date:end})),start,end,now());},
  };
}
export function fiatProvider({http,now=Date.now}){return {id:'frankfurter',async latest(){return normalizeFiat(await http('frankfurter','https://api.frankfurter.dev/v2/rates?base=USD&quotes=EUR,COP'),now());}};}
export function usdtProvider({http,now=Date.now}){return {id:'coinbase',async latest(){return normalizeUsdt(await http('coinbase','https://api.exchange.coinbase.com/products/USDT-USD/ticker'),now());}};}
