import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';

test('fallback precalculado pertenece al renderer actual y cabe en un bitmap móvil acotado',async()=>{
 const bytes=await readFile(new URL('../assets/geology-light.png',import.meta.url)),metadata=JSON.parse(await readFile(new URL('../assets/geology-light.json',import.meta.url),'utf8'));
 assert.equal(metadata.demoOnly,true);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a');assert.equal(bytes.readUInt32BE(16),360);assert.equal(bytes.readUInt32BE(20),640);assert.ok(bytes.length<400000);assert.ok(360*640*4<1024*1024);
 assert.equal(metadata.sha256,createHash('sha256').update(bytes).digest('hex'));
 for(const [file,expected] of Object.entries(metadata.sourceHashesLF)){const text=await readFile(new URL('../'+file,import.meta.url),'utf8');assert.equal(createHash('sha256').update(text.replaceAll('\r\n','\n')).digest('hex'),expected,'Rebake the fallback after changing '+file);}
});
