export type Storage = {
  getItem(key:string):Promise<string|null>;
  setItem(key:string,value:string):Promise<void>;
  removeItem(key:string):Promise<void>;
};
export type PendingOperation = {
  session:string; action:string; body:Record<string,string>; requestId:string; title:string;
};
type OperationResult = {state:unknown;receipt:{id:string;replayed?:boolean}};
type Options = {api:string;storage:Storage;uuid:()=>string;fetchImpl?:typeof fetch;timeoutMs?:number};
export class RequestError extends Error {
  status:number;
  ambiguous:boolean;
  constructor(message:string,status=0,ambiguous=true){super(message);this.status=status;this.ambiguous=ambiguous;}
}

// No operation is sent before its original key and payload are stored durably.
// An uncertain response must be replayed with that same key, including after restart.
export function createDemoClient({api,storage,uuid,fetchImpl=fetch,timeoutMs=12_000}:Options){
  const sessionKey='openminerals-demo-session';
  const pendingKey=`openminerals-demo-pending:${api}`;
  const actions=new Set(['deposit','withdraw','convert','buy','sell','offer','cancel_offer','delivery','cancel_delivery']);
  let session='';
  let pending:PendingOperation|null=null;
  let initialized=false;
  let sending=false;

  async function initialize(){
    if(!initialized){
      let id=await storage.getItem(sessionKey);
      if(!id){id=uuid();await storage.setItem(sessionKey,id);}
      if(!/^[A-Za-z0-9_-]{16,100}$/.test(id))throw new Error('La sesión guardada no es válida. No se enviaron operaciones.');
      const saved=await storage.getItem(pendingKey);
      let restored:PendingOperation|null=null;
      if(saved){
        const p=JSON.parse(saved) as PendingOperation;
        if(p.session!==id||!actions.has(p.action)||!p.body||typeof p.body!=='object'||Array.isArray(p.body)||
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
  async function execute(operation:PendingOperation){
    try{
      const data=await request<OperationResult>(`/api/demo/${operation.action}`,{
        method:'POST',headers:{'Content-Type':'application/json','x-demo-session':operation.session,'Idempotency-Key':operation.requestId},
        body:JSON.stringify(operation.body),
      });
      if(!data.state||!data.receipt||typeof data.receipt.id!=='string'){
        throw new RequestError('Respuesta incompleta. Conservamos la operación para reintentar sin duplicarla.');
      }
      await clearPending();
      return data;
    }catch(error){
      if(error instanceof RequestError&&!error.ambiguous)await clearPending();
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
      const operation={session,action,body:{...body},requestId:uuid(),title};
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
    return request<T>(path,{headers:{'x-demo-session':session}});
  }
  return {initialize,submit,retry,get,getPending:()=>pending};
}
