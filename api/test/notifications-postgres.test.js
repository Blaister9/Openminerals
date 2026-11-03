import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createStore} from '../src/store.js';
import {notificationJourney,deviceFixture,command} from './notifications-fixture.js';
import {lotFixture} from './lot-history-fixture.js';
const databaseUrl=process.env.TEST_DATABASE_URL;
test('PostgreSQL notificaciones DEMO: atomicidad, persistencia, dos pools y cola push durable',{
  skip:databaseUrl?false:'Falta TEST_DATABASE_URL; persistencia de notificaciones no probada',timeout:120000,
},async t=>{
  const {default:pg}=await import('pg'),schema='om_notifications_'+randomUUID().replaceAll('-','');
  const admin=new pg.Pool({connectionString:databaseUrl,max:2}),scoped=new URL(databaseUrl);scoped.searchParams.set('options','-c search_path='+schema);
  let time=Date.now(),sends=0,receipts=0;
  const transport={async send(messages){sends+=messages.length;return messages.map(()=>({status:'ok',id:randomUUID()}));},async receipts(ids){receipts+=ids.length;return Object.fromEntries(ids.map(id=>[id,{status:'ok'}]));}};
  const options={notificationsEnabled:true,pushSendEnabled:true,pushTransport:transport,now:()=>time};let a,b,f;
  try{
    await admin.query(`CREATE SCHEMA "${schema}"`);[a,b]=await Promise.all([createStore(scoped.toString(),options),createStore(scoped.toString(),options)]);
    await t.test('operaciones comerciales y lectura/paginación persistentes, sin duplicaciones por replay',async()=>{f=await notificationJourney(a,'pg_notice');});
    await t.test('reinicio conserva preferencias, alertas, historial y lectura',async()=>{
      const alert={id:randomUUID(),metal:'XPT',direction:'above',threshold:'10',enabled:true,source:'demo'};await a.savePriceAlert(f.a.id,alert);
      const sample={sampleId:randomUUID(),metal:'XPT',price:'11',source:'demo'};await a.demoPriceSample(f.a.id,sample);
      const before=await a.getNotifications(f.a.id);await a.close();a=await createStore(scoped.toString(),options);
      assert.deepEqual(await a.getNotifications(f.a.id),before);assert.equal((await b.demoPriceSample(f.a.id,sample)).replayed,true);assert.deepEqual(await b.getNotifications(f.a.id),before);
    });
    await t.test('dos pools confirman una operación y una notificación; lectura concurrente no se pierde',async()=>{
      const buy=command('buy',{metal:'XAG',grams:'0.100'}),before=await a.getNotifications(f.a.id);
      await Promise.all([a.mutateAccount(f.a.id,buy),b.mutateAccount(f.a.id,buy)]);
      const after=await a.getNotifications(f.a.id);assert.equal(after.items.length,before.items.length+1);
      await Promise.all([a.readNotifications(f.a.id,{id:after.items[0].id}),b.readNotifications(f.a.id,{id:after.items[1].id})]);
      assert.ok((await b.getNotifications(f.a.id)).items.slice(0,2).every(item=>item.readAt));
    });
    await t.test('error al guardar aviso revierte compra, inventario, custodia y comprobante',async()=>{
      const beforeMine=(await admin.query(`SELECT state FROM "${schema}".demo_mines WHERE id=$1`,[f.mine.id])).rows[0].state;
      const beforeBuyer=(await admin.query(`SELECT state FROM "${schema}".demo_accounts WHERE id=$1`,[f.a.id])).rows[0].state;
      const notices=await a.getNotifications(f.a.id);
      await admin.query(`CREATE FUNCTION "${schema}".fail_notice_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'notice rollback fixture'; END $$;
        CREATE TRIGGER fail_notice BEFORE UPDATE ON "${schema}".demo_notification_records FOR EACH ROW EXECUTE FUNCTION "${schema}".fail_notice_write();`);
      try{await assert.rejects(a.mutateAccount(f.a.id,command('buy',{metal:'XAG',grams:'0.100'})),/notice rollback fixture/);}
      finally{await admin.query(`DROP TRIGGER fail_notice ON "${schema}".demo_notification_records`);}
      assert.deepEqual((await admin.query(`SELECT state FROM "${schema}".demo_mines WHERE id=$1`,[f.mine.id])).rows[0].state,beforeMine);
      assert.deepEqual((await admin.query(`SELECT state FROM "${schema}".demo_accounts WHERE id=$1`,[f.a.id])).rows[0].state,beforeBuyer);assert.deepEqual(await b.getNotifications(f.a.id),notices);
    });
    await t.test('cola entre dos workers, reinicio antes de envío y recibo posterior a reinicio',async()=>{
      const fixture=await lotFixture(a,'pg_dispatch');await deviceFixture(a,fixture.a);
      await a.mutateAccount(fixture.a.id,command('buy',{metal:'XAG',grams:'0.100'}));
      await a.close();a=await createStore(scoped.toString(),options);await Promise.all([a.dispatchNotifications(),b.dispatchNotifications()]);assert.equal(sends,1);
      await b.close();b=await createStore(scoped.toString(),options);time+=15*60000+1;await Promise.all([a.dispatchNotifications(),b.dispatchNotifications()]);assert.equal(receipts,1);assert.equal(sends,1);
      const jobs=(await admin.query(`SELECT value FROM "${schema}".demo_notification_records WHERE key LIKE 'push:%'`)).rows;assert.ok(jobs.every(row=>row.value.status==='PROVIDER_ACCEPTED'));
    });
    await t.test('sesión revocada y permiso desactivado cancelan trabajos pendientes sin salir a red',async()=>{
      const fixture=await lotFixture(a,'pg_revoked'),device=await deviceFixture(a,fixture.a);
      await a.mutateAccount(fixture.a.id,command('buy',{metal:'XAG',grams:'0.100'}));await b.logoutAccount(device.auth.token);await a.dispatchNotifications();assert.equal(sends,1);
      const state=await a.getNotifications(fixture.a.id);assert.equal(state.devices[0].active,false);assert.equal(state.items.length,1);
    });
  }finally{await Promise.allSettled([a?.close(),b?.close()]);try{await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);}finally{await admin.end();}}
});
