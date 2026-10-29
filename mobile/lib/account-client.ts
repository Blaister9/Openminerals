import {createDemoClient,RequestError,type Storage,type PendingOperation} from './demo-client.ts';

export type PublicAccount={id:string;alias:string;role:'buyer'|'operator';mineId:string};
export type PublicMine={id:string;name:string};
export type DemoProfile={displayName:string;preferredCurrency:'COP'|'EUR'|'USD'|'USDT';jurisdiction:'DEMO_LOCAL'|'DEMO_REGIONAL'|'DEMO_INTERNATIONAL'};
export type AccountProfileResult={demoOnly:true;account:PublicAccount;profile:DemoProfile;recovery:{enabled:boolean;selfService:boolean}};
export type RecoverySetupResult={demoOnly:true;recoveryEnabled:true;recoveryKey:string};
export type RecoveryChallenge={alias:string;expiresAt:string;demoOnly:true};
export type RecoveryCompletion={alias:string;recoveryKey:string;sessionsRevoked:true;demoOnly:true};
export type AccountContext={
  session:string;pending:PendingOperation|null;account:PublicAccount|null;
  mine?:PublicMine;expiresAt?:string;authExpired?:boolean;
};
type AuthResult={token:string;expiresAt:string;account:PublicAccount;mine:PublicMine;demoOnly:true};
type SavedAuth=AuthResult&{version:1;api:string};
type Options={
  api:string;storage:Storage;authStorage:Storage;uuid:()=>string;
  fetchImpl?:typeof fetch;timeoutMs?:number;
};

// SecureStore keys permit only letters, digits, '.', '_' and '-'. Fixed-width
// UTF-16 hex also keeps different API origins in distinct credential slots.
export function accountAuthStorageKey(api:string):string {
  return 'openminerals-demo-account-'+api.split('').map(c=>c.charCodeAt(0).toString(16).padStart(4,'0')).join('');
}

function publicAccount(value:unknown):value is PublicAccount {
  if(!value||typeof value!=='object')return false;
  const account=value as PublicAccount;
  return typeof account.id==='string'&&/^[A-Za-z0-9_-]{16,100}$/.test(account.id)&&
    typeof account.alias==='string'&&/^[A-Za-z0-9_-]{3,40}$/.test(account.alias)&&
    ['buyer','operator'].includes(account.role)&&typeof account.mineId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(account.mineId);
}
function publicMine(value:unknown):value is PublicMine {
  if(!value||typeof value!=='object')return false;
  const mine=value as PublicMine;
  return typeof mine.id==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(mine.id)&&typeof mine.name==='string'&&mine.name.length>0&&mine.name.length<=200;
}
function validAuth(value:unknown):value is AuthResult {
  if(!value||typeof value!=='object')return false;
  const auth=value as AuthResult;
  return auth.demoOnly===true&&typeof auth.token==='string'&&/^[A-Za-z0-9_-]{32,200}$/.test(auth.token)&&
    typeof auth.expiresAt==='string'&&Number.isFinite(Date.parse(auth.expiresAt))&&publicAccount(auth.account)&&publicMine(auth.mine)&&auth.account.mineId===auth.mine.id;
}
const pendingMessage='Resuelve primero la operación pendiente con su misma cuenta antes de cambiar o cerrar sesión.';
const recoveryInProgress='Termina o cierra la recuperación de acceso antes de operar o cambiar de cuenta.';
const cleanAccount=(account:PublicAccount):PublicAccount=>({id:account.id,alias:account.alias,role:account.role,mineId:account.mineId});
const cleanMine=(mine:PublicMine):PublicMine=>({id:mine.id,name:mine.name});
const secretKey=(value:unknown):value is string=>typeof value==='string'&&/^[A-Za-z0-9_-]{43}$/.test(value);
export function validateDemoProfile(value:DemoProfile):DemoProfile{
  const displayName=value.displayName.trim();
  if(displayName.length<3||displayName.length>40||!/^[-\p{L}\p{N} ._]+$/u.test(displayName)||!/[\p{L}]/u.test(displayName))throw new Error('Usa un nombre ficticio de 3 a 40 letras, números, espacios, puntos, guiones o guiones bajos; sin correo, URL ni teléfono.');
  if(!['COP','EUR','USD','USDT'].includes(value.preferredCurrency))throw new Error('Elige una divisa de demostración disponible.');
  if(!['DEMO_LOCAL','DEMO_REGIONAL','DEMO_INTERNATIONAL'].includes(value.jurisdiction))throw new Error('Elige una jurisdicción ficticia disponible.');
  return {displayName,preferredCurrency:value.preferredCurrency,jurisdiction:value.jurisdiction};
}
function profileResult(value:unknown,expected:PublicAccount):AccountProfileResult{
  const result=value as AccountProfileResult;
  if(!result||result.demoOnly!==true||!publicAccount(result.account)||result.account.id!==expected.id||result.account.role!==expected.role||result.account.mineId!==expected.mineId||
    !result.profile||typeof result.profile.displayName!=='string'||typeof result.recovery?.enabled!=='boolean'||result.recovery.selfService!==(expected.role==='buyer')||(expected.role==='operator'&&result.recovery.enabled))throw new Error('El perfil de demostración devolvió una respuesta incompleta.');
  return {demoOnly:true,account:cleanAccount(result.account),profile:validateDemoProfile(result.profile),recovery:{enabled:result.recovery.enabled,selfService:result.recovery.selfService}};
}

