import test from 'node:test';
import assert from 'node:assert/strict';
import {seedState,applyCommand} from '../../api/src/domain.js';
import {seedMine} from '../../api/src/shared-mine.js';
import {ensureCustody} from '../../api/src/custody.js';
import {marketQuote,marketplaceCatalog,settleMarketplace} from '../../api/src/marketplace.js';
import {filterMarketplaceOffers,marketplaceBuyBlocked,marketplaceBuyCommand,marketplaceGrams,marketplaceMoney,parseMarketplaceCatalog,parseMarketplaceHistory,quoteMarketplace} from '../lib/marketplace.ts';
import {receiptSummary} from '../lib/receipt-presentation.ts';

function fixture(){
  let mine=seedMine();
  const buyer={id:'market-buyer-account-001',alias:'buyer_demo',role:'buyer',mineId:mine.id,state:seedState()};
  const seller={id:'market-seller-account-01',alias:'seller_demo',role:'buyer',mineId:mine.id,state:seedState()};
  seller.state.holdingsMg.XAU=1000;mine.inventoryMg.XAU-=1000;
  const accounts=[buyer,seller];mine=ensureCustody(mine,accounts,'2026-10-28T12:00:00Z').mine;
  seller.state=applyCommand(seller.state,{action:'offer',metal:'XAU',grams:'0.5',price:'145.00',requestId:'market-ui-offer-test-01'},'2026-10-28T12:05:00Z').state;
  return {mine,buyer,seller,accounts};
}

test('catálogo UI consume DTO real con precio por gramo, comisión al vendedor y total comprador',()=>{
  const f=fixture(),raw=marketplaceCatalog(f.mine,f.accounts,f.buyer),catalog=parseMarketplaceCatalog(raw,f.buyer.id);
  const [offer]=catalog.offers;
  assert.equal(offer.priceMinorPerGram,14500);assert.equal(offer.mg,500);
  assert.equal(offer.baseMinor,7250);assert.equal(offer.feeMinor,87);assert.equal(offer.sellerNetMinor,7163);
  assert.equal(offer.isOwn,false);assert.equal(offer.canBuy,true);
  assert.equal(marketplaceMoney(offer.baseMinor),'USDT 72,50');assert.equal(marketplaceGrams(offer.mg),'0,500 g');
  assert.equal(JSON.stringify(catalog).includes('walletMinor'),false);
});

test('cotización de presentación coincide con enteros y redondeo del API',()=>{
  for(const mg of [100,101,333,500,999,1000,1999])for(const price of [280,5200,5900,14500]){
    const actual=marketQuote(mg,price,120),expected=quoteMarketplace(mg,price,120);
    assert.deepEqual(expected,{baseMinor:actual.baseMinor,feeMinor:actual.feeMinor,sellerNetMinor:actual.sellerNetMinor});
  }
  for(const values of [[100,1,120],[99,14500,120],[500,14500,10000],[1000000000,10000000000,120],[NaN,14500,120]])assert.equal(quoteMarketplace(...values),null);
});

test('compra completa crea payload durable de strings y bloquea saldo insuficiente sin redondearlo',()=>{
  const f=fixture(),offer=parseMarketplaceCatalog(marketplaceCatalog(f.mine,f.accounts,f.buyer),f.buyer.id).offers[0];
  assert.match(marketplaceBuyBlocked(offer,f.buyer.id,7249),/saldo USDT/);
  assert.throws(()=>marketplaceBuyCommand(offer,f.buyer.id,7249),/saldo USDT/);
  assert.equal(marketplaceBuyBlocked(offer,f.buyer.id,7250),null);
  const command=marketplaceBuyCommand(offer,f.buyer.id,7250);
  assert.equal(command.action,'market_buy');assert.deepEqual(command.body,{sellerId:f.seller.id,offerId:offer.id});
  assert.equal(Object.values(command.body).every(value=>typeof value==='string'),true);
  assert.match(command.detail,/Total que pagas: USDT 72,50/);assert.match(command.detail,/USDT después de comprar: USDT 0,00/);
  assert.match(command.detail,/se descuenta al vendedor/);assert.match(command.detail,/USDT 71,63/);
});

test('oferta propia nunca se puede comprar, aunque se intente manipular el flag',()=>{
  const f=fixture(),catalog=parseMarketplaceCatalog(marketplaceCatalog(f.mine,f.accounts,f.seller),f.seller.id),offer=catalog.offers[0];
  assert.equal(offer.isOwn,true);assert.equal(offer.canBuy,false);assert.equal(offer.unavailableReason,'OWN_OFFER');
  assert.throws(()=>marketplaceBuyCommand(offer,f.seller.id,100000),/oferta es tuya/);
  assert.match(marketplaceBuyBlocked({...offer,isOwn:false,canBuy:true},f.seller.id,100000),/oferta es tuya/);
});

