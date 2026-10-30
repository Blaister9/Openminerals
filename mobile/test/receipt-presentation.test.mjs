import test from 'node:test';
import assert from 'node:assert/strict';
import {receiptTitle,receiptSummary,receiptDetails,receiptUsesWallet} from '../lib/receipt-presentation.ts';
import {seedState,applyCommand} from '../../api/src/domain.js';
import {createStore} from '../../api/src/store.js';
import {seedMine} from '../../api/src/shared-mine.js';
import {ensureCustody} from '../../api/src/custody.js';
import {ensureDelivery,applyOperatorDelivery,applyBuyerDelivery} from '../../api/src/delivery.js';
import {settleMarketplace} from '../../api/src/marketplace.js';

const legacy={id:'legacy-receipt-01',action:'buy',status:'COMPLETED',at:'2026-10-28T12:00:00Z',demoOnly:true,
  metal:'XAU',mg:500,baseMinor:7250,feeMinor:73,totalMinor:7323};
const asMap=receipt=>Object.fromEntries(receiptDetails(receipt).map(row=>[row.label,row.value]));

test('vista del operador explica la privacidad y no presenta saldos del comprador',()=>{
  const receipt={...legacy,operatorView:true,balancesAfter:seedState()};
  const rows=asMap(receipt);
  assert.equal(rows['Total descontado'],'USDT 73,23');
  assert.equal(rows['Privacidad del comprador'],'Los saldos de su billetera no se comparten con el operador.');
  assert.equal(Object.keys(rows).some(key=>key.includes('después')||key==='Saldos posteriores'),false);
});

test('historial antiguo presenta los importes registrados sin inventar precio ni saldo',()=>{
  assert.equal(receiptTitle(legacy),'Compra de oro');
  assert.equal(receiptSummary(legacy),'−USDT 73,23 · 0,500 g');
  const rows=asMap(legacy);
  assert.equal(rows['Valor del metal'],'USDT 72,50');
  assert.equal(rows['Comisión simulada'],'USDT 0,73');
  assert.equal(rows['Total descontado'],'USDT 73,23');
  assert.equal(rows['Precio ficticio por gramo'],'No registrado en este comprobante anterior');
  assert.equal(rows['Saldos posteriores'],'No registrados en este comprobante anterior');
  assert.equal(Object.keys(rows).some(key=>key.startsWith('Saldo USDT después')),false);
});

test('comprobante nuevo conserva el saldo de su operación después de movimientos posteriores',()=>{
  const bought=applyCommand(seedState(),{action:'buy',metal:'XAU',grams:'0.5',requestId:'receipt-presentation-buy-half'});
  const receipt=bought.receipt;
  const before=receiptDetails(receipt);
  const sold=applyCommand(bought.state,{action:'sell',metal:'XAU',grams:'0.5',requestId:'receipt-presentation-sell-half'});
  assert.equal(sold.state.walletMinor.USDT,24840);
  assert.deepEqual(receiptDetails(receipt),before);
  const rows=asMap(receipt);
  assert.equal(rows['Saldo USDT después'],'USDT 176,77');
  assert.equal(rows['Oro total después'],'0,500 g');
  assert.equal(rows['Oro disponible después'],'0,500 g');
  assert.equal(rows['Precio ficticio por gramo'],'USDT 145,00/g');
});

test('resumen de conversión muestra débito y crédito en sus monedas originales',()=>{
  const receipt={id:'convert-presentation-01',action:'convert',status:'COMPLETED',at:'2026-10-28T12:00:00Z',demoOnly:true,
    from:'COP',to:'USD',amountMinor:12345,outputMinor:3,rateDemo:250,feeMinor:0};
  assert.equal(receiptTitle(receipt),'Conversión COP → USD');
  assert.equal(receiptSummary(receipt),'COP 123,45 → USD 0,03');
  const rows=asMap(receipt);
  assert.equal(rows['Importe descontado'],'COP 123,45');
  assert.equal(rows['Importe recibido'],'USD 0,03');
  assert.equal(rows['Tasa fija ficticia'],'1 COP = 0,00025 USD');
  assert.equal(rows['Comisión simulada'],'COP 0,00');
  const legacyRows=asMap({...receipt,feeMinor:undefined});
  assert.equal(legacyRows['Comisión simulada'],'No registrado en este comprobante anterior');
});

