// Openminerals: motor DEMO. No hay servicios financieros ni metal real.
// Saldos en centésimas; cantidades de metal en miligramos.
export const METALS = {
  XAU: { name: 'Oro', symbol: 'Au', quoteCentsPerGram: 14500, inventoryMg: 200000 },
  XAG: { name: 'Plata', symbol: 'Ag', quoteCentsPerGram: 280, inventoryMg: 1500000 },
  XPT: { name: 'Platino', symbol: 'Pt', quoteCentsPerGram: 5900, inventoryMg: 350000 },
  XPD: { name: 'Paladio', symbol: 'Pd', quoteCentsPerGram: 5200, inventoryMg: 280000 },
};
export const CURRENCIES = ['COP', 'EUR', 'USD', 'USDT'];
export const ACTIVE_DELIVERY_STATUSES=['PENDING_QUOTE','QUOTED','APPROVED','PREPARING','DISPATCHED_DEMO'];
export const deliveryIsActive=status=>ACTIVE_DELIVERY_STATUSES.includes(status);
export const DEMO_RATES = {
  COP:  { EUR: 230, USD: 250, USDT: 250 },
  EUR:  { COP: 4347826087, USD: 1086957, USDT: 1086957 },
  USD:  { COP: 4000000000, EUR: 920000, USDT: 1000000 },
  USDT: { COP: 4000000000, EUR: 920000, USD: 1000000 },
};
const MAX_MINOR = 10_000_000_000;
const MAX_MG = 1_000_000_000;

