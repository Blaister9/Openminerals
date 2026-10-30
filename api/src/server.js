import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {createStore,validateSessionId} from './store.js';
import {DomainError,METALS,operatorSummary} from './domain.js';
import {historyPage,parseHistoryQuery,readReceipt} from './receipt-history.js';
import {accountError,bearerToken,adminMatches,createAuthLimiter} from './account-auth.js';

const API_VERSION=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
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
function onlyKeys(body,allowed){if(Object.keys(body).some(key=>!allowed.includes(key)))throw accountError(400,'Campos de petición no permitidos.','INVALID_FIELDS');}
function requireIdentity(identity){if(!identity)throw accountError(401,'Inicia sesión con tu cuenta demo.','UNAUTHORIZED');return identity;}

export function createApiServer(store,config={}){
  const adminToken=config.adminToken ?? process.env.DEMO_ADMIN_TOKEN;
  const allowAuth=createAuthLimiter(config.authRateLimit);
  return http.createServer(async (req,res)=>{
    try {
      let url;
      try{url=new URL(req.url||'/', 'http://127.0.0.1');}catch{throw accountError(400,'Ruta inválida.','INVALID_URL');}
      const path=url.pathname;
      if(req.method==='GET'&&path==='/health'){await store.ping();return send(res,200,{ok:true,mode:store.mode,demoOnly:true,apiVersion:API_VERSION});}
      if(!path.startsWith('/api/demo/'))return send(res,404,{error:'Ruta no disponible'});
      if(req.method==='POST'&&path==='/api/demo/accounts/register'){
        allowAuth(req.socket.remoteAddress||'unknown');
        const body=await readJson(req);onlyKeys(body,['alias','password','importLegacy']);
        if(body.importLegacy!==undefined&&typeof body.importLegacy!=='boolean')throw accountError(400,'Selecciona si deseas vincular la sesión anterior.');
        const legacySessionId=body.importLegacy?validateSessionId(req.headers['x-demo-session']):undefined;
        return send(res,201,await store.registerAccount({alias:body.alias,password:body.password,legacySessionId}));
      }
      if(req.method==='POST'&&path==='/api/demo/accounts/login'){
        allowAuth(req.socket.remoteAddress||'unknown');
        const body=await readJson(req);onlyKeys(body,['alias','password']);
        return send(res,200,await store.loginAccount(body.alias,body.password));
      }
      if(req.method==='POST'&&path==='/api/demo/accounts/recovery/start'){
        allowAuth(req.socket.remoteAddress||'unknown');
        const body=await readJson(req);onlyKeys(body,['alias','recoveryKey']);
        return send(res,200,await store.startRecovery(body.alias,body.recoveryKey));
      }
      if(req.method==='POST'&&path==='/api/demo/accounts/recovery/complete'){
        allowAuth(req.socket.remoteAddress||'unknown');
        const body=await readJson(req);onlyKeys(body,['token','password']);
        return send(res,200,await store.completeRecovery(body.token,body.password));
      }
      if(req.method==='POST'&&path==='/api/demo/accounts/logout'){
        const token=bearerToken(req.headers.authorization);
        if(!token)throw accountError(401,'Inicia sesión con tu cuenta demo.','UNAUTHORIZED');
        return send(res,200,await store.logoutAccount(token));
      }
      if(path.startsWith('/api/demo/admin/')){
        if(!adminMatches(req.headers['x-demo-admin-token'],adminToken))throw accountError(403,'No autorizado.','FORBIDDEN');
        if(req.method==='POST'&&path==='/api/demo/admin/mines'){
          const body=await readJson(req);onlyKeys(body,['name','initialInventoryMg']);
          return send(res,201,await store.createMine(body));
        }
        if(req.method==='POST'&&path==='/api/demo/admin/accounts'){
          const body=await readJson(req);onlyKeys(body,['alias','password','role','mineId']);
          return send(res,201,{account:await store.createAccount(body),demoOnly:true});
        }
        return send(res,404,{error:'Ruta administrativa no disponible'});
      }
      // A supplied bearer is always checked, never downgraded to the legacy header.
      const token=bearerToken(req.headers.authorization);
      const identity=token?await store.authenticate(token):null;
      if(req.method==='GET'&&path==='/api/demo/accounts/me')return send(res,200,requireIdentity(identity));
      if(req.method==='GET'&&path==='/api/demo/accounts/profile'){
        const {account}=requireIdentity(identity);return send(res,200,await store.getProfile(account.id));
      }
      if(req.method==='POST'&&path==='/api/demo/accounts/profile'){
        const {account}=requireIdentity(identity),body=await readJson(req);onlyKeys(body,['displayName','preferredCurrency','jurisdiction']);
        return send(res,200,await store.updateProfile(account.id,body));
      }
      if(req.method==='POST'&&path==='/api/demo/accounts/recovery/setup'){
        const {account}=requireIdentity(identity),body=await readJson(req);onlyKeys(body,['password']);
        return send(res,200,await store.setupRecovery(account.id,body.password));
      }
      if(req.method==='GET'&&path==='/api/demo/marketplace'){
        const {account}=requireIdentity(identity);
        return send(res,200,await store.getMarketplace(account.id));
      }
      if(req.method==='GET'&&path==='/api/demo/deliveries'){
        const {account}=requireIdentity(identity);
        return send(res,200,await store.getDeliveries(account.id));
      }
      if(req.method==='POST'&&['/api/demo/delivery_accept','/api/demo/delivery_reject'].includes(path)){
        const {account}=requireIdentity(identity),body=await readJson(req);
        const action=path.slice('/api/demo/'.length);onlyKeys(body,action==='delivery_accept'?['deliveryId','quoteId']:['deliveryId']);
        const result=await store.mutateAccount(account.id,{...body,action,requestId:req.headers['idempotency-key']});
        return send(res,200,{receipt:result.receipt,state:{...result.state,metals:METALS}});
      }
      if(req.method==='POST'&&path==='/api/demo/market_buy'){
        const {account}=requireIdentity(identity),body=await readJson(req);onlyKeys(body,['sellerId','offerId']);
        const result=await store.mutateAccount(account.id,{...body,action:'market_buy',requestId:req.headers['idempotency-key']});
        return send(res,200,{receipt:result.receipt,state:{...result.state,metals:METALS}});
      }
      if(req.method==='GET'&&path==='/api/demo/custody'){
        const {account}=requireIdentity(identity);
        return send(res,200,await store.getCustody(account.id,'buyer'));
      }
      if(req.method==='GET'&&/^\/api\/demo\/custody\/lots\/[^/]+\/history$/.test(path)){
        const {account}=requireIdentity(identity),lotId=path.split('/')[5];
        return send(res,200,await store.getLotHistory(account.id,lotId,url.searchParams));
      }
      if(req.method==='GET'&&path.startsWith('/api/demo/certificates/')){
        const {account}=requireIdentity(identity);
        const certificateId=path.slice('/api/demo/certificates/'.length);
        if(!/^[A-Za-z0-9_-]{8,100}$/.test(certificateId))throw accountError(400,'Identificador de certificado DEMO inválido.');
        return send(res,200,await store.getCertificate(account.id,certificateId));
      }
      if(path.startsWith('/api/demo/mine/')){
        const {account}=requireIdentity(identity);
        if(req.method==='GET'&&path==='/api/demo/mine/summary')return send(res,200,await store.getMineSummary(account.id));
        if(req.method==='GET'&&path==='/api/demo/mine/intake')return send(res,200,await store.getIntake(account.id));
        if(req.method==='POST'&&['intake_produce','intake_verify','intake_receive'].some(action=>path==='/api/demo/mine/'+action)){
          const action=path.slice('/api/demo/mine/'.length),body=await readJson(req);
          onlyKeys(body,action==='intake_produce'?['metal','grams','reason']:['batchId','reason']);
          const result=await store.mutateIntake(account.id,{...body,action,requestId:req.headers['idempotency-key']});
          return send(res,200,{receipt:result.receipt,mine:result.mine,demoOnly:true});
        }
        if(req.method==='GET'&&path==='/api/demo/mine/custody')return send(res,200,await store.getCustody(account.id,'operator'));
        if(req.method==='GET'&&path==='/api/demo/mine/deliveries')return send(res,200,await store.getDeliveries(account.id,'operator'));
        if(req.method==='GET'&&path==='/api/demo/mine/management')return send(res,200,await store.getManagement(account.id,url.searchParams));
        if(req.method==='GET'&&path.startsWith('/api/demo/mine/commands/')){
          for(const key of url.searchParams.keys())if(!['actor','kind'].includes(key)||url.searchParams.getAll(key).length!==1)throw accountError(400,'Parámetros de comprobante DEMO inválidos.');
          return send(res,200,await store.getMineCommand(account.id,path.slice('/api/demo/mine/commands/'.length),{actorId:url.searchParams.get('actor')??undefined,kind:url.searchParams.get('kind')??undefined}));
        }
        if(req.method==='POST'&&['/api/demo/mine/delivery_quote','/api/demo/mine/delivery_transition','/api/demo/mine/delivery_config'].includes(path)){
          const action=path.slice('/api/demo/mine/'.length),body=await readJson(req);
          const fields={delivery_quote:['buyerId','deliveryId','jurisdiction'],delivery_transition:['buyerId','deliveryId','status','reason'],delivery_config:['jurisdiction','label','taxBps','service','preparation','transport','insuranceBps','quoteValidityHours','requirements','reason']};
          onlyKeys(body,fields[action]);const result=await store.mutateDelivery(account.id,{...body,action,requestId:req.headers['idempotency-key']});
          return send(res,200,{receipt:result.receipt,mine:result.mine});
        }
        if(req.method==='POST'&&path==='/api/demo/mine/stock'){
          const body=await readJson(req);onlyKeys(body,['metal','grams','reason','purityBps','location','documents','documentTitle','documentContent']);
          const result=await store.mutateStock(account.id,{...body,requestId:req.headers['idempotency-key']});
          return send(res,200,{receipt:result.receipt,mine:result.mine,demoOnly:true});
        }
        if(req.method==='GET'&&path.startsWith('/api/demo/mine/receipts/')){
          const parts=path.slice('/api/demo/mine/receipts/'.length).split('/');
          if(parts.length!==2||!parts.every(value=>/^[A-Za-z0-9_-]{8,100}$/.test(value)))throw accountError(400,'Identificador de comprobante inválido.');
          return send(res,200,await store.getMineReceipt(account.id,parts[0],parts[1]));
        }
        return send(res,404,{error:'Ruta de mina no disponible'});
      }
      const session=identity?null:validateSessionId(req.headers['x-demo-session']);
      const loadState=()=>identity?store.getAccountState(identity.account.id):store.get(session);
      if(req.method==='GET'&&path==='/api/demo/state'){
        const state=await loadState();
        return send(res,200,{...state,metals:METALS});
      }
      if(req.method==='GET'&&path==='/api/demo/operator/summary'){
        if(identity)throw accountError(403,'El panel compartido se consulta con una cuenta de operador en Mina.','FORBIDDEN');
        const state=await store.get(session);
        return send(res,200,operatorSummary(state));
      }
      if(req.method==='GET'&&path==='/api/demo/history'){
        const options=parseHistoryQuery(url.searchParams);
        const state=await loadState();
        return send(res,200,historyPage(state,options));
      }
      if(req.method==='GET'&&path.startsWith('/api/demo/receipts/')){
        const id=path.slice('/api/demo/receipts/'.length);
        const state=await loadState();
        return send(res,200,readReceipt(state,id));
      }
      if(req.method==='POST'&&path==='/api/demo/reset'){
        if(identity||!adminMatches(req.headers['x-demo-admin-token'],adminToken))return send(res,403,{error:'No autorizado'});
        return send(res,200,{...(await store.reset(session)),metals:METALS});
      }
      if(req.method==='POST'&&path.startsWith('/api/demo/')){
        const action=path.slice('/api/demo/'.length);
        if(!ACTIONS.has(action))return send(res,404,{error:'Acción no disponible'});
        const body=await readJson(req);
        const idempotencyKey=req.headers['idempotency-key'];
        const command={...body,action,requestId:idempotencyKey};
        const result=identity?await store.mutateAccount(identity.account.id,command):await store.mutate(session,command);
        return send(res,200,{receipt:result.receipt,state:{...result.state,metals:METALS}});
      }
      return send(res,405,{error:'Método no permitido'});
    }catch(error){
      const status=error.status||(error instanceof DomainError?422:500);
      if(status===500)console.error('API internal failure:',error.code||error.name||'Error');
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
  start().catch(error=>{console.error('API startup failure:',error.code||error.name||'Error');process.exit(1);});
}
