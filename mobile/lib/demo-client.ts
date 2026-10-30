import type {Receipt} from './receipt-presentation';

export type Storage = {
  getItem(key:string):Promise<string|null>;
  setItem(key:string,value:string):Promise<void>;
  removeItem(key:string):Promise<void>;
};
export type PendingOperation = {
  session:string; action:string; body:Record<string,string>; requestId:string; title:string;
  accountId?:string;
};
export type OperationResult = {state?:unknown;mine?:unknown;receipt:Receipt};
type Options = {
  api:string;storage:Storage;uuid:()=>string;fetchImpl?:typeof fetch;timeoutMs?:number;
  accountId?:string;getToken?:()=>string|null;
};
export class RequestError extends Error {
  status:number;
  ambiguous:boolean;
  constructor(message:string,status=0,ambiguous=true){super(message);this.status=status;this.ambiguous=ambiguous;}
}
const metalKeys=['XAU','XAG','XPT','XPD'];
const nonnegative=(value:unknown)=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
function metalRecord(value:unknown):value is Record<string,number>{
  return !!value&&typeof value==='object'&&metalKeys.every(key=>nonnegative((value as Record<string,unknown>)[key]));
}
function completeStockResult(data:OperationResult,operation:PendingOperation):boolean {
  const receipt=data.receipt as Receipt&{
    reason?:unknown;actor?:{id?:unknown;alias?:unknown};inventoryAfterMg?:unknown;totalSupplyAfterMg?:unknown;
  };
  const mine=data.mine as Record<string,unknown>|undefined;
  const identity=mine?.mine as {id?:unknown;name?:unknown}|undefined;
  const snapshotAvailable=receipt?.inventoryAfterMg,snapshotSupply=receipt?.totalSupplyAfterMg;
  return !!receipt&&receipt.action==='stock'&&receipt.status==='COMPLETED'&&receipt.demoOnly===true&&
    typeof receipt.at==='string'&&Number.isFinite(Date.parse(receipt.at))&&
    typeof receipt.metal==='string'&&metalKeys.includes(receipt.metal)&&receipt.metal===operation.body.metal&&nonnegative(receipt.mg)&&receipt.mg! > 0&&
    typeof receipt.reason==='string'&&receipt.reason.length>=3&&receipt.actor?.id===operation.accountId&&typeof receipt.actor?.alias==='string'&&
    metalRecord(snapshotAvailable)&&metalRecord(snapshotSupply)&&metalKeys.every(key=>snapshotAvailable[key]<=snapshotSupply[key])&&
    !!mine&&mine.demoOnly===true&&mine.reconciled===true&&typeof identity?.id==='string'&&typeof identity?.name==='string'&&
    ['inventoryMg','totalSupplyMg','allocatedMg','reservedMg'].every(key=>metalRecord(mine[key]))&&
    ['accountCount','transactionCount','demoFeesCollectedMinor','offersOpen','deliveriesPending'].every(key=>nonnegative(mine[key]))&&
    ['operations','pendingOffers','pendingDeliveries','stockAdjustments'].every(key=>Array.isArray(mine[key]));
}
function completeOperatorResult(data:OperationResult,operation:PendingOperation):boolean {
  const receipt=data.receipt as Receipt&{actor?:{id?:unknown};mineId?:unknown};
  const mine=data.mine as Record<string,unknown>|undefined;
  const identity=mine?.mine as {id?:unknown;name?:unknown}|undefined;
  return !!receipt&&receipt.action===operation.action.slice('mine/'.length)&&receipt.status==='COMPLETED'&&receipt.demoOnly===true&&
    receipt.actor?.id===operation.accountId&&typeof receipt.at==='string'&&Number.isFinite(Date.parse(receipt.at))&&
    !!mine&&mine.demoOnly===true&&mine.reconciled===true&&typeof identity?.id==='string'&&typeof identity.name==='string'&&receipt.mineId===identity.id&&
    ['inventoryMg','totalSupplyMg','allocatedMg','reservedMg'].every(key=>metalRecord(mine[key]))&&
    ['accountCount','transactionCount','demoFeesCollectedMinor','offersOpen','deliveriesPending'].every(key=>nonnegative(mine[key]))&&
    ['operations','pendingOffers','pendingDeliveries','stockAdjustments'].every(key=>Array.isArray(mine[key]));
}

