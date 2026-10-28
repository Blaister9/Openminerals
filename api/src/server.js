import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createStore,validateSessionId} from './store.js';
import {DomainError,METALS,operatorSummary} from './domain.js';

const ACTIONS=new Set(['deposit','withdraw','convert','buy','sell','offer','cancel_offer','delivery','cancel_delivery']);
async function readJson(req){
  let body='';
  for await (const chunk of req){
    body+=chunk;
    if(body.length>16_384) throw Object.assign(new Error('Petición demasiado grande'),{status:413});
  }
  try { const parsed=JSON.parse(body);if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))throw new Error('Objeto requerido');return parsed;}
  catch {throw Object.assign(new Error('JSON inválido'),{status:400});}
}
function send(res,status,payload){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Openminerals-Mode':'simulation'});res.end(JSON.stringify(payload));}

export function createApiServer(store,config={}){
  const adminToken=config.adminToken ?? process.env.DEMO_ADMIN_TOKEN;
  return http.createServer(async (req,res)=>{
    const path=new URL(req.url||'/', 'http://127.0.0.1').pathname;
    try {
      if(req.method==='GET'&&path==='/health'){await store.ping();return send(res,200,{ok:true,mode:store.mode,demoOnly:true});}
      if(!path.startsWith('/api/demo/'))return send(res,404,{error:'Ruta no disponible'});
      const session=validateSessionId(req.headers['x-demo-session']);
      if(req.method==='GET'&&path==='/api/demo/state'){
        const state=await store.get(session);
        return send(res,200,{...state,metals:METALS});
      }
      if(req.method==='GET'&&path==='/api/demo/operator/summary'){
        const state=await store.get(session);
        return send(res,200,operatorSummary(state));
      }
      if(req.method==='POST'&&path==='/api/demo/reset'){
        if(!adminToken||req.headers['x-demo-admin-token']!==adminToken)return send(res,403,{error:'No autorizado'});
        return send(res,200,{...(await store.reset(session)),metals:METALS});
      }
      if(req.method==='POST'&&path.startsWith('/api/demo/')){
        const action=path.slice('/api/demo/'.length);
        if(!ACTIONS.has(action))return send(res,404,{error:'Acción no disponible'});
        const body=await readJson(req);
        const idempotencyKey=req.headers['idempotency-key'];
        const result=await store.mutate(session,{...body,action,requestId:idempotencyKey});
        return send(res,200,{receipt:result.receipt,state:{...result.state,metals:METALS}});
      }
      return send(res,405,{error:'Método no permitido'});
    }catch(error){
      const status=error.status||(error instanceof DomainError?422:500);
      if(status===500) console.error('API internal failure:',error);
      return send(res,status,{error:status===500?'Error interno de la demostración':error.message,code:error.code||'ERROR'});
    }
  });
}
export async function start(){
  const store=await createStore();
  const server=createApiServer(store);
  const port=Number(process.env.PORT||3000);
  server.listen(port,'0.0.0.0',()=>console.log(`Openminerals DEMO API ${port} (${store.mode})`));
  return {server,store};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  start().catch(e=>{console.error(e);process.exit(1);});
}
