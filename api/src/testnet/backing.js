import {AbiCoder,concat,keccak256} from 'ethers';
// Immutable manifest of gross-mass capacities; the on-chain Merkle root prevents
// even an issuer from registering a different quantity/purity for this pool.
export function backingTree(lots){
  const leaf=lot=>keccak256(keccak256(AbiCoder.defaultAbiCoder().encode(['bytes32','bytes4','uint16','uint128','bytes32'],[lot.sourceKey,'0x'+Buffer.from(lot.metal).toString('hex')+'00',lot.purityBps,lot.capGrossMg,lot.documentsHash])));
  const nodes=lots.map(lot=>({hash:leaf(lot),members:[lot]})).sort((a,b)=>a.hash<b.hash?-1:1),proofs=new Map(lots.map(lot=>[lot.sourceKey,[]]));
  let level=nodes;
  while(level.length>1){const next=[];for(let i=0;i<level.length;i+=2){const a=level[i],b=level[i+1];if(!b){next.push(a);continue;}for(const lot of a.members)proofs.get(lot.sourceKey).push(b.hash);for(const lot of b.members)proofs.get(lot.sourceKey).push(a.hash);next.push({hash:keccak256(concat([a.hash,b.hash].sort())),members:[...a.members,...b.members]});}level=next;}
  return {root:level[0].hash,lots:lots.map(lot=>({...lot,proof:proofs.get(lot.sourceKey)}))};
}
