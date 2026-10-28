import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDecimalInput,parsePositiveDecimal,summarizePortfolio,quoteBuy,quoteSell,quoteConversion} from '../lib/presentation.ts';
import {seedState,applyCommand} from '../../api/src/domain.js';

test('Inicio distingue cero metales del saldo USDT y no suma USD/COP/EUR',()=>{
  assert.deepEqual(summarizePortfolio(seedState()),{
    metalsValueMinor:0,usdtAvailableMinor:25000,totalUsdtAndMetalsMinor:25000,
  });
});

test('conversión USD 200 acredita USDT disponible aunque los metales sigan en cero',()=>{
  const {state}=applyCommand(seedState(),{
    action:'convert',from:'USD',to:'USDT',amount:'200.00',requestId:'presentation-convert-200',
  });
  assert.equal(state.walletMinor.USD,40000);
  assert.deepEqual(summarizePortfolio(state),{
    metalsValueMinor:0,usdtAvailableMinor:45000,totalUsdtAndMetalsMinor:45000,
  });
});

test('compra 0.5 g: coste 73.23 USDT y valoración 72.50 son conceptos distintos',()=>{
  const quote=quoteBuy('0.5',14500,100);
  assert.equal(quote.totalMinor,7323);
  assert.equal(quote.baseMinor,7250);
  assert.equal(quote.feeMinor,73);
  const bought=applyCommand(seedState(),{
    action:'buy',metal:'XAU',grams:quote.normalizedGrams,requestId:'presentation-buy-half-gram',
  });
  assert.equal(bought.receipt.totalMinor,quote.totalMinor);
  assert.deepEqual(summarizePortfolio(bought.state),{
    metalsValueMinor:7250,usdtAvailableMinor:17677,totalUsdtAndMetalsMinor:24927,
  });
});

test('coma decimal y espacios se normalizan sin cambiar los gramos',()=>{
  assert.equal(normalizeDecimalInput(' 0,5 '),'0.5');
  assert.equal(parsePositiveDecimal('0,5',3),0.5);
  assert.equal(quoteBuy('0,5',14500).milligrams,500);
  assert.equal(quoteBuy('0.500',14500).totalMinor,quoteBuy('0,5',14500).totalMinor);
  assert.equal(parsePositiveDecimal(' 200,00 ',2),200);
});

test('1050 sigue significando 1050 g; no se inventa un separador decimal',()=>{
  assert.equal(normalizeDecimalInput('1050'),'1050');
  assert.equal(parsePositiveDecimal('1050',3),1050);
  assert.equal(quoteBuy('1050',14500).milligrams,1050000);
  assert.equal(quoteBuy('1050',14500).totalMinor,15377250);
  assert.equal(quoteBuy('1.050',14500).milligrams,1050);
});

test('formatos mixtos, exponentes y exceso de decimales son inválidos',()=>{
  for(const value of ['1.050,5','1,050.5','1,0,5','1 050','1e3','0x10','Infinity','NaN','-1','+1','','.5','5.']){
    assert.equal(parsePositiveDecimal(value,3),null,value);
    assert.equal(quoteBuy(value,14500),null,value);
  }
  assert.equal(parsePositiveDecimal('1.001',2),null);
  assert.equal(parsePositiveDecimal('1,001',2),null);
  assert.equal(parsePositiveDecimal('0.5000',3),null);
  assert.equal(parsePositiveDecimal('0.000',3),null);
  assert.equal(quoteBuy('0.099',14500),null);
  assert.equal(quoteBuy('1000000.001',14500),null);
});

test('la estimación redondea base y comisión por separado igual que el servidor',()=>{
  for(const grams of ['0.100','0.101','0.500','1.050','2.000']){
    const quote=quoteBuy(grams,280,100);
    const bought=applyCommand(seedState(),{
      action:'buy',metal:'XAG',grams,requestId:`presentation-quote-${grams.replace('.','-')}`,
    });
    assert.equal(quote.baseMinor,bought.receipt.baseMinor);
    assert.equal(quote.feeMinor,bought.receipt.feeMinor);
    assert.equal(quote.totalMinor,bought.receipt.totalMinor);
  }
  assert.equal(quoteBuy('0.101',280).totalMinor,30);
  assert.equal(quoteBuy('0.500',14500,0).totalMinor,7250);
  assert.equal(quoteBuy('0.500',NaN),null);
  assert.equal(quoteBuy('0.500',14500,-1),null);
});

