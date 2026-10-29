import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {spawnSync} from 'node:child_process';
import {createObserverRequest} from '../e2e/ci-http.mjs';
test('CI observer survives a blocking native command with fresh sockets and keeps errors private',async()=>{
  const secret='private-observer-canary',worker=new Worker(`const{parentPort}=require('node:worker_threads'),http=require('node:http');const server=http.createServer((req,res)=>{res.setHeader('Keep-Alive','timeout=60');if(req.url==='/denied'){res.statusCode=401;res.end(JSON.stringify({error:'${secret}'}));}else res.end(JSON.stringify({ok:true,connection:req.headers.connection}));});server.keepAliveTimeout=100;server.keepAliveTimeoutBuffer=0;server.listen(0,'127.0.0.1',()=>parentPort.postMessage(server.address().port));`,{eval:true});
  try{
    const port=await new Promise(resolve=>worker.once('message',resolve)),events=[],read=createObserverRequest({api:'http://127.0.0.1:'+port,onFailure:value=>events.push(value)});
    assert.equal((await read('/health')).connection,'close');await new Promise(setImmediate);
    const blocked=spawnSync(process.execPath,['-e','Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,700)'],{windowsHide:true,timeout:5000});assert.equal(blocked.status,0);
    assert.equal((await read('/health')).ok,true);
    await assert.rejects(()=>read('/denied',secret));assert.deepEqual(events,[{operation:'other-demo-api',kind:'status',expectedStatus:200,actualStatus:401}]);assert.equal(JSON.stringify(events).includes(secret),false);
    assert.throws(()=>createObserverRequest({api:'https://unapproved.example'}));
  }finally{await worker.terminate();}
});
