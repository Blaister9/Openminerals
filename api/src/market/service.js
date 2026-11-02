import {MarketError,metalCode,periodDays} from './normalize.js';
import {createProviderHttp} from './http.js';
import {metalsDevProvider,fiatProvider,usdtProvider} from './providers.js';
import {memoryMarketRepository} from './repository.js';

const day=86_400_000;
function setting(value,fallback,min,max){if(value===undefined)return fallback;const n=Number(value);if(!Number.isInteger(n)||n<min||n>max)throw new Error('Invalid market configuration');return n;}
export function createMarketService({env=process.env,repository=async()=>memoryMarketRepository(),fetchImpl=fetch,now=Date.now,providers}={}){
  const enabled=env.MARKET_REFERENCE_ENABLED==='true',storageAllowed=env.MARKET_METALS_STORAGE_ALLOWED==='true';
  const ttl=setting(env.MARKET_CACHE_SECONDS,300,60,3600)*1000;
  const daily=setting(env.MARKET_METALS_DAILY_LIMIT,20,1,100000),monthly=setting(env.MARKET_METALS_MONTHLY_LIMIT,100,1,1000000);
  const local=memoryMarketRepository(),inFlight=new Map();let repo;
  const persistent=async()=>await (repo??=repository());
  const http=createProviderHttp({fetchImpl,reserve:async provider=>{
    const db=await persistent(),time=now(),month=Date.UTC(new Date(time).getUTCFullYear(),new Date(time).getUTCMonth(),1);
    return await db.reserve(provider,provider==='metals.dev'?daily:1000,time)&&await db.reserve(provider+':month',provider==='metals.dev'?monthly:30000,month);
  }});
  const metals=providers?.metals??metalsDevProvider({apiKey:env.METALS_DEV_API_KEY,http,now});
  const fiat=providers?.fiat??fiatProvider({http,now}),usdt=providers?.usdt??usdtProvider({http,now});
  async function cached(key,load,{persist=false,cacheMs=ttl,maxAge=ttl,dated=false}={}){
    const db=persist?await persistent():local;
    const envelope=entry=>{
      if(entry.data===null)return {status:'unavailable',data:null,retrievedAt:entry.retrievedAt,cacheUntil:new Date(entry.cacheUntil).toISOString(),errorCode:entry.errorCode,demoOnly:true};
      const values=Array.isArray(entry.data)?entry.data:[entry.data];
      const age=Math.max(...values.map(value=>now()-Date.parse(value.asOf)));
      return {status:entry.errorCode?'stale':age>maxAge?'delayed':'current',data:entry.data,retrievedAt:entry.retrievedAt,cacheUntil:new Date(entry.cacheUntil).toISOString(),errorCode:entry.errorCode??null,timestampPrecision:dated?'date':'timestamp',demoOnly:true};
    };
    const entry=await db.get(key);
    if(entry&&entry.cacheUntil>now())return envelope(entry);
    if(inFlight.has(key))return inFlight.get(key);
    const pending=(async()=>{
      try{
        const data=await load(),next={data,retrievedAt:new Date(now()).toISOString(),cacheUntil:now()+cacheMs};
        await db.put(key,next);return envelope(next);
      }catch(error){
        const code=error instanceof MarketError?error.code:'PROVIDER_UNAVAILABLE';
        if(entry){const next={...entry,errorCode:code,cacheUntil:now()+30_000};await db.put(key,next);return envelope(next);}
        // Negative caching also bounds repeated failures / invalid credentials.
        const next={data:null,retrievedAt:new Date(now()).toISOString(),cacheUntil:now()+30_000,errorCode:code};
        await db.put(key,next);return envelope(next);
      }
    })();inFlight.set(key,pending);
    try{return await pending;}finally{inFlight.delete(key);}
  }
  const unavailable=status=>({status,data:null,demoOnly:true,errorCode:status==='not-configured'?'METALS_NOT_CONFIGURED':null});
  async function spot(code){metalCode(code);if(!enabled)return unavailable('disabled');if(!metals.configured)return unavailable('not-configured');return cached('spot:'+code,()=>metals.spot(code),{persist:storageAllowed});}
  async function history(code,period){
    metalCode(code);const days=periodDays(period);
    if(!enabled)return {...unavailable('disabled'),points:[]};
    if(!metals.configured)return {...unavailable('not-configured'),points:[]};
    if(period==='24h')return {status:'unsupported',points:[],data:null,granularity:'daily',reason:'INTRADAY_NOT_PROVIDED',demoOnly:true};
    const end=new Date(now()-day).toISOString().slice(0,10),start=new Date(now()-days*day).toISOString().slice(0,10);
    const result=await cached(`history:${code}:${period}:${end}`,async()=>{
      const points=[];
      for(let cursor=Date.parse(start+'T00:00:00Z');cursor<=Date.parse(end+'T00:00:00Z');cursor+=30*day){
        const a=new Date(cursor).toISOString().slice(0,10),b=new Date(Math.min(cursor+29*day,Date.parse(end+'T00:00:00Z'))).toISOString().slice(0,10);
        points.push(...await metals.history(code,a,b));
      }
      return {provider:metals.id,asOf:end+'T00:00:00.000Z',points,start,end,granularity:'daily',currency:'USD',unit:'g',gaps:'not-filled'};
    },{persist:storageAllowed,cacheMs:day,maxAge:4*day,dated:true});
    return {...result,points:result.data?.points??[],granularity:'daily'};
  }
  async function exchange(){
    if(!enabled)return {demoOnly:true,fiat:unavailable('disabled'),usdt:unavailable('disabled')};
    const results=await Promise.all([cached('fx:fiat',()=>fiat.latest(),{persist:true,cacheMs:3600_000,maxAge:4*day,dated:true}),cached('fx:usdt',()=>usdt.latest(),{maxAge:120_000,cacheMs:60_000})]);
    return {demoOnly:true,fiat:results[0],usdt:results[1],walletRates:'separate-simulated-rates'};
  }
  return {spot,history,exchange,enabled,storageAllowed,now,quoteConfig:{
    ttlSeconds:setting(env.MARKET_QUOTE_TTL_SECONDS,90,10,300),
    buySpreadBps:setting(env.MARKET_BUY_SPREAD_BPS,100,0,5000),sellSpreadBps:setting(env.MARKET_SELL_SPREAD_BPS,100,0,5000),
    buyFeeBps:setting(env.MARKET_BUY_FEE_BPS,100,0,5000),sellFeeBps:setting(env.MARKET_SELL_FEE_BPS,120,0,5000),
  }};
}
