import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {once} from 'node:events';
import {Wallet} from 'ethers';
import {createStore} from '../src/store.js';
import {createApiServer} from '../src/server.js';
import {tokenHash} from '../src/account-auth.js';
import {validateSubmitted} from '../src/testnet/service.js';

const password='Only-local-testnet-fixtures-123';
test('vinculación DEMO: nonce, dominio/URI/red, firma, expiración, consumo único y sesión vinculada',async()=>{
 let time=Date.now();const store=await createStore('',{testnetEnabled:true,testnetOrigin:'https://testnet.example.invalid',now:()=>time});
 // Unfunded ephemeral signing keys remain only in this test process's memory.
 const signer=Wallet.createRandom(),wrong=Wallet.createRandom();
 try{
  const login=await store.registerAccount({alias:'nonce_demo_buyer',password}),id=login.account.id,session=tokenHash(login.token);
  const challenge=await store.testnetChallenge(id,session,{address:signer.address});
  assert.match(challenge.message,/testnet.example.invalid wants/);assert.match(challenge.message,/Chain ID: 84532/);assert.match(challenge.message,/Nonce: [a-f0-9]{48}/);assert.match(challenge.message,new RegExp(id));
  await assert.rejects(store.testnetVerifyWallet(id,session,{challengeId:challenge.challengeId,signature:await wrong.signMessage(challenge.message)}),{code:'WALLET_PROOF_REJECTED'});
  await assert.rejects(store.testnetVerifyWallet(id,session,{challengeId:challenge.challengeId,signature:await signer.signMessage(challenge.message.replace('Chain ID: 84532','Chain ID: 1'))}),{code:'WALLET_PROOF_REJECTED'});
  const signature=await signer.signMessage(challenge.message),attempts=await Promise.allSettled([store.testnetVerifyWallet(id,session,{challengeId:challenge.challengeId,signature}),store.testnetVerifyWallet(id,session,{challengeId:challenge.challengeId,signature})]);
  assert.equal(attempts.filter(item=>item.status==='fulfilled').length,1);
  const second=await store.loginAccount('nonce_demo_buyer',password),old=await store.testnetChallenge(id,session,{address:signer.address});
  await assert.rejects(store.testnetVerifyWallet(id,tokenHash(second.token),{challengeId:old.challengeId,signature:await signer.signMessage(old.message)}),{code:'WALLET_PROOF_REJECTED'});
  time+=300001;await assert.rejects(store.testnetVerifyWallet(id,session,{challengeId:old.challengeId,signature:await signer.signMessage(old.message)}),{code:'WALLET_PROOF_REJECTED'});
  const other=await store.registerAccount({alias:'nonce_demo_other',password}),owned=await store.testnetChallenge(other.account.id,tokenHash(other.token),{address:signer.address});
  await assert.rejects(store.testnetVerifyWallet(other.account.id,tokenHash(other.token),{challengeId:owned.challengeId,signature:await signer.signMessage(owned.message)}),{code:'WALLET_PROOF_REJECTED'});
 }finally{await store.close();}
});
test('vinculación DEMO: intentos inválidos persistentes, rol de operador y mina compartida protegidos',async()=>{
 const store=await createStore('',{testnetEnabled:true,testnetOrigin:'https://testnet.example.invalid'});
 try{
  const user=await store.registerAccount({alias:'testnet_guard_buyer',password}),session=tokenHash(user.token),signer=Wallet.createRandom(),wrong=Wallet.createRandom();
  const challenge=await store.testnetChallenge(user.account.id,session,{address:signer.address});
  for(let i=0;i<5;i++)await assert.rejects(store.testnetVerifyWallet(user.account.id,session,{challengeId:challenge.challengeId,signature:await wrong.signMessage(challenge.message)}),{code:'WALLET_PROOF_REJECTED'});
  await assert.rejects(store.testnetVerifyWallet(user.account.id,session,{challengeId:challenge.challengeId,signature:await signer.signMessage(challenge.message)}),{code:'WALLET_PROOF_REJECTED'});
  await assert.rejects(store.freezeTestnetPool(user.account.id,session,{acknowledgement:'DEMO_ONLY_ISOLATED_MINE'}),{status:403});
  const operator=await store.createAccount({alias:'testnet_guard_operator',password,role:'operator'}),auth=await store.loginAccount(operator.alias,password);
  await assert.rejects(store.freezeTestnetPool(operator.id,tokenHash(auth.token),{acknowledgement:'DEMO_ONLY_ISOLATED_MINE'}),{status:403});
 }finally{await store.close();}
});
test('testnet HTTP: bearer obligatorio, campos extra rechazados y módulo apagado sin consultar RPC',async()=>{
 let rpcCalls=0;const store=await createStore('',{testnetEnabled:false,testnetRpc:{async request(){rpcCalls++;throw new Error('Must not be called');}}}),server=createApiServer(store);server.listen(0,'127.0.0.1');await once(server,'listening');
 const base=`http://127.0.0.1:${server.address().port}`,call=(path,token,body)=>fetch(base+'/api/demo/testnet/'+path,{method:body?'POST':'GET',headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});
 try{
  const user=await store.registerAccount({alias:'testnet_disabled_http',password});assert.equal((await call('state')).status,401);assert.equal((await call('state','bad')).status,401);
  assert.equal((await call('state',user.token)).status,503);assert.equal((await call('reconcile',user.token,{})).status,503);assert.equal(rpcCalls,0);
  assert.equal((await call('wallet/challenge',user.token,{address:Wallet.createRandom().address,accountId:'other'})).status,400);
  assert.equal((await call('state?mine=other',user.token)).status,400);
 }finally{server.close();await once(server,'close');await store.close();}
});
test('intentos DEMO: hash no sustituye verificación de cadena, origen, destino, calldata y valor cero',()=>{
 const from=Wallet.createRandom().address.toLowerCase(),to=Wallet.createRandom().address.toLowerCase(),op={from,unsigned:{from,to,data:'0x1234',chainId:'0x14a34',value:'0x0'}};
 const tx={from,to,input:'0x1234',chainId:'0x14a34',value:'0x0',nonce:'0x0'};validateSubmitted(op,tx);
 for(const patch of [{from:to},{to:from},{input:'0xdead'},{value:'0x1'},{chainId:'0x1'}])assert.throws(()=>validateSubmitted(op,{...tx,...patch}),{code:'TX_MISMATCH'});
 assert.throws(()=>validateSubmitted(op,null),{code:'TX_NOT_FOUND'});
});
