import {randomBytes,scrypt,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';

const derive=promisify(scrypt);
const PASSWORD_OPTIONS={N:65536,r:8,p:2,maxmem:96*1024*1024};
let hashing=0;
const waiting=[];
async function limitedHash(password,salt){
  if(hashing<2)hashing++;
  else{
    if(waiting.length>=8)throw accountError(429,'Demasiados intentos. Espera unos minutos.','RATE_LIMITED');
    await new Promise(resolve=>waiting.push(resolve));
  }
  try{return await derive(password,salt,32,PASSWORD_OPTIONS);}
  finally{const next=waiting.shift();if(next)next();else hashing--;}
}
export const AUTH_LIFETIME_MS=7*24*60*60*1000;
export const accountError=(status,message,code='ACCOUNT_ERROR')=>Object.assign(new Error(message),{status,code});
export function normalizeAlias(value){
  if(typeof value!=='string')throw accountError(400,'Usa un alias de demostración, sin correo ni datos personales.','INVALID_ALIAS');
  const alias=value.trim().toLowerCase();
  if(!/^[a-z0-9_-]{3,40}$/.test(alias))throw accountError(400,'El alias debe tener 3–40 letras, números, guiones o guiones bajos.','INVALID_ALIAS');
  return alias;
}
export function validatePassword(value){
  if(typeof value!=='string'||value.length<10||value.length>128)throw accountError(400,'La clave exclusiva de demostración debe tener entre 10 y 128 caracteres.','INVALID_PASSWORD');
  return value;
}
export async function passwordRecord(password){
  validatePassword(password);
  const passwordSalt=randomBytes(16).toString('hex');
  const passwordHash=(await limitedHash(password,passwordSalt)).toString('hex');
  return {passwordSalt,passwordHash};
}
const dummy={passwordSalt:'00000000000000000000000000000000',passwordHash:'0'.repeat(64)};
export async function passwordMatches(password,record){
  if(typeof password!=='string'||password.length<10||password.length>128)return false;
  const source=record||dummy;
  const candidate=await limitedHash(password,source.passwordSalt);
  const expected=Buffer.from(source.passwordHash,'hex');
  return Boolean(record)&&expected.length===candidate.length&&timingSafeEqual(candidate,expected);
}
export const tokenHash=token=>createHash('sha256').update(token).digest('hex');
export function newAuthToken(){return randomBytes(32).toString('base64url');}
export function bearerToken(value){
  if(value===undefined)return null;
  if(typeof value!=='string'||!/^Bearer [A-Za-z0-9_-]{43}$/.test(value))throw accountError(401,'Inicia sesión de nuevo con tu cuenta demo.','UNAUTHORIZED');
  return value.slice(7);
}
export function publicAccount(account){return {id:account.id,alias:account.alias,role:account.role,mineId:account.mineId};}
export function adminMatches(actual,expected){
  if(typeof actual!=='string'||typeof expected!=='string'||!expected)return false;
  const a=Buffer.from(actual),b=Buffer.from(expected);
  return a.length===b.length&&timingSafeEqual(a,b);
}
// Process-local limits are sufficient for this isolated demo, not production antifraud.
export function createAuthLimiter({limit=20,windowMs=5*60*1000,maxKeys=1000}={}){
  const entries=new Map();
  return key=>{
    const now=Date.now();
    for(const [id,entry] of entries)if(entry.until<=now)entries.delete(id);
    let entry=entries.get(key);
    if(!entry){
      if(entries.size>=maxKeys)throw accountError(429,'Demasiados intentos. Espera unos minutos.','RATE_LIMITED');
      entry={count:0,until:now+windowMs};entries.set(key,entry);
    }
    entry.count++;
    if(entry.count>limit)throw accountError(429,'Demasiados intentos. Espera unos minutos.','RATE_LIMITED');
  };
}