test('venta de 0,5 g presenta 72,50 de metal, 0,87 de comisión y 71,63 netos',()=>{
  const quote=quoteSell('0,5',14500,120);
  assert.deepEqual(quote,{
    grams:0.5,milligrams:500,normalizedGrams:'0.5',baseMinor:7250,feeMinor:87,outputMinor:7163,
  });
});

test('ventas de los cuatro metales redondean igual que la API, incluidos céntimos',()=>{
  for(const metal of ['XAU','XAG','XPT','XPD']){
    for(const grams of ['0.100','0.101','0.333','0.500','1.050','2.000']){
      const state=seedState();
      state.holdingsMg[metal]=2000;
      const quote=quoteSell(grams,state.priceCentsPerGram[metal],state.feesBps.sell);
      const sold=applyCommand(state,{action:'sell',metal,grams,requestId:`presentation-sell-${metal}-${grams.replace('.','-')}`});
      assert.equal(quote.baseMinor,sold.receipt.baseMinor);
      assert.equal(quote.feeMinor,sold.receipt.feeMinor);
      assert.equal(quote.outputMinor,sold.receipt.outputMinor);
      assert.equal(sold.state.walletMinor.USDT-state.walletMinor.USDT,quote.outputMinor);
    }
  }
});

test('venta rechaza entradas inválidas, neto cero e importes imposibles',()=>{
  for(const grams of ['','0.099','0','-1','0.0001','1.0,5','1e3','1000000.001'])assert.equal(quoteSell(grams,14500),null,grams);
  for(const fee of [-1,10001,NaN,Infinity,1.1])assert.equal(quoteSell('0.5',14500,fee),null,String(fee));
  assert.equal(quoteSell('0.5',14500,10000),null);
  assert.equal(quoteSell('0.1',1,120),null);
  assert.equal(quoteSell('0.5',NaN),null);
  assert.equal(quoteSell('1000000',20000,120),null);
});

test('conversión presenta el resultado de los doce pares igual que el servidor',()=>{
  const seed=seedState();
  for(const from of ['COP','EUR','USD','USDT']){
    for(const to of ['COP','EUR','USD','USDT']){
      if(from===to)continue;
      const quote=quoteConversion('123,45',from,to,seed.demoRates);
      const converted=applyCommand(seed,{action:'convert',from,to,amount:'123.45',requestId:`presentation-rate-${from}-${to}`});
      assert.equal(quote.normalizedAmount,'123.45');
      assert.equal(quote.amountMinor,converted.receipt.amountMinor);
      assert.equal(quote.outputMinor,converted.receipt.outputMinor);
      assert.equal(quote.rateDemo,converted.receipt.rateDemo);
      assert.equal(quote.feeMinor,0);
    }
  }
});

test('conversión rechaza salida cero, pares/tasas inválidos y formatos ambiguos',()=>{
  const rates=seedState().demoRates;
  assert.equal(quoteConversion('0.01','COP','USDT',rates),null);
  assert.equal(quoteConversion('20','USD','USD',rates),null);
  assert.equal(quoteConversion('20','BTC','USD',rates),null);
  assert.equal(quoteConversion('20','USD','BTC',rates),null);
  for(const value of ['','0','-1','1.001','1,001','1.050,5','1e3','NaN','Infinity','100000000.01'])assert.equal(quoteConversion(value,'USD','USDT',rates),null,value);
  for(const rate of [0,-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER+1])assert.equal(quoteConversion('20','USD','USDT',{USD:{USDT:rate}}),null,String(rate));
  assert.equal(quoteConversion('20','USD','USDT',{}),null);
});

test('conversión conserva enteros grandes y el límite monetario de la API',()=>{
  const state=seedState();
  state.walletMinor.USD=10_000_000_000;
  state.walletMinor.USDT=0;
  const quote=quoteConversion('100000000.00','USD','USDT',state.demoRates);
  assert.equal(quote.amountMinor,10_000_000_000);
  assert.equal(quote.outputMinor,10_000_000_000);
  const converted=applyCommand(state,{action:'convert',from:'USD',to:'USDT',amount:quote.normalizedAmount,requestId:'presentation-max-conversion'});
  assert.equal(converted.state.walletMinor.USDT,quote.outputMinor);
  assert.equal(quoteConversion('100000000.00','USD','COP',state.demoRates),null);
});
