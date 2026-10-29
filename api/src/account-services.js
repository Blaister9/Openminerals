import {timingSafeEqual} from 'node:crypto';
import {CURRENCIES} from './domain.js';
import {accountError,normalizeAlias,passwordMatches,passwordRecord,validatePassword,newAuthToken,tokenHash,publicAccount} from './account-auth.js';

export const RECOVERY_LIFETIME_MS=10*60*1000;
export const RECOVERY_ATTEMPT_LIMIT=5;
export const RECOVERY_WINDOW_MS=15*60*1000;
const secretPattern=/^[A-Za-z0-9_-]{43}$/;
const invalid=()=>accountError(401,'No se pudo validar la recuperación. Revisa los datos de demostración.','RECOVERY_INVALID');
const disabled=()=>accountError(403,'La recuperación del operador demo se administra por una vía protegida.','RECOVERY_DISABLED');
const unauthenticated=()=>accountError(401,'Inicia sesión de nuevo con tu cuenta demo.','UNAUTHORIZED');
const jurisdictions=['DEMO_LOCAL','DEMO_REGIONAL','DEMO_INTERNATIONAL'];
const validDisplayName=value=>typeof value==='string'&&value.trim().length>=3&&value.trim().length<=40&&/^[\p{L}\p{N} _.-]+$/u.test(value.trim())&&/\p{L}/u.test(value);
function profileInput(body){
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(key=>!['displayName','preferredCurrency','jurisdiction'].includes(key)))throw accountError(400,'Solo se permiten preferencias ficticias del perfil.','INVALID_PROFILE');
  const {displayName,preferredCurrency,jurisdiction}=body;
  if(!validDisplayName(displayName)||!CURRENCIES.includes(preferredCurrency)||!jurisdictions.includes(jurisdiction))throw accountError(400,'Usa un nombre ficticio de 3–40 caracteres, una divisa y una jurisdicción DEMO. No uses correo, dirección ni teléfono.','INVALID_PROFILE');
  return {displayName:displayName.trim(),preferredCurrency,jurisdiction};
}
function matchesKey(raw,record){
  const validRecord=typeof record?.keyHash==='string'&&/^[a-f0-9]{64}$/.test(record.keyHash);
  const actual=tokenHash(typeof raw==='string'?raw:''),expected=validRecord?record.keyHash:'0'.repeat(64);
  const equal=timingSafeEqual(Buffer.from(actual),Buffer.from(expected));
  return typeof raw==='string'&&secretPattern.test(raw)&&equal&&validRecord;
}
export function accountServices(adapter){
  async function account(tx,id,lock=false){const result=await tx.account(id,lock);if(!result)throw unauthenticated();return result;}
  async function attempt(scope,value){
    const keyHash=tokenHash(JSON.stringify([scope,typeof value==='string'?value:'<invalid>']));
    // Commit the counter in its own transaction. A rejected proof/reset must
    // never roll back a failed attempt or erase the limit after a restart.
    const allowed=await adapter.tx(tx=>tx.recoveryAttempt(keyHash,RECOVERY_ATTEMPT_LIMIT,RECOVERY_WINDOW_MS));
    if(!allowed)throw accountError(429,'Demasiados intentos de recuperación. Espera 15 minutos.','RECOVERY_RATE_LIMITED');
  }
  async function profileView(tx,current){
    const stored=await tx.profile(current.id),enabled=current.role==='buyer'&&Boolean(await tx.recoveryKey(current.id));
    const profile=stored?profileInput({displayName:stored.displayName,preferredCurrency:stored.preferredCurrency,jurisdiction:stored.jurisdiction}):{displayName:validDisplayName(current.alias)?current.alias:`Demo ${current.alias.slice(0,35)}`,preferredCurrency:'USDT',jurisdiction:'DEMO_LOCAL'};
    return {demoOnly:true,account:publicAccount(current),profile,recovery:{enabled,selfService:current.role==='buyer'}};
  }
  return {
    async getProfile(accountId){return adapter.tx(async tx=>profileView(tx,await account(tx,accountId)));},
    async updateProfile(accountId,body){
      return adapter.tx(async tx=>{const current=await account(tx,accountId,true),profile=profileInput(body);await tx.saveProfile(current.id,profile);return profileView(tx,current);});
    },
    async setupRecovery(accountId,password){
      const first=await adapter.tx(tx=>account(tx,accountId));if(first.role!=='buyer')throw disabled();
      await attempt('setup',accountId);
      return adapter.tx(async tx=>{
        const current=await account(tx,accountId,true);if(current.role!=='buyer')throw disabled();
        if(!await passwordMatches(password,current))throw accountError(403,'La clave demo actual no pudo verificarse.','INVALID_RECOVERY_PROOF');
        const recoveryKey=newAuthToken();await tx.saveRecoveryKey(accountId,tokenHash(recoveryKey));await tx.deleteRecoveryChallenges(accountId);
        return {demoOnly:true,recoveryEnabled:true,recoveryKey};
      });
    },
    async startRecovery(rawAlias,recoveryKey){
      let alias;try{alias=normalizeAlias(rawAlias);}catch{}
      const attemptAlias=alias??`invalid:${tokenHash(typeof rawAlias==='string'?rawAlias.trim().toLowerCase():'<invalid>')}`;
      await attempt('start',attemptAlias);
      return adapter.tx(async tx=>{
        const first=await tx.alias(alias??':invalid-recovery-alias:');
        const current=await tx.account(first?.id??':missing-recovery-account:',true);
        const proof=await tx.recoveryKey(current?.id??':missing-recovery-account:');
        if(!matchesKey(recoveryKey,proof)||!current||current.role!=='buyer')throw invalid();
        const token=newAuthToken(),expiresAt=new Date(Date.now()+RECOVERY_LIFETIME_MS).toISOString();
        await tx.insertRecoveryChallenge({hash:tokenHash(token),accountId:current.id,expiresAt});
        return {demoOnly:true,token,expiresAt};
      });
    },
    async completeRecovery(token,password){
      await attempt('complete',typeof token==='string'?token:'<invalid>');validatePassword(password);
      if(typeof token!=='string'||!secretPattern.test(token))throw invalid();
      const hash=tokenHash(token);
      return adapter.tx(async tx=>{
        const first=await tx.recoveryChallenge(hash);
        if(!first)throw invalid();
        const current=await tx.account(first.accountId,true);
        const challenge=await tx.recoveryChallenge(hash,true);
        if(!current||current.role!=='buyer'||!challenge||challenge.accountId!==current.id||Date.parse(challenge.expiresAt)<=Date.now())throw invalid();
        const credentials=await passwordRecord(password),recoveryKey=newAuthToken();
        await tx.savePassword(current.id,credentials);await tx.saveRecoveryKey(current.id,tokenHash(recoveryKey));
        await tx.deleteAccountAuth(current.id);await tx.deleteRecoveryChallenges(current.id);
        return {demoOnly:true,ok:true,recoveryKey,sessionsRevoked:true};
      });
    },
  };
}
