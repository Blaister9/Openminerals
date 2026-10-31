import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createStore} from '../src/store.js';
import {immersiveInventory,publicCustodyProjection} from './immersive-inventory-fixture.js';
const url=process.env.TEST_DATABASE_URL;
test('PostgreSQL inventario inmersivo: dos conexiones, atomicidad y reapertura',{skip:url?false:'Falta TEST_DATABASE_URL',timeout:120000},async t=>{
  const {default:pg}=await import('pg'),schema='om_immersive_'+randomUUID().replaceAll('-',''),admin=new pg.Pool({connectionString:url,max:1}),scoped=new URL(url);scoped.searchParams.set('options','-c search_path='+schema);let a,b;
  try{
    await admin.query(`CREATE SCHEMA "${schema}"`);a=await createStore(scoped.toString());b=await createStore(scoped.toString());
    const result=await immersiveInventory(t,a,b);await a.close();a=await createStore(scoped.toString());
    assert.deepEqual(await a.getIntake(result.op.id),result.intake);assert.deepEqual(await a.getCustody(result.op.id,'operator'),result.custody);
    await t.test('HTTP PostgreSQL: nombre y textos operativos fuera de DTO compradores',async()=>publicCustodyProjection(a));
  }finally{if(a)await a.close();if(b)await b.close();try{await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);}finally{await admin.end();}}
});
