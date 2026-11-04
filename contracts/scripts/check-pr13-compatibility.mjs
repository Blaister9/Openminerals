// Read-only comparison with the exact PR #13 source. No merge or public RPC.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {seedMine} from '../../api/src/shared-mine.js';
import {seedState} from '../../api/src/domain.js';
import {ensureCustody} from '../../api/src/custody.js';
import {backingTree} from '../../api/src/testnet/backing.js';
import {sourceKey,hash,artifact} from '../../api/src/testnet/common.js';
import {BrowserProvider,ContractFactory,id} from 'ethers';

process.env.HARDHAT_CONFIG=fileURLToPath(new URL('../hardhat.config.cjs',import.meta.url));
const {localChain}=await import('../test/local-chain.mjs');
const reference='61211eeaa044d15ebab63eea18c23bb1f8114836';
const root=fileURLToPath(new URL('../../',import.meta.url));
async function referenceModule(path){
  let source;
  try{source=execFileSync('git',['show',reference+':api/src/'+path],{cwd:root,encoding:'utf8',windowsHide:true});}
  catch{throw new Error('Falta la referencia fijada de PR #13. Ejecuta git fetch origin codex/demo-digital-units-20261102.');}
  source=source.replace(/from '(\.\/[^']+)'/g,(_,relative)=>'from '+JSON.stringify(new URL('../../api/src/'+relative.slice(2),import.meta.url).href));
  return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
const {syncDigitalUnits}=await referenceModule('digital-units.js');
const {demoBlockchainIntent}=await referenceModule('blockchain-port.js');
const at='2026-11-03T00:00:00.000Z';
const raw=seedMine('compatibility-pr13-pr15','Compatibilidad exclusivamente local DEMO');
raw.totalSupplyMg={XAU:1001,XAG:2507,XPT:3001,XPD:4001};
raw.inventoryMg={...raw.totalSupplyMg};
const empty=ensureCustody(raw,[],at).mine;
const manifest=backingTree(empty.custody.lots.map(lot=>({lotId:lot.id,sourceKey:sourceKey(empty,lot),tokenId:BigInt(sourceKey(empty,lot)).toString(),metal:lot.metal,purityBps:lot.purityBps,capGrossMg:lot.weightMg-lot.deliveredMg,documentsHash:hash(lot.documents)})));
const account={id:'buyer-compatibility',role:'buyer',alias:'compatibility',state:seedState()};
account.state.holdingsMg={XAU:800,XAG:800,XPT:800,XPD:800};
const allocated=structuredClone(raw);
for(const metal of Object.keys(raw.inventoryMg))allocated.inventoryMg[metal]-=800;
const custody=ensureCustody(allocated,[account],at).mine;
const ledger=syncDigitalUnits(custody,[account],{at}).mine.digitalUnits;
const chain=await localChain(),provider=new BrowserProvider(chain.provider,undefined,{cacheTimeout:-1});
provider.pollingInterval=10;
try{
  const issuer=await provider.getSigner(0),holder=await provider.getSigner(1);
  const deadline=Math.floor(Date.now()/1000)+900;
  const contract=await new ContractFactory(artifact.abi,artifact.bytecode,issuer).deploy(await issuer.getAddress(),deadline,manifest.root);
  await contract.waitForDeployment();
  await (await contract.setParticipant(id('compatibility-participant'),deadline,await holder.getAddress(),true)).wait();
  for(const lot of manifest.lots){
    const series=ledger.series.find(item=>item.lotId===lot.lotId);
    const event=ledger.events.find(item=>item.seriesId===series.id);
    const intent=demoBlockchainIntent(event,series);
    assert.equal(series.unit,'mg');assert.equal(series.massBasis,'gross-lot-mass');
    assert.equal(series.purityBps,lot.purityBps);assert.equal(series.eligibleMg,lot.capGrossMg);
    assert.equal(intent.quantityUnit,'mg');assert.equal(intent.massBasis,'gross-lot-mass');
    assert.equal(intent.quantity,'800');assert.equal(intent.network,'unconfigured-testnet');
    // Different ID/hash schemes require an explicit mapping, never equality.
    assert.notEqual(series.id,lot.tokenId);assert.notEqual(series.documentsHash,lot.documentsHash);
    await (await contract.registerLot(id('register-'+lot.lotId),deadline,lot.sourceKey,'0x'+Buffer.from(lot.metal).toString('hex')+'00',lot.purityBps,lot.capGrossMg,lot.documentsHash,lot.proof)).wait();
    await (await contract.issue(id('issue-'+lot.lotId),deadline,lot.tokenId,await holder.getAddress(),intent.quantity)).wait();
    assert.equal(await contract.balanceOf(await holder.getAddress(),lot.tokenId),800n);
    assert.equal(await contract['totalSupply(uint256)'](lot.tokenId),800n);
    const metadata=JSON.parse(Buffer.from((await contract.uri(lot.tokenId)).split(',')[1],'base64').toString());
    assert.equal(metadata.unit,series.unit);assert.equal(metadata.massBasis,series.massBasis);assert.equal(metadata.purityBps,series.purityBps);
  }
  console.log(JSON.stringify({reference,execution:'local-simulated',metals:manifest.lots.length,unit:'mg',massBasis:'gross-lot-mass',issuedPerMetal:'800',result:'PASS',automaticLedgerBridge:false,publicTransactions:0}));
}finally{provider.destroy();await chain.close();}