// No operation is sent before its original key and payload are stored durably.
// An uncertain response must be replayed with that same key, including after restart.
export function createDemoClient({api,storage,uuid,fetchImpl=fetch,timeoutMs=12_000,accountId,getToken}:Options){
  const sessionKey='openminerals-demo-session';
  const pendingKey=`openminerals-demo-pending:${api}${accountId?`:account:${accountId}`:''}`;
  const actions=new Set(['deposit','withdraw','convert','buy','sell','offer','cancel_offer','delivery','cancel_delivery']);
  if(accountId)for(const action of ['mine/stock','market_buy','delivery_accept','delivery_reject','mine/delivery_quote','mine/delivery_transition','mine/delivery_config','mine/intake_produce','mine/intake_verify','mine/intake_receive'])actions.add(action);
  let session='';
  let pending:PendingOperation|null=null;
  let initialized=false;
  let sending=false;

  async function initialize(){
    if(!initialized){
      let id=accountId??await storage.getItem(sessionKey);
      if(!id){id=uuid();await storage.setItem(sessionKey,id);}
      if(!/^[A-Za-z0-9_-]{16,100}$/.test(id))throw new Error('La sesión guardada no es válida. No se enviaron operaciones.');
      const saved=await storage.getItem(pendingKey);
      let restored:PendingOperation|null=null;
      if(saved){
        const p=JSON.parse(saved) as PendingOperation;
        if(p.session!==id||p.accountId!==accountId||!actions.has(p.action)||!p.body||typeof p.body!=='object'||Array.isArray(p.body)||
          !Object.values(p.body).every(v=>typeof v==='string')||typeof p.title!=='string'||
          typeof p.requestId!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(p.requestId)){
          throw new Error('La operación pendiente no es válida. Se bloqueó el envío para evitar duplicaciones.');
        }
        restored=p;
      }
      session=id;pending=restored;initialized=true;
    }
    return {session,pending};
  }

  async function request<T>(path:string,init:RequestInit={}):Promise<T>{
    if(!api)throw new Error('Falta EXPO_PUBLIC_API_URL en mobile/.env. Conecta primero la API de Railway.');
    const controller=new AbortController();
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{
      const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{
        controller.abort();reject(new RequestError('Se agotó el tiempo de conexión. Reintenta la operación pendiente con su mismo comprobante.'));
      },timeoutMs);});
      const work=(async()=>{
        const response=await fetchImpl(`${api}${path}`,{...init,signal:controller.signal});
        const data=await response.json();
        if(!response.ok){
          const definite=response.status>=400&&response.status<500&&![408,429].includes(response.status);
          throw new RequestError(data.error||'Operación rechazada',response.status,!definite);
        }
        return data as T;
      })();
      return await Promise.race([work,timeout]);
    }finally{if(timer!==undefined)clearTimeout(timer);}
  }

  async function clearPending(){await storage.removeItem(pendingKey);pending=null;}
  function identityHeaders():Record<string,string>{
    if(!accountId)return {'x-demo-session':session};
    const token=getToken?.();
    if(!token)throw new RequestError('Inicia sesión de nuevo con la misma cuenta para continuar.',401,true);
    return {Authorization:`Bearer ${token}`};
  }
  async function execute(operation:PendingOperation){
    try{
      const data=await request<OperationResult>(`/api/demo/${operation.action}`,{
        method:'POST',headers:{'Content-Type':'application/json',...identityHeaders(),'Idempotency-Key':operation.requestId},
        body:JSON.stringify(operation.body),
      });
      const complete=operation.action==='mine/stock'?completeStockResult(data,operation):operation.action.startsWith('mine/')?completeOperatorResult(data,operation):data.state;
      if(!complete||!data.receipt||typeof data.receipt.id!=='string'||
        (accountId&&data.receipt.id!==operation.requestId)){
        throw new RequestError('Respuesta incompleta. Conservamos la operación para reintentar sin duplicarla.');
      }
      await clearPending();
      return data;
    }catch(error){
      if(error instanceof RequestError&&!error.ambiguous&&!(accountId&&error.status===401))await clearPending();
      throw error;
    }
  }
  async function submit(action:string,body:Record<string,string>,title:string){
    if(sending)throw new Error('Ya hay una solicitud en curso.');
    sending=true;
    try{
      await initialize();
      if(pending)throw new Error('Resuelve primero la operación pendiente; así evitamos registrar otra por error.');
      if(!actions.has(action))throw new Error('Operación no disponible.');
      const operation:PendingOperation={session,action,body:{...body},requestId:uuid(),title,...(accountId?{accountId}:{})};
      // Keep the in-memory block even if storage reports an ambiguous write failure.
      pending=operation;
      await storage.setItem(pendingKey,JSON.stringify(operation));
      return await execute(operation);
    }finally{sending=false;}
  }
  async function retry(){
    if(sending)throw new Error('Ya hay una solicitud en curso.');
    sending=true;
    try{
      await initialize();
      if(!pending)throw new Error('No hay ninguna operación pendiente.');
      // Retry saving too: the previous storage write itself may have failed.
      await storage.setItem(pendingKey,JSON.stringify(pending));
      return await execute(pending);
    }finally{sending=false;}
  }
  async function get<T>(path:string){
    await initialize();
    return request<T>(path,{headers:identityHeaders()});
  }
  return {initialize,submit,retry,get,getPending:()=>pending,isSending:()=>sending};
}
