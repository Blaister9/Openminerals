import type {Storage} from './demo-client';
import type {PushInstallation} from './notifications';
export type NativePushPort={channel:()=>Promise<unknown>;permission:()=>Promise<{status:string;canAskAgain?:boolean}>;request:()=>Promise<{status:string;canAskAgain?:boolean}>;token:(projectId:string)=>Promise<string>};
export function pushInstallationStorageKey(api:string){return 'om-push-'+api.split('').map(c=>c.charCodeAt(0).toString(16).padStart(4,'0')).join('');}
export function createAndroidPushController({api,accountId,projectId,storage,uuid,native,register,release}:{api:string;accountId:string;projectId?:string;storage:Storage;uuid:()=>string;native:NativePushPort;
  register:(body:Pick<PushInstallation,'installationId'|'installationKey'>&{platform:'android';permission:'granted';consent:true;token:string;reactivate:boolean})=>Promise<unknown>;release:(body:{installationId:string;installationKey:string})=>Promise<unknown>}){
  let cancelled=false,running=false;const key=pushInstallationStorageKey(api);
  async function read(){const raw=await storage.getItem(key);if(!raw)return null;const value=JSON.parse(raw) as PushInstallation;if(!/^[a-f0-9-]{36}$/.test(value.installationId)||!/^[a-f0-9]{64}$/.test(value.installationKey))throw new Error('La identificación push guardada no es válida.');return value;}
  async function sync({enabled,requestPermission=false}:{enabled:boolean;requestPermission?:boolean}){
    if(cancelled||running)return 'busy';running=true;
    try{
      let installation=await read();if(cancelled)return 'cancelled';
      const detach=async()=>{if(installation?.registeredAccountId){await release({installationId:installation.installationId,installationKey:installation.installationKey});installation={...installation,registeredAccountId:null};await storage.setItem(key,JSON.stringify(installation));}};
      if(installation?.registeredAccountId&&installation.registeredAccountId!==accountId)await detach();
      if(!enabled){await detach();return 'disabled';}
      if(!projectId||!/^[a-f0-9-]{36}$/.test(projectId))throw new Error('Falta configurar un proyecto Expo/Firebase independiente para push Android.');
      await native.channel();let permission=await native.permission();
      if(cancelled)return 'cancelled';
      if(permission.status!=='granted'&&requestPermission&&permission.canAskAgain!==false)permission=await native.request();
      if(cancelled)return 'cancelled';
      if(permission.status!=='granted'){await detach();return permission.canAskAgain===false?'settings-required':'denied';}
      if(!installation){installation={installationId:uuid(),installationKey:(uuid()+uuid()).replaceAll('-',''),registeredAccountId:null};await storage.setItem(key,JSON.stringify(installation));}
      const token=await native.token(projectId);if(cancelled)return 'cancelled';
      await register({installationId:installation.installationId,installationKey:installation.installationKey,platform:'android',permission:'granted',consent:true,token,reactivate:requestPermission});
      installation.registeredAccountId=accountId;await storage.setItem(key,JSON.stringify(installation));return 'registered';
    }finally{running=false;}
  }
  return {sync,cancel(){cancelled=true;}};
}
