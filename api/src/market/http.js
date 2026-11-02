import {MarketError} from './normalize.js';

// No raw upstream error, URL (which can contain an API key), or body is logged/returned.
export function createProviderHttp({fetchImpl=fetch,reserve=async()=>true,sleep=ms=>new Promise(r=>setTimeout(r,ms)),timeoutMs=5000}={}){
  return async function getJson(provider,url){
    for(let attempt=0;attempt<2;attempt++){
      if(!await reserve(provider))throw new MarketError('PROVIDER_BUDGET_EXHAUSTED',429);
      const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);
      let retry=false;
      try{
        const response=await fetchImpl(url,{signal:controller.signal,redirect:'error',headers:{Accept:'application/json','User-Agent':'Openminerals-DEMO-reference/1.0'}});
        if(!response.ok){
          if(attempt===0&&[502,503,504].includes(response.status))retry=true;
          else throw new MarketError(response.status===429?'PROVIDER_RATE_LIMIT':response.status===401||response.status===403?'PROVIDER_CREDENTIALS_REJECTED':'PROVIDER_UNAVAILABLE');
        }else{
          const reader=response.body?.getReader();let body='',bytes=0;
          if(reader){
            const decoder=new TextDecoder();
            for(;;){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1_000_000){await reader.cancel();throw new MarketError('PROVIDER_RESPONSE_TOO_LARGE');}body+=decoder.decode(value,{stream:true});}body+=decoder.decode();
          }else{body=await response.text();if(body.length>1_000_000)throw new MarketError('PROVIDER_RESPONSE_TOO_LARGE');}
          let data;try{data=JSON.parse(body);}catch{throw new MarketError('INVALID_PROVIDER_DATA');}
          if(data?.status==='failure')throw new MarketError('PROVIDER_REQUEST_REJECTED');
          return data;
        }
      }catch(error){if(error instanceof MarketError)throw error;if(attempt===0)retry=true;else throw new MarketError('PROVIDER_UNAVAILABLE');}
      finally{clearTimeout(timer);}
      if(retry)await sleep(200);
    }
    throw new MarketError('PROVIDER_UNAVAILABLE');
  };
}
