// Run only inside the isolated Railway API container; pipe over SSH if necessary.
// Research validation only: no public price output, no numeric price archive, no orders.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
assert.equal(process.env.RAILWAY_ENVIRONMENT_ID,'c4c1afd1-2ed7-40e1-8955-f173a6880518');
assert.equal(process.env.RAILWAY_SERVICE_ID,'373995aa-3925-4e3e-a74b-7ca652bb713e');
assert.equal(new URL(process.env.DATABASE_URL).pathname,'/openminerals_market_reference');
assert.ok(process.env.METALS_DEV_API_KEY,'Configure the server key first');
const {createStore}=await import('/app/src/store.js');
const {createProviderHttp}=await import('/app/src/market/http.js');
const {metalsDevProvider}=await import('/app/src/market/providers.js');
const {METAL_NAMES,TROY_OUNCE_GRAMS}=await import('/app/src/market/normalize.js');
const store=await createStore(),repo=await store.marketRepository(),key='qa:metal-probe:20261102-v1';
const hash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
try{
  const previous=await repo.get(key);
  if(previous){console.log(JSON.stringify({...previous,reusedWithoutProviderCalls:true}));}
  else{
    const report={observedAt:new Date().toISOString(),demoOnly:true,internalResearchOnly:true,rawPricesArchived:false,frequencyVerified:false,requestsAttempted:0,maximumRequests:6,spot:[],history:[],errors:[]};
    // A failed/interrupted probe cannot be blindly repeated and spend the same quota again.
    await repo.put(key,{...report,status:'started'});
    const rawSpots=new Map();let rawHistory;
    const transport=createProviderHttp({reserve:async()=>{
      if(report.requestsAttempted>=6)return false;
      const time=Date.now(),month=Date.UTC(new Date(time).getUTCFullYear(),new Date(time).getUTCMonth(),1);
      if(!await repo.reserve('metals.dev',20,time)||!await repo.reserve('metals.dev:month',100,month))return false;
      report.requestsAttempted++;return true;
    }});
    const http=async(provider,url)=>{const data=await transport(provider,url);if(url.pathname.endsWith('/metal/spot'))rawSpots.set(url.searchParams.get('metal'),data);if(url.pathname.endsWith('/timeseries'))rawHistory=data;return data;};
    const provider=metalsDevProvider({apiKey:process.env.METALS_DEV_API_KEY,http});
    for(const metal of Object.keys(METAL_NAMES)){
      try{
        const value=await provider.spot(metal),raw=rawSpots.get(METAL_NAMES[metal]);
        report.spot.push({metal,provider:value.provider,asOf:value.asOf,observedAgeSeconds:(Date.now()-Date.parse(value.asOf))/1000,inputUnit:raw.unit,outputUnit:value.unit,currency:value.currency,direction:value.direction,bidAskPublished:value.bid!==null&&value.ask!==null,bidAskOrdered:value.bid<=value.ask,highLowPublished:value.high!==null&&value.low!==null,highLowOrdered:value.low<=value.high,changePublished:value.changePercent!==null,gramConversionVerified:Math.abs(value.reference-Number(raw.rate.price)/TROY_OUNCE_GRAMS)<1e-9,normalizedSha256:hash(value)});
      }catch(error){report.errors.push({scope:'spot',metal,code:error.code||error.name});}
    }
    const end=new Date(Date.now()-86400000).toISOString().slice(0,10),start=new Date(Date.now()-7*86400000).toISOString().slice(0,10);
    const results=await Promise.allSettled(Object.keys(METAL_NAMES).map(metal=>provider.history(metal,start,end)));
    results.forEach((result,index)=>{const metal=Object.keys(METAL_NAMES)[index];if(result.status==='rejected')report.errors.push({scope:'history',metal,code:result.reason.code||result.reason.name});else report.history.push({metal,start,end,points:result.value.length,firstDate:result.value[0]?.date??null,lastDate:result.value.at(-1)?.date??null,unit:'USD/g',sourceUnit:rawHistory?.unit,gramConversionVerified:result.value.every(point=>Math.abs(point.value-Number(rawHistory.rates[point.date].metals[METAL_NAMES[metal]])/TROY_OUNCE_GRAMS)<1e-9),normalizedSha256:hash(result.value)});});
    if(report.requestsAttempted<6){try{const url=new URL('https://api.metals.dev/usage');url.searchParams.set('api_key',process.env.METALS_DEV_API_KEY);const usage=await transport('metals.dev',url);report.providerUsage={plan:usage.plan,total:usage.total,used:usage.used,remaining:usage.remaining,timestamp:usage.timestamp};}catch(error){report.errors.push({scope:'usage',code:error.code||error.name});}}
    report.passed=report.spot.length===4&&report.history.length===4&&report.errors.length===0&&report.spot.every(row=>row.bidAskPublished&&row.bidAskOrdered&&row.highLowPublished&&row.highLowOrdered&&row.gramConversionVerified)&&report.history.every(row=>row.points>0&&row.gramConversionVerified);
    report.status='completed';await repo.put(key,report);console.log(JSON.stringify(report));
  }
}finally{await store.close();}
