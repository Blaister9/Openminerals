import test from 'node:test';
import assert from 'node:assert/strict';
import {seedState,applyCommand} from '../../api/src/domain.js';
import {seedMine} from '../../api/src/shared-mine.js';
import {ensureCustody,custodyView} from '../../api/src/custody.js';
import {ensureDelivery,deliveryQuote,deliveryView,applyBuyerDelivery,applyOperatorDelivery} from '../../api/src/delivery.js';
import {acceptDeliveryCommand,deliveryAcceptBlocked,deliveryCanCancel,deliveryPolicyCommand,deliveryPolicyInitialForm,deliveryStatusLabel,nextDeliveryStatus,parseDeliverySummary,quoteDeliveryCosts,requestDeliveryCommand,transitionDeliveryCommand} from '../lib/delivery.ts';
import {parseCustodySummary} from '../lib/custody.ts';

const at='2026-10-28T12:00:00Z',now=Date.parse(at);
function fixture(){
  let mine=seedMine();
  const buyer={id:'delivery-ui-buyer-account',alias:'buyer_demo',role:'buyer',mineId:mine.id,state:seedState()};
  const other={id:'delivery-ui-other-buyer',alias:'other_demo',role:'buyer',mineId:mine.id,state:seedState()};
  const operator={id:'delivery-ui-operator-demo',alias:'operator_demo',role:'operator',mineId:mine.id};
  buyer.state.holdingsMg.XAU=2000;mine.inventoryMg.XAU-=2000;
  const accounts=[buyer,other,operator];mine=ensureDelivery(ensureCustody(mine,accounts,at).mine).mine;
  buyer.state=applyCommand(buyer.state,{action:'delivery',metal:'XAU',grams:'0.5',jurisdiction:'DEMO_REGIONAL',requestId:'delivery-ui-request-one'},at).state;
  return {mine,buyer,other,operator,accounts};
}
function quoteFixture(){
  const f=fixture(),id=f.buyer.state.custodyRequests[0].id;
  const quoted=applyOperatorDelivery(f.mine,f.operator,f.buyer,{action:'delivery_quote',buyerId:f.buyer.id,deliveryId:id,jurisdiction:'DEMO_REGIONAL',requestId:'delivery-ui-quote-001'},at);
  f.mine=quoted.mine;f.buyer.state=quoted.state;
  return f;
}
function ownRequest(f){return parseDeliverySummary(deliveryView(f.mine,f.accounts,f.buyer),false,f.buyer.id).requests[0];}

test('entrega UI consume DTO real del comprador y operador sin compartir billeteras ni auditoría privada',()=>{
  const f=fixture(),buyer=parseDeliverySummary(deliveryView(f.mine,f.accounts,f.buyer),false,f.buyer.id);
  assert.equal(buyer.requests.length,1);assert.equal(buyer.availableMg.XAU,1500);assert.equal(buyer.audit.length,0);
  assert.equal(buyer.requests[0].status,'PENDING_QUOTE');assert.equal(buyer.requests[0].quote,null);
  assert.equal(buyer.policies.jurisdictions.length,3);assert.equal(JSON.stringify(buyer).includes('walletMinor'),false);
  const operator=parseDeliverySummary(deliveryView(f.mine,f.accounts,f.operator),true,f.operator.id);
  assert.equal(operator.requests[0].account.alias,'buyer_demo');assert.equal(operator.view,'operator');
});

test('desglose de costes coincide con cotizaciones reales de todas las jurisdicciones ficticias',()=>{
  const f=fixture(),request=f.buyer.state.custodyRequests[0];
  for(const policy of f.mine.delivery.jurisdictions){
    const quoted=deliveryQuote(f.mine,request,policy.id,`quote-${policy.id}`,at);
    const result=quoteDeliveryCosts(quoted);
    for(const field of ['serviceMinor','preparationMinor','transportMinor','insuranceMinor','taxMinor','subtotalMinor','totalMinor'])assert.equal(result[field],quoted[field]);
  }
  assert.equal(quoteDeliveryCosts({metalValueMinor:1,serviceMinor:10000000000,preparationMinor:1,transportMinor:0,taxBps:0,insuranceBps:0}),null);
  assert.equal(quoteDeliveryCosts({metalValueMinor:1,serviceMinor:0,preparationMinor:0,transportMinor:0,taxBps:10001,insuranceBps:0}),null);
});

