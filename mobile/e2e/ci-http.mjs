import {API,requireSafe} from './ci-safety.mjs';
const operations=new Map([['/health','health'],['/api/demo/state','state'],['/api/demo/accounts/login','login'],['/api/demo/accounts/logout','logout'],['/api/demo/mine/summary','mine-summary']]);
export function createObserverRequest({api=API,onFailure=()=>{}}={}){
  requireSafe(api===API||/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(api),'Invalid CI observer destination.');
  return async(path,token,body,expectedStatus=200)=>{
    const operation=operations.get(path)||'other-demo-api';let response;
    try{
      // Synchronous Maestro runs block JS for minutes. Do not retain an idle
      // socket whose peer-close event cannot be processed during that time.
      response=await fetch(api+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',Connection:'close',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000),redirect:'error'});
    }catch(error){
      const known=new Set(['ECONNRESET','UND_ERR_SOCKET','UND_ERR_CONNECT_TIMEOUT','EAI_AGAIN','ENOTFOUND','ECONNREFUSED']);
      await onFailure({operation,kind:'network',code:known.has(error.cause?.code)?error.cause.code:error.name==='TimeoutError'?'timeout':'unavailable'});
      throw new Error('CI API observer request failed.');
    }
    if(response.status!==expectedStatus){await onFailure({operation,kind:'status',expectedStatus,actualStatus:response.status});throw new Error('CI API observer status differs.');}
    try{return await response.json();}catch{await onFailure({operation,kind:'invalid-json',actualStatus:response.status});throw new Error('CI API observer JSON unavailable.');}
  };
}
