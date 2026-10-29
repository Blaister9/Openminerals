import test from 'node:test';
import assert from 'node:assert/strict';
import {seedState} from '../../api/src/domain.js';
import {seedMine,applyAccountCommand,applyStockCommand} from '../../api/src/shared-mine.js';
import {ensureCustody,allocateCustody,addStockLot} from '../../api/src/custody.js';
import {ensureDelivery,applyOperatorDelivery} from '../../api/src/delivery.js';
import {settleMarketplace} from '../../api/src/marketplace.js';
import {managementView,parseManagementQuery} from '../../api/src/management.js';
import {createManagementQuery,emptyManagementFilters,managementActionLabel,managementInventoryReconciled,managementStatusLabel,mergeManagementEvents,parseManagementSummary} from '../lib/management.ts';

const at='2026-10-28T12:00:00.000Z';
function fixture(){
  let mine=seedMine();
  const buyer={id:'account-management-buyer-001',alias:'buyer_demo',role:'buyer',mineId:mine.id,state:seedState()};
  const seller={id:'account-management-seller-01',alias:'seller_demo',role:'buyer',mineId:mine.id,state:seedState()};
  const operator={id:'account-management-operator',alias:'operator_demo',role:'operator',mineId:mine.id};
  seller.state.holdingsMg.XAU=2000;mine.inventoryMg.XAU-=2000;const accounts=[buyer,seller,operator];
  mine=ensureDelivery(ensureCustody(mine,accounts,at).mine).mine;
  const bought=applyAccountCommand(buyer.state,mine,{action:'buy',metal:'XAU',grams:'0.1',requestId:'management-ui-buy-0001'},{accountId:buyer.id});buyer.state=bought.state;mine=allocateCustody(bought.mine,buyer,'XAU',100,'management-ui-buy-0001',at).mine;
  const offered=applyAccountCommand(seller.state,mine,{action:'offer',metal:'XAU',grams:'0.5',price:'145.00',requestId:'management-ui-offer-01'},{accountId:seller.id});seller.state=offered.state;mine=offered.mine;
  const trade=settleMarketplace(mine,buyer,seller,{action:'market_buy',sellerId:seller.id,offerId:seller.state.offers[0].id,requestId:'management-ui-trade-01'},at);mine=trade.mine;buyer.state=trade.buyerState;seller.state=trade.sellerState;
  const stockCommand={metal:'XAG',grams:'1',reason:'Ingreso ficticio de prueba',requestId:'management-ui-stock-01'};
  const stock=applyStockCommand(mine,stockCommand,{accountId:operator.id,alias:operator.alias},at);mine=addStockLot(stock.mine,stockCommand,at).mine;
  const config={action:'delivery_config',jurisdiction:'DEMO_LOCAL',label:'Zona DEMO A',taxBps:'0',service:'2',preparation:'3',transport:'5',insuranceBps:'0',quoteValidityHours:'24',requirements:'Solo información ficticia',reason:'Prueba ficticia de configuración',requestId:'management-ui-config-01'};
  mine=applyOperatorDelivery(mine,operator,null,config,at).mine;
  return {mine,buyer,seller,operator,accounts};
}
function query(form=emptyManagementFilters(),before=null,limit=20){const result=createManagementQuery(form,before,limit);return {...result,server:parseManagementQuery(new URL(result.path,'https://demo.invalid').searchParams)};}

test('panel consume DTO real y distingue indicadores filtrados de inventario y compradores actuales',()=>{
  const f=fixture(),q=query(),raw=managementView(f.mine,f.accounts,f.operator,q.server),view=parseManagementSummary(raw,q.filters);
  assert.equal(view.kpisScope,'filtered_history');assert.equal(view.snapshotScope,'current_mine');assert.equal(view.buyers.length,2);
  assert.equal(view.kpis.directBuys,1);assert.equal(view.kpis.marketplaceTrades,1);assert.equal(view.kpis.marketplaceVolumeMinor,7250);
  assert.equal(view.kpis.tradingFeesMinor,102);assert.equal(view.kpis.stockEntries,1);assert.equal(view.kpis.stockMg,1000);assert.equal(view.kpis.policyChanges,1);
  assert.equal(view.history.total,6);assert.equal(view.history.items.length,6);
  assert.ok(view.history.items.some(event=>event.scope==='stock'&&event.ownerId==='mine'));
  assert.ok(view.history.items.some(event=>event.scope==='command'&&event.ownerId==='mine'));
  assert.ok(view.history.items.every(event=>event.receipt.operatorView));
  assert.equal(JSON.stringify(view).includes('walletMinor'),false);assert.equal(JSON.stringify(view).includes('balancesAfter'),false);
});

test('filtros de metal, tipo, estado y comprador afectan KPI e historial sin alterar la foto actual',()=>{
  const f=fixture(),all=parseManagementSummary(managementView(f.mine,f.accounts,f.operator));
  const q=query({...emptyManagementFilters(),metal:'XAU',action:'market_buy',status:'FILLED',buyer:f.buyer.id});
  const filtered=parseManagementSummary(managementView(f.mine,f.accounts,f.operator,q.server),q.filters);
  assert.equal(filtered.history.total,1);assert.equal(filtered.kpis.marketplaceTrades,1);assert.equal(filtered.kpis.marketplaceVolumeMinor,7250);
  assert.equal(filtered.history.items[0].buyer.id,f.buyer.id);assert.equal(filtered.history.items[0].status,'FILLED');
  assert.deepEqual(filtered.metals,all.metals);assert.deepEqual(filtered.buyers,all.buyers);assert.deepEqual(filtered.obligations,all.obligations);
});

