import {randomBytes,createHash} from 'node:crypto';
import {getAddress,Interface,keccak256,toUtf8Bytes} from 'ethers';
import {readFileSync} from 'node:fs';
import {accountError} from '../account-auth.js';
export const CHAIN_ID=84532,CHAIN_HEX='0x14a34',EXPLORER='https://sepolia.basescan.org';
export const artifact=JSON.parse(readFileSync(new URL('./contract-artifact.json',import.meta.url),'utf8'));
export const abi=new Interface(artifact.abi),ZERO='0x0000000000000000000000000000000000000000';
export const fail=(condition,message='Operación de testnet DEMO inválida.',status=400,code='INVALID_TESTNET')=>{if(!condition)throw accountError(status,message,code);};
export const copy=value=>structuredClone(value);
export function address(value){try{return getAddress(value).toLowerCase();}catch{throw accountError(400,'Dirección EVM inválida.','INVALID_ADDRESS');}}
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
export const hash=value=>keccak256(toUtf8Bytes(JSON.stringify(canonical(value))));
export const sha=value=>createHash('sha256').update(value).digest('hex');
export const operationKey=id=>hash(['openminerals-demo',id]);
export const uuid=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/.test(value);
export const txHash=value=>typeof value==='string'&&/^0x[a-fA-F0-9]{64}$/.test(value);
export function units(value){fail(typeof value==='string'&&/^[1-9]\d{0,9}$/.test(value)&&BigInt(value)<=1000000000n,'Unidades DEMO: miligramos brutos enteros positivos.');return value;}
export const nonce=()=>randomBytes(24).toString('hex');
export const hex=n=>'0x'+BigInt(n).toString(16);
export const sourceKey=(mine,lot)=>hash([mine.id,lot.id,lot.metal,lot.purityBps,'gross-lot-mass','mg']);
export function rpcPort({url='https://sepolia.base.org',provider}={}){
  if(provider)return {async request(input){try{return await provider.request(input);}catch(error){if(error.status)throw error;throw accountError(503,'RPC Base Sepolia no disponible.','RPC_UNAVAILABLE');}}};
  const parsed=new URL(url);fail(parsed.protocol==='https:'&&!parsed.username&&!parsed.password,'RPC de testnet debe usar HTTPS.');
  return {async request({method,params=[]}){
    let response;try{response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(10000)});}catch{throw accountError(503,'RPC Base Sepolia no disponible.','RPC_UNAVAILABLE');}
    if(!response.ok)throw accountError(503,'RPC Base Sepolia no disponible.','RPC_UNAVAILABLE');
    const data=await response.json();if(data.error)throw accountError(503,'RPC Base Sepolia rechazó la consulta.','RPC_UNAVAILABLE');return data.result;
  }};
}
export async function network(rpc){fail(BigInt(await rpc.request({method:'eth_chainId'}))===84532n,'Solo se permite Base Sepolia.',409,'TESTNET_ONLY');}
export async function call(rpc,contract,name,args=[],block='latest'){
  return abi.decodeFunctionResult(name,await rpc.request({method:'eth_call',params:[{to:contract,data:abi.encodeFunctionData(name,args)},block]}));
}
export async function assertContract(rpc,contract,block='latest'){
  const code=await rpc.request({method:'eth_getCode',params:[contract,block]});
  fail(code.toLowerCase()===artifact.deployedBytecode.toLowerCase(),'El contrato no coincide con el artefacto DEMO fijado.',409,'CONTRACT_MISMATCH');
}
