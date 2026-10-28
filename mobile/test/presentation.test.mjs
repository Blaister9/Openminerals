import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeDecimalInput,parsePositiveDecimal,summarizePortfolio,quoteBuy} from '../lib/presentation.ts';
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
