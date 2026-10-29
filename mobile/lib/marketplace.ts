import type {Receipt,ReceiptMetal} from './receipt-presentation';

export type MarketplaceQuote={baseMinor:number;feeMinor:number;sellerNetMinor:number};
export type MarketplaceOffer={
  id:string;seller:{id:string;alias:string};metal:ReceiptMetal;mg:number;status:'OPEN';createdAt:string;
  priceMinorPerGram:number|null;baseMinor:number|null;feeMinor:number|null;sellerNetMinor:number|null;feeBps:number;
  currency:'USDT';isOwn:boolean;canBuy:boolean;unavailableReason:'OWN_OFFER'|'LEGACY_NO_PRICE'|null;demoOnly:true;
};
export type MarketplaceCatalog={demoOnly:true;disclaimer:string;mine:{id:string;name:string};currency:'USDT';feeBps:number;offers:MarketplaceOffer[]};
export type MarketplaceHistory={items:Receipt[];scannedCount:number;totalOperations:number;hasMore:boolean};
export type MarketplaceFilter='ALL'|ReceiptMetal;
const metalNames:Record<ReceiptMetal,string>={XAU:'Oro',XAG:'Plata',XPT:'Platino',XPD:'Paladio'};
export const marketplaceMetals=Object.keys(metalNames) as ReceiptMetal[];
const MAX_MINOR=10_000_000_000;
const integer=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const error=()=>new Error('El marketplace demo devolvió datos incompletos. Actualiza el catálogo antes de comprar.');
const record=(value:unknown):Record<string,unknown>=>{
  if(!value||typeof value!=='object'||Array.isArray(value))throw error();
  return value as Record<string,unknown>;
};
const id=(value:unknown):string=>{
  if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(value))throw error();
  return value;
};
const text=(value:unknown,max=200):string=>{
  if(typeof value!=='string'||!value.trim()||value.length>max)throw error();
  return value;
};
const metal=(value:unknown):ReceiptMetal=>{
  if(typeof value!=='string'||!Object.hasOwn(metalNames,value))throw error();
  return value as ReceiptMetal;
};
const date=(value:unknown):string=>{
  if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw error();
  return value;
};
const number=(value:unknown,max=MAX_MINOR):number=>{
  if(!integer(value)||value>max)throw error();
  return value;
};
const ceilDiv=(value:bigint,by:bigint)=>(value+by-1n)/by;

