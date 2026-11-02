// Bake the fictitious runtime scene into the low-cost native Image fallback.
// No photographs, downloaded textures, locations or account data are used.
import {mkdtemp,readFile,copyFile,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=fileURLToPath(new URL('..',import.meta.url));
if(!process.env.OPENMINERALS_WEBGL_BROWSER)throw Error('Set OPENMINERALS_WEBGL_BROWSER to Chrome or Edge for the software GL bake.');
const folder=await mkdtemp(path.join(tmpdir(),'openminerals-geology-bake-'));
try{
 const env={...process.env,OPENMINERALS_GEOLOGY_RASTER_DIR:folder};delete env.OPENMINERALS_GEOLOGY_SHEET;
 const result=spawnSync(process.execPath,['--experimental-strip-types','--test','test/geological-render.test.mjs'],{cwd:root,env,stdio:'inherit',windowsHide:true,timeout:90000});
 if(result.error||result.status!==0)throw Error('Software GL check failed; the existing fallback was preserved.');
 const bytes=await readFile(path.join(folder,'pose-0.png'));
 if(bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)!==360||bytes.readUInt32BE(20)!==640)throw Error('Unexpected baked PNG.');
 const sources={};for(const name of ['scene-renderer','geological-scene','gold-bar-3d','immersive-story','geological-specimen','metal-materials']){const source=await readFile(path.join(root,'lib',name+'.ts'),'utf8');sources['lib/'+name+'.ts']=createHash('sha256').update(source.replaceAll('\r\n','\n')).digest('hex');}
 const evidence={demoOnly:true,kind:'precomputed-fictitious-mine-light-fallback',width:360,height:640,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),renderer:'same application renderer; desktop Chrome/SwiftShader',pose:{progress:0,drag:0,metal:'XAU'},sourceHashesLF:sources,limitations:'Static lighting/perspective for the lightweight mode; not a photograph or an Android performance measurement.'};
 await copyFile(path.join(folder,'pose-0.png'),path.join(root,'assets','geology-light.png'));
 await writeFile(path.join(root,'assets','geology-light.json'),JSON.stringify(evidence,null,2)+'\n');
 console.log('Baked DEMO fallback: '+bytes.length+' bytes; SHA-256 '+evidence.sha256);
}finally{const resolved=path.resolve(folder);if(path.dirname(resolved)!==path.resolve(tmpdir())||!path.basename(resolved).startsWith('openminerals-geology-bake-'))throw Error('Unsafe temporary bake path.');await rm(resolved,{recursive:true,force:true,maxRetries:5,retryDelay:200});}
