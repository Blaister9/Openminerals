/**
 * Acceptance test across a Railway service restart, using a NEW synthetic session.
 * node scripts/persistence.mjs prepare https://api.example /outside/repo/snapshot.json
 * Restart the API service, then:
 * node scripts/persistence.mjs verify https://api.example /outside/repo/snapshot.json
 * The snapshot contains no admin token, credentials, or personal information.
 */
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFile,writeFile,stat} from 'node:fs/promises';
import {resolve,dirname,parse} from 'node:path';

const [phase,rawBase,snapshotPath]=process.argv.slice(2);
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'
  ?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical(value[key])])):value;
const hash=value=>createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
async function rejectGitDirectory(file){
  // Keep the session identifier and test snapshot out of every Git checkout.
  let dir=dirname(resolve(file));
  while(true){
    try {await stat(resolve(dir,'.git'));throw new Error('Guarda snapshot fuera de cualquier repositorio Git.');}
    catch(error){if(error.code!=='ENOENT')throw error;}
    if(dir===parse(dir).root)return;
    dir=dirname(dir);
  }
}
try {
  assert.ok(['prepare','verify'].includes(phase)&&rawBase&&snapshotPath,
    'Uso: node scripts/persistence.mjs prepare|verify URL_API RUTA_SNAPSHOT_FUERA_GIT');
  const base=rawBase.replace(/\/$/,'');
  const parsed=new URL(base);
  assert.ok(parsed.protocol==='https:'||(parsed.protocol==='http:'&&['localhost','127.0.0.1'].includes(parsed.hostname)),
    'Se requiere HTTPS, salvo prueba local.');
  assert.ok(!parsed.username&&!parsed.password&&!parsed.search&&!parsed.hash,'URL de API sin credenciales ni parámetros.');
  await rejectGitDirectory(snapshotPath);
  let snapshot;
  if(phase==='verify'){
    snapshot=JSON.parse(await readFile(snapshotPath,'utf8'));
    assert.equal(snapshot.version,1);
    assert.equal(snapshot.base,base,'Usa exactamente la misma API que en prepare.');
    assert.match(snapshot.session,/^persistence-[a-f0-9-]{36}$/);
  }else{
    snapshot={version:1,base,session:`persistence-${randomUUID()}`,command:{
      action:'buy',metal:'XAG',grams:'1.000',requestId:randomUUID(),
    }};
  }
  const req=async(path,body,requestId)=>{
    const res=await fetch(base+path,{
      method:body?'POST':'GET',signal:AbortSignal.timeout(15_000),
      headers:{'x-demo-session':snapshot.session,'Content-Type':'application/json',...(requestId?{'Idempotency-Key':requestId}:{})},
      body:body?JSON.stringify(body):undefined,
    });
    const json=await res.json();
    assert.equal(res.ok,true,`${res.status} ${path}: ${json.error||'Error API'}`);
    return json;
  };
  const health=await req('/health');
  assert.equal(health.ok,true);assert.equal(health.demoOnly,true);assert.equal(health.mode,'postgres-demo');
  if(phase==='prepare'){
    const initial=await req('/api/demo/state');
    assert.equal(initial.holdingsMg.XAG,0);
    const result=await req('/api/demo/buy',{
      metal:snapshot.command.metal,grams:snapshot.command.grams,
    },snapshot.command.requestId);
    assert.equal(result.state.holdingsMg.XAG,1000);
    snapshot.stateHash=hash(result.state);
    snapshot.receipt=result.receipt;
    snapshot.preparedAt=new Date().toISOString();
    await writeFile(snapshotPath,JSON.stringify(snapshot,null,2)+'\n',{flag:'wx',mode:0o600});
    console.log('PASS prepare: compra ficticia guardada en PostgreSQL y snapshot local creado.');
    console.log('Reinicia el servicio API en Railway y ejecuta verify con la misma ruta.');
  }else{
    const state=await req('/api/demo/state');
    assert.equal(hash(state),snapshot.stateHash,'El estado cambió o se perdió desde prepare.');
    const replay=await req('/api/demo/buy',{
      metal:snapshot.command.metal,grams:snapshot.command.grams,
    },snapshot.command.requestId);
    assert.equal(replay.receipt.replayed,true);
    assert.equal(hash(replay.state),snapshot.stateHash,'El reintento duplicó la operación.');
    const {replayed,...receipt}=replay.receipt;
    assert.deepEqual(receipt,snapshot.receipt);
    console.log('PASS verify: estado y comprobante persisten; repetir la clave no duplica la compra.');
    console.log('El reinicio debe verificarse además en Railway; este script no lo inicia ni lo acredita.');
  }
}catch(error){
  console.error(`PERSISTENCE ${phase||''} FALLÓ:`,error.message);
  process.exitCode=1;
}
