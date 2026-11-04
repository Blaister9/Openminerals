import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {localChain} from './local-chain.mjs';
import {BrowserProvider,ContractFactory,keccak256,toUtf8Bytes,AbiCoder} from 'ethers';
const artifact=JSON.parse(readFileSync(new URL('../../api/src/testnet/contract-artifact.json',import.meta.url),'utf8'));
test('ERC-1155 DEMO: emisión, transferencia, cancelación, respaldo, permisos, replay y vencimiento',async t=>{
  const chain=await localChain(),provider=new BrowserProvider(chain.provider,undefined,{cacheTimeout:-1});provider.pollingInterval=20;
  const admin=await provider.getSigner(0),a=await provider.getSigner(1),b=await provider.getSigner(2),outsider=await provider.getSigner(3);
  const deadline=()=>Math.floor(Date.now()/1000)+900,op=label=>keccak256(toUtf8Bytes(label)),source=op('isolated-demo-mine:lot-1'),id=BigInt(source);
  const root=keccak256(keccak256(AbiCoder.defaultAbiCoder().encode(['bytes32','bytes4','uint16','uint128','bytes32'],[source,'0x58415500',9999,1000,op('documents')])));
  let contract;
  try{
    await t.test('solo Base Sepolia; despliegue y metadatos DEMO brutos',async()=>{
      contract=await new ContractFactory(artifact.abi,artifact.bytecode,admin).deploy(await admin.getAddress(),deadline(),root);await contract.waitForDeployment();
      assert.equal(await contract.TEST_CHAIN_ID(),84532n);assert.equal(await contract.demoOnly(),true);
      await assert.rejects(contract.registerLot(op('forged-cap'),deadline(),source,'0x58415500',9999,2000,op('documents'),[]));
      await (await contract.registerLot(op('register'),deadline(),source,'0x58415500',9999,1000,op('documents'),[])).wait();
      const metadata=JSON.parse(Buffer.from((await contract.uri(id)).split(',')[1],'base64').toString());assert.equal(metadata.demoOnly,true);assert.equal(metadata.massBasis,'gross-lot-mass');assert.equal(metadata.purityBps,9999);
      const other=await localChain(8453);try{const wrong=new BrowserProvider(other.provider);await assert.rejects(new ContractFactory(artifact.abi,artifact.bytecode,await wrong.getSigner()).deploy(await admin.getAddress(),deadline(),root));wrong.destroy();}finally{await other.close();}
    });
    await t.test('registro inmutable, roles y destinatarios restringidos',async()=>{
      await assert.rejects(contract.connect(outsider).registerLot(op('unauthorized'),deadline(),op('new-lot'),'0x58415500',9999,1000,op('d'),[]));
      await assert.rejects(contract.registerLot(op('duplicate'),deadline(),source,'0x58415500',9999,1000,op('documents'),[]));
      await assert.rejects(contract.issue(op('not-enrolled'),deadline(),id,await a.getAddress(),100));
      for(const [i,signer] of [a,b].entries())await (await contract.setParticipant(op('participant-'+i),deadline(),await signer.getAddress(),true)).wait();
    });
    await t.test('emisión sin sobrepasar capacidad; no hay descuento de pureza ni replay',async()=>{
      await (await contract.issue(op('issue'),deadline(),id,await a.getAddress(),800)).wait();assert.equal(await contract['totalSupply(uint256)'](id),800n);
      await assert.rejects(contract.issue(op('issue'),deadline(),id,await a.getAddress(),800));
      await assert.rejects(contract.issue(op('over-cap'),deadline(),id,await a.getAddress(),201));
      await assert.rejects(contract.connect(a).issue(op('not-issuer'),deadline(),id,await a.getAddress(),1));
      assert.equal(await contract.balanceOf(await a.getAddress(),id),800n);
    });
    await t.test('transferencia entre titulares y transferencia ERC-1155 estándar sin crear suministro',async()=>{
      await (await contract.connect(a).transferDemo(op('transfer'),deadline(),id,await b.getAddress(),300)).wait();assert.equal(await contract.balanceOf(await b.getAddress(),id),300n);assert.equal(await contract['totalSupply(uint256)'](id),800n);
      await assert.rejects(contract.connect(a).safeTransferFrom(await a.getAddress(),await outsider.getAddress(),id,1,'0x'));
      await assert.rejects(contract.connect(outsider).safeTransferFrom(await a.getAddress(),await b.getAddress(),id,1,'0x'));
      await assert.rejects(contract.connect(a).setApprovalForAll(await outsider.getAddress(),true));
      await (await contract.connect(b).safeBatchTransferFrom(await b.getAddress(),await a.getAddress(),[id],[50],'0x')).wait();
      assert.equal(await contract.balanceOf(await b.getAddress(),id),250n);
    });
    await t.test('cancelación propia, reemisión acotada y vencimiento efectivo en contrato',async()=>{
      await (await contract.connect(b).cancelDemo(op('cancel'),deadline(),id,100)).wait();assert.equal(await contract['totalSupply(uint256)'](id),700n);
      await assert.rejects(contract.connect(b).cancelDemo(op('too-many'),deadline(),id,151));
      await (await contract.issue(op('reissue'),deadline(),id,await b.getAddress(),300)).wait();assert.equal(await contract['totalSupply(uint256)'](id),1000n);
      await assert.rejects(contract.issue(op('late'),1,id,await a.getAddress(),1));
      await assert.rejects(admin.sendTransaction({to:await contract.getAddress(),value:1}));
      assert.equal(await provider.getBalance(await contract.getAddress()),0n);
    });
  }finally{provider.destroy();await chain.close();}
});
