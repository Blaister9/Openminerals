import {readdirSync,readFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
const load=directory=>{const root=resolve(directory),files=readdirSync(root,{recursive:true}).filter(name=>name.endsWith('.hbc'));if(files.length!==1)throw new Error('Expected one Android Hermes bundle');return readFileSync(join(root,files[0]));};
const normal=load(process.argv[2]),preview=load(process.argv[3]),marker=Buffer.from('mm-sdk-relay');
if(normal.includes(marker)||!preview.includes(marker))throw new Error('MetaMask graph isolation failed');
console.log(JSON.stringify({demoOnly:true,defaultBytes:normal.length,previewBytes:preview.length,defaultHasMetaMaskRelay:false,previewHasMetaMaskRelay:true,apk:false}));
