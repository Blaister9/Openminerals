import test from 'node:test';
import assert from 'node:assert/strict';
import {seedState,applyCommand} from '../src/domain.js';
import {seedMine,applyAccountCommand,applyStockCommand,importLegacyState,accountStateForMine,summarizeMine} from '../src/shared-mine.js';

const stock=mg=>{const m=seedMine();m.inventoryMg.XAU=mg;m.totalSupplyMg.XAU=mg;return m;};
const command=(action,grams,id)=>({action,metal:'XAU',grams,requestId:id});
const operator={accountId:'operator-unit',alias:'operador-prueba'};
const buyer=(id,state)=>({id,alias:id,role:'buyer',state});

test('dos compradores consumen el mismo inventario y una venta repone solo los gramos vendidos',()=>{
  let mine=stock(2000);
  let a=seedState(),b=seedState();
  let result=applyAccountCommand(a,mine,command('buy','0.500','mine-buy-a-half'),{accountId:'buyer-a'});
  a=result.state;mine=result.mine;
  result=applyAccountCommand(b,mine,command('buy','1.500','mine-buy-b-rest'),{accountId:'buyer-b'});
  b=result.state;mine=result.mine;
  assert.equal(mine.inventoryMg.XAU,0);
  assert.throws(()=>applyAccountCommand(b,mine,command('buy','0.100','mine-buy-no-stock'),{accountId:'buyer-b'}),{code:'INSUFFICIENT_INVENTORY'});
  result=applyAccountCommand(a,mine,command('sell','0.200','mine-sell-a-part'),{accountId:'buyer-a'});
  a=result.state;mine=result.mine;
  assert.equal(mine.inventoryMg.XAU,200);
  result=applyAccountCommand(b,mine,command('buy','0.100','mine-buy-released'),{accountId:'buyer-b'});
  b=result.state;mine=result.mine;
  const summary=summarizeMine(mine,[buyer('buyer-a',a),buyer('buyer-b',b)]);
  assert.equal(summary.inventoryMg.XAU,100);
  assert.equal(summary.allocatedMg.XAU,1900);
  assert.equal(summary.totalSupplyMg.XAU,2000);
  assert.equal(summary.accountCount,2);
  assert.equal(summary.transactionCount,4);
  assert.equal(summary.demoFeesCollectedMinor,341);
  assert.equal(summary.reconciled,true);
  assert.equal(summary.operations.length,4);
  for(const operation of summary.operations){
    assert.equal(operation.receipt.operatorView,true);
    assert.equal(operation.receipt.balancesAfter,undefined);
  }
  assert.ok(a.receipts['mine-buy-a-half'].balancesAfter.walletMinor);
});

test('idempotencia por cuenta permite claves iguales en dos compradores sin duplicar la misma compra',()=>{
  let mine=stock(1000);
  const cmd=command('buy','0.100','mine-shared-request-key');
  const a=applyAccountCommand(seedState(),mine,cmd,{accountId:'buyer-a'});mine=a.mine;
  const b=applyAccountCommand(seedState(),mine,cmd,{accountId:'buyer-b'});mine=b.mine;
  assert.equal(mine.inventoryMg.XAU,800);
  const replay=applyAccountCommand(a.state,mine,cmd,{accountId:'buyer-a'});
  assert.equal(replay.changed,false);
  assert.equal(replay.mine.inventoryMg.XAU,800);
  assert.equal(replay.receipt.replayed,true);
  assert.equal(replay.receipt.accountId,'buyer-a');
  assert.equal(summarizeMine(mine,[buyer('buyer-a',a.state),buyer('buyer-b',b.state)]).transactionCount,2);
});

test('el ingreso de metal mantiene snapshot e idempotencia sin alterar posiciones de compradores',()=>{
  const cmd={metal:'XAU',grams:'0.500',reason:'Ingreso ficticio de prueba',requestId:'mine-restock-unit'};
  const first=applyStockCommand(stock(1000),cmd,operator);
  const second=applyStockCommand(first.mine,{...cmd,grams:'0.100',requestId:'mine-restock-second'},operator);
  const replay=applyStockCommand(second.mine,cmd,operator);
  assert.equal(replay.changed,false);
  assert.equal(replay.mine.inventoryMg.XAU,1600);
  assert.equal(replay.receipt.inventoryAfterMg.XAU,1500);
  assert.equal(replay.receipt.totalSupplyAfterMg.XAU,1500);
  assert.equal(replay.receipt.replayed,true);
  assert.throws(()=>applyStockCommand(second.mine,cmd,{...operator,accountId:'other-operator'}),{code:'INVALID_OPERATION'});
  first.receipt.inventoryAfterMg.XAU=0;
  assert.equal(first.mine.stockReceipts[cmd.requestId].inventoryAfterMg.XAU,1500);
  const summary=summarizeMine(second.mine,[]);
  assert.equal(summary.totalSupplyMg.XAU,1600);
  assert.equal(summary.allocatedMg.XAU,0);
  assert.equal(summary.stockAdjustments.length,2);
});

