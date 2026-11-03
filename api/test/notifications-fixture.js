import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {tokenHash} from '../src/account-auth.js';
import {lotFixture,lotJourney,lotCommand,LOT_HISTORY_PASSWORD} from './lot-history-fixture.js';
export {lotCommand as command};
export async function notificationJourney(store,tag){
  const f=await lotFixture(store,tag),commands=await lotJourney(f);
  const a=await store.getNotifications(f.a.id),b=await store.getNotifications(f.b.id),op=await store.getNotifications(f.op.id);
  assert.equal(a.items.filter(item=>item.type==='PURCHASE').length,2);assert.equal(a.items.filter(item=>item.type==='SALE').length,1);assert.equal(a.items.filter(item=>item.type==='OFFER_ACCEPTED').length,1);
  assert.equal(b.items.filter(item=>item.type==='DELIVERY_CHANGED').length,6);assert.equal(op.items.filter(item=>item.type==='DELIVERY_CHANGED').length,2);
  assert.ok([...a.items,...b.items,...op.items].every(item=>item.demoOnly&&item.title.includes('DEMO')&&!item.readAt));
  for(const [id,command] of [[f.a.id,commands.first],[f.a.id,commands.second],[f.b.id,commands.market],[f.a.id,commands.sell]])await store.mutateAccount(id,command);
  await store.mutateDelivery(f.op.id,commands.delivered);
  assert.deepEqual(await store.getNotifications(f.a.id),a);assert.deepEqual(await store.getNotifications(f.b.id),b);
  await assert.rejects(store.readNotifications(f.a.id,{id:b.items[0].id}),{status:404});
  await store.readNotifications(f.a.id,{id:a.items[0].id});const first=await store.getNotifications(f.a.id);
  assert.equal(first.unreadCount,a.unreadCount-1);await store.readNotifications(f.a.id,{id:a.items[0].id});assert.deepEqual(await store.getNotifications(f.a.id),first);
  const page=await store.getNotifications(f.b.id,new URLSearchParams('limit=2')),next=await store.getNotifications(f.b.id,new URLSearchParams({limit:'2',before:page.nextCursor}));
  assert.equal(new Set([...page.items,...next.items].map(item=>item.id)).size,4);
  await store.notificationPreferences(f.b.id,{sales:false,push:false});
  await store.mutateAccount(f.b.id,lotCommand('sell',{metal:'XAU',grams:'0.100'}));
  assert.equal((await store.getNotifications(f.b.id)).items.length,b.items.length);
  return {...f,commands,noticeA:first,noticeB:await store.getNotifications(f.b.id)};
}
export async function deviceFixture(store,account){
  const auth=await store.loginAccount(account.alias,LOT_HISTORY_PASSWORD);await store.notificationPreferences(account.id,{push:true});
  const body={installationId:randomUUID(),installationKey:(randomUUID()+randomUUID()).replaceAll('-',''),token:'ExpoPushToken[demo_token_'+randomUUID().replaceAll('-','')+']',platform:'android',permission:'granted',consent:true,reactivate:true};
  await store.registerPushDevice(account.id,tokenHash(auth.token),body);return {auth,hash:tokenHash(auth.token),body};
}
