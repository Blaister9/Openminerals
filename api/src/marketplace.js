import {createHash} from 'node:crypto';
import {DomainError,availableHoldingMg,METALS} from './domain.js';
import {accountError} from './account-auth.js';
import {transferCustody} from './custody.js';

export const MARKETPLACE_DISCLAIMER='MERCADO SIMULADO · Ofertas, USDT, metales y comisiones ficticios. La liquidación DEMO no representa pagos, transmisión de propiedad ni custodia física.';
const MAX_MINOR=10_000_000_000,copy=value=>structuredClone(value);
const fail=(condition,message,code='INVALID_OPERATION')=>{if(!condition)throw new DomainError(message,code);};
const signature=command=>JSON.stringify(Object.keys(command).filter(key=>key!=='requestId').sort().map(key=>[key,command[key]]));
const digest=(...parts)=>createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0,32);
const ceil=(numerator,denominator)=>Number((numerator+denominator-1n)/denominator);
function validateKey(command){
  fail(typeof command.requestId==='string'&&/^[A-Za-z0-9_-]{8,100}$/.test(command.requestId)&&!['__proto__','constructor','prototype'].includes(command.requestId),'Identificador de operación inválido');
}
export function marketQuote(mg,priceMinorPerGram,feeBps){
  fail(Number.isSafeInteger(mg)&&mg>=100&&mg<=1_000_000_000&&Number.isSafeInteger(priceMinorPerGram)&&priceMinorPerGram>0&&priceMinorPerGram<=MAX_MINOR,'Cantidad o precio de oferta inválido');
  fail(Number.isSafeInteger(feeBps)&&feeBps>=0&&feeBps<10000,'Comisión de mercado DEMO inválida');
  const baseMinor=ceil(BigInt(mg)*BigInt(priceMinorPerGram),1000n);
  fail(Number.isSafeInteger(baseMinor)&&baseMinor<=MAX_MINOR,'Importe de oferta fuera de límites');
  const feeMinor=ceil(BigInt(baseMinor)*BigInt(feeBps),10000n),sellerNetMinor=baseMinor-feeMinor;
  fail(sellerNetMinor>0,'La oferta no alcanza el importe mínimo después de comisión');
  return {baseMinor,feeMinor,sellerNetMinor,feeBps};
}
export function marketplaceCatalog(mine,accounts,viewer){
  const offers=accounts.filter(account=>account.role==='buyer').flatMap(seller=>seller.state.offers.filter(offer=>offer.status==='OPEN').map(offer=>{
    const priced=Number.isSafeInteger(offer.priceMinorPerGram)&&offer.priceMinorPerGram>0,isOwn=seller.id===viewer.id;
    const quote=priced?marketQuote(offer.mg,offer.priceMinorPerGram,mine.feesBps.sell):{baseMinor:null,feeMinor:null,sellerNetMinor:null,feeBps:mine.feesBps.sell};
    return {id:offer.id,seller:{id:seller.id,alias:seller.alias},metal:offer.metal,mg:offer.mg,status:'OPEN',createdAt:offer.createdAt,priceMinorPerGram:priced?offer.priceMinorPerGram:null,
      ...quote,currency:'USDT',isOwn,canBuy:priced&&!isOwn,unavailableReason:!priced?'LEGACY_NO_PRICE':isOwn?'OWN_OFFER':null,demoOnly:true};
  })).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)||a.seller.id.localeCompare(b.seller.id)||a.id.localeCompare(b.id));
  return {demoOnly:true,disclaimer:MARKETPLACE_DISCLAIMER,mine:{id:mine.id,name:mine.name},currency:'USDT',feeBps:mine.feesBps.sell,offers};
}
export function marketReplay(state,command){
  validateKey(command);
  if(!Object.hasOwn(state.receipts,command.requestId))return null;
  fail(state.signatures?.[command.requestId]===signature(command),'Identificador reutilizado con otros parámetros');
  return {...copy(state.receipts[command.requestId]),replayed:true};
}
function balances(state){
  return {walletMinor:{...state.walletMinor},holdingsMg:{...state.holdingsMg},reservedMg:Object.fromEntries(Object.keys(METALS).map(metal=>[metal,state.holdingsMg[metal]-availableHoldingMg(state,metal)]))};
}
function movement(state,type,label,details,at){state.movements.unshift({id:`mov-${state.sequence++}`,type,label,...details,at});state.movements=state.movements.slice(0,100);}

