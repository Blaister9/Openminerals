import type {DeliveryQuote} from './delivery';
export type ReceiptCurrency='COP'|'EUR'|'USD'|'USDT';
export type ReceiptMetal='XAU'|'XAG'|'XPT'|'XPD';
type Reservation={id:string;metal:ReceiptMetal;mg:number;status:string;createdAt?:string};
export type Receipt={
  id:string;
  action:string;
  status:string;
  at:string;
  demoOnly:boolean;
  receiptVersion?:number;
  label?:string;
  replayed?:boolean;
  operatorView?:boolean;
  metal?:ReceiptMetal;
  mg?:number;
  currency?:ReceiptCurrency;
  from?:ReceiptCurrency;
  to?:ReceiptCurrency;
  amountMinor?:number;
  outputMinor?:number;
  rateDemo?:number;
  priceCentsPerGram?:number;
  baseMinor?:number;
  feeMinor?:number;
  totalMinor?:number;
  offer?:Reservation;
  offerId?:string;
  tradeId?:string;
  counterparty?:{id:string;alias:string};
  certificateIds?:string[];
  delivery?:Reservation;
  deliveryId?:string;
  quote?:DeliveryQuote;
  deliveryStatus?:string;
  paidMinor?:number;
  actor?:{id:string;alias:string};
  reason?:string;
  balancesAfter?:{
    walletMinor:Record<ReceiptCurrency,number>;
    holdingsMg:Record<ReceiptMetal,number>;
    reservedMg:Record<ReceiptMetal,number>;
  };
};
export type ReceiptHistoryPage={items:Receipt[];nextCursor:string|null;total:number;demoOnly:boolean};
export type ReceiptDetail={label:string;value:string};

