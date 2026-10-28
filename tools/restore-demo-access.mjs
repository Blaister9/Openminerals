// Restore the encrypted operator backup without putting plaintext in Git.
import {createDecipheriv} from 'node:crypto';
import {readFile,writeFile,realpath,stat} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {homedir} from 'node:os';
import {fileURLToPath} from 'node:url';

const AAD=Buffer.from('openminerals.demo-access-backup.v1');
const decode=(value,length)=>{
  if(typeof value!=='string'||!value.length||value.length>32768||Buffer.from(value,'base64').toString('base64')!==value)throw new Error('Formato de respaldo inválido');
  const bytes=Buffer.from(value,'base64');
  if(length!==undefined&&bytes.length!==length)throw new Error('Formato de respaldo inválido');
  return bytes;
};
export function decryptAccess(backup,keyBase64){
  if(backup?.format!=='openminerals.demo-access-backup'||backup.version!==1||backup.algorithm!=='aes-256-gcm')throw new Error('Formato de respaldo inválido');
  const encrypted=decode(backup.ciphertextBase64);
  if(encrypted.length>16384)throw new Error('Respaldo demasiado grande');
  const decipher=createDecipheriv('aes-256-gcm',decode(keyBase64,32),decode(backup.ivBase64,12));
  decipher.setAAD(AAD);decipher.setAuthTag(decode(backup.tagBase64,16));
  const clear=Buffer.concat([decipher.update(encrypted),decipher.final()]);
  const credentials=JSON.parse(clear.toString('utf8'));
  if(credentials.role!=='operator'||credentials.demoOnly!==true||typeof credentials.alias!=='string'||typeof credentials.password!=='string')throw new Error('Contenido de acceso inválido');
  return clear;
}
export async function assertOutsideGit(file){
  let current=await realpath(dirname(resolve(file)));
  while(true){
    try{await stat(join(current,'.git'));throw new Error('El archivo privado debe quedar fuera de cualquier repositorio Git');}
    catch(error){if(error.code!=='ENOENT')throw error;}
    const parent=dirname(current);if(parent===current)return;current=parent;
  }
}
async function main(){
  const args=process.argv.slice(2);
  const options={};
  for(let i=0;i<args.length;i+=2){
    if(!['--key-file','--out','--backup'].includes(args[i])||!args[i+1])throw new Error('Argumentos inválidos');
    options[args[i]]=args[i+1];
  }
  if(!options['--key-file'])throw new Error('Falta el archivo privado de acceso');
  const backupPath=options['--backup']||fileURLToPath(new URL('../secure-backups/operator-demo.enc.json',import.meta.url));
  const keyPath=await realpath(resolve(options['--key-file']));
  const output=resolve(options['--out']||join(homedir(),'Downloads','openminerals-demo-access-restored.json'));
  await assertOutsideGit(keyPath);await assertOutsideGit(output);
  const keyFile=JSON.parse(await readFile(keyPath,'utf8'));
  const backup=JSON.parse(await readFile(backupPath,'utf8'));
  const clear=decryptAccess(backup,keyFile.backupKeyBase64);
  await writeFile(output,clear,{flag:'wx',mode:0o600});
  console.log('Acceso restaurado en archivo privado: '+output);
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  main().catch(()=>{
    console.error('No se pudo restaurar. Comprueba la clave privada, la integridad del respaldo y un destino nuevo fuera de Git. No se imprimieron credenciales ni se sobrescribió un archivo.');
    process.exitCode=1;
  });
}