/** Buyer pays the gross amount. The commission comes out of the seller's gross. */
export function quoteMarketplace(mg:number,priceMinorPerGram:number,feeBps:number):MarketplaceQuote|null {
  if(!integer(mg)||mg<100||mg>1_000_000_000||!integer(priceMinorPerGram)||priceMinorPerGram<=0||priceMinorPerGram>MAX_MINOR||!integer(feeBps)||feeBps>10000)return null;
  const base=ceilDiv(BigInt(mg)*BigInt(priceMinorPerGram),1000n);
  const fee=ceilDiv(base*BigInt(feeBps),10000n),net=base-fee;
  if(base>BigInt(MAX_MINOR)||net<=0n)return null;
  return {baseMinor:Number(base),feeMinor:Number(fee),sellerNetMinor:Number(net)};
}
export function parseMarketplaceCatalog(value:unknown,accountId:string):MarketplaceCatalog {
  const data=record(value),mine=record(data.mine),feeBps=number(data.feeBps,10000);
  if(data.demoOnly!==true||data.currency!=='USDT'||!Array.isArray(data.offers))throw error();
  const offers=data.offers.map(entry=>{
    const item=record(entry),seller=record(item.seller),sellerId=id(seller.id);
    const mg=number(item.mg,1_000_000_000),isOwn=sellerId===accountId;
    if(mg<100||item.demoOnly!==true||item.currency!=='USDT'||item.status!=='OPEN'||item.feeBps!==feeBps||item.isOwn!==isOwn||typeof item.canBuy!=='boolean'||![null,'OWN_OFFER','LEGACY_NO_PRICE'].some(reason=>reason===item.unavailableReason))throw error();
    const priceMinorPerGram=item.priceMinorPerGram===null?null:number(item.priceMinorPerGram);
    let quote:MarketplaceQuote|null=null;
    if(priceMinorPerGram!==null){
      quote=quoteMarketplace(mg,priceMinorPerGram,feeBps);
      if(!quote||item.baseMinor!==quote.baseMinor||item.feeMinor!==quote.feeMinor||item.sellerNetMinor!==quote.sellerNetMinor)throw error();
    }else if(item.baseMinor!==null||item.feeMinor!==null||item.sellerNetMinor!==null||item.canBuy||item.unavailableReason!=='LEGACY_NO_PRICE')throw error();
    if(item.canBuy&&(isOwn||priceMinorPerGram===null||item.unavailableReason!==null))throw error();
    if(isOwn&&item.canBuy)throw error();
    if(priceMinorPerGram!==null&&item.canBuy!==!isOwn)throw error();
    if(priceMinorPerGram!==null&&item.unavailableReason!==(isOwn?'OWN_OFFER':null))throw error();
    return {id:id(item.id),seller:{id:sellerId,alias:text(seller.alias,40)},metal:metal(item.metal),mg,status:'OPEN',createdAt:date(item.createdAt),
      priceMinorPerGram,baseMinor:quote?.baseMinor??null,feeMinor:quote?.feeMinor??null,sellerNetMinor:quote?.sellerNetMinor??null,feeBps,currency:'USDT',isOwn,
      canBuy:item.canBuy,unavailableReason:item.unavailableReason,demoOnly:true} as MarketplaceOffer;
  });
  if(new Set(offers.map(offer=>`${offer.seller.id}:${offer.id}`)).size!==offers.length)throw error();
  return {demoOnly:true,disclaimer:text(data.disclaimer,2000),mine:{id:id(mine.id),name:text(mine.name)},currency:'USDT',feeBps,offers};
}
export function marketplaceBuyBlocked(offer:MarketplaceOffer,accountId:string,usdtMinor:number):string|null {
  if(offer.seller.id===accountId||offer.isOwn)return 'Esta oferta es tuya. Puedes cancelarla para liberar los gramos.';
  if(offer.priceMinorPerGram===null||offer.unavailableReason==='LEGACY_NO_PRICE')return 'Reserva anterior sin precio. El vendedor debe cancelarla y publicar otra oferta con precio para poder comprarla.';
  if(offer.status!=='OPEN'||!offer.canBuy||offer.baseMinor===null)return 'Esta oferta no está disponible para comprar.';
  if(!integer(usdtMinor)||usdtMinor<offer.baseMinor)return 'Tu saldo USDT no alcanza para comprar la oferta completa.';
  return null;
}
export function marketplaceBuyCommand(offer:MarketplaceOffer,accountId:string,usdtMinor:number){
  const blocked=marketplaceBuyBlocked(offer,accountId,usdtMinor);if(blocked)throw new Error(blocked);
  return {action:'market_buy',body:{sellerId:offer.seller.id,offerId:offer.id},
    title:`Comprar oferta de ${metalNames[offer.metal].toLowerCase()}`,
    detail:`${marketplaceGrams(offer.mg)} de ${metalNames[offer.metal]}.\nVendedor demo: ${offer.seller.alias}.\nPrecio por gramo: ${marketplaceMoney(offer.priceMinorPerGram!)}.\nTotal que pagas: ${marketplaceMoney(offer.baseMinor!)}.\nUSDT después de comprar: ${marketplaceMoney(usdtMinor-offer.baseMinor!)}.\nLa comisión de ${marketplaceMoney(offer.feeMinor!)} se descuenta al vendedor; recibirá ${marketplaceMoney(offer.sellerNetMinor!)}.\nCompra completa, sin entrega ni fondos reales.`};
}
export function filterMarketplaceOffers(offers:MarketplaceOffer[],filter:MarketplaceFilter):MarketplaceOffer[]{return offers.filter(offer=>filter==='ALL'||offer.metal===filter);}

/** This is only the viewer's own recent history; private wallet snapshots are omitted. */
export function parseMarketplaceHistory(value:unknown):MarketplaceHistory {
  const page=record(value);
  if(page.demoOnly!==true||!Array.isArray(page.items)||!integer(page.total)||page.total<page.items.length||!(page.nextCursor===null||typeof page.nextCursor==='string'))throw error();
  const actions=new Set(['offer','cancel_offer','market_buy','market_sell']);
  const items=page.items.filter(entry=>actions.has(String(record(entry).action))).map(entry=>{
    const item=record(entry);
    if(item.demoOnly!==true||item.status!=='COMPLETED')throw error();
    const receipt:Receipt={id:id(item.id),action:String(item.action),status:'COMPLETED',at:date(item.at),demoOnly:true};
    if(item.metal!==undefined)receipt.metal=metal(item.metal);
    if(item.mg!==undefined)receipt.mg=number(item.mg,1_000_000_000);
    for(const key of ['baseMinor','feeMinor','totalMinor','outputMinor','priceCentsPerGram'] as const){if(item[key]!==undefined)receipt[key]=number(item[key]);}
    if(item.tradeId!==undefined)receipt.tradeId=id(item.tradeId);
    if(item.offerId!==undefined)receipt.offerId=id(item.offerId);
    if(item.counterparty!==undefined){const other=record(item.counterparty);receipt.counterparty={id:id(other.id),alias:text(other.alias,40)};}
    if(item.offer!==undefined){const offer=record(item.offer);receipt.offer={id:id(offer.id),metal:metal(offer.metal),mg:number(offer.mg,1_000_000_000),status:text(offer.status,40)};}
    return receipt;
  });
  return {items,scannedCount:page.items.length,totalOperations:page.total,hasMore:page.nextCursor!==null};
}
export function marketplaceMoney(minor:number):string{return `USDT ${(minor/100).toLocaleString('es-CO',{minimumFractionDigits:2,maximumFractionDigits:2})}`;}
export function marketplaceGrams(mg:number):string{return `${(mg/1000).toLocaleString('es-CO',{minimumFractionDigits:3,maximumFractionDigits:3})} g`;}
export function marketplaceMetalName(value:ReceiptMetal):string{return metalNames[value];}