test('solicitud normaliza gramos, conserva jurisdicción y bloquea usar posiciones reservadas',()=>{
  const f=fixture(),policy=f.mine.delivery.jurisdictions[1],command=requestDeliveryCommand('XAU',' 0,25 ',policy,1500);
  assert.equal(command.action,'delivery');assert.deepEqual(command.body,{metal:'XAU',grams:'0.25',jurisdiction:'DEMO_REGIONAL'});
  assert.throws(()=>requestDeliveryCommand('XAU','2',policy,1500),/gramos disponibles/);
  assert.throws(()=>requestDeliveryCommand('XAU','0.01',policy,1500),/0,1/);
});

test('aceptación exige cotización vigente, saldo exacto y todos los requisitos leídos',()=>{
  const f=quoteFixture(),request=ownRequest(f),quote=request.quote,requirements=quote.requirements;
  assert.match(deliveryAcceptBlocked(request,quote.totalMinor,[],now),/requisitos/);
  assert.match(deliveryAcceptBlocked(request,quote.totalMinor-1,requirements,now),/saldo/);
  assert.match(deliveryAcceptBlocked(request,quote.totalMinor,requirements,Date.parse(quote.expiresAt)),/venció/);
  assert.equal(deliveryAcceptBlocked(request,quote.totalMinor,requirements,now),null);
  const command=acceptDeliveryCommand(request,quote.totalMinor,requirements,now);
  assert.deepEqual(command.body,{deliveryId:request.id,quoteId:quote.id});assert.match(command.detail,/USDT 0,00/);assert.match(command.detail,/no podrás cancelar/);
  assert.throws(()=>acceptDeliveryCommand({...request,status:'APPROVED'},quote.totalMinor,requirements,now));
});

test('recotizar conserva snapshot antiguo y el comando nuevo selecciona el nuevo quoteId',()=>{
  const f=quoteFixture(),before=ownRequest(f),oldQuote=structuredClone(before.quote);
  const next=applyOperatorDelivery(f.mine,f.operator,f.buyer,{action:'delivery_quote',buyerId:f.buyer.id,deliveryId:before.id,jurisdiction:'DEMO_INTERNATIONAL',requestId:'delivery-ui-requote-01'},at);
  f.mine=next.mine;f.buyer.state=next.state;const after=ownRequest(f);
  assert.notEqual(after.quote.id,oldQuote.id);assert.deepEqual(before.quote,oldQuote);
  assert.equal(acceptDeliveryCommand(after,100000,after.quote.requirements,now).body.quoteId,after.quote.id);
});

test('transiciones operador requieren motivo y conservan strings durables sin saltar estados',()=>{
  const f=quoteFixture(),request=ownRequest(f);
  const reject=transitionDeliveryCommand(request,'REJECTED','Prueba ficticia');assert.equal(reject.action,'mine/delivery_transition');assert.equal(reject.body.buyerId,f.buyer.id);
  assert.throws(()=>transitionDeliveryCommand(request,'DELIVERED_DEMO','Prueba ficticia'),/transición/);
  assert.throws(()=>transitionDeliveryCommand({...request,status:'APPROVED'},'PREPARING','x'),/motivo/);
  assert.equal(nextDeliveryStatus('APPROVED'),'PREPARING');assert.equal(nextDeliveryStatus('PREPARING'),'DISPATCHED_DEMO');assert.equal(nextDeliveryStatus('DISPATCHED_DEMO'),'DELIVERED_DEMO');
  assert.equal(nextDeliveryStatus('DELIVERED_DEMO'),null);assert.equal(deliveryCanCancel('QUOTED'),true);assert.equal(deliveryCanCancel('APPROVED'),false);
});