test('vincular una sesión conserva saldos, reservas y recibos sin convertir compras anteriores en ventas de la mina',()=>{
  const legacy=applyCommand(seedState(),command('buy','0.500','legacy-buy-for-import')).state;
  const frozen=structuredClone(legacy);
  const imported=importLegacyState(legacy,stock(1000));
  assert.deepEqual(legacy,frozen);
  assert.equal(imported.mine.inventoryMg.XAU,500);
  assert.deepEqual(imported.state.walletMinor,legacy.walletMinor);
  assert.deepEqual(imported.state.receipts,legacy.receipts);
  assert.equal(summarizeMine(imported.mine,[buyer('buyer-a',imported.state)]).transactionCount,0);
  const newBuy=applyAccountCommand(imported.state,imported.mine,command('buy','0.100','mine-after-import'),{accountId:'buyer-a'});
  assert.equal(newBuy.receipt.mineId,imported.mine.id);
  assert.equal(newBuy.receipt.accountId,'buyer-a');
  assert.deepEqual(newBuy.state.receipts['legacy-buy-for-import'],legacy.receipts['legacy-buy-for-import']);
  assert.equal(summarizeMine(newBuy.mine,[buyer('buyer-a',newBuy.state)]).transactionCount,1);
  assert.throws(()=>importLegacyState(legacy,stock(100)),{code:'INSUFFICIENT_INVENTORY'});
  assert.deepEqual(legacy,frozen);
});

test('las reservas se muestran globalmente y no vuelven a descontar existencias comercializables',()=>{
  const bought=applyAccountCommand(seedState(),stock(3000),command('buy','1.000','mine-buy-reserve'),{accountId:'buyer-a'});
  const offered=applyAccountCommand(bought.state,bought.mine,command('offer','0.400','mine-offer-reserve'),{accountId:'buyer-a'});
  const delivery=applyAccountCommand(offered.state,offered.mine,command('delivery','0.300','mine-delivery-reserve'),{accountId:'buyer-a'});
  const summary=summarizeMine(delivery.mine,[buyer('buyer-a',delivery.state)]);
  assert.equal(summary.inventoryMg.XAU,2000);
  assert.equal(summary.allocatedMg.XAU,1000);
  assert.equal(summary.reservedMg.XAU,700);
  assert.equal(summary.offersOpen,1);
  assert.equal(summary.deliveriesPending,1);
  assert.throws(()=>applyAccountCommand(delivery.state,delivery.mine,command('sell','0.400','mine-oversell-reserve'),{accountId:'buyer-a'}),{code:'INSUFFICIENT_HOLDING'});
});

test('la vista de cuenta usa la política e inventario de mina y no comparte referencias mutables',()=>{
  const mine=stock(1000),state=seedState();
  state.inventoryMg.XAU=999999;
  const view=accountStateForMine(state,mine);
  assert.equal(view.inventoryMg.XAU,1000);
  view.inventoryMg.XAU=0;view.priceCentsPerGram.XAU=1;
  assert.equal(mine.inventoryMg.XAU,1000);
  assert.equal(mine.priceCentsPerGram.XAU,14500);
  const invalid=seedState();invalid.holdingsMg.XAU=1;
  assert.throws(()=>summarizeMine(mine,[buyer('buyer-a',invalid)]),{code:'INVALID_MINE_STATE'});
});

test('límite de suministro y validación del ingreso no permiten cantidades negativas o identidades peligrosas',()=>{
  const cmd={metal:'XAU',grams:'1000000.000',reason:'Ingreso ficticio máximo',requestId:'mine-stock-limit'};
  const full=applyStockCommand(stock(0),cmd,operator);
  assert.equal(full.mine.totalSupplyMg.XAU,1_000_000_000);
  assert.throws(()=>applyStockCommand(full.mine,{...cmd,grams:'0.100',requestId:'mine-stock-too-much'},operator),{code:'INVALID_OPERATION'});
  for(const patch of [{grams:'-1'},{metal:'constructor'},{reason:'  '},{requestId:'__proto__'}]){
    assert.throws(()=>applyStockCommand(stock(1000),{...cmd,...patch},operator));
  }
});
