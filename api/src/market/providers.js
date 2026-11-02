import {MarketError,METAL_NAMES,metalCode,normalizeSpot,normalizeHistory,normalizeFiat,normalizeUsdt} from './normalize.js';

// Provider contract: id, configured, spot(code), history(code,start,end).
// Business operations accept only normalized snapshots, never a provider response.
export function metalsDevProvider({apiKey,http,now=Date.now}={}){
  const windows=new Map(),inFlight=new Map();
  function url(path,params){
    if(!apiKey)throw new MarketError('METALS_NOT_CONFIGURED');
    const url=new URL('https://api.metals.dev/v1/'+path);url.search=new URLSearchParams({api_key:apiKey,...params});return url;
  }
  return {id:'metals.dev',configured:!!apiKey,
    async spot(code){metalCode(code);return normalizeSpot(code,await http('metals.dev',url('metal/spot',{metal:METAL_NAMES[code],currency:'USD'})),now());},
    async history(code,start,end){
      metalCode(code);const key=start+':'+end;
      let entry=windows.get(key);
      if(!entry||entry.until<=now()){
        let pending=inFlight.get(key);
        if(!pending){
          pending=(async()=>{
            const raw=await http('metals.dev',url('timeseries',{start_date:start,end_date:end}));
            // One timeseries response contains all four metals. Share the window,
            // omitting unrelated currency data and keeping a bounded volatile cache.
            if(raw?.status!=='success'||raw.currency!=='USD'||raw.unit!=='toz'||!raw.rates||typeof raw.rates!=='object'||Object.keys(raw.rates).length>30)throw new MarketError('INVALID_PROVIDER_DATA');
            const data={status:raw.status,currency:raw.currency,unit:raw.unit,rates:Object.fromEntries(Object.entries(raw.rates).map(([date,row])=>[date,{metals:Object.fromEntries(Object.values(METAL_NAMES).map(name=>[name,row?.metals?.[name]]))}]))};
            const next={data,until:now()+86400000};if(windows.size>=16&&!windows.has(key))windows.delete(windows.keys().next().value);windows.set(key,next);return next;
          })();inFlight.set(key,pending);
        }
        try{entry=await pending;}finally{if(inFlight.get(key)===pending)inFlight.delete(key);}
      }
      try{return normalizeHistory(code,entry.data,start,end,now());}catch(error){windows.delete(key);throw error;}
    },
  };
}
export function fiatProvider({http,now=Date.now}){return {id:'frankfurter',async latest(){return normalizeFiat(await http('frankfurter','https://api.frankfurter.dev/v2/rates?base=USD&quotes=EUR,COP'),now());}};}
export function usdtProvider({http,now=Date.now}){return {id:'coinbase',async latest(){return normalizeUsdt(await http('coinbase','https://api.exchange.coinbase.com/products/USDT-USD/ticker'),now());}};}
