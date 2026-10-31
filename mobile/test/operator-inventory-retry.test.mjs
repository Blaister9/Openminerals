import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {randomUUID} from 'node:crypto';
import {mkdtemp,readFile,writeFile,unlink,rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createStore} from '../../api/src/store.js';
import {createApiServer} from '../../api/src/server.js';
import {createDemoClient,RequestError} from '../lib/demo-client.ts';

const faults={
  'compromiso ausente':mine=>{delete mine.deliveryCommittedMg;},
  'compromiso mayor que la reserva':mine=>{mine.deliveryCommittedMg.XAU=100;},
};

for(const action of ['mine/intake_receive','mine/stock'])for(const [fault,corrupt] of Object.entries(faults)){
  test(`${action}: ${fault} conserva pendiente tras reapertura; replay válido limpia una sola vez`,async()=>{
    const store=await createStore('');let server,directory;
    try{
      const mine=await store.createMine({name:'Reintento de inventario DEMO',initialInventoryMg:{XAU:0,XAG:0,XPT:0,XPD:0}});
      const op=await store.createAccount({alias:'inventory_retry_operator',password:'Only-local-inventory-retry-2026',role:'operator',mineId:mine.id});
      const auth=await store.loginAccount(op.alias,'Only-local-inventory-retry-2026');
      let body={metal:'XAU',grams:'1.000',reason:'Ingreso exclusivamente DEMO'};
      if(action==='mine/intake_receive'){
        const produced=await store.mutateIntake(op.id,{action:'intake_produce',metal:'XAU',grams:'1.000',reason:'Producción DEMO',requestId:randomUUID()});
        await store.mutateIntake(op.id,{action:'intake_verify',batchId:produced.receipt.batchId,reason:'Verificación DEMO',requestId:randomUUID()});
        body={batchId:produced.receipt.batchId,reason:'Recepción exclusivamente DEMO'};
      }
      server=createApiServer(store);server.listen(0,'127.0.0.1');await once(server,'listening');
      const api=`http://127.0.0.1:${server.address().port}`,key=`openminerals-demo-pending:${api}:account:${op.id}`;
      directory=await mkdtemp(join(tmpdir(),'openminerals-inventory-retry-'));
      const pendingFile=join(directory,'pending.json'),requests=[];let removals=0,alterResponse=true;
      const storage={
        getItem:async name=>{assert.equal(name,key);try{return await readFile(pendingFile,'utf8');}catch(error){if(error.code==='ENOENT')return null;throw error;}},
        setItem:async(name,value)=>{assert.equal(name,key);await writeFile(pendingFile,value,{mode:0o600});},
        removeItem:async name=>{assert.equal(name,key);await unlink(pendingFile);removals++;},
      };
      const create=uuid=>createDemoClient({api,storage,accountId:op.id,getToken:()=>auth.token,uuid,
        fetchImpl:async(url,options)=>{
          const saved=JSON.parse(await readFile(pendingFile,'utf8'));
          assert.equal(options.headers['Idempotency-Key'],saved.requestId);
          assert.deepEqual(JSON.parse(options.body),saved.body);
          requests.push({key:saved.requestId,body:JSON.parse(options.body)});
          const response=await fetch(url,options);assert.equal(response.status,200);
          const result=await response.json();
          if(alterResponse)corrupt(result.mine);
          return new Response(JSON.stringify(result),{status:200,headers:{'Content-Type':'application/json'}});
        },
      });
      const ambiguous=error=>error instanceof RequestError&&error.ambiguous===true&&error.status===0&&/incompleta/.test(error.message);
      const first=create(randomUUID);
      await assert.rejects(first.submit(action,body,'Ingreso DEMO'),ambiguous);
      const original=first.getPending(),durable=await readFile(pendingFile,'utf8');
      assert.ok(original);assert.deepEqual(JSON.parse(durable),original);assert.equal(removals,0);
      assert.ok(!durable.includes(auth.token));

      const reopened=create(()=>{throw new Error('El reintento no debe generar otra clave');});
      assert.deepEqual((await reopened.initialize()).pending,original);
      await assert.rejects(reopened.submit(action,body,'Otro ingreso'),/pendiente/);
      await assert.rejects(reopened.retry(),ambiguous);
      assert.deepEqual(reopened.getPending(),original);assert.equal(await readFile(pendingFile,'utf8'),durable);assert.equal(removals,0);

      alterResponse=false;
      const replay=await reopened.retry();
      assert.equal(replay.receipt.id,original.requestId);assert.equal(replay.receipt.replayed,true);
      assert.equal(reopened.getPending(),null);assert.equal(await storage.getItem(key),null);assert.equal(removals,1);
      assert.deepEqual(requests,Array.from({length:3},()=>({key:original.requestId,body})));
      await assert.rejects(reopened.retry(),/No hay ninguna operación pendiente/);
      assert.equal(removals,1);assert.equal(requests.length,3);

      const summary=await store.getMineSummary(op.id),intake=await store.getIntake(op.id);
      assert.equal(summary.inventoryMg.XAU,1000);assert.equal(summary.totalSupplyMg.XAU,1000);
      assert.equal(summary.stockAdjustments.length,1);assert.equal(intake.totals.XAU.receivedMg,1000);
      assert.equal(intake.batches.length,action==='mine/intake_receive'?1:0);
    }finally{
      if(server)await new Promise(resolve=>server.close(resolve));await store.close();
      if(directory){await unlink(join(directory,'pending.json')).catch(error=>{if(error.code!=='ENOENT')throw error;});await rmdir(directory);}
    }
  });
}
