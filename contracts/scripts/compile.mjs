import solc from 'solc';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const normalize=value=>value.replace(/\r\n/g,'\n');
const root=new URL('../',import.meta.url),source=normalize(readFileSync(new URL('src/OpenmineralsDemo1155.sol',root),'utf8'));
const input={language:'Solidity',sources:{'OpenmineralsDemo1155.sol':{content:source}},settings:{optimizer:{enabled:true,runs:200},evmVersion:'cancun',outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object']}}}};
const output=JSON.parse(solc.compile(JSON.stringify(input),{import:path=>{try{return {contents:normalize(readFileSync(new URL('node_modules/'+path,root),'utf8'))};}catch{return {error:'Import not found: '+path};}}}));
for(const error of output.errors??[])if(error.severity==='error')throw new Error(error.formattedMessage);
const contract=output.contracts['OpenmineralsDemo1155.sol'].OpenmineralsDemo1155;
const artifact={contractName:'OpenmineralsDemo1155',compiler:solc.version(),evmVersion:'cancun',sourceSha256:createHash('sha256').update(source).digest('hex'),abi:contract.abi,bytecode:'0x'+contract.evm.bytecode.object,deployedBytecode:'0x'+contract.evm.deployedBytecode.object};
const target=new URL('../../api/src/testnet/contract-artifact.json',import.meta.url);mkdirSync(fileURLToPath(new URL('.',target)),{recursive:true});
if(process.argv.includes('--check')){if(JSON.stringify(JSON.parse(readFileSync(target,'utf8')))!==JSON.stringify(artifact))throw new Error('Contract artifact differs from pinned source/compiler');}
else writeFileSync(target,JSON.stringify(artifact)+'\n');
console.log('DEMO contract compiled: '+(artifact.bytecode.length-2)/2+' bytes; chain 84532 only');