export function settleMarketplace(mine,buyer,seller,command,now=new Date().toISOString()){
  validateKey(command);
  if(buyer.role!=='buyer'||seller.role!=='buyer')throw accountError(403,'Solo compradores pueden operar en el mercado DEMO.','FORBIDDEN');
  fail(buyer.id!==seller.id,'No puedes comprar tu propia oferta','OWN_OFFER');
  if(buyer.mineId!==mine.id||seller.mineId!==mine.id)throw accountError(404,'Oferta no disponible en esta mina.');
  const original=seller.state.offers.find(offer=>offer.id===command.offerId);
  fail(original&&original.status==='OPEN','La oferta ya no está abierta','OFFER_UNAVAILABLE');
  fail(Number.isSafeInteger(original.priceMinorPerGram)&&original.priceMinorPerGram>0,'La oferta anterior no tiene precio y no se puede liquidar','LEGACY_NO_PRICE');
  const quote=marketQuote(original.mg,original.priceMinorPerGram,mine.feesBps.sell);
  fail(buyer.state.walletMinor.USDT>=quote.baseMinor,'USDT insuficiente','INSUFFICIENT_BALANCE');
  fail(seller.state.walletMinor.USDT+quote.sellerNetMinor<=MAX_MINOR,'Saldo de destino fuera de límites');
  const buyerState=copy(buyer.state),sellerState=copy(seller.state),tradeId=`trade-${digest(buyer.id,command.requestId)}`;
  const offer=sellerState.offers.find(item=>item.id===original.id);
  offer.status='FILLED';offer.filledAt=now;offer.tradeId=tradeId;offer.buyerId=buyer.id;
  sellerState.holdingsMg[offer.metal]-=offer.mg;buyerState.holdingsMg[offer.metal]+=offer.mg;
  fail(availableHoldingMg(sellerState,offer.metal)>=0,'La oferta excede los gramos reservados disponibles','INSUFFICIENT_HOLDING');
  buyerState.walletMinor.USDT-=quote.baseMinor;sellerState.walletMinor.USDT+=quote.sellerNetMinor;
  const transfer=transferCustody(mine,seller.id,buyer,offer.metal,offer.mg,`market:${tradeId}`,now);
  const common={tradeId,offerId:offer.id,status:'COMPLETED',at:now,demoOnly:true,metal:offer.metal,mg:offer.mg,priceCentsPerGram:offer.priceMinorPerGram,priceMinorPerGram:offer.priceMinorPerGram,
    baseMinor:quote.baseMinor,marketplaceFeeMinor:quote.feeMinor,sellerNetMinor:quote.sellerNetMinor,feeBps:quote.feeBps,currency:'USDT',mineId:mine.id,receiptVersion:2};
  const buyerReceipt={...common,id:command.requestId,action:'market_buy',accountId:buyer.id,totalMinor:quote.baseMinor,feeMinor:0,counterparty:{id:seller.id,alias:seller.alias},certificateIds:transfer.allocations.map(item=>item.certificateId),label:`Compra de oferta DEMO de ${METALS[offer.metal].name}`};
  const sellerReceipt={...common,id:`market-sell-${digest(tradeId)}`,action:'market_sell',accountId:seller.id,feeMinor:quote.feeMinor,outputMinor:quote.sellerNetMinor,counterparty:{id:buyer.id,alias:buyer.alias},label:`Venta de oferta DEMO de ${METALS[offer.metal].name}`};
  fail(!Object.hasOwn(sellerState.receipts,sellerReceipt.id),'El identificador de liquidación DEMO ya existe');
  movement(buyerState,'MARKET_BUY',buyerReceipt.label,{metal:offer.metal,mg:offer.mg,totalMinor:quote.baseMinor,feeMinor:0,tradeId,offerId:offer.id},now);
  movement(sellerState,'MARKET_SELL',sellerReceipt.label,{metal:offer.metal,mg:offer.mg,outputMinor:quote.sellerNetMinor,feeMinor:quote.feeMinor,tradeId,offerId:offer.id},now);
  buyerReceipt.balancesAfter=balances(buyerState);sellerReceipt.balancesAfter=balances(sellerState);
  buyerState.receipts[command.requestId]=copy(buyerReceipt);buyerState.signatures[command.requestId]=signature(command);
  sellerState.receipts[sellerReceipt.id]=copy(sellerReceipt);sellerState.signatures[sellerReceipt.id]=JSON.stringify([['action','market_sell'],['tradeId',tradeId]]);
  return {mine:transfer.mine,buyerState,sellerState,buyerReceipt,sellerReceipt};
}
