import {randomUUID} from 'node:crypto';

export const MANAGEMENT_PASSWORD='Exclusive-management-tests-123';
export const managementCommand=(action,body={})=>({action,...body,requestId:randomUUID()});
export async function seedManagement(store,tag='unit'){
  const mine=await store.createMine({name:'Gestión exclusivamente DEMO',initialInventoryMg:{XAU:2000,XAG:5000,XPT:1000,XPD:1000}}),users={};
  for(const [name,role] of [['a','buyer'],['b','buyer'],['op','operator'],['op2','operator']])users[name]=await store.createAccount({alias:`management_${tag}_${name}`,password:MANAGEMENT_PASSWORD,mineId:mine.id,role});
  const {a,b,op}=users;
  const stock=await store.mutateStock(op.id,{metal:'XAU',grams:'1.000',reason:'Ingreso gerencial ficticio',requestId:randomUUID()});
  const bought=await store.mutateAccount(a.id,managementCommand('buy',{metal:'XAU',grams:'1.000'}));
  const offer=await store.mutateAccount(a.id,managementCommand('offer',{metal:'XAU',grams:'0.200',price:'150.00'}));
  const market=await store.mutateAccount(b.id,managementCommand('market_buy',{sellerId:a.id,offerId:offer.receipt.offer.id}));
  await store.mutateAccount(a.id,managementCommand('sell',{metal:'XAU',grams:'0.100'}));
  const request=await store.mutateAccount(b.id,managementCommand('delivery',{metal:'XAU',grams:'0.100'}));
  const quoted=await store.mutateDelivery(op.id,managementCommand('delivery_quote',{buyerId:b.id,deliveryId:request.receipt.delivery.id,jurisdiction:'DEMO_LOCAL'}));
  await store.mutateAccount(b.id,managementCommand('delivery_accept',{deliveryId:request.receipt.delivery.id,quoteId:quoted.receipt.quote.id}));
  for(const status of ['PREPARING','DISPATCHED_DEMO','DELIVERED_DEMO'])await store.mutateDelivery(op.id,managementCommand('delivery_transition',{buyerId:b.id,deliveryId:request.receipt.delivery.id,status,reason:'Paso de entrega gerencial ficticia'}));
  const config=await store.mutateDelivery(op.id,managementCommand('delivery_config',{jurisdiction:'DEMO_LOCAL',label:'Política gerencial DEMO',taxBps:'0',service:'2.00',preparation:'3.00',transport:'5.00',insuranceBps:'0',quoteValidityHours:'24',requirements:'Alias ficticio\nConfirmar demostración',reason:'Configuración gerencial ilustrativa'}));
  await store.mutateAccount(a.id,managementCommand('offer',{metal:'XAU',grams:'0.100',price:'160.00'}));
  const activeDelivery=await store.mutateAccount(b.id,managementCommand('delivery',{metal:'XAU',grams:'0.100'}));
  await store.mutateAccount(a.id,managementCommand('deposit',{currency:'USD',amount:'0.02'}));
  await store.mutateAccount(a.id,managementCommand('convert',{from:'USD',to:'USDT',amount:'0.01'}));
  await store.mutateAccount(a.id,managementCommand('withdraw',{currency:'USD',amount:'0.01'}));
  return {store,mine,...users,stock,bought,market,quoted,config,activeDelivery:activeDelivery.receipt.delivery};
}
