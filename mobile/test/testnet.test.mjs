import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {once} from 'node:events';
import {createTestnetController} from '../lib/testnet-controller.ts';
import {addressEqual,grossUnits,requireSepolia,safeExplorer,validateWalletTransaction,validateLinkChallenge} from '../lib/testnet.ts';
import {createAccountClient} from '../lib/account-client.ts';
import {createStore} from '../../api/src/store.js';
import {createApiServer} from '../../api/src/server.js';
const {Wallet}=createRequire(new URL('../../api/package.json',import.meta.url))('ethers');
const from='0x'+'1'.repeat(40),to='0x'+'2'.repeat(40),txHash='0x'+'a'.repeat(64);
function storage(){const data=new Map();return {data,async getItem(key){return data.get(key)??null;},async setItem(key,value){data.set(key,value);},async removeItem(key){data.delete(key);}};}
function fixture(){const saved=storage(),requests=[],submissions=[],calls=[];let losePrepare=false,loseSubmit=false,rejectSign=false,uncertainSign=false;
 const operation={id:randomUUID(),kind:'transfer',status:'AWAITING_SIGNATURE',hash:null,deadline:Math.floor(Date.now()/1000)+900,unsigned:{from,to,data:'0x1234',chainId:'0x14a34',value:'0x0'},explorer:null,units:'100'};
 const options={api:'https://testnet.example.invalid',accountId:'account-a',storage:saved,uuid:randomUUID,async prepare(body,id){requests.push({body,id});if(losePrepare){losePrepare=false;throw new Error('response lost');}return {operation};},async submitted(id,hash){submissions.push({id,hash});if(loseSubmit){loseSubmit=false;throw new Error('ack lost');}}};
 const provider={async request(request){calls.push(request);if(request.method==='eth_chainId')return '0x14a34';if(request.method==='eth_estimateGas')return '0x186a0';if(rejectSign)throw Object.assign(new Error('Rejected'),{code:4001});if(uncertainSign)throw new Error('timeout after submission');return txHash;}};
 return {saved,operation,options,provider,calls,requests,submissions,controller:createTestnetController(options),losePrepare(){losePrepare=true;},loseSubmit(){loseSubmit=true;},reject(){rejectSign=true;},uncertain(){uncertainSign=true;}};
}
test('testnet móvil: red exclusiva, sin valor ETH, cantidades brutas exactas y enlaces seguros',async()=>{
 assert.equal(grossUnits('0,101'),'101');for(const value of ['0','-1','1e3','0.0001','1000000.001'])assert.throws(()=>grossUnits(value));
 const f=fixture();validateWalletTransaction(f.operation,from);
 for(const patch of [{unsigned:{...f.operation.unsigned,chainId:'0x1'}},{unsigned:{...f.operation.unsigned,value:'0x1'}},{unsigned:{...f.operation.unsigned,from:to}},{deadline:1}])assert.throws(()=>validateWalletTransaction({...f.operation,...patch},from));
 let sent=false;await assert.rejects(requireSepolia({async request(request){if(request.method!=='eth_chainId')sent=true;return '0x1';}}));assert.equal(sent,false);
 assert.equal(safeExplorer('https://sepolia.basescan.org/tx/'+txHash),'https://sepolia.basescan.org/tx/'+txHash);
 for(const url of ['https://basescan.org/tx/'+txHash,'https://user:secret@sepolia.basescan.org/tx/'+txHash,'javascript:alert(1)'])assert.equal(safeExplorer(url),null);
});
test('testnet móvil: preparación perdida conserva identidad; hash conocido se recupera sin duplicar firma',async()=>{
 const f=fixture(),body={kind:'transfer',lotId:'demo-lot',toAccountId:'account-b',units:'100'};f.losePrepare();await assert.rejects(f.controller.prepare(body));
 const restored=createTestnetController(f.options);await restored.prepare(Object.fromEntries(Object.entries(body).reverse()));assert.equal(f.requests[0].id,f.requests[1].id);
 f.loseSubmit();await assert.rejects(restored.send(f.provider,from));assert.equal((await restored.read()).phase,'HASH_KNOWN');await restored.recoverHash();assert.equal(f.submissions.length,2);assert.equal(f.calls.filter(item=>item.method==='eth_sendTransaction').length,1);
 await assert.rejects(restored.prepare(body));await restored.refresh([{...f.operation,status:'CONFIRMED',hash:txHash}]);assert.equal(await restored.read(),null);
 assert.equal(JSON.stringify([...f.saved.data.values()]).includes('privateKey'),false);
});
test('testnet móvil: firma ambigua no se reenvía ni se desbloquea preparando otra vez; rechazo explícito sí permite revisar',async()=>{
 const f=fixture(),body={kind:'transfer',units:'100'};await f.controller.prepare(body);f.uncertain();await assert.rejects(f.controller.send(f.provider,from));assert.equal((await f.controller.read()).phase,'SIGNING_UNKNOWN');
 await assert.rejects(f.controller.send(f.provider,from));await assert.rejects(f.controller.prepare(body));assert.equal(f.calls.filter(item=>item.method==='eth_sendTransaction').length,1);
 const rejected=fixture();await rejected.controller.prepare(body);rejected.reject();await assert.rejects(rejected.controller.send(rejected.provider,from));assert.equal((await rejected.controller.read()).phase,'AWAITING_SIGNATURE');
});
test('preview testnet mantiene paquete comercial, rechaza API/proyecto estables y requiere entorno propio',()=>{
 const require=createRequire(import.meta.url),resolve=require('../app.config.js'),base=JSON.parse(readFileSync(new URL('../app.json',import.meta.url),'utf8')).expo;
 const keys=['OPENMINERALS_TESTNET_PREVIEW','EXPO_PUBLIC_TESTNET','EXPO_PUBLIC_API_URL','TESTNET_API_URL','EXPO_PUBLIC_TESTNET_PROJECT_ID','EAS_BUILD','EAS_BUILD_PROFILE'],before=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 try{for(const key of keys)delete process.env[key];assert.equal(resolve({config:base}).android.package,base.android.package);
  process.env.EXPO_PUBLIC_TESTNET='1';assert.throws(()=>resolve({config:base}),/independent/);process.env.OPENMINERALS_TESTNET_PREVIEW='1';process.env.EXPO_PUBLIC_API_URL='https://testnet.example.invalid';process.env.TESTNET_API_URL=process.env.EXPO_PUBLIC_API_URL;
  const preview=resolve({config:base});assert.equal(preview.android.package,'com.openminerals.demo.testnetpreview');assert.equal(preview.runtimeVersion,'base-sepolia-demo-0.3.0-v1');assert.equal(preview.updates.enabled,false);
  process.env.EXPO_PUBLIC_TESTNET_PROJECT_ID=base.extra.eas.projectId;assert.throws(()=>resolve({config:base}),/separate/);delete process.env.EXPO_PUBLIC_TESTNET_PROJECT_ID;
  for(const url of ['https://openminerals-api-demo.up.railway.app/','https://openminerals-market-api-market-reference.up.railway.app']){process.env.EXPO_PUBLIC_API_URL=url;process.env.TESTNET_API_URL=url;assert.throws(()=>resolve({config:base}),/isolated/);}
 }finally{for(const key of keys)if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}
});
test('cliente/backend: firma de reto válida y rechazo de dominio/cuenta/red manipulados',async()=>{
 const store=await createStore('',{testnetEnabled:true,testnetOrigin:'https://testnet.example.invalid'}),server=createApiServer(store);server.listen(0,'127.0.0.1');await once(server,'listening');
 const api=`http://127.0.0.1:${server.address().port}`,client=createAccountClient({api,storage:storage(),authStorage:storage(),uuid:randomUUID}),signer=Wallet.createRandom();
 try{await store.registerAccount({alias:'testnet_mobile_demo',password:'Testnet-mobile-only-tests-123'});await client.login('testnet_mobile_demo','Testnet-mobile-only-tests-123');
  const challenge=await client.testnetChallenge(signer.address),account=client.getAccount();validateLinkChallenge(challenge,'https://testnet.example.invalid',signer.address,account.id);
  for(const change of [{message:challenge.message.replace('testnet.example.invalid','other.example.invalid')},{chainId:1},{expiresAt:'2020-01-01T00:00:00Z'}])assert.throws(()=>validateLinkChallenge({...challenge,...change},'https://testnet.example.invalid',signer.address,account.id));
  await client.testnetVerify(challenge.challengeId,await signer.signMessage(challenge.message));const state=await client.getTestnetState();assert.ok(addressEqual(state.wallet.address,signer.address));assert.equal(state.chainId,84532);assert.deepEqual(state.balances,[]);
 }finally{server.close();await once(server,'close');await store.close();}
});
