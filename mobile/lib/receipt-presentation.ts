import {deliveryStatuses,deliveryStatusLabel,type DeliveryPolicy,type DeliveryQuote,type DeliveryStatus} from './delivery.ts';
export type ReceiptCurrency='COP'|'EUR'|'USD'|'USDT';
export type ReceiptMetal='XAU'|'XAG'|'XPT'|'XPD';
type Reservation={id:string;metal:ReceiptMetal;mg:number;status:string;createdAt?:string;priceMinorPerGram?:number};
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
  priceMinorPerGram?:number;
  baseMinor?:number;
  feeMinor?:number;
  totalMinor?:number;
  marketplaceFeeMinor?:number;
  sellerNetMinor?:number;
  feeBps?:number;
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
  lotId?:string;
  inventoryAfterMg?:Record<ReceiptMetal,number>;
  totalSupplyAfterMg?:Record<ReceiptMetal,number>;
  deliveredLots?:{lotId:string;mg:number}[];
  jurisdiction?:string;
  policy?:DeliveryPolicy;
  policyVersion?:number;
  quoteValidityHours?:number;
  requirementsAcknowledged?:boolean;
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
const deliveryState=(value:string)=>deliveryStatuses.some(status=>status===value)?deliveryStatusLabel(value as DeliveryStatus):value;
const jurisdictionNames:Record<string,string>={DEMO_LOCAL:'Jurisdicción DEMO A',DEMO_REGIONAL:'Jurisdicción DEMO B',DEMO_INTERNATIONAL:'Jurisdicción DEMO C'};
const percent=(bps:number)=>`${(bps/100).toLocaleString('es-CO',{maximumFractionDigits:2})}% DEMO`;
export function receiptUsesWallet(receipt:Receipt):boolean{return !receipt.operatorView&&!['stock','delivery_config'].includes(receipt.action);}

