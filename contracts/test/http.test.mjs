import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {BrowserProvider} from 'ethers';
import {localChain} from './local-chain.mjs';
import {createStore} from '../../api/src/store.js';
import {createApiServer} from '../../api/src/server.js';
import {createAccountClient} from '../../mobile/lib/account-client.ts';
import {createTestnetController} from '../../mobile/lib/testnet-controller.ts';
import {validateLinkChallenge} from '../../mobile/lib/testnet.ts';
function storage(){const data=new Map();return {async getItem(key){return data.get(key)??null;},async setItem(key,value){data.set(key,value);},async removeItem(key){data.delete(key);}};}
test('protocolo cliente→HTTP→EVM local: dos billeteras, firma, despliegue, emisión, transferencia y cancelación',async()=>{
 const chain=await localChain(),provider=new BrowserProvider(chain.provider,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
 const signers=await Promise.all([0,1].map(index=>provider.getSigner(index))),origin='https://testnet.example.invalid';
 const store=await createStore('',{testnetEnabled:true,testnetOrigin:origin,testnetRpc:chain.provider,testnetConfirmations:2,localSimulation:true}),server=createApiServer(store,{authRateLimit:{limit:100}});
 server.listen(0,'127.0.0.1');await once(server,'listening');const local='http://127.0.0.1:'+server.address().port;
 try{
  const mine=await store.createMine({name:'Protocolo HTTP testnet exclusivamente DEMO',initialInventoryMg:{XAU:1000}}),clients=[],accounts=[],controllers=[];
  for(const [index,role] of ['operator','buyer'].entries()){
   const user=await store.createAccount({alias:'chain_http_'+index,password:'Chain-http-fixture-only-123',role,mineId:mine.id});accounts.push(user);
   const client=createAccountClient({api:origin,storage:storage(),authStorage:storage(),uuid:randomUUID,fetchImpl:(url,init)=>fetch(url.replace(origin,local),init)});clients.push(client);await client.login(user.alias,'Chain-http-fixture-only-123');
   const address=await signers[index].getAddress(),challenge=await client.testnetChallenge(address);validateLinkChallenge(challenge,origin,address,user.id);await client.testnetVerify(challenge.challengeId,await signers[index].signMessage(challenge.message));
   controllers.push(createTestnetController({api:origin,accountId:user.id,storage:storage(),uuid:randomUUID,prepare:client.testnetPrepare,submitted:client.testnetSubmit}));
  }
  const before=await store.getAccountState(accounts[1].id);await clients[0].testnetFreeze();const lot=(await clients[0].getTestnetState()).backing.lots[0];
  async function execute(index,body){
   await controllers[index].prepare(body);
   const wallet={async request(input){if(input.method==='eth_sendTransaction'){const tx=input.params[0];return (await signers[index].sendTransaction({...tx,...(tx.nonce?{nonce:Number(BigInt(tx.nonce))}:{})})).hash;}return chain.provider.request(input);}};
   await controllers[index].send(wallet,await signers[index].getAddress());await chain.provider.request({method:'evm_mine'});await clients[index].testnetReconcile();const state=await clients[index].getTestnetState();assert.equal(state.reconciliation.status,'READY');assert.equal(await controllers[index].refresh(state.operations),null);return state;
  }
  await execute(0,{kind:'deploy'});await execute(0,{kind:'participant',toAccountId:accounts[1].id});await execute(0,{kind:'register',lotId:lot.lotId});
  await execute(0,{kind:'issue',lotId:lot.lotId,toAccountId:accounts[0].id,units:'1000'});await execute(0,{kind:'transfer',lotId:lot.lotId,toAccountId:accounts[1].id,units:'400'});
  const state=await execute(1,{kind:'cancel',lotId:lot.lotId,units:'100'});assert.equal(state.balances[0].units,'300');assert.ok(state.operations.every(op=>op.status==='CONFIRMED'));assert.ok(state.operations.every(op=>op.explorer===null));assert.deepEqual(await store.getAccountState(accounts[1].id),before);
 }finally{server.close();await once(server,'close');await store.close();provider.destroy();await chain.close();}
});