test('paginación por cursor recorre todo el historial sin perder ni duplicar operaciones',()=>{
  const f=fixture();let before=null,events=[],total;
  do{
    const q=query(emptyManagementFilters(),before,2),page=parseManagementSummary(managementView(f.mine,f.accounts,f.operator,q.server),q.filters);
    total=page.history.total;events=mergeManagementEvents(events,page.history.items);before=page.history.nextCursor;
  }while(before);
  assert.equal(events.length,total);assert.equal(new Set(events.map(event=>event.id)).size,total);
  assert.equal(mergeManagementEvents(events,events).length,total);
  assert.ok(events.some(event=>event.action==='market_buy'));assert.ok(events.some(event=>event.action==='market_sell'));
});

test('fechas de Bogotá se convierten a límites UTC inclusivos compatibles con el servidor',()=>{
  const q=query({...emptyManagementFilters(),fromDate:'2026-10-28',toDate:'2026-10-28'});
  assert.equal(q.filters.from,'2026-10-28T05:00:00.000Z');assert.equal(q.filters.to,'2026-10-29T04:59:59.999Z');assert.deepEqual(q.server,q.filters);
  for(const change of [{fromDate:'2026-02-30'},{toDate:'28/10/2026'},{fromDate:'2026-10-29',toDate:'2026-10-28'},{buyer:'not-an-account'},{action:'deposit'}])assert.throws(()=>query({...emptyManagementFilters(),...change}));
  assert.throws(()=>query(emptyManagementFilters(),'not-a-cursor'));assert.throws(()=>query(emptyManagementFilters(),null,51));
});

test('parser rechaza respuestas de otro filtro o rutas ajenas antes de abrir comprobantes',()=>{
  const f=fixture(),q=query(),raw=managementView(f.mine,f.accounts,f.operator,q.server);
  assert.throws(()=>parseManagementSummary(raw,{...q.filters,metal:'XAG'}),/otro filtro/);
  for(const mutate of [
    value=>{value.demoOnly=false;},value=>{value.kpisScope='all_time';},value=>{value.history.items[0].receiptPath='https://example.test/private';},
    value=>{value.history.items[0].ownerId='another-owner';},value=>{value.history.items[0].receipt.action='deposit';},value=>{value.kpis.eventsMatched++;},
  ]){const changed=structuredClone(raw);mutate(changed);assert.throws(()=>parseManagementSummary(changed,q.filters));}
});

test('recibos y compradores retienen solo campos permitidos, incluso si llegan snapshots privados',()=>{
  const f=fixture(),raw=managementView(f.mine,f.accounts,f.operator);
  raw.history.items[0].receipt.balancesAfter=seedState();raw.history.items[0].receipt.adminToken='must-not-retain';raw.buyers[0].walletMinor={USDT:99999};
  const view=parseManagementSummary(raw);
  assert.equal(JSON.stringify(view).includes('walletMinor'),false);assert.equal(JSON.stringify(view).includes('must-not-retain'),false);
  const stock=view.history.items.find(event=>event.scope==='stock');assert.equal(stock.receipt.actor.alias,f.operator.alias);assert.equal(stock.receipt.inventoryAfterMg.XAG,f.mine.inventoryMg.XAG);
  const command=view.history.items.find(event=>event.scope==='command');assert.match(command.receiptPath,/kind=command/);assert.equal(command.receipt.reason,'Prueba ficticia de configuración');
});

test('conciliación distingue original, entregado y activo y no declara conciliado un valor contradictorio',()=>{
  const value={originalWeightMg:200000,deliveredMg:500,activeSupplyMg:199500,availableMg:198000,allocatedMg:1500,reservedMg:200,reconciled:true};
  assert.equal(managementInventoryReconciled(value),true);
  assert.equal(managementInventoryReconciled({...value,activeSupplyMg:200000}),false);
  assert.equal(managementInventoryReconciled({...value,reservedMg:1501}),false);
  assert.equal(managementInventoryReconciled({...value,reconciled:false}),false);
});

test('históricos acumulados admiten peso mayor al límite de un lote individual',()=>{
  const f=fixture(),raw=managementView(f.mine,f.accounts,f.operator);
  raw.metals.XAU={originalWeightMg:2000000000,deliveredMg:1000000000,activeSupplyMg:1000000000,availableMg:999998000,allocatedMg:2000,reservedMg:0,reconciled:true};
  const view=parseManagementSummary(raw);assert.equal(view.metals.XAU.originalWeightMg,2000000000);assert.equal(managementInventoryReconciled(view.metals.XAU),true);
});

test('etiquetas administrativas identifican las operaciones y estados ficticios',()=>{
  assert.equal(managementActionLabel('market_buy'),'Compra en marketplace');assert.equal(managementActionLabel('stock'),'Ingreso de metal');
  assert.equal(managementStatusLabel('DELIVERED_DEMO'),'Entregada DEMO');assert.equal(managementStatusLabel('FILLED'),'Oferta vendida');
});
