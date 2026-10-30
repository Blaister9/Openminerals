import test from 'node:test';
import assert from 'node:assert/strict';
import {lotHistoryPath,lotMovementLabel,mergeLotHistory,parseLotHistory} from '../lib/custody-history.ts';

const eventId=n=>'lot-move-'+String(n).padStart(32,'0');
function fixture(){return {demoOnly:true,mine:{id:'mine-fixture',name:'Mina ficticia'},view:'buyer',lot:{id:'lot-fixture',metal:'XAU'},items:[{id:eventId(2),at:'2026-10-29T15:00:00Z',kind:'MARKET_TRANSFER',mg:500,account:{id:'buyer-own',alias:'comprador_demo'},direction:'IN',referenceId:'receipt-own'},{id:eventId(1),at:'2026-10-29T14:00:00Z',kind:'LOT_REGISTERED',mg:2000}],total:3,nextCursor:eventId(1),disclaimer:'Historial simulado sin custodia física',historyStartedAt:'2026-10-29T14:00:00Z',earlierHistoryUnavailable:true};}

test('historial por lote diferencia entrada y salida y conserva baseline explícito',()=>{
  const raw=fixture(),data=parseLotHistory(raw,'lot-fixture',false,'buyer-own');
  assert.equal(data.items[0].direction,'IN');assert.equal(data.earlierHistoryUnavailable,true);
  assert.equal(lotMovementLabel(data.items[0].kind,data.items[0].direction),'Entrada desde marketplace');
  assert.equal(lotMovementLabel('MARKET_TRANSFER','OUT'),'Salida por marketplace');
  assert.match(lotMovementLabel('OPENING_BALANCE'),/Peso original/);
  data.items[0].account.alias='changed';assert.equal(raw.items[0].account.alias,'comprador_demo');
});

test('comprador rechaza historia ajena incluso cuando el resto de la respuesta es válido',()=>{
  for(const change of [
    raw=>{raw.view='operator';},raw=>{raw.lot.id='other-lot';},raw=>{raw.items[0].account.id='other-buyer';},
    raw=>{raw.items[0].counterparty={id:'other-buyer',alias:'private_alias'};},raw=>{delete raw.items[0].direction;},
    raw=>{delete raw.items[0].account;},raw=>{raw.items[1].kind='SELL';},
  ]){const raw=fixture();change(raw);assert.throws(()=>parseLotHistory(raw,'lot-fixture',false,'buyer-own'));}
});

test('operador consulta vendedor y comprador sin incorporar campos privados no contratados',()=>{
  const raw=fixture();raw.view='operator';delete raw.items[0].direction;raw.items[0].counterparty={id:'buyer-second',alias:'segundo_demo'};
  raw.items[0].walletMinor={USDT:123};raw.items[0].token='private-canary';raw.adminToken='admin-canary';
  const data=parseLotHistory(raw,'lot-fixture',true,'operator-own');assert.equal(data.items[0].counterparty.id,'buyer-second');
  assert.doesNotMatch(JSON.stringify(data),/private-canary|admin-canary|walletMinor/);
  delete raw.items[0].counterparty;assert.throws(()=>parseLotHistory(raw,'lot-fixture',true,'operator-own'));
});

test('paginación y cantidades inválidas no se presentan como historia aceptada',()=>{
  for(const change of [
    raw=>{raw.items.push(raw.items[0]);},raw=>{raw.total=0;},raw=>{raw.nextCursor=eventId(99);},raw=>{raw.items=[];},
    raw=>{raw.items[0].mg=-1;},raw=>{raw.items[0].mg=0.5;},raw=>{raw.items[0].kind='UNKNOWN';},
    raw=>{raw.historyStartedAt='invalid';},raw=>{raw.earlierHistoryUnavailable=false;},raw=>{raw.demoOnly=false;},
  ]){const raw=fixture();change(raw);assert.throws(()=>parseLotHistory(raw,'lot-fixture',false,'buyer-own'));}
  const raw=fixture();raw.items=[];raw.total=0;raw.nextCursor=null;assert.deepEqual(parseLotHistory(raw,'lot-fixture',false,'buyer-own').items,[]);
});

test('rutas del historial rechazan enlaces, parámetros y cursores manipulados',()=>{
  assert.equal(lotHistoryPath('lot-fixture'),'/api/demo/custody/lots/lot-fixture/history?limit=20&includeReservations=1');
  assert.equal(lotHistoryPath('lot-fixture',eventId(1)).endsWith('before='+eventId(1)),true);
  for(const id of ['','../accounts/me','lot?token=private','https://example.test','a b','a'.repeat(129)])assert.throws(()=>lotHistoryPath(id));
  for(const cursor of ['x','../lot','lot-move-'+('A'.repeat(32)),eventId(1)+'&limit=50'])assert.throws(()=>lotHistoryPath('lot-fixture',cursor));
});

test('páginas solapadas conservan una sola copia de cada movimiento sin alterar las entradas',()=>{
  const first=fixture().items,last={...first[1],id:eventId(0)},next=[structuredClone(first[1]),last];
  const merged=mergeLotHistory(first,next);assert.deepEqual(merged.map(entry=>entry.id),[eventId(2),eventId(1),eventId(0)]);
  assert.equal(first.length,2);assert.equal(next.length,2);
});