export function receiptTitle(receipt:Receipt):string {
  if(receipt.action==='delivery_transition'&&receipt.deliveryStatus)return `Entrega demo: ${deliveryState(receipt.deliveryStatus).toLowerCase()}`;
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
    case 'stock':return name?`Ingreso ficticio de ${name}`:'Ingreso ficticio de metal';
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
    case 'offer':return quantity?`${quantity} reservados${amountRecorded(receipt.offer?.priceMinorPerGram)&&receipt.offer!.priceMinorPerGram!>0?` · ${money(receipt.offer!.priceMinorPerGram!)}/g`:''}`:'Reserva registrada';
    case 'cancel_offer':
    case 'cancel_delivery':return quantity?`${quantity} liberados`:'Reserva liberada';
    case 'delivery':return quantity?`${quantity} · pendiente de cotización`:'Pendiente de cotización';
    case 'delivery_accept':return amountRecorded(receipt.totalMinor)?`−${money(receipt.totalMinor)} · costes DEMO`:quantity||'Cotización aceptada';
    case 'delivery_quote':return `${quantity?`${quantity} · `:''}${amountRecorded(receipt.quote?.totalMinor)?`${money(receipt.quote!.totalMinor)} de costes DEMO`:'Propuesta DEMO registrada'}`;
    case 'delivery_transition':return `${quantity?`${quantity} · `:''}${receipt.deliveryStatus?deliveryState(receipt.deliveryStatus):'Avance DEMO registrado'}`;
    case 'delivery_reject':return quantity?`${quantity} liberados · rechazada`:'Entrega demo rechazada';
    case 'delivery_config':return `Política DEMO${amountRecorded(receipt.policyVersion)?` v${receipt.policyVersion}`:''}${receipt.policy?.label?` · ${receipt.policy.label}`:''}`;
    case 'stock':return quantity?`+${quantity} · inventario DEMO`:'Ingreso de metal DEMO';
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
    const price=receipt.priceCentsPerGram??receipt.priceMinorPerGram;
    rows.push({label:'Precio ficticio por gramo',value:amountRecorded(price)?`${money(price)}/g`:missing});
    rows.push({label:'Valor del metal',value:amountRecorded(receipt.baseMinor)?money(receipt.baseMinor):missing});
    if(receipt.action.startsWith('market_')){
      if(receipt.action==='market_buy')rows.push({label:'Comisión a cargo del comprador',value:amountRecorded(receipt.feeMinor)?money(receipt.feeMinor):missing});
      const sellerFee=receipt.marketplaceFeeMinor??(receipt.action==='market_sell'?receipt.feeMinor:undefined);
      rows.push({label:'Comisión descontada al vendedor',value:amountRecorded(sellerFee)?money(sellerFee):missing});
      if(receipt.action==='market_buy')rows.push({label:'Neto registrado para el vendedor',value:amountRecorded(receipt.sellerNetMinor)?money(receipt.sellerNetMinor):missing});
    }else rows.push({label:'Comisión simulada',value:amountRecorded(receipt.feeMinor)?money(receipt.feeMinor):missing});
    if(receipt.action==='buy'||receipt.action==='market_buy')rows.push({label:'Total descontado',value:amountRecorded(receipt.totalMinor)?money(receipt.totalMinor):missing});
    else rows.push({label:'Neto recibido',value:amountRecorded(receipt.outputMinor)?money(receipt.outputMinor):missing});
  }else if(receipt.action==='convert'){
    rows.push({label:'Importe descontado',value:amountRecorded(receipt.amountMinor)&&receipt.from?money(receipt.amountMinor,receipt.from):missing});
    rows.push({label:'Importe recibido',value:amountRecorded(receipt.outputMinor)&&receipt.to?money(receipt.outputMinor,receipt.to):missing});
    if(amountRecorded(receipt.rateDemo)&&receipt.from&&receipt.to)rows.push({label:'Tasa fija ficticia',value:`1 ${receipt.from} = ${(receipt.rateDemo/1_000_000).toLocaleString('es-CO',{maximumFractionDigits:6})} ${receipt.to}`});
    rows.push({label:'Comisión simulada',value:amountRecorded(receipt.feeMinor)&&receipt.from?money(receipt.feeMinor,receipt.from):missing});
  }else if(receipt.action==='deposit'||receipt.action==='withdraw'){
    rows.push({label:receipt.action==='deposit'?'Importe ingresado':'Importe retirado',value:amountRecorded(receipt.amountMinor)&&receipt.currency?money(receipt.amountMinor,receipt.currency):missing});
  }else if(receipt.action==='stock'){
    const available=metal?receipt.inventoryAfterMg?.[metal]:undefined,supply=metal?receipt.totalSupplyAfterMg?.[metal]:undefined;
    rows.push({label:'Disponible en mina después',value:amountRecorded(available)?grams(available):missing});
    rows.push({label:'Suministro activo después',value:amountRecorded(supply)?grams(supply):missing});
    rows.push({label:'Lote DEMO creado',value:receipt.lotId??missing});
  }else if(receipt.action==='delivery_accept'){
    rows.push({label:'Costes demo pagados',value:amountRecorded(receipt.totalMinor)?money(receipt.totalMinor):missing});
  }
  if(receipt.action==='offer')rows.push({label:'Precio publicado por gramo',value:amountRecorded(receipt.offer?.priceMinorPerGram)&&receipt.offer!.priceMinorPerGram!>0?`${money(receipt.offer!.priceMinorPerGram!)}/g`:'Reserva anterior sin precio de marketplace'});
  if(receipt.offerId||receipt.offer?.id)rows.push({label:'Oferta',value:receipt.offerId??receipt.offer!.id});
  if(receipt.tradeId)rows.push({label:'Liquidación DEMO',value:receipt.tradeId});
  if(receipt.counterparty)rows.push({label:'Contraparte ficticia',value:receipt.counterparty.alias});
  if(receipt.certificateIds?.length)rows.push({label:'Certificados DEMO verificables en Custodia',value:receipt.certificateIds.join('\n')});
  if(receipt.deliveryId||receipt.delivery?.id)rows.push({label:'Solicitud de cotización',value:receipt.deliveryId??receipt.delivery!.id});
  if(receipt.deliveryStatus)rows.push({label:'Estado de entrega simulada',value:deliveryState(receipt.deliveryStatus)});
  if(receipt.actor)rows.push({label:'Responsable de la operación',value:receipt.actor.alias});
  if(receipt.reason)rows.push({label:'Motivo registrado',value:receipt.reason});
  if(receipt.deliveredLots?.length)rows.push({label:'Gramos retirados de lotes en la simulación',value:receipt.deliveredLots.map(lot=>`${lot.lotId}: ${amountRecorded(lot.mg)?grams(lot.mg):missing}`).join('\n')});
  if(receipt.quote){
    const quote=receipt.quote;
    rows.push({label:'Cotización DEMO',value:quote.id},{label:'Escenario ficticio',value:quote.jurisdiction.label});
    for(const [label,value] of [['Servicio',quote.serviceMinor],['Fabricación o preparación',quote.preparationMinor],['Transporte',quote.transportMinor],['Seguro',quote.insuranceMinor],['Subtotal de costes DEMO',quote.subtotalMinor],['Impuesto configurable DEMO',quote.taxMinor],['Total de costes de entrega',quote.totalMinor]] as const){
      rows.push({label,value:amountRecorded(value)?money(value):missing});
    }
    if(amountRecorded(quote.insuranceBps))rows.push({label:'Tasa de seguro ficticio',value:percent(quote.insuranceBps)});
    if(amountRecorded(quote.taxBps))rows.push({label:'Tasa de impuesto ficticio',value:percent(quote.taxBps)});
    rows.push({label:'Requisitos ficticios de esta cotización',value:quote.requirements?.length?quote.requirements.join('\n'):missing});
    if(amountRecorded(quote.policyVersion))rows.push({label:'Versión de política usada',value:String(quote.policyVersion)});
    rows.push({label:'Validez de la propuesta',value:new Date(quote.expiresAt).toLocaleString('es-CO')});
  }
  if(receipt.action==='delivery_config'){
    const policy=receipt.policy;
    rows.push({label:'Jurisdicción ficticia configurada',value:policy?.label??(receipt.jurisdiction?jurisdictionNames[receipt.jurisdiction]??receipt.jurisdiction:missing)});
    rows.push({label:'Versión de política registrada',value:amountRecorded(receipt.policyVersion)?String(receipt.policyVersion):missing});
    if(policy){
      for(const [label,value] of [['Servicio configurado DEMO',policy.serviceMinor],['Preparación configurada DEMO',policy.preparationMinor],['Transporte configurado DEMO',policy.transportMinor]] as const)rows.push({label,value:amountRecorded(value)?money(value):missing});
      rows.push({label:'Tasa de seguro configurada DEMO',value:amountRecorded(policy.insuranceBps)?percent(policy.insuranceBps):missing});
      rows.push({label:'Tasa de impuesto configurada DEMO',value:amountRecorded(policy.taxBps)?percent(policy.taxBps):missing});
      rows.push({label:'Requisitos ficticios configurados',value:policy.requirements?.length?policy.requirements.join('\n'):missing});
    }
    rows.push({label:'Vigencia de nuevas propuestas',value:amountRecorded(receipt.quoteValidityHours)?`${receipt.quoteValidityHours} horas`:missing});
  }

  if(!receiptUsesWallet(receipt)){
    rows.push(receipt.operatorView?{label:'Privacidad del comprador',value:'Los saldos de su billetera no se comparten con el operador.'}:{label:'Alcance del registro',value:'Este comprobante de mina no utiliza una billetera de comprador.'});
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