const metals:Record<ReceiptMetal,string>={XAU:'Oro',XAG:'Plata',XPT:'Platino',XPD:'Paladio'};
const amountRecorded=(value:unknown):value is number=>typeof value==='number'&&Number.isSafeInteger(value)&&value>=0;
const money=(minor:number,currency:string='USDT')=>`${currency} ${(minor/100).toLocaleString('es-CO',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const grams=(mg:number)=>`${(mg/1000).toLocaleString('es-CO',{minimumFractionDigits:3,maximumFractionDigits:3})} g`;
const missing='No registrado en este comprobante anterior';
const receiptMetal=(receipt:Receipt)=>receipt.metal??receipt.offer?.metal??receipt.delivery?.metal;
const receiptMg=(receipt:Receipt)=>receipt.mg??receipt.offer?.mg??receipt.delivery?.mg;

export function receiptTitle(receipt:Receipt):string {
  if(receipt.label)return receipt.label;
  const metal=receiptMetal(receipt);
  const name=metal?metals[metal]?.toLowerCase():undefined;
  switch(receipt.action){
    case 'buy':return name?`Compra de ${name}`:'Compra de metal';
    case 'sell':return name?`Venta de ${name}`:'Venta de metal';
    case 'market_buy':return 'Compra en marketplace DEMO';
    case 'market_sell':return 'Venta en marketplace DEMO';
    case 'convert':return receipt.from&&receipt.to?`Conversión ${receipt.from} → ${receipt.to}`:'Conversión';
    case 'deposit':return 'Ingreso simulado';
    case 'withdraw':return 'Retiro simulado';
    case 'offer':return 'Oferta publicada';
    case 'cancel_offer':return 'Oferta cancelada';
    case 'delivery':return 'Cotización de entrega solicitada';
    case 'cancel_delivery':return 'Solicitud de entrega cancelada';
    case 'delivery_accept':return 'Cotización DEMO aceptada';
    case 'delivery_reject':return 'Cotización DEMO rechazada';
    case 'delivery_quote':return 'Cotización de entrega DEMO';
    case 'delivery_transition':return 'Avance de entrega simulada';
    case 'delivery_config':return 'Política de entrega DEMO actualizada';
    default:return 'Operación simulada';
  }
}

/** The compact amount comes from this receipt, never from the current wallet. */
export function receiptSummary(receipt:Receipt):string {
  const mg=receiptMg(receipt);
  const quantity=amountRecorded(mg)?grams(mg):'';
  switch(receipt.action){
    case 'buy':case 'market_buy':return amountRecorded(receipt.totalMinor)?`−${money(receipt.totalMinor)}${quantity?` · ${quantity}`:''}`:quantity||'Importe no registrado';
    case 'sell':case 'market_sell':return amountRecorded(receipt.outputMinor)?`+${money(receipt.outputMinor)}${quantity?` · ${quantity}`:''}`:quantity||'Importe no registrado';
    case 'convert':return amountRecorded(receipt.amountMinor)&&amountRecorded(receipt.outputMinor)&&receipt.from&&receipt.to?
      `${money(receipt.amountMinor,receipt.from)} → ${money(receipt.outputMinor,receipt.to)}`:'Importes no registrados';
    case 'deposit':
    case 'withdraw':return amountRecorded(receipt.amountMinor)&&receipt.currency?
      `${receipt.action==='deposit'?'+':'−'}${money(receipt.amountMinor,receipt.currency)}`:'Importe no registrado';
    case 'offer':return quantity?`${quantity} reservados`:'Reserva registrada';
    case 'cancel_offer':
    case 'cancel_delivery':return quantity?`${quantity} liberados`:'Reserva liberada';
    case 'delivery':return quantity?`${quantity} · pendiente de cotización`:'Pendiente de cotización';
    case 'delivery_accept':return amountRecorded(receipt.totalMinor)?`−${money(receipt.totalMinor)} · costes DEMO`:quantity||'Cotización aceptada';
    case 'delivery_quote':case 'delivery_transition':case 'delivery_reject':return quantity||'Entrega simulada registrada';
    default:return quantity||'Ver comprobante';
  }
}

/** Operation fields and historical balances only; the view owns ID/date/status. */
export function receiptDetails(receipt:Receipt):ReceiptDetail[] {
  const rows:ReceiptDetail[]=[];
  const metal=receiptMetal(receipt);
  const mg=receiptMg(receipt);
  if(metal)rows.push({label:'Metal',value:metals[metal]??metal});
  if(amountRecorded(mg))rows.push({label:'Cantidad',value:grams(mg)});
  if(['buy','sell','market_buy','market_sell'].includes(receipt.action)){
    rows.push({label:'Precio ficticio por gramo',value:amountRecorded(receipt.priceCentsPerGram)?`${money(receipt.priceCentsPerGram)}/g`:missing});
    rows.push({label:'Valor del metal',value:amountRecorded(receipt.baseMinor)?money(receipt.baseMinor):missing});
    rows.push({label:'Comisión simulada',value:amountRecorded(receipt.feeMinor)?money(receipt.feeMinor):missing});
    if(receipt.action==='buy'||receipt.action==='market_buy')rows.push({label:'Total descontado',value:amountRecorded(receipt.totalMinor)?money(receipt.totalMinor):missing});
    else rows.push({label:'Neto recibido',value:amountRecorded(receipt.outputMinor)?money(receipt.outputMinor):missing});
  }else if(receipt.action==='convert'){
    rows.push({label:'Importe descontado',value:amountRecorded(receipt.amountMinor)&&receipt.from?money(receipt.amountMinor,receipt.from):missing});
    rows.push({label:'Importe recibido',value:amountRecorded(receipt.outputMinor)&&receipt.to?money(receipt.outputMinor,receipt.to):missing});
    if(amountRecorded(receipt.rateDemo)&&receipt.from&&receipt.to)rows.push({label:'Tasa fija ficticia',value:`1 ${receipt.from} = ${(receipt.rateDemo/1_000_000).toLocaleString('es-CO',{maximumFractionDigits:6})} ${receipt.to}`});
    rows.push({label:'Comisión simulada',value:amountRecorded(receipt.feeMinor)&&receipt.from?money(receipt.feeMinor,receipt.from):missing});
  }else if(receipt.action==='deposit'||receipt.action==='withdraw'){
    rows.push({label:receipt.action==='deposit'?'Importe ingresado':'Importe retirado',value:amountRecorded(receipt.amountMinor)&&receipt.currency?money(receipt.amountMinor,receipt.currency):missing});
  }
  if(receipt.offerId||receipt.offer?.id)rows.push({label:'Oferta',value:receipt.offerId??receipt.offer!.id});
  if(receipt.tradeId)rows.push({label:'Liquidación DEMO',value:receipt.tradeId});
  if(receipt.counterparty)rows.push({label:'Contraparte ficticia',value:receipt.counterparty.alias});
  if(receipt.certificateIds?.length)rows.push({label:'Certificados DEMO verificables en Custodia',value:receipt.certificateIds.join('\n')});
  if(receipt.deliveryId||receipt.delivery?.id)rows.push({label:'Solicitud de cotización',value:receipt.deliveryId??receipt.delivery!.id});
  if(receipt.deliveryStatus)rows.push({label:'Estado de entrega simulada',value:receipt.deliveryStatus});
  if(receipt.actor)rows.push({label:'Responsable de la operación',value:receipt.actor.alias});
  if(receipt.reason)rows.push({label:'Motivo registrado',value:receipt.reason});
  if(receipt.quote){
    const quote=receipt.quote;
    rows.push({label:'Cotización DEMO',value:quote.id},{label:'Escenario ficticio',value:quote.jurisdiction.label});
    for(const [label,value] of [['Servicio',quote.serviceMinor],['Fabricación o preparación',quote.preparationMinor],['Transporte',quote.transportMinor],['Seguro',quote.insuranceMinor],['Impuesto configurable DEMO',quote.taxMinor],['Total de costes de entrega',quote.totalMinor]] as const){
      rows.push({label,value:amountRecorded(value)?money(value):missing});
    }
    rows.push({label:'Validez de la propuesta',value:new Date(quote.expiresAt).toLocaleString('es-CO')});
  }

  if(receipt.operatorView){
    rows.push({label:'Privacidad del comprador',value:'Los saldos de su billetera no se comparten con el operador.'});
    return rows;
  }
  const snapshot=receipt.balancesAfter;
  if(!snapshot){
    rows.push({label:'Saldos posteriores',value:'No registrados en este comprobante anterior'});
    return rows;
  }
  const currencies:ReceiptCurrency[]=receipt.action==='convert'&&receipt.from&&receipt.to?[receipt.from,receipt.to]:
    receipt.currency?[receipt.currency]:['USDT'];
  for(const currency of new Set(currencies)){
    const value=snapshot.walletMinor?.[currency];
    rows.push({label:`Saldo ${currency} después`,value:amountRecorded(value)?money(value,currency):missing});
  }
  if(metal){
    const total=snapshot.holdingsMg?.[metal];
    const reserved=snapshot.reservedMg?.[metal];
    const name=metals[metal]??metal;
    rows.push({label:`${name} total después`,value:amountRecorded(total)?grams(total):missing});
    rows.push({label:`${name} reservado después`,value:amountRecorded(reserved)?grams(reserved):missing});
    rows.push({label:`${name} disponible después`,value:amountRecorded(total)&&amountRecorded(reserved)&&total>=reserved?grams(total-reserved):missing});
  }
  return rows;
}