test('configuración de política genera payload string compatible con API, incluidos ceros y coma decimal',()=>{
  const f=fixture(),policy=f.mine.delivery.jurisdictions[0],form=deliveryPolicyInitialForm(policy,24);
  Object.assign(form,{reason:'Configuración ficticia de prueba',service:' 0000000001,25 ',preparation:'0',transport:'10.50',taxPercent:'5,25',insurancePercent:'0',requirements:'Requisito ficticio uno\nRequisito ficticio dos'});
  const command=deliveryPolicyCommand(policy.id,form);assert.equal(Object.values(command.body).every(value=>typeof value==='string'),true);
  assert.equal(command.body.service,'1.25');assert.equal(command.body.preparation,'0');assert.equal(command.body.taxBps,'525');assert.equal(command.body.insuranceBps,'0');
  const result=applyOperatorDelivery(f.mine,f.operator,null,{action:'delivery_config',...command.body,requestId:'delivery-ui-config-001'},at);
  assert.equal(result.mine.delivery.jurisdictions[0].serviceMinor,125);assert.equal(result.mine.delivery.jurisdictions[0].taxBps,525);assert.equal(result.mine.delivery.policyVersion,2);
  assert.equal(parseDeliverySummary(deliveryView(result.mine,f.accounts,f.operator),true,f.operator.id).audit.length,1);
});

test('política rechaza porcentajes, importes, vigencia y requisitos fuera de límites',()=>{
  const f=fixture(),policy=f.mine.delivery.jurisdictions[0],base={...deliveryPolicyInitialForm(policy,24),reason:'Prueba ficticia'};
  for(const change of [{taxPercent:'100.01'},{insurancePercent:'1e2'},{service:'1000000.01'},{quoteValidityHours:'169'},{requirements:''},{requirements:'x'},{label:'ab'},{reason:'x'},{transport:'1.000,50'}])assert.throws(()=>deliveryPolicyCommand(policy.id,{...base,...change}));
  assert.throws(()=>deliveryPolicyCommand('REAL_COUNTRY',base));
});

test('parsers rechazan quote adulterada, identidad ajena, rol distinto y auditoría filtrada al comprador',()=>{
  const f=quoteFixture(),raw=deliveryView(f.mine,f.accounts,f.buyer);
  for(const mutate of [
    value=>{value.demoOnly=false;},value=>{value.view='operator';},value=>{value.requests[0].account.id=f.other.id;},
    value=>{value.requests[0].quote.totalMinor++;},value=>{value.requests[0].quote.taxMinor++;},value=>{value.requests[0].paidMinor=1;},
    value=>{value.policies.quoteValidityHours=0;},value=>{value.availableMg.XAU=-1;},value=>{value.requests[0].quote.requirements=[];},
    value=>{value.audit=[{id:'audit-one',at,actor:{id:f.operator.id,alias:f.operator.alias},jurisdiction:'DEMO_LOCAL',reason:'Prueba ficticia',policyVersion:1}];},
  ]){const changed=structuredClone(raw);mutate(changed);assert.throws(()=>parseDeliverySummary(changed,false,f.buyer.id));}
});

test('recorrido de entrega actualiza DTO y peso activo de custodia, conservando peso original',()=>{
  const f=quoteFixture();let request=ownRequest(f);
  const accepted=applyBuyerDelivery(f.mine,f.buyer,{action:'delivery_accept',deliveryId:request.id,quoteId:request.quote.id,requestId:'delivery-ui-accept-001'},at);f.mine=accepted.mine;f.buyer.state=accepted.state;
  for(const [index,status] of ['PREPARING','DISPATCHED_DEMO','DELIVERED_DEMO'].entries()){
    request=ownRequest(f);const command=transitionDeliveryCommand(request,status,'Paso ficticio de prueba');
    const advanced=applyOperatorDelivery(f.mine,f.operator,f.buyer,{action:'delivery_transition',...command.body,requestId:`delivery-ui-step-000${index}`},at);f.mine=advanced.mine;f.buyer.state=advanced.state;
  }
  const delivered=ownRequest(f);assert.equal(delivered.status,'DELIVERED_DEMO');assert.match(deliveryStatusLabel(delivered.status),/simulación/);
  assert.equal(f.buyer.state.holdingsMg.XAU,1500);
  const summary=parseCustodySummary(custodyView(f.mine,f.accounts,f.operator),true,f.operator.id),lot=summary.lots.find(entry=>entry.metal==='XAU');
  assert.equal(lot.originalWeightMg,200000);assert.equal(lot.weightMg,200000);assert.equal(lot.deliveredMg,500);assert.equal(lot.activeWeightMg,199500);
  assert.equal(lot.availableMg+lot.allocatedMg,lot.activeWeightMg);
  assert.equal(summary.totals.XAU.deliveredMg,500);assert.equal(summary.totals.XAU.activeWeightMg,199500);
});