test('reservas anteriores sin precio siguen visibles y no se convierten en ofertas liquidables',()=>{
  const f=fixture();
  f.seller.state=applyCommand(f.seller.state,{action:'offer',metal:'XAU',grams:'0.1',requestId:'market-ui-legacy-offer'}).state;
  const catalog=parseMarketplaceCatalog(marketplaceCatalog(f.mine,f.accounts,f.buyer),f.buyer.id);
  const legacy=catalog.offers.find(offer=>offer.priceMinorPerGram===null);
  assert.ok(legacy);assert.equal(legacy.canBuy,false);assert.equal(legacy.baseMinor,null);
  assert.match(marketplaceBuyBlocked(legacy,f.buyer.id,100000),/sin precio/);
  assert.throws(()=>marketplaceBuyCommand(legacy,f.buyer.id,100000),/sin precio/);
  assert.equal(filterMarketplaceOffers(catalog.offers,'XAG').length,0);
  assert.equal(filterMarketplaceOffers(catalog.offers,'XAU').length,2);
});

test('catálogo adulterado no habilita compras ni presenta un importe distinto del servidor',()=>{
  const f=fixture(),raw=marketplaceCatalog(f.mine,f.accounts,f.buyer);
  for(const mutate of [
    value=>{value.demoOnly=false;},value=>{value.currency='USD';},value=>{value.offers[0].baseMinor++;},
    value=>{value.offers[0].sellerNetMinor++;},value=>{value.offers[0].isOwn=true;},
    value=>{value.offers[0].status='FILLED';},value=>{value.offers[0].canBuy=false;},
    value=>{value.offers[0].seller.id=f.buyer.id;},value=>{value.offers[0].feeBps=0;},
  ]){
    const changed=structuredClone(raw);mutate(changed);assert.throws(()=>parseMarketplaceCatalog(changed,f.buyer.id));
  }
});

test('historial UI muestra recibos de liquidación reales y omite snapshots privados',()=>{
  const f=fixture(),offer=f.seller.state.offers[0];
  const traded=settleMarketplace(f.mine,f.buyer,f.seller,{action:'market_buy',sellerId:f.seller.id,offerId:offer.id,requestId:'market-ui-buy-test-0001'},'2026-10-28T12:10:00Z');
  const unrelated=applyCommand(seedState(),{action:'deposit',currency:'USD',amount:'1',requestId:'market-ui-unrelated-01'}).receipt;
  const history=parseMarketplaceHistory({items:[traded.buyerReceipt,unrelated],total:75,nextCursor:'more-receipts',demoOnly:true});
  assert.equal(history.items.length,1);assert.equal(history.scannedCount,2);assert.equal(history.totalOperations,75);assert.equal(history.hasMore,true);
  const [receipt]=history.items;assert.equal(receipt.action,'market_buy');assert.equal(receipt.tradeId,traded.sellerReceipt.tradeId);
  assert.equal(receipt.counterparty.alias,'seller_demo');assert.equal('balancesAfter' in receipt,false);assert.equal('accountId' in receipt,false);
  assert.match(receiptSummary(receipt),/72,50/);
  const seller=parseMarketplaceHistory({items:[traded.sellerReceipt],total:1,nextCursor:null,demoOnly:true}).items[0];
  assert.equal(seller.outputMinor,7163);assert.match(receiptSummary(seller),/71,63/);
});

test('ofertas con id local igual pero distinto vendedor se conservan separadas',()=>{
  const f=fixture(),another={...f.buyer,state:structuredClone(f.seller.state)};
  const raw=marketplaceCatalog(f.mine,[another,f.seller],f.buyer),catalog=parseMarketplaceCatalog(raw,f.buyer.id);
  assert.equal(catalog.offers.length,2);assert.equal(catalog.offers[0].id,catalog.offers[1].id);
  assert.notEqual(catalog.offers[0].seller.id,catalog.offers[1].seller.id);
  raw.offers.push(structuredClone(raw.offers[0]));assert.throws(()=>parseMarketplaceCatalog(raw,f.buyer.id));
});

test('historial de marketplace rechaza metadatos incompletos sin exponer datos adicionales',()=>{
  const f=fixture(),raw={items:[f.seller.state.receipts['market-ui-offer-test-01']],total:1,nextCursor:null,demoOnly:true};
  assert.equal(parseMarketplaceHistory(raw).items[0].action,'offer');
  assert.throws(()=>parseMarketplaceHistory({...raw,demoOnly:false}));
  assert.throws(()=>parseMarketplaceHistory({...raw,total:0}));
  const changed=structuredClone(raw);changed.items[0].demoOnly=false;assert.throws(()=>parseMarketplaceHistory(changed));
});