test('venta presenta su neto y una reserva usa cantidades sin aparentar un cobro',()=>{
  assert.equal(receiptSummary({...legacy,action:'sell',outputMinor:7163,totalMinor:undefined} ),'+USDT 71,63 · 0,500 g');
  const offer={id:'offer-receipt-01',action:'offer',status:'COMPLETED',at:'2026-10-28T12:00:00Z',demoOnly:true,
    offer:{id:'offer-2',metal:'XAU',mg:500,status:'OPEN'}};
  assert.equal(receiptSummary(offer),'0,500 g reservados');
  assert.equal(asMap(offer)['Cantidad'],'0,500 g');
  assert.equal(asMap(offer)['Oferta'],'offer-2');
  assert.equal(receiptSummary({...offer,action:'delivery',delivery:offer.offer}),'0,500 g · pendiente de cotización');
  assert.equal(receiptSummary({id:'cancel-legacy-01',action:'cancel_offer',status:'COMPLETED',at:'2026-10-28',demoOnly:true,offerId:'offer-2'}),'Reserva liberada');
});

test('snapshot parcial o inconsistente no fabrica una posición disponible',()=>{
  const rows=asMap({...legacy,balancesAfter:{walletMinor:{USDT:17677},holdingsMg:{XAU:500},reservedMg:{XAU:700}}});
  assert.equal(rows['Oro total después'],'0,500 g');
  assert.equal(rows['Oro reservado después'],'0,700 g');
  assert.equal(rows['Oro disponible después'],'No registrado en este comprobante anterior');
});

function mineFixture(){
  let mine=seedMine();
  const buyer={id:'receipt-ui-buyer-account',alias:'buyer_demo',role:'buyer',mineId:mine.id,state:seedState()};
  const seller={id:'receipt-ui-seller-account',alias:'seller_demo',role:'buyer',mineId:mine.id,state:seedState()};
  const operator={id:'receipt-ui-operator-account',alias:'operator_demo',role:'operator',mineId:mine.id};
  seller.state.holdingsMg.XAU=1000;mine.inventoryMg.XAU-=1000;
  const accounts=[buyer,seller,operator];mine=ensureDelivery(ensureCustody(mine,accounts,'2026-10-28T12:00:00.000Z').mine).mine;
  return {mine,buyer,seller,operator,accounts};
}

test('stock presenta lote e inventario histórico sin inventar una billetera de operador',async()=>{
  const store=await createStore('');try{
    const mine=await store.createMine({name:'Mina DEMO comprobante stock'}),operator=await store.createAccount({alias:'receipt_stock_operator',role:'operator',password:'Exclusive-receipt-demo-password-123',mineId:mine.id});
    const first=await store.mutateStock(operator.id,{metal:'XAU',grams:'1',reason:'Ingreso exclusivamente ficticio',requestId:'receipt-stock-snapshot-01'}),receipt=first.receipt;
    const before=receiptDetails(receipt),rows=asMap({...receipt,balancesAfter:seedState()});
    assert.equal(receiptTitle(receipt),'Ingreso ficticio de oro');assert.equal(receiptSummary(receipt),'+1,000 g · inventario DEMO');
    assert.equal(rows['Lote DEMO creado'],receipt.lotId);assert.equal(rows['Disponible en mina después'],'1,000 g');assert.equal(rows['Suministro activo después'],'1,000 g');
    assert.equal(receiptUsesWallet(receipt),false);assert.equal(Object.keys(rows).some(key=>key.startsWith('Saldo ')||key==='Saldos posteriores'),false);
    await store.mutateStock(operator.id,{metal:'XAU',grams:'1',reason:'Segundo ingreso ficticio',requestId:'receipt-stock-snapshot-02'});assert.deepEqual(receiptDetails(receipt),before);
    assert.equal(asMap({...receipt,lotId:undefined})['Lote DEMO creado'],'No registrado en este comprobante anterior');
  }finally{await store.close();}
});

