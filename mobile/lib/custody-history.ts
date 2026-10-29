import {custodyMetals,validCertificateId,type CustodyMetal} from './custody.ts';

export const lotMovementKinds=['OPENING_BALANCE','ALLOCATION_OPENING','LOT_REGISTERED','BUY','IMPORT','SELL','MARKET_TRANSFER','DELIVERY'] as const;
export type LotMovementKind=typeof lotMovementKinds[number];
export type LotMovement={id:string;at:string;kind:LotMovementKind;mg:number;account?:{id:string;alias:string};counterparty?:{id:string;alias:string};referenceId?:string;direction?:'IN'|'OUT'};
export type LotHistory={demoOnly:true;mine:{id:string;name:string};view:'buyer'|'operator';lot:{id:string;metal:CustodyMetal};items:LotMovement[];total:number;nextCursor:string|null;disclaimer:string;historyStartedAt:string;earlierHistoryUnavailable:true};
const invalid=()=>new Error('El historial del lote devolvió datos incompletos. Actualiza la consulta.');
function object(value:unknown):Record<string,unknown>{if(!value||typeof value!=='object'||Array.isArray(value))throw invalid();return value as Record<string,unknown>;}
function text(value:unknown,max:number):string{if(typeof value!=='string'||!value.trim()||value.length>max)throw invalid();return value;}
function id(value:unknown):string{if(typeof value!=='string'||!validCertificateId(value))throw invalid();return value;}
function moveId(value:unknown):string{if(typeof value!=='string'||!/^lot-move-[a-f0-9]{32}$/.test(value))throw invalid();return value;}
function amount(value:unknown):number{if(typeof value!=='number'||!Number.isSafeInteger(value)||value<0)throw invalid();return value;}
function date(value:unknown):string{if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw invalid();return value;}
function account(value:unknown){const item=object(value);return {id:id(item.id),alias:text(item.alias,40)};}

export function lotHistoryPath(lotId:string,before:string|null=null):string{
  if(!validCertificateId(lotId))throw new Error('El identificador de lote demo no es válido.');
  if(before!==null)moveId(before);
  return `/api/demo/custody/lots/${encodeURIComponent(lotId)}/history?limit=20${before?`&before=${encodeURIComponent(before)}`:''}`;
}
export function parseLotHistory(value:unknown,lotId:string,operator:boolean,accountId:string):LotHistory{
  const item=object(value),mine=object(item.mine),lot=object(item.lot),view=operator?'operator':'buyer';
  if(item.demoOnly!==true||item.view!==view||lot.id!==lotId||!custodyMetals.includes(lot.metal as CustodyMetal)||item.earlierHistoryUnavailable!==true||!Array.isArray(item.items)||item.items.length>20)throw invalid();
  const items=item.items.map(raw=>{
    const event=object(raw);
    if(!lotMovementKinds.includes(event.kind as LotMovementKind))throw invalid();
    const checked:LotMovement={id:moveId(event.id),at:date(event.at),kind:event.kind as LotMovementKind,mg:amount(event.mg)};
    if(event.account!==undefined)checked.account=account(event.account);
    if(event.counterparty!==undefined)checked.counterparty=account(event.counterparty);
    if(event.referenceId!==undefined)checked.referenceId=id(event.referenceId);
    if(event.direction!==undefined){if(checked.kind!=='MARKET_TRANSFER'||!['IN','OUT'].includes(String(event.direction)))throw invalid();checked.direction=event.direction as 'IN'|'OUT';}
    if(!operator&&(checked.counterparty||checked.account&&checked.account.id!==accountId))throw invalid();
    if(!operator&&!checked.account&&!['OPENING_BALANCE','LOT_REGISTERED'].includes(checked.kind))throw invalid();
    if(checked.kind==='MARKET_TRANSFER'&&(operator?(!checked.account||!checked.counterparty||checked.direction!==undefined):(!checked.account||checked.direction===undefined)))throw invalid();
    return checked;
  });
  const total=amount(item.total),nextCursor=item.nextCursor===null?null:moveId(item.nextCursor);
  if(total<items.length||new Set(items.map(event=>event.id)).size!==items.length||nextCursor!==null&&(!items.length||nextCursor!==items.at(-1)?.id))throw invalid();
  return {demoOnly:true,mine:{id:id(mine.id),name:text(mine.name,200)},view,lot:{id:id(lot.id),metal:lot.metal as CustodyMetal},items,total,nextCursor,disclaimer:text(item.disclaimer,2000),historyStartedAt:date(item.historyStartedAt),earlierHistoryUnavailable:true};
}
export function mergeLotHistory(current:LotMovement[],next:LotMovement[]):LotMovement[]{
  const ids=new Set<string>();return [...current,...next].filter(item=>{if(ids.has(item.id))return false;ids.add(item.id);return true;});
}
export function lotMovementLabel(kind:LotMovementKind,direction?:'IN'|'OUT'):string{
  return {OPENING_BALANCE:'Peso original del lote al habilitar el historial',ALLOCATION_OPENING:'Asignación existente al habilitar el historial',LOT_REGISTERED:'Registro de lote DEMO',BUY:'Compra directa',IMPORT:'Importación explícita de sesión',SELL:'Venta directa',MARKET_TRANSFER:direction==='IN'?'Entrada desde marketplace':direction==='OUT'?'Salida por marketplace':'Transferencia entre compradores',DELIVERY:'Salida por entrega simulada'}[kind];
}
