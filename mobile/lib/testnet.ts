export const TESTNET_CHAIN='0x14a34',TESTNET_CHAIN_ID=84532;
export type WalletProvider={request:(args:{method:string;params?:unknown[]})=>Promise<unknown>;on?:(event:string,listener:(value:unknown)=>void)=>unknown;removeListener?:(event:string,listener:(value:unknown)=>void)=>unknown};
export type ChainOperation={id:string;kind:'deploy'|'participant'|'register'|'issue'|'transfer'|'cancel';status:string;hash:string|null;deadline:number;unsigned:{from:string;to?:string;data:string;chainId:string;value:string;nonce?:string};explorer:string|null;units:string|null};
export type TestnetState={demoOnly:true;execution:'local-simulated'|'base-sepolia';chainId:84532;wallet:{address:string;verifiedAt:string}|null;contract:string|null;contractExplorer:string|null;
 backing:{massBasis:'gross-lot-mass';unit:'mg';lots:{lotId:string;tokenId:string;metal:string;purityBps:number;capGrossMg:number}[]}|null;
 participants:{accountId:string;alias:string;address:string;enabled:boolean}[];balances:{tokenId:string;units:string;unit:'mg';massBasis:'gross-lot-mass'}[];operations:ChainOperation[];
 events:{transactionHash:string;from:string;to:string;units:string;tokenId:string;explorer:string|null}[];reconciliation:{status:string;indexedBlock:number|null;confirmations:number;problems:string[]};disclaimer:string};
export function parseTestnetState(value:unknown):TestnetState{
 const result=value as TestnetState;
 if(!result||result.demoOnly!==true||result.chainId!==84532||!['local-simulated','base-sepolia'].includes(result.execution)||!Array.isArray(result.balances)||!Array.isArray(result.operations)||!Array.isArray(result.events)||!Array.isArray(result.participants)||!result.reconciliation)throw new Error('Respuesta de testnet DEMO inválida.');return result;
}
export function addressEqual(a:string,b:string){return /^0x[a-fA-F0-9]{40}$/.test(a)&&/^0x[a-fA-F0-9]{40}$/.test(b)&&a.toLowerCase()===b.toLowerCase();}
export async function requireSepolia(provider:WalletProvider){const id=await provider.request({method:'eth_chainId'});if(id!==TESTNET_CHAIN)throw new Error('Solo se permite Base Sepolia. No se firmó ninguna transacción.');}
export function validateLinkChallenge(value:{demoOnly:boolean;chainId:number;message:string;expiresAt:string;challengeId:string},api:string,wallet:string,accountId:string){
 const origin=new URL(api).origin,lines=value.message.split('\n');
 if(value.demoOnly!==true||value.chainId!==84532||Date.parse(value.expiresAt)<=Date.now()||!value.message.startsWith(new URL(origin).host+' wants you to sign in with your Ethereum account:\n')||!addressEqual(lines[1]??'',wallet)||!value.message.includes('Link this address to Openminerals DEMO account '+accountId+'.')||!lines.includes('URI: '+origin+'/api/demo/testnet/wallet/verify')||!lines.includes('Chain ID: 84532')||!lines.includes('Expiration Time: '+value.expiresAt)||!lines.includes('Request ID: '+value.challengeId)||!lines.some(line=>/^Nonce: [a-f0-9]{48}$/.test(line)))throw new Error('El reto no corresponde a esta cuenta, dominio o red DEMO.');
}
export function validateWalletTransaction(op:ChainOperation,connected:string){
 const tx=op.unsigned;
 if(op.status!=='AWAITING_SIGNATURE'||tx.chainId!==TESTNET_CHAIN||tx.value!=='0x0'||!addressEqual(tx.from,connected)||!/^0x[0-9a-fA-F]+$/.test(tx.data)||op.deadline<=Date.now()/1000||!['deploy','participant','register','issue','transfer','cancel'].includes(op.kind)||(op.kind==='deploy'?tx.to!==undefined:!tx.to||!/^0x[0-9a-fA-F]{40}$/.test(tx.to)))throw new Error('El intento no corresponde a la billetera o red de prueba.');
}
export function safeExplorer(value:string|null){if(!value)return null;try{const url=new URL(value);return url.origin==='https://sepolia.basescan.org'&&/^\/(tx\/0x[a-fA-F0-9]{64}|address\/0x[a-fA-F0-9]{40})$/.test(url.pathname)&&!url.username&&!url.password&&!url.search&&!url.hash?url.href:null;}catch{return null;}}
export function grossUnits(grams:string){const value=grams.trim().replace(',','.');if(!/^(0|[1-9]\d{0,6})(\.\d{1,3})?$/.test(value))throw new Error('Gramos brutos DEMO: hasta tres decimales.');const [whole,fraction='']=value.split('.'),mg=BigInt(whole)*1000n+BigInt(fraction.padEnd(3,'0'));if(mg<=0n||mg>1000000000n)throw new Error('Cantidad DEMO fuera de límites.');return mg.toString();}