export function createAccountClient({api,storage,authStorage,uuid,fetchImpl=fetch,timeoutMs=12_000}:Options){
  const authKey=accountAuthStorageKey(api);
  const legacy=createDemoClient({api,storage,uuid,fetchImpl,timeoutMs});
  let current=legacy;
  let auth:SavedAuth|null=null;
  let restored=false;
  let restoreFlight:Promise<void>|null=null;
  let authBusy=false;
  let mutationBusy=false;
  let authExpired=false;
  let identityUncertain=false;
  let acknowledgedLogout=false;
  let revision=0;
  let recovery:{alias:string;token:string;expiresAt:string}|null=null;
  let recoveryRevision=0;

  async function request<T>(path:string,{body,token,legacySession}: {body?:unknown;token?:string;legacySession?:string}={}):Promise<T>{
    if(!api)throw new Error('Falta EXPO_PUBLIC_API_URL. Conecta primero la API de demostración.');
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    try{
      const timeout=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{
        controller.abort();reject(new RequestError('Se agotó el tiempo de conexión. Reintenta sin cambiar de cuenta.'));
      },timeoutMs);});
      const work=(async()=>{
        const response=await fetchImpl(api+path,{
          method:body===undefined?'GET':'POST',signal:controller.signal,
          headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{ }),...(legacySession?{'x-demo-session':legacySession}:{})},
          body:body===undefined?undefined:JSON.stringify(body),
        });
        const data=response.status===204?{}:await response.json();
        if(!response.ok){
          const definite=response.status>=400&&response.status<500&&![408,429].includes(response.status);
          throw new RequestError(data.error||'No se pudo acceder a la cuenta de demostración.',response.status,!definite);
        }
        return data as T;
      })();
      return await Promise.race([work,timeout]);
    }finally{if(timer!==undefined)clearTimeout(timer);}
  }

  function accountClient(account:PublicAccount){
    return createDemoClient({api,storage,uuid,fetchImpl,timeoutMs,accountId:account.id,
      getToken:()=>auth?.account.id===account.id?auth.token:null});
  }
  async function restore(){
    if(restored)return;
    if(restoreFlight)return restoreFlight;
    restoreFlight=(async()=>{
      const saved=await authStorage.getItem(authKey);
      if(saved){
        let parsed:SavedAuth;
        try{parsed=JSON.parse(saved);}catch{throw new Error('La cuenta guardada no es válida. No se enviaron operaciones.');}
        if(parsed.version!==1||parsed.api!==api||!validAuth(parsed))throw new Error('La cuenta guardada no es válida. No se enviaron operaciones.');
        // Assign only a validated saved identity. If its token belongs to a
        // different account, /me below blocks it before any trade can be sent.
        const client=accountClient(parsed.account);
        await client.initialize();
        auth={token:parsed.token,expiresAt:parsed.expiresAt,account:cleanAccount(parsed.account),mine:cleanMine(parsed.mine),demoOnly:true,version:1,api};current=client;
        try{
          const me=await request<{account:PublicAccount;mine:PublicMine;demoOnly:boolean}>('/api/demo/accounts/me',{token:parsed.token});
          if(me.demoOnly!==true||!publicAccount(me.account)||!publicMine(me.mine)||me.account.mineId!==me.mine.id)throw new Error('La cuenta devolvió una respuesta incompleta.');
          if(me.account.id!==parsed.account.id){authExpired=true;throw new RequestError('La cuenta guardada no coincide con la sesión. Inicia sesión de nuevo.',401,true);}
          auth={...auth,account:cleanAccount(me.account),mine:cleanMine(me.mine)};
          authExpired=Date.parse(auth.expiresAt)<=Date.now();
        }catch(error){
          if(error instanceof RequestError&&error.status===401)authExpired=true;
          else throw error;
        }
      }else{
        await legacy.initialize();
      }
      restored=true;
    })();
    try{await restoreFlight;}finally{restoreFlight=null;}
  }
  function guardIdentity(){
    if(identityUncertain)throw new Error('No pudimos confirmar que la cuenta quedara guardada. Inicia sesión de nuevo antes de operar.');
    if(auth&&authExpired)throw new RequestError('Inicia sesión de nuevo con la misma cuenta para continuar.',401,true);
  }
  async function context():Promise<AccountContext>{
    const identity=await current.initialize();
    return {...identity,account:auth?{...auth.account}:null,...(auth?{mine:{...auth.mine},expiresAt:auth.expiresAt,authExpired}: {})};
  }
  async function initialize(){
    if(authBusy)throw new Error('Espera a que termine el cambio de cuenta.');
    await restore();
    if(authBusy)throw new Error('Espera a que termine el cambio de cuenta.');
    if(identityUncertain)throw new Error('No pudimos confirmar que la cuenta quedara guardada. Inicia sesión de nuevo.');
    const requestRevision=revision;const result=await context();
    if(requestRevision!==revision)throw new RequestError('La cuenta cambió durante la consulta. Actualiza los datos.',409,true);
    return result;
  }
  async function persistAndActivate(next:AuthResult){
    if(!validAuth(next))throw new Error('La cuenta devolvió una respuesta incompleta. No se cambió la identidad.');
    // Auth responses may grow new one-time secrets. Persist only this explicit
    // allowlist, including nested objects; never spread an API response to disk.
    const saved:SavedAuth={token:next.token,expiresAt:next.expiresAt,account:cleanAccount(next.account),mine:cleanMine(next.mine),demoOnly:true,version:1,api};
    // Rotating a token for this same account must retain the in-memory command
    // too: an ambiguous AsyncStorage write/delete may leave no disk copy yet.
    const nextClient=auth?.account.id===saved.account.id?current:accountClient(saved.account);
    await nextClient.initialize();
    try{await authStorage.setItem(authKey,JSON.stringify(saved));}
    catch(error){identityUncertain=true;throw error;}
    auth=saved;current=nextClient;revision++;authExpired=false;identityUncertain=false;acknowledgedLogout=false;
    return context();
  }
  function enterAuth(){
    if(authBusy||mutationBusy||current.isSending())throw new Error('Ya hay una solicitud en curso.');
    authBusy=true;
  }
  async function register(alias:string,password:string,importLegacy=true){
    enterAuth();
    try{
      await restore();
      if(recovery)throw new Error(recoveryInProgress);
      if(auth)throw new Error('Cierra primero tu cuenta actual antes de crear otra.');
      if(current.getPending())throw new Error(pendingMessage);
      const legacyIdentity=await legacy.initialize();
      try{
        const next=await request<AuthResult>('/api/demo/accounts/register',{
          body:{alias,password,importLegacy},...(importLegacy?{legacySession:legacyIdentity.session}:{}),
        });
        return await persistAndActivate(next);
      }catch(error){
        if(!(error instanceof RequestError&&!error.ambiguous)){
          // Registration may have claimed the legacy session before a response
          // was lost. Resolve that account explicitly; never keep trading under
          // a possibly superseded anonymous identity.
          identityUncertain=true;
          throw new RequestError('No se pudo confirmar la creación de la cuenta. Inicia sesión con el mismo alias y clave; tu sesión anterior no se borró.');
        }
        throw error;
      }
    }finally{authBusy=false;}
  }
  async function login(alias:string,password:string){
    enterAuth();
    try{
      await restore();
      if(recovery)throw new Error(recoveryInProgress);
      const pending=current.getPending();
      if(pending&&(!auth||alias.trim().toLowerCase()!==auth.account.alias.toLowerCase()))throw new Error(pendingMessage);
      const next=await request<AuthResult>('/api/demo/accounts/login',{body:{alias,password}});
      if(!validAuth(next))throw new Error('La cuenta devolvió una respuesta incompleta.');
      if(pending&&next.account.id!==auth?.account.id)throw new Error(pendingMessage);
      return await persistAndActivate(next);
    }finally{authBusy=false;}
  }
  async function logout(){
    enterAuth();
    try{
      await restore();
      if(recovery)throw new Error(recoveryInProgress);
      if(current.getPending())throw new Error(pendingMessage);
      if(identityUncertain&&!acknowledgedLogout)throw new Error('Confirma primero el acceso a tu cuenta antes de cerrar sesión.');
      if(!auth)return context();
      if(!acknowledgedLogout){
        try{await request('/api/demo/accounts/logout',{body:{},token:auth.token});}
        catch(error){if(!(error instanceof RequestError&&error.status===401))throw error;}
        acknowledgedLogout=true;authExpired=true;
      }
      try{await authStorage.removeItem(authKey);}catch(error){identityUncertain=true;throw error;}
      auth=null;current=legacy;revision++;authExpired=false;identityUncertain=false;acknowledgedLogout=false;
      return context();
    }finally{authBusy=false;}
  }
  async function get<T>(path:string):Promise<T>{
    if(authBusy)throw new Error('Espera a que termine el cambio de cuenta.');
    await restore();guardIdentity();
    if(authBusy)throw new Error('Espera a que termine el cambio de cuenta.');
    const requestRevision=revision;const client=current;
    try{
      const result=await client.get<T>(path);
      if(requestRevision!==revision)throw new RequestError('La cuenta cambió durante la consulta. Actualiza los datos.',409,true);
      return result;
    }catch(error){if(requestRevision===revision&&auth&&error instanceof RequestError&&error.status===401)authExpired=true;throw error;}
  }
  async function mutate(run:(client:typeof current)=>ReturnType<typeof current.submit>){
    if(authBusy||mutationBusy)throw new Error('Ya hay una solicitud en curso.');
    mutationBusy=true;
    try{
      await restore();if(recovery)throw new Error(recoveryInProgress);guardIdentity();
      try{return await run(current);}
      catch(error){if(auth&&error instanceof RequestError&&error.status===401)authExpired=true;throw error;}
    }finally{mutationBusy=false;}
  }
  async function getProfile():Promise<AccountProfileResult>{
    await restore();guardIdentity();if(!auth)throw new Error('Abre primero una cuenta de demostración.');
    const expected=cleanAccount(auth.account);
    return profileResult(await get<unknown>('/api/demo/accounts/profile'),expected);
  }
  async function withAccountSettings<T>(run:(account:PublicAccount,token:string)=>Promise<T>):Promise<T>{
    enterAuth();
    try{
      await restore();if(recovery)throw new Error(recoveryInProgress);guardIdentity();
      if(!auth)throw new Error('Abre primero una cuenta de demostración.');
      if(current.getPending())throw new Error(pendingMessage);
      try{return await run(cleanAccount(auth.account),auth.token);}
      catch(error){if(error instanceof RequestError&&error.status===401)authExpired=true;throw error;}
    }finally{authBusy=false;}
  }
  async function updateProfile(profile:DemoProfile):Promise<AccountProfileResult>{
    return withAccountSettings(async(account,token)=>profileResult(await request<unknown>('/api/demo/accounts/profile',{token,body:validateDemoProfile(profile)}),account));
  }
  async function setupRecovery(password:string):Promise<RecoverySetupResult>{
    return withAccountSettings(async(account,token)=>{
      if(account.role!=='buyer')throw new Error('El acceso del operador compartido se administra por separado.');
      const result=await request<RecoverySetupResult>('/api/demo/accounts/recovery/setup',{token,body:{password}});
      if(result?.demoOnly!==true||result.recoveryEnabled!==true||!secretKey(result.recoveryKey))throw new Error('No se pudo confirmar la clave de recuperación. Con tu clave actual puedes generar otra; la anterior dejará de funcionar.');
      return {demoOnly:true,recoveryEnabled:true,recoveryKey:result.recoveryKey};
    });
  }
  function guardRecoveryAlias(alias:string){
    if(current.getPending()&&(!auth||!authExpired||auth.account.alias.toLowerCase()!==alias))throw new Error(pendingMessage);
    if(auth?.account.role==='operator'&&auth.account.alias.toLowerCase()===alias)throw new Error('El acceso del operador compartido se administra por separado.');
  }
  function cancelRecovery(){recovery=null;recoveryRevision++;}
  async function startRecovery(alias:string,recoveryKey:string):Promise<RecoveryChallenge>{
    enterAuth();
    try{
      await restore();const normalized=alias.trim().toLowerCase();
      if(!/^[a-z0-9_-]{3,40}$/.test(normalized))throw new Error('Introduce el alias ficticio de tu cuenta.');
      guardRecoveryAlias(normalized);cancelRecovery();const attempt=recoveryRevision;
      const result=await request<{demoOnly:true;token:string;expiresAt:string}>('/api/demo/accounts/recovery/start',{body:{alias:normalized,recoveryKey:recoveryKey.trim()}});
      if(attempt!==recoveryRevision)throw new Error('La recuperación se cerró. Vuelve a iniciarla si la necesitas.');
      if(result?.demoOnly!==true||!secretKey(result.token)||typeof result.expiresAt!=='string'||!Number.isFinite(Date.parse(result.expiresAt))||Date.parse(result.expiresAt)<=Date.now())throw new Error('La recuperación devolvió una respuesta incompleta. Inicia el proceso de nuevo.');
      recovery={alias:normalized,token:result.token,expiresAt:result.expiresAt};
      return {alias:normalized,expiresAt:result.expiresAt,demoOnly:true};
    }finally{authBusy=false;}
  }
  async function completeRecovery(password:string):Promise<RecoveryCompletion>{
    enterAuth();
    try{
      await restore();const challenge=recovery,attempt=recoveryRevision;
      if(!challenge||Date.parse(challenge.expiresAt)<=Date.now()){cancelRecovery();throw new Error('La recuperación venció o se cerró. Iníciala de nuevo con tu clave de recuperación.');}
      guardRecoveryAlias(challenge.alias);
      if(password.length<10||password.length>128)throw new Error('La nueva clave debe tener de 10 a 128 caracteres.');
      // A lost response may already have changed the password and revoked this
      // token. Preserve the account/pending command, and require the same login.
      if(auth?.account.alias.toLowerCase()===challenge.alias)authExpired=true;
      let result:{demoOnly:true;ok:true;recoveryKey:string;sessionsRevoked:true};
      let closedWhileWaiting=false;
      try{result=await request('/api/demo/accounts/recovery/complete',{body:{token:challenge.token,password}});}
      finally{closedWhileWaiting=attempt!==recoveryRevision;if(!closedWhileWaiting)cancelRecovery();}
      if(closedWhileWaiting)throw new Error('La recuperación se cerró. Entra con tu nueva clave si el cambio llegó a confirmarse.');
      if(result?.demoOnly!==true||result.ok!==true||result.sessionsRevoked!==true||!secretKey(result.recoveryKey))throw new Error('No pudimos confirmar el resultado. Prueba a entrar con la nueva clave y, después, genera otra clave de recuperación.');
      return {alias:challenge.alias,recoveryKey:result.recoveryKey,sessionsRevoked:true,demoOnly:true};
    }finally{authBusy=false;}
  }
  return {
    initialize,get,register,login,logout,getProfile,updateProfile,setupRecovery,startRecovery,completeRecovery,cancelRecovery,
    submit:(action:string,body:Record<string,string>,title:string)=>mutate(client=>client.submit(action,body,title)),
    retry:()=>mutate(client=>client.retry()),
    getPending:()=>current.getPending(),
    getAccount:()=>auth?{...auth.account}:null,
    isIdentityUncertain:()=>identityUncertain,
    isSending:()=>authBusy||mutationBusy||current.isSending(),
  };
}
