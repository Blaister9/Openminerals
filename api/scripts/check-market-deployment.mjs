// Integration check for the isolated Railway environment. No market orders execute.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {join} from 'node:path';
const base='https://openminerals-market-api-market-reference.up.railway.app';
const [credentialsFile,outputDirectory,phase='before']=process.argv.slice(2);
assert.ok(credentialsFile&&outputDirectory,'Pass private credential file and output directory');
assert.ok(['before','after'].includes(phase));
const credentials=JSON.parse(readFileSync(credentialsFile,'utf8'));
assert.equal(credentials.environmentId,'c4c1afd1-2ed7-40e1-8955-f173a6880518');
assert.equal(credentials.apiServiceId,'373995aa-3925-4e3e-a74b-7ca652bb713e');
const report={observedAt:new Date().toISOString(),base,phase,demoOnly:true,metalsProviderRequestsInitiated:0,endpoints:[],blockedChecks:['Live metal spot/history validation requires a valid key and display rights.','Successful reference quote/trade and native expiry checks require authorized real reference sources.','USDT/USD external display/use requires provider permission.']};
async function request(path,{body,token,idempotencyKey}={}){
  const response=await fetch(base+path,{method:body?'POST':'GET',headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...(idempotencyKey?{'Idempotency-Key':idempotencyKey}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});
  return {status:response.status,data:await response.json()};
}
const fingerprint=state=>createHash('sha256').update(JSON.stringify({wallet:state.walletMinor,holdings:state.holdingsMg,receipts:Object.keys(state.receipts??{})})).digest('hex');
try{
  const health=await request('/health');assert.equal(health.status,200);assert.equal(health.data.mode,'postgres-demo');assert.equal(health.data.demoOnly,true);report.health=health;
  let auth;
  if(!credentials.buyer){
    assert.equal(phase,'before','Provision only once');
    credentials.buyer={alias:'market_qa_'+randomBytes(6).toString('hex'),password:randomBytes(24).toString('base64url')};
    // Save the same identity before sending, so a timeout cannot cause new identities.
    writeFileSync(credentialsFile,JSON.stringify(credentials,null,2));
    const registration=await request('/api/demo/accounts/register',{body:{...credentials.buyer,importLegacy:false}});
    assert.equal(registration.status,201);auth=registration.data;
  }else{
    const login=await request('/api/demo/accounts/login',{body:credentials.buyer});assert.equal(login.status,200);auth=login.data;
  }
  assert.equal(auth.account.role,'buyer');
  const stateBefore=await request('/api/demo/state',{token:auth.token});assert.equal(stateBefore.status,200);report.buyerStateSha256=fingerprint(stateBefore.data);
  if(phase==='before'){
    for(const metal of ['XAU','XAG','XPT','XPD']){
      const spotPath='/api/demo/market/metals/'+metal,historyPath=spotPath+'/history?period=7d';
      for(const path of [spotPath,historyPath]){
        const result=await request(path);assert.equal(result.status,200);assert.equal(result.data.status,'not-configured');assert.equal(result.data.data,null);
        report.endpoints.push({path,...result});
      }
    }
  }
  const exchange=await request('/api/demo/market/exchange');assert.equal(exchange.status,200);assert.equal(exchange.data.fiat.status,'current');assert.equal(exchange.data.usdt.status,'permission-required');assert.equal(exchange.data.usdt.data,null);
  assert.deepEqual(exchange.data.fiat.data.map(row=>row.quote).sort(),['COP','EUR']);assert.ok(exchange.data.fiat.data.every(row=>row.base==='USD'&&row.rate>0&&Number.isFinite(Date.parse(row.asOf))));
  report.endpoints.push({path:'/api/demo/market/exchange',...exchange});
  if(phase==='before'){
    const cached=await request('/api/demo/market/exchange');assert.equal(cached.data.fiat.retrievedAt,exchange.data.fiat.retrievedAt);report.sameProcessCacheHit=true;
    const quote=await request('/api/demo/reference-quotes',{token:auth.token,body:{action:'buy',metal:'XAU',grams:'0.100'}});assert.equal(quote.status,503);assert.equal(quote.data.code,'MARKET_STORAGE_PERMISSION_REQUIRED');report.endpoints.push({path:'/api/demo/reference-quotes',...quote});
    const unknown=await request('/api/demo/reference_trade',{token:auth.token,idempotencyKey:randomUUID(),body:{quoteId:'quote-'+randomUUID()}});assert.equal(unknown.status,404);assert.equal(unknown.data.code,'QUOTE_NOT_AVAILABLE');report.endpoints.push({path:'/api/demo/reference_trade',...unknown});
    const denied=await request('/api/demo/reference-quotes',{body:{action:'buy',metal:'XAU',grams:'0.100'}});assert.equal(denied.status,401);report.unauthenticatedQuoteRejected=true;
    const stateAfter=await request('/api/demo/state',{token:auth.token});assert.equal(fingerprint(stateAfter.data),report.buyerStateSha256);report.rejectedRequestsPreservedBalances=true;
    let limited=false,attempts=0;
    for(;attempts<24;attempts++){const result=await request('/api/demo/market/metals/INVALID');if(result.status===429){limited=true;attempts++;break;}assert.equal(result.status,400);}
    assert.equal(limited,true);report.httpRateLimit={observed429:true,boundedInvalidSymbolRequests:attempts,upstreamMetalCalls:0};
  }else{
    const before=JSON.parse(readFileSync(join(outputDirectory,'endpoints-before.json'),'utf8'));
    assert.equal(report.buyerStateSha256,before.buyerStateSha256);
    const previous=before.endpoints.find(row=>row.path==='/api/demo/market/exchange');
    assert.equal(exchange.data.fiat.retrievedAt,previous.data.fiat.retrievedAt);report.persistence={buyerAfterApiRestart:true,fiatCacheAfterApiRestart:true};
  }
  report.passed=true;mkdirSync(outputDirectory,{recursive:true});writeFileSync(join(outputDirectory,'endpoints-'+phase+'.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({phase,passed:true,endpointObservations:report.endpoints.length,metalsCalls:0,acceptedLiveMetals:false,persistence:report.persistence??null}));
}catch(error){console.error('Market deployment integration failed:',error.code||error.name);process.exitCode=1;}
