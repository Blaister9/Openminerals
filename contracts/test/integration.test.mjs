import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {BrowserProvider,Contract} from 'ethers';
import {localChain} from './local-chain.mjs';
import {createStore} from '../../api/src/store.js';
import {tokenHash} from '../../api/src/account-auth.js';
import {artifact} from '../../api/src/testnet/common.js';
if(process.env.REQUIRE_TESTNET_POSTGRES==='true'&&!process.env.TEST_DATABASE_URL)throw new Error('TEST_DATABASE_URL es obligatorio para la integración de testnet.');

for(const mode of ['memory','postgres'])test('tokenización DEMO '+mode+': prueba local completa, sin transacciones de testnet públicas',{
  skip:mode==='postgres'&&!process.env.TEST_DATABASE_URL?'Falta TEST_DATABASE_URL; integración blockchain PostgreSQL no probada':false,timeout:120000,
},async t=>{
  const chain=await localChain(),provider=new BrowserProvider(chain.provider,undefined,{cacheTimeout:-1});provider.pollingInterval=10;
  const signers=await Promise.all([0,1,2].map(index=>provider.getSigner(index))),password='Testnet-local-only-password-123';
  let store,other,pool,schema,dbUrl='';
  if(mode==='postgres'){
    const {Pool}=createRequire(new URL('../../api/package.json',import.meta.url))('pg');pool=new Pool({connectionString:process.env.TEST_DATABASE_URL});schema='om_chain_'+randomUUID().replaceAll('-','');await pool.query(`CREATE SCHEMA "${schema}"`);
    const url=new URL(process.env.TEST_DATABASE_URL);url.searchParams.set('options','-c search_path='+schema);dbUrl=url.toString();
  }
  let rpcOffline=false,wrongChain=false;
  const rpc={async request(input){if(rpcOffline)throw new Error('offline');if(wrongChain&&input.method==='eth_chainId')return '0x1';return chain.provider.request(input);}};
  const options={testnetEnabled:true,testnetOrigin:'https://testnet.example.invalid',testnetRpc:rpc,testnetConfirmations:2,localSimulation:true};
  const hashes=[],users=[],sessions=[];let mine,lot,before,contractAddress;
  async function link(user,session,signer){const challenge=await store.testnetChallenge(user.id,tokenHash(session.token),{address:await signer.getAddress()});const signature=await signer.signMessage(challenge.message);return store.testnetVerifyWallet(user.id,tokenHash(session.token),{challengeId:challenge.challengeId,signature});}
  async function confirmed(index,body){
    const prepared=await store.prepareTestnetOperation(users[index].id,tokenHash(sessions[index].token),body,randomUUID()),op=prepared.operation;
    const request={...op.unsigned,...(op.unsigned.nonce?{nonce:Number(BigInt(op.unsigned.nonce))}:{})};
    const transaction=await signers[index].sendTransaction(request);await transaction.wait();hashes.push(transaction.hash);
    await store.submitTestnetOperation(users[index].id,tokenHash(sessions[index].token),op.id,{hash:transaction.hash});await chain.provider.request({method:'evm_mine'});
    const result=await store.testnetReconcile(users[index].id,tokenHash(sessions[index].token));assert.equal(result.status,'READY');
    const view=await store.getTestnetState(users[index].id,tokenHash(sessions[index].token));assert.equal(view.operations.find(item=>item.id===op.id).status,'CONFIRMED');return {op,view};
  }
  try{
    store=await createStore(dbUrl,options);other=mode==='postgres'?await createStore(dbUrl,options):store;
    mine=await store.createMine({name:'Pool blockchain exclusivamente DEMO',initialInventoryMg:{XAU:1000,XAG:500,XPT:400,XPD:300}});
    for(const [index,role] of ['operator','buyer','buyer'].entries()){
      const user=await store.createAccount({alias:`chain_${mode}_${index}`,password,mineId:mine.id,role});users.push(user);sessions.push(await store.loginAccount(user.alias,password));await link(user,sessions[index],signers[index]);
    }
    before=await store.getAccountState(users[1].id);
    await t.test('reserva un pool vacío de posiciones; impide doble uso comercial y mantiene billeteras',async()=>{
      await store.freezeTestnetPool(users[0].id,tokenHash(sessions[0].token),{acknowledgement:'DEMO_ONLY_ISOLATED_MINE'});
      await assert.rejects(store.mutateAccount(users[1].id,{action:'buy',metal:'XAU',grams:'0.100',requestId:randomUUID()}),{code:'TESTNET_POOL_LOCKED'});
      await assert.rejects(store.mutateStock(users[0].id,{metal:'XAU',grams:'1.000',reason:'No debe modificar respaldo',requestId:randomUUID()}),{code:'TESTNET_POOL_LOCKED'});
      assert.deepEqual(await store.getAccountState(users[1].id),before);
      const state=await store.getTestnetState(users[0].id,tokenHash(sessions[0].token));lot=state.backing.lots[0];assert.equal(lot.massBasis,undefined);assert.equal(state.backing.massBasis,'gross-lot-mass');
    });
    await t.test('despliegue requiere confirmaciones y verifica bytecode exacto',async()=>{
      const id=randomUUID(),request={kind:'deploy'},op=(await store.prepareTestnetOperation(users[0].id,tokenHash(sessions[0].token),request,id)).operation;
      assert.equal((await store.prepareTestnetOperation(users[0].id,tokenHash(sessions[0].token),request,id)).operation.id,op.id);
      const tx=await signers[0].sendTransaction({...op.unsigned,nonce:Number(BigInt(op.unsigned.nonce))});await tx.wait();hashes.push(tx.hash);await store.submitTestnetOperation(users[0].id,tokenHash(sessions[0].token),op.id,{hash:tx.hash});
      assert.equal((await store.testnetReconcile(users[0].id,tokenHash(sessions[0].token))).status,'CONFIRMING');await chain.provider.request({method:'evm_mine'});
      assert.equal((await store.testnetReconcile(users[0].id,tokenHash(sessions[0].token))).status,'READY');contractAddress=(await store.getTestnetState(users[0].id,tokenHash(sessions[0].token))).contract;
    });
    await t.test('habilita titulares, registra lote y emite 800 mg brutos sin descontar pureza',async()=>{
      for(const index of [1,2])await confirmed(0,{kind:'participant',toAccountId:users[index].id});
      await confirmed(0,{kind:'register',lotId:lot.lotId});await confirmed(0,{kind:'issue',lotId:lot.lotId,toAccountId:users[1].id,units:'800'});
      const state=await store.getTestnetState(users[1].id,tokenHash(sessions[1].token));assert.equal(state.balances[0].units,'800');assert.equal(state.balances[0].massBasis,'gross-lot-mass');assert.equal(state.operations[0].explorer,null);
      await assert.rejects(store.prepareTestnetOperation(users[0].id,tokenHash(sessions[0].token),{kind:'issue',lotId:lot.lotId,toAccountId:users[1].id,units:'201'},randomUUID()),{code:'BACKING_EXCEEDED'});
    });
    await t.test('reserva intenciones simultáneas; transferencia y cancelación concilian cantidades',async()=>{
      const [first,second]=await Promise.allSettled([store,other].map(s=>s.prepareTestnetOperation(users[1].id,tokenHash(sessions[1].token),{kind:'transfer',lotId:lot.lotId,toAccountId:users[2].id,units:'500'},randomUUID())));
      assert.equal([first,second].filter(item=>item.status==='fulfilled').length,1);assert.equal([first,second].find(item=>item.status==='rejected').reason.code,'UNITS_RESERVED');
      const op=[first,second].find(item=>item.status==='fulfilled').value.operation,tx=await signers[1].sendTransaction(op.unsigned);await tx.wait();hashes.push(tx.hash);await store.submitTestnetOperation(users[1].id,tokenHash(sessions[1].token),op.id,{hash:tx.hash});await chain.provider.request({method:'evm_mine'});await store.testnetReconcile(users[1].id,tokenHash(sessions[1].token));
      const result=await confirmed(2,{kind:'cancel',lotId:lot.lotId,units:'100'});assert.equal(result.view.balances.find(item=>item.tokenId===lot.tokenId).units,'400');
      assert.deepEqual(await store.getAccountState(users[1].id),before);
      const replay=await store.submitTestnetOperation(users[1].id,tokenHash(sessions[1].token),op.id,{hash:tx.hash});assert.equal(replay.replayed,true);
    });
    await t.test('transferencias ERC-1155 externas al frontend también se indexan',async()=>{
      const contract=new Contract(contractAddress,artifact.abi,signers[2]);const tx=await contract.safeTransferFrom(await signers[2].getAddress(),await signers[1].getAddress(),lot.tokenId,50,'0x');await tx.wait();hashes.push(tx.hash);await chain.provider.request({method:'evm_mine'});await store.testnetReconcile(users[1].id,tokenHash(sessions[1].token));
      const state=await store.getTestnetState(users[1].id,tokenHash(sessions[1].token));assert.equal(state.balances[0].units,'350');assert.ok(state.events.some(item=>item.transactionHash===tx.hash));
      if(mode==='postgres'){await store.close();store=await createStore(dbUrl,options);assert.deepEqual(await store.getTestnetState(users[1].id,tokenHash(sessions[1].token)),state);}
    });
    await t.test('reorganización revierte posiciones derivadas y conserva intención; RPC erróneo no fabrica saldos',async()=>{
      const snapshot=await chain.provider.request({method:'evm_snapshot'}),initial=await store.getTestnetState(users[1].id,tokenHash(sessions[1].token));
      const moved=await confirmed(1,{kind:'transfer',lotId:lot.lotId,toAccountId:users[2].id,units:'100'});
      await chain.provider.request({method:'evm_revert',params:[snapshot]});await chain.provider.request({method:'evm_increaseTime',params:[4]});await chain.provider.request({method:'evm_mine'});await chain.provider.request({method:'evm_mine'});
      await store.testnetReconcile(users[1].id,tokenHash(sessions[1].token));const restored=await store.getTestnetState(users[1].id,tokenHash(sessions[1].token));assert.deepEqual(restored.balances,initial.balances);assert.equal(restored.operations.find(op=>op.id===moved.op.id).status,'REORGED');
      rpcOffline=true;await assert.rejects(store.testnetReconcile(users[1].id,tokenHash(sessions[1].token)),{code:'RPC_UNAVAILABLE'});assert.deepEqual(await store.getTestnetState(users[1].id,tokenHash(sessions[1].token)),restored);rpcOffline=false;
      wrongChain=true;await assert.rejects(store.testnetReconcile(users[1].id,tokenHash(sessions[1].token)),{code:'TESTNET_ONLY'});wrongChain=false;
    });
    await t.test('dos billeteras bastan: el emisor recibe primero y transfiere al segundo titular',async()=>{
      await confirmed(0,{kind:'issue',lotId:lot.lotId,toAccountId:users[0].id,units:'100'});
      await confirmed(0,{kind:'transfer',lotId:lot.lotId,toAccountId:users[1].id,units:'100'});
      const result=await confirmed(1,{kind:'cancel',lotId:lot.lotId,units:'100'});assert.equal(result.view.balances[0].units,'350');
      assert.deepEqual(await store.getAccountState(users[1].id),before);
    });
    assert.ok(hashes.length>=7);assert.ok(hashes.every(value=>/^0x[a-f0-9]{64}$/.test(value)));
  }finally{
    await store?.close();if(other&&other!==store)await other.close();provider.destroy();await chain.close();
    if(pool){try{await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);}finally{await pool.end();}}
  }
});