test('marketplace separa el pago comprador, la comisión vendedor y su neto registrado',()=>{
  const f=mineFixture();f.seller.state=applyCommand(f.seller.state,{action:'offer',metal:'XAU',grams:'0.5',price:'145',requestId:'receipt-market-offer-01'}).state;
  const result=settleMarketplace(f.mine,f.buyer,f.seller,{action:'market_buy',sellerId:f.seller.id,offerId:f.seller.state.offers[0].id,requestId:'receipt-market-trade-01'});
  const buyer=asMap(result.buyerReceipt),seller=asMap(result.sellerReceipt);
  assert.equal(buyer['Total descontado'],'USDT 72,50');assert.equal(buyer['Comisión a cargo del comprador'],'USDT 0,00');assert.equal(buyer['Comisión descontada al vendedor'],'USDT 0,87');assert.equal(buyer['Neto registrado para el vendedor'],'USDT 71,63');
  assert.equal(seller['Comisión descontada al vendedor'],'USDT 0,87');assert.equal(seller['Neto recibido'],'USDT 71,63');
  assert.equal(buyer['Liquidación DEMO'],seller['Liquidación DEMO']);assert.ok(buyer['Certificados DEMO verificables en Custodia']);
  assert.equal(receiptUsesWallet(result.buyerReceipt),true);assert.equal(receiptUsesWallet({...result.buyerReceipt,operatorView:true}),false);
});

test('configuración presenta su política y motivo históricos sin saldos de comprador',()=>{
  const f=mineFixture(),command={action:'delivery_config',jurisdiction:'DEMO_LOCAL',label:'Jurisdicción ficticia de prueba',taxBps:'500',service:'2',preparation:'3',transport:'5',insuranceBps:'50',quoteValidityHours:'48',requirements:'Primer requisito ficticio\nSegundo requisito ficticio',reason:'Cambio exclusivamente ilustrativo',requestId:'receipt-policy-config-01'};
  const configured=applyOperatorDelivery(f.mine,f.operator,null,command),receipt=configured.receipt,rows=asMap({...receipt,balancesAfter:seedState()});
  assert.equal(rows['Jurisdicción ficticia configurada'],command.label);assert.equal(rows['Versión de política registrada'],'2');assert.equal(rows['Motivo registrado'],command.reason);
  assert.equal(rows['Tasa de impuesto configurada DEMO'],'5% DEMO');assert.equal(rows['Tasa de seguro configurada DEMO'],'0,5% DEMO');assert.equal(rows['Vigencia de nuevas propuestas'],'48 horas');
  assert.equal(rows['Requisitos ficticios configurados'],command.requirements);assert.match(receiptSummary(receipt),/Política DEMO v2/);assert.equal(receiptUsesWallet(receipt),false);
  assert.equal(Object.keys(rows).some(key=>key.startsWith('Saldo ')||key==='Saldos posteriores'),false);
  applyOperatorDelivery(configured.mine,f.operator,null,{...command,service:'9',requestId:'receipt-policy-config-02'});assert.equal(asMap(receipt)['Servicio configurado DEMO'],'USDT 2,00');
});

