import {METALS} from './domain.js';

const ID_PATTERN=/^[A-Za-z0-9_-]{8,100}$/;
const invalid=message=>Object.assign(new Error(message),{status:400,code:'INVALID_HISTORY_QUERY'});
const missing=()=>Object.assign(new Error('Comprobante no disponible en esta sesión'),{status:404,code:'RECEIPT_NOT_FOUND'});

function validateId(id){
  if(typeof id!=='string'||!ID_PATTERN.test(id))throw invalid('Identificador de comprobante inválido');
  return id;
}

function labelFor(receipt){
  const metal=METALS[receipt.metal||receipt.offer?.metal||receipt.delivery?.metal]?.name;
  switch(receipt.action){
    case 'deposit':return `Ingreso simulado ${receipt.currency}`;
    case 'withdraw':return `Retiro simulado ${receipt.currency}`;
    case 'convert':return `Conversión ${receipt.from} → ${receipt.to}`;
    case 'buy':return `Compra de ${metal||'metal'}`;
    case 'sell':return `Venta de ${metal||'metal'}`;
    case 'offer':return `Oferta de ${metal||'metal'}`;
    case 'cancel_offer':return 'Oferta cancelada';
    case 'delivery':return `Solicitud de cotización de entrega de ${metal||'metal'}`;
    case 'cancel_delivery':return 'Solicitud de entrega cancelada';
    default:return 'Operación simulada';
  }
}

// Legacy receipts already contain amounts, but not historical balance snapshots.
// Add only a descriptive label; never reconstruct a past balance from today's state.
export function receiptView(receipt){
  const result=structuredClone(receipt);
  if(!result.label)result.label=labelFor(result);
  return result;
}

export function readReceipt(state,id){
  validateId(id);
  if(!Object.hasOwn(state.receipts,id))throw missing();
  return receiptView(state.receipts[id]);
}

export function parseHistoryQuery(params){
  for(const key of params.keys()){
    if(!['limit','before'].includes(key)||params.getAll(key).length!==1){
      throw invalid('Parámetros de historial inválidos');
    }
  }
  const rawLimit=params.get('limit')??'20';
  if(!/^[1-9]\d?$/.test(rawLimit)||Number(rawLimit)>50)throw invalid('El límite debe ser un entero de 1 a 50');
  const before=params.has('before')?validateId(params.get('before')):undefined;
  return {limit:Number(rawLimit),before};
}

export function historyPage(state,{limit=20,before}={}){
  if(!Number.isInteger(limit)||limit<1||limit>50)throw invalid('El límite debe ser un entero de 1 a 50');
  if(before!==undefined)validateId(before);
  const receipts=Object.values(state.receipts).sort((a,b)=>{
    // All server timestamps use ISO UTC. ID resolves equal timestamps without
    // depending on JSONB key order. The cursor identifies a receipt, not an offset.
    if(a.at!==b.at)return a.at>b.at?-1:1;
    return a.id===b.id?0:a.id>b.id?-1:1;
  });
  let start=0;
  if(before!==undefined){
    const index=receipts.findIndex(receipt=>receipt.id===before);
    if(index<0)throw missing();
    start=index+1;
  }
  const items=receipts.slice(start,start+limit).map(receiptView);
  return {items,nextCursor:start+items.length<receipts.length?items.at(-1).id:null,total:receipts.length,demoOnly:true};
}
