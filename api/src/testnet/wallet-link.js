import {randomUUID} from 'node:crypto';
import {verifyMessage,getAddress} from 'ethers';
import {address,fail,nonce,sha,uuid} from './common.js';
export function walletLinkServices({adapter,context,now,origin}){
  return {
    async testnetChallenge(accountId,sessionHash,input){
      const wallet=address(input.address);
      return adapter.tx(async tx=>{
        await context(tx,accountId,sessionHash);const id=randomUUID(),issuedAt=new Date(now()).toISOString(),expiresAt=new Date(now()+5*60000).toISOString(),salt=nonce();
        const message=`${new URL(origin).host} wants you to sign in with your Ethereum account:\n${getAddress(wallet)}\n\nLink this address to Openminerals DEMO account ${accountId}. Testnet only; no physical metal or legal ownership.\n\nURI: ${origin}/api/demo/testnet/wallet/verify\nVersion: 1\nChain ID: 84532\nNonce: ${salt}\nIssued At: ${issuedAt}\nExpiration Time: ${expiresAt}\nRequest ID: ${id}`;
        const pending=(await tx.chainScan('challenge:')).filter(item=>item.accountId===accountId&&!item.used&&Date.parse(item.expiresAt)>now());
        fail(pending.length<5,'Resuelve o espera a que venzan los retos anteriores.',429);
        await tx.chainPut('challenge:'+id,{id,accountId,sessionHash,address:wallet,message,expiresAt,attempts:0,used:false});
        return {demoOnly:true,challengeId:id,message,expiresAt,chainId:84532};
      });
    },
    async testnetVerifyWallet(accountId,sessionHash,input){
      fail(uuid(input.challengeId)&&typeof input.signature==='string'&&input.signature.length<=200);
      const result=await adapter.tx(async tx=>{
        await context(tx,accountId,sessionHash);const challenge=await tx.chainGet('challenge:'+input.challengeId);
        if(!challenge||challenge.accountId!==accountId||challenge.sessionHash!==sessionHash||challenge.used||challenge.attempts>=5||Date.parse(challenge.expiresAt)<=now())return {error:'Reto no disponible o vencido.'};
        challenge.attempts++;await tx.chainPut('challenge:'+challenge.id,challenge);let recovered;try{recovered=address(verifyMessage(challenge.message,input.signature));}catch{}
        if(recovered!==challenge.address){await tx.chainPut('challenge:'+challenge.id,challenge);return {error:'La firma no corresponde a la dirección del reto.'};}
        const current=await tx.chainGet('wallet:'+accountId),owner=await tx.chainGet('address:'+recovered);
        if(owner&&owner.accountId!==accountId)return {error:'La dirección ya está vinculada a otra cuenta DEMO.'};
        if(current&&current.address!==recovered)return {error:'La cuenta ya tiene otra dirección vinculada; no se reemplaza su titular.'};
        challenge.used=true;await tx.chainPut('challenge:'+challenge.id,challenge);
        const link={accountId,address:recovered,chainId:84532,verifiedAt:new Date(now()).toISOString(),proofHash:sha(challenge.message),demoOnly:true};
        await tx.chainPut('wallet:'+accountId,link);await tx.chainPut('address:'+recovered,{accountId});return {wallet:link};
      });
      fail(!result.error,result.error,409,'WALLET_PROOF_REJECTED');return {demoOnly:true,...result};
    },
  };
}
