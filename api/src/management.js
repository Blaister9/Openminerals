import {createHash} from 'node:crypto';
import {METALS,availableHoldingMg,deliveryIsActive} from './domain.js';
import {custodyView} from './custody.js';
import {deliveryView,deliveryBuyerReceiptId} from './delivery.js';
import {operatorReceiptView} from './shared-mine.js';

export const MANAGEMENT_ACTIONS=['buy','sell','offer','cancel_offer','market_buy','market_sell','delivery','cancel_delivery','delivery_quote','delivery_accept','delivery_reject','delivery_transition','stock','delivery_config'];
export const MANAGEMENT_STATUSES=['COMPLETED','OPEN','CANCELLED','FILLED','PENDING_QUOTE','QUOTED','APPROVED','PREPARING','DISPATCHED_DEMO','DELIVERED_DEMO','REJECTED'];
const invalid=message=>Object.assign(new Error(message),{status:400,code:'INVALID_MANAGEMENT_QUERY'});
const copy=value=>structuredClone(value),metals=Object.keys(METALS),record=fn=>Object.fromEntries(metals.map(metal=>[metal,fn(metal)]));
const compare=(a,b)=>b.at.localeCompare(a.at)||b.id.localeCompare(a.id);
function timestamp(value){
  if(value===null)return null;
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)||!Number.isFinite(Date.parse(value)))throw invalid('Fecha de filtro inválida; usa ISO UTC con Z.');
  const canonical=new Date(value).toISOString();if(canonical!==(value.includes('.')?value:value.replace('Z','.000Z')))throw invalid('La fecha de filtro no existe.');return canonical;
}
export function parseManagementQuery(params=new URLSearchParams()){
  const allowed=['metal','action','status','buyer','from','to','limit','before'];
  for(const field of params.keys())if(!allowed.includes(field)||params.getAll(field).length!==1)throw invalid('Parámetros gerenciales inválidos o repetidos.');
  const get=field=>params.get(field)||null;
  const filters={metal:get('metal'),action:get('action'),status:get('status'),buyer:get('buyer'),from:timestamp(get('from')),to:timestamp(get('to')),limit:20,before:get('before')};
  if(filters.metal&&!metals.includes(filters.metal))throw invalid('Metal de filtro inválido.');
  if(filters.action&&!MANAGEMENT_ACTIONS.includes(filters.action))throw invalid('Tipo de operación no permitido.');
  if(filters.status&&!MANAGEMENT_STATUSES.includes(filters.status))throw invalid('Estado de filtro inválido.');
  if(filters.buyer&&!/^account-[A-Za-z0-9_-]{8,80}$/.test(filters.buyer))throw invalid('Comprador de filtro inválido.');
  if(filters.from&&filters.to&&filters.from>filters.to)throw invalid('La fecha inicial debe ser anterior a la final.');
  const limit=params.has('limit')?params.get('limit'):'20';
  if(!/^[1-9]\d?$/.test(limit)||Number(limit)>50)throw invalid('El límite debe ser un entero de 1 a 50.');filters.limit=Number(limit);
  if(filters.before&&!/^operation-[a-f0-9]{32}$/.test(filters.before))throw invalid('Cursor gerencial inválido.');
  return filters;
}
function statusOf(receipt){
  if(['market_buy','market_sell'].includes(receipt.action))return 'FILLED';
  if(receipt.action==='offer')return 'OPEN';
  if(['cancel_offer','cancel_delivery'].includes(receipt.action))return 'CANCELLED';
  if(receipt.action==='delivery')return 'PENDING_QUOTE';
  if(receipt.action==='delivery_reject')return 'REJECTED';
  return receipt.deliveryStatus??receipt.status;
}
function event(receipt,scope,buyer,mine){
  const actor=receipt.actor?{id:receipt.actor.id,alias:receipt.actor.alias}:null,ownerId=scope==='buyer'?buyer.id:'mine';
  const id=`operation-${createHash('sha256').update(JSON.stringify([scope,scope==='buyer'?buyer.id:actor?.id??mine.id,receipt.id])).digest('hex').slice(0,32)}`;
  const query=scope==='buyer'?'':`?kind=${scope}${actor?`&actor=${encodeURIComponent(actor.id)}`:''}`;
  return {id,at:receipt.at,label:receipt.label??(scope==='stock'?'Ingreso ficticio de metal':'Operación de mina DEMO'),action:receipt.action,metal:receipt.metal??receipt.offer?.metal??receipt.delivery?.metal??null,
    status:statusOf(receipt),buyer:buyer?{id:buyer.id,alias:buyer.alias}:null,actor,scope,ownerId,receiptPath:scope==='buyer'?`/api/demo/mine/receipts/${buyer.id}/${receipt.id}`:`/api/demo/mine/commands/${receipt.id}${query}`,receipt:operatorReceiptView(receipt)};
}
function allEvents(mine,accounts){
  const buyers=accounts.filter(account=>account.role==='buyer'),accountMap=new Map(buyers.map(account=>[account.id,account]));
  const commands=Object.values(mine.commandReceipts),copiedBuyerReceipts=new Set(commands.filter(receipt=>receipt.actor&&accountMap.has(receipt.accountId)).map(receipt=>`${receipt.accountId}:${deliveryBuyerReceiptId(receipt.actor.id,receipt.id)}`));
  const buyerEvents=buyers.flatMap(account=>Object.values(account.state.receipts).filter(receipt=>receipt.mineId===mine.id&&receipt.accountId===account.id&&MANAGEMENT_ACTIONS.includes(receipt.action)&&!copiedBuyerReceipts.has(`${account.id}:${receipt.id}`)).map(receipt=>event(receipt,'buyer',account,mine)));
  const commandEvents=commands.filter(receipt=>MANAGEMENT_ACTIONS.includes(receipt.action)).map(receipt=>event(receipt,'command',accountMap.get(receipt.accountId),mine));
  const stock=Object.values(mine.stockReceipts).map(receipt=>event(receipt,'stock',null,mine));
  return [...buyerEvents,...commandEvents,...stock].sort(compare);
}
function metrics(events){
  const buys=events.filter(item=>item.action==='buy'),sells=events.filter(item=>item.action==='sell'),stocks=events.filter(item=>item.action==='stock');
  const trades=new Map();for(const item of events)if(['market_buy','market_sell'].includes(item.action)&&item.receipt.tradeId&&!trades.has(item.receipt.tradeId))trades.set(item.receipt.tradeId,item.receipt);
  const market=[...trades.values()];
  return {directBuys:buys.length,directSells:sells.length,marketplaceTrades:market.length,directBuyVolumeMinor:buys.reduce((sum,item)=>sum+item.receipt.baseMinor,0),directSellVolumeMinor:sells.reduce((sum,item)=>sum+item.receipt.baseMinor,0),marketplaceVolumeMinor:market.reduce((sum,receipt)=>sum+receipt.baseMinor,0),
    tradingFeesMinor:[...buys,...sells].reduce((sum,item)=>sum+(item.receipt.feeMinor??0),0)+market.reduce((sum,receipt)=>sum+(receipt.marketplaceFeeMinor??receipt.feeMinor??0),0),
    deliveryCostsCollectedMinor:events.filter(item=>item.action==='delivery_accept').reduce((sum,item)=>sum+(item.receipt.totalMinor??0),0),stockEntries:stocks.length,stockMg:stocks.reduce((sum,item)=>sum+item.receipt.mg,0),policyChanges:events.filter(item=>item.action==='delivery_config').length,eventsMatched:events.length};
}
export function managementView(mine,accounts,viewer,filters=parseManagementQuery()){
  const custody=custodyView(mine,accounts,viewer),deliveries=deliveryView(mine,accounts,viewer),buyers=accounts.filter(account=>account.role==='buyer').map(account=>({id:account.id,alias:account.alias,holdingsMg:copy(account.state.holdingsMg),reservedMg:record(metal=>account.state.holdingsMg[metal]-availableHoldingMg(account.state,metal)),activeOffers:account.state.offers.filter(offer=>offer.status==='OPEN').length,activeDeliveries:account.state.custodyRequests.filter(request=>deliveryIsActive(request.status)).length})).sort((a,b)=>a.alias.localeCompare(b.alias)||a.id.localeCompare(b.id));
  const events=allEvents(mine,accounts).filter(item=>(!filters.metal||item.metal===filters.metal)&&(!filters.action||item.action===filters.action)&&(!filters.status||item.status===filters.status)&&(!filters.buyer||item.buyer?.id===filters.buyer)&&(!filters.from||item.at>=filters.from)&&(!filters.to||item.at<=filters.to));
  let start=0;if(filters.before){const index=events.findIndex(item=>item.id===filters.before);if(index<0)throw invalid('El cursor no está disponible con estos filtros.');start=index+1;}
  const items=events.slice(start,start+filters.limit),nextCursor=start+items.length<events.length?items.at(-1)?.id??null:null;
  const requests=deliveries.requests,openOffers=accounts.filter(account=>account.role==='buyer').flatMap(account=>account.state.offers.filter(offer=>offer.status==='OPEN'));
  return {demoOnly:true,disclaimer:'PANEL GERENCIAL DEMO · Datos y operaciones simulados. No es inventario físico auditado ni backoffice empresarial de producción.',mine:{id:mine.id,name:mine.name},filters:copy(filters),options:{metals:[...metals],actions:[...MANAGEMENT_ACTIONS],statuses:[...MANAGEMENT_STATUSES],buyers:buyers.map(({id,alias})=>({id,alias}))},kpisScope:'filtered_history',snapshotScope:'current_mine',kpis:metrics(events),
    metals:record(metal=>({originalWeightMg:custody.totals[metal].weightMg,deliveredMg:custody.totals[metal].deliveredMg,activeSupplyMg:mine.totalSupplyMg[metal],availableMg:mine.inventoryMg[metal],allocatedMg:custody.totals[metal].allocatedMg,reservedMg:buyers.reduce((sum,buyer)=>sum+buyer.reservedMg[metal],0),reconciled:mine.inventoryMg[metal]+custody.totals[metal].allocatedMg===mine.totalSupplyMg[metal]})),lots:custody.lots,buyers,
    obligations:{offersOpen:openOffers.length,offersMg:record(metal=>openOffers.filter(offer=>offer.metal===metal).reduce((sum,offer)=>sum+offer.mg,0)),deliveriesActive:requests.filter(request=>deliveryIsActive(request.status)).length,deliveryMg:record(metal=>requests.filter(request=>request.metal===metal&&deliveryIsActive(request.status)).reduce((sum,request)=>sum+request.mg,0)),paidDeliveryCostsMinor:requests.filter(request=>deliveryIsActive(request.status)).reduce((sum,request)=>sum+request.paidMinor,0)},
    requests,stock:Object.values(mine.stockReceipts).map(operatorReceiptView).sort((a,b)=>b.at.localeCompare(a.at)||b.id.localeCompare(a.id)),policies:deliveries.policies,audit:deliveries.audit,history:{items,total:events.length,nextCursor}};
}
