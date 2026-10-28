import test from 'node:test';
import assert from 'node:assert/strict';
import {receiptTitle,receiptSummary,receiptDetails} from '../lib/receipt-presentation.ts';
import {seedState,applyCommand} from '../../api/src/domain.js';

const legacy={id:'legacy-receipt-01',action:'buy',status:'COMPLETED',at:'2026-10-28T12:00:00Z',demoOnly:true,
  metal:'XAU',mg:500,baseMinor:7250,feeMinor:73,totalMinor:7323};
const asMap=receipt=>Object.fromEntries(receiptDetails(receipt).map(row=>[row.label,row.value]));

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