export class DomainError extends Error {
  constructor(message, code='INVALID_OPERATION') { super(message); this.name='DomainError'; this.code=code; }
}
function assert(condition, message, code) { if (!condition) throw new DomainError(message,code); }
function validMetal(m) { assert(Object.hasOwn(METALS, m), 'Metal inválido'); }
function validCurrency(c) { assert(CURRENCIES.includes(c), 'Moneda inválida'); }
function decimalToInt(value, digits, max) {
  assert(typeof value === 'string' && new RegExp(`^\\d{1,10}(?:\\.\\d{1,${digits}})?$`).test(value), 'Introduce un importe decimal válido');
  const [whole, frac=''] = value.split('.');
  const n = Number(whole) * (10 ** digits) + Number(frac.padEnd(digits,'0'));
  assert(Number.isSafeInteger(n) && n > 0 && n <= max, 'Importe fuera de límites');
  return n;
}
export function parseMoney(value) { return decimalToInt(value, 2, MAX_MINOR); }
export function parseGrams(value) {
  const mg = decimalToInt(value,3,MAX_MG);
  assert(mg >= 100, 'Mínimo de demostración: 0.100 gramos');
  return mg;
}
const ceilDiv = (a,b) => Number((BigInt(a)+BigInt(b)-1n)/BigInt(b));
const floorDiv = (a,b) => Number(BigInt(a)/BigInt(b));
const quoteBase = (mg, centsPerGram) => ceilDiv(BigInt(mg)*BigInt(centsPerGram),1000n);
const bpsFee = (cents,bps) => ceilDiv(BigInt(cents)*BigInt(bps),10000n);
function clone(o) { return structuredClone(o); }
function checkRequestId(requestId) {
  assert(typeof requestId === 'string' && /^[a-zA-Z0-9_-]{8,100}$/.test(requestId) &&
    !['__proto__','constructor','prototype'].includes(requestId),'Identificador de operación inválido');
}
function move(state, type, label, details, now) {
  const event = { id: `mov-${state.sequence++}`, type, label, ...details, at: now };
  state.movements.unshift(event);
  state.movements = state.movements.slice(0,100);
  return event;
}
function reservedMg(state, metal) {
  const offers = state.offers.filter(o=>o.metal===metal && o.status==='OPEN').reduce((a,o)=>a+o.mg,0);
  const deliveries = state.custodyRequests.filter(o=>o.metal===metal && deliveryIsActive(o.status)).reduce((a,o)=>a+o.mg,0);
  return offers+deliveries;
}
export function availableHoldingMg(state, metal) { return state.holdingsMg[metal]-reservedMg(state,metal); }
export function seedState() {
  const inventoryMg={}, holdingsMg={};
  for(const [code,meta] of Object.entries(METALS)) { inventoryMg[code]=meta.inventoryMg; holdingsMg[code]=0; }
  return {
    schemaVersion: 1,
    demoOnly: true,
    walletMinor: { COP: 145000000, EUR: 75000, USD: 60000, USDT: 25000 },
    holdingsMg, inventoryMg, offers: [], custodyRequests: [], movements: [], receipts: {}, signatures: {},
    sequence: 1,
    priceCentsPerGram: Object.fromEntries(Object.entries(METALS).map(([k,v])=>[k,v.quoteCentsPerGram])),
    demoRates: DEMO_RATES,
    feesBps: { buy: 100, sell: 120 },
  };
}
export function operatorSummary(s) {
  const trades=s.movements.filter(m=>m.type==='BUY'||m.type==='SELL');
  return {
    demoOnly: true,
    inventoryMg: s.inventoryMg,
    holdingsMg: s.holdingsMg,
    reservedMg: Object.fromEntries(Object.keys(METALS).map(m=>[m,reservedMg(s,m)])),
    transactionCount: trades.length,
    buyCount: trades.filter(x=>x.type==='BUY').length,
    sellCount: trades.filter(x=>x.type==='SELL').length,
    demoFeesCollectedMinor: trades.reduce((x,m)=>x+(m.feeMinor||0),0),
    offersOpen: s.offers.filter(x=>x.status==='OPEN').length,
    deliveriesPending: s.custodyRequests.filter(x=>deliveryIsActive(x.status)).length,
  };
}
export function applyCommand(current, cmd, now=new Date().toISOString()) {
  const { action, requestId } = cmd;
  checkRequestId(requestId);
  assert(['deposit','withdraw','convert','buy','sell','offer','cancel_offer','delivery','cancel_delivery'].includes(action),'Acción no permitida');
  const signature=JSON.stringify(Object.keys(cmd).filter(k=>k!=='requestId').sort().map(k=>[k,cmd[k]]));
  if(Object.hasOwn(current.receipts,requestId)) {
    assert(current.signatures?.[requestId]===signature,'Identificador reutilizado con otros parámetros');
    return {state: current, receipt: {...clone(current.receipts[requestId]), replayed: true},changed: false};
  }
  const s=clone(current);
  let receipt = {id:requestId, action, status:'COMPLETED', at:now, demoOnly:true};
  if(action==='deposit'||action==='withdraw') {
    validCurrency(cmd.currency);
    const amountMinor=parseMoney(cmd.amount);
    if(action==='withdraw') assert(s.walletMinor[cmd.currency]>=amountMinor,'Saldo insuficiente','INSUFFICIENT_BALANCE');
    if(action==='deposit') assert(s.walletMinor[cmd.currency]+amountMinor<=MAX_MINOR,'Saldo fuera de límites');
    s.walletMinor[cmd.currency]+=action==='deposit'?amountMinor:-amountMinor;
    receipt={...receipt,currency:cmd.currency,amountMinor};
    move(s,action==='deposit'?'DEPOSIT':'WITHDRAW',`${action==='deposit'?'Ingreso':'Retiro'} simulado ${cmd.currency}`,{currency:cmd.currency,amountMinor},now);
  }
  if(action==='convert') {
    const {from,to,amount}=cmd;
    validCurrency(from); validCurrency(to);
    assert(from!==to,'Selecciona monedas diferentes');
    const amountMinor=parseMoney(amount);
    assert(s.walletMinor[from]>=amountMinor,'Saldo insuficiente','INSUFFICIENT_BALANCE');
    const rate=s.demoRates[from][to];
    const outputMinor=floorDiv(BigInt(amountMinor)*BigInt(rate),1000000n);
    assert(outputMinor>0 && outputMinor<=MAX_MINOR,'Conversión fuera de límites');
    assert(s.walletMinor[to]+outputMinor<=MAX_MINOR,'Saldo de destino fuera de límites');
    s.walletMinor[from]-=amountMinor; s.walletMinor[to]+=outputMinor;
    receipt={...receipt,from,to,amountMinor,outputMinor,feeMinor:0,rateDemo:rate};
    move(s,'CONVERT',`Conversión ${from} → ${to}`,{from,to,amountMinor,outputMinor},now);
  }
  if(action==='buy') {
    validMetal(cmd.metal);
    const mg=parseGrams(cmd.grams);
    const baseMinor=quoteBase(mg,s.priceCentsPerGram[cmd.metal]);
    const feeMinor=bpsFee(baseMinor,s.feesBps.buy);
    const totalMinor=baseMinor+feeMinor;
    assert(s.walletMinor.USDT>=totalMinor,'USDT insuficiente','INSUFFICIENT_BALANCE');
    assert(s.inventoryMg[cmd.metal]>=mg,'Inventario simulado insuficiente','INSUFFICIENT_INVENTORY');
    s.walletMinor.USDT-=totalMinor;
    s.holdingsMg[cmd.metal]+=mg;
    s.inventoryMg[cmd.metal]-=mg;
    receipt={...receipt,metal:cmd.metal,mg,priceCentsPerGram:s.priceCentsPerGram[cmd.metal],baseMinor,feeMinor,totalMinor};
    move(s,'BUY',`Compra de ${METALS[cmd.metal].name}`,{metal:cmd.metal,mg,feeMinor,totalMinor},now);
  }
  if(action==='sell') {
    validMetal(cmd.metal);
    const mg=parseGrams(cmd.grams);
    assert(availableHoldingMg(s,cmd.metal)>=mg,'Posición disponible insuficiente','INSUFFICIENT_HOLDING');
    const baseMinor=quoteBase(mg,s.priceCentsPerGram[cmd.metal]);
    const feeMinor=bpsFee(baseMinor,s.feesBps.sell);
    const outputMinor=baseMinor-feeMinor;
    assert(outputMinor>0,'La operación no alcanza el mínimo');
    assert(s.walletMinor.USDT+outputMinor<=MAX_MINOR,'Saldo de destino fuera de límites');
    s.holdingsMg[cmd.metal]-=mg; s.inventoryMg[cmd.metal]+=mg;
    s.walletMinor.USDT+=outputMinor;
    receipt={...receipt,metal:cmd.metal,mg,priceCentsPerGram:s.priceCentsPerGram[cmd.metal],baseMinor,feeMinor,outputMinor};
    move(s,'SELL',`Venta de ${METALS[cmd.metal].name}`,{metal:cmd.metal,mg,feeMinor,outputMinor},now);
  }
  if(action==='offer') {
    validMetal(cmd.metal);
    const mg=parseGrams(cmd.grams);
    assert(availableHoldingMg(s,cmd.metal)>=mg,'Posición disponible insuficiente','INSUFFICIENT_HOLDING');
    const offer={id:`offer-${s.sequence++}`,metal:cmd.metal,mg,status:'OPEN',createdAt:now};
    if(cmd.price!==undefined){
      const priceMinorPerGram=parseMoney(cmd.price),baseMinor=quoteBase(mg,priceMinorPerGram),feeMinor=bpsFee(baseMinor,s.feesBps.sell);
      assert(Number.isSafeInteger(baseMinor)&&baseMinor<=MAX_MINOR&&baseMinor>feeMinor,'El precio no permite una liquidación demo dentro de límites');
      offer.priceMinorPerGram=priceMinorPerGram;
    }
    s.offers.unshift(offer);
    receipt={...receipt,offer};
    move(s,'OFFER',`Oferta de ${METALS[cmd.metal].name}`,{metal:cmd.metal,mg,offerId:offer.id},now);
  }
  if(action==='cancel_offer') {
    const offer=s.offers.find(o=>o.id===cmd.offerId);
    assert(offer && offer.status==='OPEN','Oferta no disponible');
    offer.status='CANCELLED';
    receipt={...receipt,offerId:offer.id,metal:offer.metal,mg:offer.mg};
    move(s,'CANCEL_OFFER','Oferta cancelada',{metal:offer.metal,mg:offer.mg,offerId:offer.id},now);
  }
  if(action==='delivery') {
    validMetal(cmd.metal);
    const mg=parseGrams(cmd.grams);
    assert(availableHoldingMg(s,cmd.metal)>=mg,'Posición disponible insuficiente','INSUFFICIENT_HOLDING');
    const jurisdiction=cmd.jurisdiction??'DEMO_LOCAL';
    assert(['DEMO_LOCAL','DEMO_REGIONAL','DEMO_INTERNATIONAL'].includes(jurisdiction),'Jurisdicción DEMO inválida');
    const delivery={id:`delivery-${s.sequence++}`,metal:cmd.metal,mg,status:'PENDING_QUOTE',createdAt:now,jurisdiction,
      timeline:[{status:'PENDING_QUOTE',at:now,label:'Solicitud de cotización DEMO registrada'}]};
    s.custodyRequests.unshift(delivery);
    receipt={...receipt,delivery};
    move(s,'DELIVERY_REQUEST',`Solicitud de cotización de entrega de ${METALS[cmd.metal].name}`,{metal:cmd.metal,mg,deliveryId:delivery.id},now);
  }
  if(action==='cancel_delivery') {
    const delivery=s.custodyRequests.find(d=>d.id===cmd.deliveryId);
    assert(delivery && ['PENDING_QUOTE','QUOTED'].includes(delivery.status),'Solicitud no disponible para cancelar');
    delivery.status='CANCELLED';
    delivery.timeline=[...(delivery.timeline??[]),{status:'CANCELLED',at:now,label:'Solicitud DEMO cancelada por el comprador'}];
    receipt={...receipt,deliveryId:delivery.id,metal:delivery.metal,mg:delivery.mg};
    move(s,'CANCEL_DELIVERY','Solicitud de entrega cancelada',{metal:delivery.metal,mg:delivery.mg},now);
  }
  receipt={...receipt,receiptVersion:2,label:s.movements[0].label,
    balancesAfter:{
      walletMinor:{...s.walletMinor},
      holdingsMg:{...s.holdingsMg},
      reservedMg:Object.fromEntries(Object.keys(METALS).map(m=>[m,reservedMg(s,m)])),
    },
  };
  // An offer/delivery can change later. A completed receipt must retain the
  // original command and its resulting balances, not references to live objects.
  s.receipts[requestId]=clone(receipt);
  s.signatures[requestId]=signature;
  return {state:s,receipt:clone(receipt),changed:true};
}
