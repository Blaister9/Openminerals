// Buyer custody payloads use explicit public fields and fixed fictional copy.
// Operational free text remains in the authenticated operator record only.
const copy=value=>structuredClone(value);
const pick=(value,keys)=>Object.fromEntries(keys.filter(key=>Object.hasOwn(value,key)).map(key=>[key,copy(value[key])]));
const publicRequirements=['Usar exclusivamente alias e identificadores ficticios','Confirmar que no se enviará metal ni se aportará una dirección real'];
const labels={DEMO_LOCAL:'Jurisdicción DEMO A',DEMO_REGIONAL:'Jurisdicción DEMO B',DEMO_INTERNATIONAL:'Jurisdicción DEMO C'};
export const PUBLIC_MINE_NAME='Mina virtual ficticia DEMO';
export function publicMine(mine,viewer){
  return {id:mine.id,name:viewer.role==='operator'?mine.name:PUBLIC_MINE_NAME};
}
export function publicPolicy(policy){
  return {...pick(policy,['id','taxBps','serviceMinor','preparationMinor','transportMinor','insuranceBps','demoOnly']),label:labels[policy.id]??'Jurisdicción ficticia DEMO',requirements:[...publicRequirements]};
}
export function publicQuote(quote){
  if(!quote)return null;
  return {...pick(quote,['id','metalValueMinor','serviceMinor','preparationMinor','transportMinor','insuranceMinor','taxMinor','subtotalMinor','totalMinor','taxBps','insuranceBps','currency','createdAt','expiresAt','policyVersion','demoOnly']),jurisdiction:{id:quote.jurisdiction.id,label:labels[quote.jurisdiction.id]??'Jurisdicción ficticia DEMO'},requirements:[...publicRequirements]};
}
export function publicDelivery(request){
  const result=pick(request,['id','metal','mg','status','createdAt','jurisdiction','paidMinor','paidAt','acceptedQuoteId','deliveredAt','demoOnly']);
  if(Object.hasOwn(request,'quote'))result.quote=publicQuote(request.quote);
  if(request.deliveredLots)result.deliveredLots=request.deliveredLots.map(item=>pick(item,['lotId','mg']));
  const statusLabels={PENDING_QUOTE:'Solicitud de cotización DEMO registrada',QUOTED:'Operador preparó una cotización DEMO',APPROVED:'Comprador aceptó cotización y requisitos DEMO',CANCELLED:'Solicitud DEMO cancelada por el comprador',REJECTED:'Solicitud DEMO rechazada',PREPARING:'Entrega DEMO en preparación',DISPATCHED_DEMO:'Entrega DEMO despachada',DELIVERED_DEMO:'Entrega DEMO completada'};
  result.timeline=(request.timeline??[]).map(event=>({status:event.status,at:event.at,label:statusLabels[event.status]??'Movimiento de entrega DEMO'}));
  return result;
}
export function publicBuyerReceipt(receipt){
  if(!['delivery','cancel_delivery','delivery_quote','delivery_transition','delivery_accept','delivery_reject'].includes(receipt.action))return copy(receipt);
  const result=pick(receipt,['id','action','status','at','demoOnly','mineId','actor','accountId','receiptVersion','label','metal','mg','deliveryId','deliveryStatus','currency','totalMinor','paidMinor','requirementsAcknowledged','balancesAfter','replayed']);
  if(receipt.delivery)result.delivery=publicDelivery(receipt.delivery);
  if(Object.hasOwn(receipt,'quote'))result.quote=publicQuote(receipt.quote);
  if(receipt.deliveredLots)result.deliveredLots=receipt.deliveredLots.map(item=>pick(item,['lotId','mg']));
  return result;
}
export function publicBuyerState(state){
  const result=copy(state);
  result.custodyRequests=result.custodyRequests.map(publicDelivery);
  result.receipts=Object.fromEntries(Object.entries(result.receipts).map(([key,value])=>[key,publicBuyerReceipt(value)]));
  return result;
}
