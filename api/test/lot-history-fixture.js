import {randomUUID} from 'node:crypto';

export const LOT_HISTORY_PASSWORD='Exclusive-lot-history-tests-123';
export const lotCommand=(action,body={})=>({action,...body,requestId:randomUUID()});
export async function lotFixture(store,tag='unit'){
  const mine=await store.createMine({name:'Historial de lotes exclusivamente DEMO',initialInventoryMg:{XAU:3000,XAG:1000,XPT:1000,XPD:1000}}),users={};
  for(const [name,role] of [['a','buyer'],['b','buyer'],['other','buyer'],['op','operator']])users[name]=await store.createAccount({alias:`lot_history_${tag}_${name}`,password:LOT_HISTORY_PASSWORD,mineId:mine.id,role});
  const lot=(await store.getCustody(users.op.id,'operator')).lots.find(item=>item.metal==='XAU');
  return {store,mine,lot,...users};
}
export async function lotJourney(f){
  const first=lotCommand('buy',{metal:'XAU',grams:'0.200'}),second=lotCommand('buy',{metal:'XAU',grams:'0.400'});
  await f.store.mutateAccount(f.a.id,first);await f.store.mutateAccount(f.a.id,second);
  const offer=await f.store.mutateAccount(f.a.id,lotCommand('offer',{metal:'XAU',grams:'0.500',price:'140.00'}));
  const market=lotCommand('market_buy',{sellerId:f.a.id,offerId:offer.receipt.offer.id});await f.store.mutateAccount(f.b.id,market);
  const sell=lotCommand('sell',{metal:'XAU',grams:'0.100'});await f.store.mutateAccount(f.a.id,sell);
  const delivery=(await f.store.mutateAccount(f.b.id,lotCommand('delivery',{metal:'XAU',grams:'0.200'}))).receipt.delivery;
  const quoted=await f.store.mutateDelivery(f.op.id,lotCommand('delivery_quote',{buyerId:f.b.id,deliveryId:delivery.id,jurisdiction:'DEMO_LOCAL'}));
  await f.store.mutateAccount(f.b.id,lotCommand('delivery_accept',{deliveryId:delivery.id,quoteId:quoted.receipt.quote.id}));
  let delivered;
  for(const status of ['PREPARING','DISPATCHED_DEMO','DELIVERED_DEMO']){
    const command=lotCommand('delivery_transition',{buyerId:f.b.id,deliveryId:delivery.id,status,reason:'Paso de entrega ficticia con historial'});
    await f.store.mutateDelivery(f.op.id,command);if(status==='DELIVERED_DEMO')delivered=command;
  }
  const stock={metal:'XAU',grams:'1.000',reason:'Reposición ficticia con historial',requestId:randomUUID()};
  const added=await f.store.mutateStock(f.op.id,stock);
  return {first,second,market,sell,delivered,stock,stockLot:added.receipt.lotId};
}
