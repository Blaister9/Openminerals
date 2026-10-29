// Creates additive, isolated demo data. Never resets an existing mine/account.
// Usage: DEMO_ADMIN_TOKEN=<private> node api/scripts/prepare-demo.mjs --out <new-private-directory> --label rc-20261029 --kind native|presentation
import {randomBytes} from 'node:crypto';
import {mkdir,writeFile,rename,realpath} from 'node:fs/promises';
import {resolve,relative,dirname,basename,join,isAbsolute,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const api='https://openminerals-api-demo.up.railway.app',repo=await realpath(fileURLToPath(new URL('../../',import.meta.url)));
let stage='arguments',directory,fixture;
const ensure=(value)=>{if(!value)throw new Error('Demo preparation guard failed.');};
async function request(path,body,{admin=false,token,status=200}={}){
  const result=await fetch(api+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json',...(admin?{'x-demo-admin-token':process.env.DEMO_ADMIN_TOKEN}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(20000),redirect:'error'});
  ensure(result.status===status);return result.json();
}
async function save(first=false){
  const content=JSON.stringify(fixture,null,2)+'\n',target=join(directory,'credentials.json');
  if(first)await writeFile(target,content,{flag:'wx',mode:0o600});
  else{const temporary=join(directory,'credentials.next.json');await writeFile(temporary,content,{flag:'wx',mode:0o600});await rename(temporary,target);}
}
try{
  const args=process.argv.slice(2),options={};ensure(args.length===6);
  for(let i=0;i<args.length;i+=2){ensure(['--out','--label','--kind'].includes(args[i])&&!options[args[i]]);options[args[i]]=args[i+1];}
  ensure(options['--out']&&/^[a-z0-9-]{3,35}$/.test(options['--label'])&&['native','presentation'].includes(options['--kind']));
  const requested=resolve(options['--out']),parent=await realpath(dirname(requested));
  directory=join(parent,basename(requested));const fromRepo=relative(repo,directory);
  ensure(fromRepo==='..'||fromRepo.startsWith('..'+sep)||isAbsolute(fromRepo));
  ensure(typeof process.env.DEMO_ADMIN_TOKEN==='string'&&process.env.DEMO_ADMIN_TOKEN.length>=32);
  stage='health';const health=await request('/health');ensure(health.ok&&health.demoOnly&&health.mode==='postgres-demo');
  stage='private-directory';await mkdir(directory,{mode:0o700});
  if(process.platform==='win32'){
    const identity=spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-Command','[System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value'],{encoding:'utf8',windowsHide:true,timeout:10000});
    const sid=identity.stdout?.trim();ensure(identity.status===0&&/^S-1-5-\d+(?:-\d+)+$/.test(sid));
    const acl=spawnSync('icacls.exe',[directory,'/inheritance:r','/grant:r','*'+sid+':(OI)(CI)F','*S-1-5-18:(OI)(CI)F'],{encoding:'utf8',windowsHide:true,timeout:10000});ensure(acl.status===0);
  }
  const tag=randomBytes(7).toString('hex');fixture={format:'openminerals-demo-fixtures-v1',api,demoOnly:true,kind:options['--kind'],status:'preparing',createdAt:new Date().toISOString(),mine:null,accounts:{}};
  for(const [name,role] of [['BUYER_A','buyer'],['BUYER_B','buyer'],['OPERATOR','operator']])fixture.accounts[name]={alias:'om_'+tag+'_'+name.toLowerCase(),password:randomBytes(24).toString('base64url'),role};
  await save(true);
  stage='new-mine';fixture.mine=await request('/api/demo/admin/mines',{name:options['--kind']==='native'?'Native QA DEMO '+options['--label']:'Openminerals · Mina de presentación '+options['--label'],initialInventoryMg:{XAU:5000,XAG:5000,XPT:5000,XPD:5000}},{admin:true,status:201});await save();
  for(const [name,value] of Object.entries(fixture.accounts)){
    stage='new-'+name.toLowerCase();value.account=(await request('/api/demo/admin/accounts',{alias:value.alias,password:value.password,role:value.role,mineId:fixture.mine.id},{admin:true,status:201})).account;await save();
    let token;
    try{
      const auth=await request('/api/demo/accounts/login',{alias:value.alias,password:value.password});token=auth.token;ensure(auth.account.id===value.account.id&&auth.account.mineId===fixture.mine.id&&auth.account.role===value.role);
      if(value.role==='buyer'){const state=await request('/api/demo/state',undefined,{token});ensure(state.walletMinor.USDT===25000&&state.walletMinor.USD===60000&&state.movements.length===0&&Object.values(state.holdingsMg).every(value=>value===0));}
    }finally{if(token)await request('/api/demo/accounts/logout',{}, {token});}
  }
  stage='ready';fixture.status='ready';await save();console.log(JSON.stringify({ok:true,demoOnly:true,directory,mineId:fixture.mine.id,accounts:3,credentialsPrinted:false}));
}catch{
  console.error(JSON.stringify({ok:false,stage,directory,credentialsPrinted:false,recordsDeleted:false}));process.exitCode=1;
}