test('cotización y aceptación muestran costes, requisitos y versión del snapshot',()=>{
  const f=mineFixture();f.seller.state=applyCommand(f.seller.state,{action:'delivery',metal:'XAU',grams:'0.2',jurisdiction:'DEMO_REGIONAL',requestId:'receipt-delivery-request'}).state;
  const id=f.seller.state.custodyRequests[0].id,quoted=applyOperatorDelivery(f.mine,f.operator,f.seller,{action:'delivery_quote',buyerId:f.seller.id,deliveryId:id,jurisdiction:'DEMO_REGIONAL',requestId:'receipt-delivery-quote'});
  f.mine=quoted.mine;f.seller.state=quoted.state;const rows=asMap({...quoted.receipt,operatorView:true});
  assert.equal(rows['Estado de entrega simulada'],'Cotización disponible');assert.equal(rows['Versión de política usada'],'1');assert.equal(rows['Tasa de impuesto ficticio'],'5% DEMO');
  assert.equal(rows['Requisitos ficticios de esta cotización'],quoted.receipt.quote.requirements.join('\n'));assert.ok(rows['Subtotal de costes DEMO']);assert.ok(!Object.keys(rows).some(key=>key.startsWith('Saldo ')));
  const accepted=applyBuyerDelivery(f.mine,f.seller,{action:'delivery_accept',deliveryId:id,quoteId:quoted.receipt.quote.id,requestId:'receipt-delivery-accept'});
  assert.equal(asMap(accepted.receipt)['Costes demo pagados'],rows['Total de costes de entrega']);assert.equal(asMap(accepted.receipt)['Estado de entrega simulada'],'Aceptada y pagada en demo');assert.equal(receiptUsesWallet(accepted.receipt),true);
});

test('entrega final presenta estado legible y gramos retirados por lote sin un envío real',()=>{
  const f=mineFixture();f.seller.state=applyCommand(f.seller.state,{action:'delivery',metal:'XAU',grams:'0.2',requestId:'receipt-delivery-full'}).state;
  const id=f.seller.state.custodyRequests[0].id;let result=applyOperatorDelivery(f.mine,f.operator,f.seller,{action:'delivery_quote',buyerId:f.seller.id,deliveryId:id,jurisdiction:'DEMO_LOCAL',requestId:'receipt-full-quote-01'});f.mine=result.mine;f.seller.state=result.state;
  const accepted=applyBuyerDelivery(f.mine,f.seller,{action:'delivery_accept',deliveryId:id,quoteId:result.receipt.quote.id,requestId:'receipt-full-accept-01'});f.mine=accepted.mine;f.seller.state=accepted.state;
  for(const [index,status] of ['PREPARING','DISPATCHED_DEMO','DELIVERED_DEMO'].entries()){result=applyOperatorDelivery(f.mine,f.operator,f.seller,{action:'delivery_transition',buyerId:f.seller.id,deliveryId:id,status,reason:'Avance exclusivamente ficticio',requestId:`receipt-full-advance-${index}`});f.mine=result.mine;f.seller.state=result.state;}
  assert.equal(receiptTitle(result.receipt),'Entrega demo: entregada en la simulación');assert.match(receiptSummary(result.receipt),/0,200 g · Entregada en la simulación/);
  const rows=asMap({...result.receipt,operatorView:true});assert.match(rows['Gramos retirados de lotes en la simulación'],/lot-.*: 0,200 g/);assert.equal(rows['Estado de entrega simulada'],'Entregada en la simulación');
});

test('oferta publicada conserva su precio y las reservas antiguas no inventan uno',()=>{
  const f=mineFixture(),priced=applyCommand(f.seller.state,{action:'offer',metal:'XAU',grams:'0.5',price:'145',requestId:'receipt-priced-offer'}).receipt;
  assert.equal(asMap(priced)['Precio publicado por gramo'],'USDT 145,00/g');assert.match(receiptSummary(priced),/USDT 145,00\/g/);
  const old=structuredClone(priced);delete old.offer.priceMinorPerGram;assert.equal(asMap(old)['Precio publicado por gramo'],'Reserva anterior sin precio de marketplace');assert.equal(receiptSummary(old),'0,500 g reservados');
});
