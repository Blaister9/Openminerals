import React, {useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Animated,Modal,Pressable,SafeAreaView,ScrollView,StatusBar,StyleSheet,Text,TextInput,View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import {RequestError,type PendingOperation} from './lib/demo-client';
import {createAccountClient} from './lib/account-client';
import {authStorage} from './lib/auth-storage';
import {normalizeDecimalInput,parsePositiveDecimal,quoteBuy,quoteSell,quoteConversion,summarizePortfolio} from './lib/presentation';
import {receiptTitle,receiptSummary,type Receipt,type ReceiptHistoryPage} from './lib/receipt-presentation';
import {MetalStory} from './components/MetalStory';
import {ReceiptDetails} from './components/ReceiptDetails';
import {OperationConfirmation} from './components/OperationConfirmation';
import {AccountAccess} from './components/AccountAccess';
import {MineDashboard,type MineSummary,type StockReceipt} from './components/MineDashboard';
import {StockReceiptDetails} from './components/StockReceiptDetails';
import {CustodyPanel} from './components/CustodyPanel';
import {MarketplacePanel} from './components/MarketplacePanel';
import {DeliveryPanel} from './components/DeliveryPanel';
import {ManagementPanel} from './components/ManagementPanel';
import {AccountSettings} from './components/AccountSettings';

// DEMO: todas las cifras, inventarios y solicitudes son simulados.
// Cuentas de demostración; no hay KYC, pagos, exchange ni bóveda real.
type Metal = 'XAU'|'XAG'|'XPT'|'XPD';
type Currency = 'COP'|'EUR'|'USD'|'USDT';
type Tab = 'Inicio'|'Mercado'|'Billetera'|'Metales'|'Más'|'Mina'|'Cuenta';
type Account={id:string;alias:string;role:'buyer'|'operator';mineId:string};
type Move = {id:string; type:string; label:string; at:string; metal?:Metal; mg?:number; amountMinor?:number};
type Offer = {id:string;metal:Metal;mg:number;status:string};
type Delivery = {id:string;metal:Metal;mg:number;status:string};
type State = {
  walletMinor:Record<Currency,number>;
  holdingsMg:Record<Metal,number>;
  priceCentsPerGram:Record<Metal,number>;
  inventoryMg:Record<Metal,number>;
  demoRates:Record<Currency,Partial<Record<Currency,number>>>;
  feesBps:{buy:number;sell:number};
  movements:Move[];offers:Offer[];custodyRequests:Delivery[];
  legacyReadOnly?:boolean;
};
type Summary = {transactionCount:number;demoFeesCollectedMinor:number;offersOpen:number;deliveriesPending:number;inventoryMg:Record<Metal,number>;holdingsMg:Record<Metal,number>};
type Confirmation={action:string;body:Record<string,string>;title:string;detail:string};
const API=(process.env.EXPO_PUBLIC_API_URL||'').replace(/\/$/,'');
const MAX_BALANCE_MINOR=10_000_000_000;
const metals: {code:Metal;name:string;symbol:string;tagline:string;color:string}[]=[
  {code:'XAU',name:'Oro',symbol:'Au',tagline:'Reserva de valor',color:'#D8B676'},
  {code:'XAG',name:'Plata',symbol:'Ag',tagline:'Metal industrial',color:'#CED3DE'},
  {code:'XPT',name:'Platino',symbol:'Pt',tagline:'Metal estratégico',color:'#B6C9D5'},
  {code:'XPD',name:'Paladio',symbol:'Pd',tagline:'Activo especializado',color:'#B8A5C9'},
];
const currencies:Currency[]=['COP','EUR','USD','USDT'];
const money=(cents:number,currency:string='USDT')=>`${currency} ${(cents/100).toLocaleString('es-CO',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const gram=(mg:number)=>`${(mg/1000).toLocaleString('es-CO',{maximumFractionDigits:3,minimumFractionDigits:3})} g`;
const meta=(code:Metal)=>metals.find(m=>m.code===code)!;
const messageError=(e:unknown)=>e instanceof Error?e.message:'Error de conexión';
const buyerSections:Tab[]=['Inicio','Mercado','Billetera','Metales','Más'];
const operatorSections:Tab[]=['Mina','Cuenta'];
function checkedMine(value:unknown):MineSummary{
 const mine=value as MineSummary;
 if(!mine||mine.demoOnly!==true||typeof mine.mine?.id!=='string'||typeof mine.mine?.name!=='string'||
   ![mine.accountCount,mine.transactionCount,mine.demoFeesCollectedMinor,mine.offersOpen,mine.deliveriesPending].every(amount=>Number.isSafeInteger(amount)&&amount>=0)||typeof mine.reconciled!=='boolean'||
   ![mine.operations,mine.pendingOffers,mine.pendingDeliveries,mine.stockAdjustments].every(Array.isArray)||
   !metals.every(item=>[mine.inventoryMg?.[item.code],mine.totalSupplyMg?.[item.code],mine.allocatedMg?.[item.code],mine.reservedMg?.[item.code]].every(amount=>Number.isSafeInteger(amount)&&amount>=0))){
  throw new Error('El panel de mina devolvió una respuesta incompleta. Actualiza la consulta.');
 }
 return mine;
}

function Chip({label,active,onPress}:{label:string;active:boolean;onPress:()=>void}){
 return <Pressable onPress={onPress} style={[styles.chip,active&&styles.chipOn]}><Text style={[styles.chipText,active&&styles.chipTextOn]}>{label}</Text></Pressable>;
}
function Button({label,onPress,secondary=false,disabled=false}:{label:string;onPress:()=>void;secondary?:boolean;disabled?:boolean}){
 return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={[styles.button,secondary&&styles.buttonSecondary,disabled&&{opacity:.45}]}><Text style={[styles.buttonText,secondary&&styles.buttonSecondaryText]}>{label}</Text></Pressable>;
}
function Card({children}:{children:React.ReactNode}){return <View style={styles.card}>{children}</View>}
function Sub({children}:{children:React.ReactNode}){return <Text style={styles.subhead}>{children}</Text>}
function Row({left,right}:{left:string;right:string}){return <View style={styles.row}><Text style={styles.muted}>{left}</Text><Text style={styles.rowValue}>{right}</Text></View>}
export default function App(){
 const [session,setSession]=useState('');
 const [state,setState]=useState<State|null>(null);
 const [summary,setSummary]=useState<Summary|null>(null);
 const [tab,setTab]=useState<Tab>('Inicio');
 const [busy,setBusy]=useState(false);
 const [problem,setProblem]=useState('');
 const [currentMetal,setCurrentMetal]=useState<Metal>('XAU');
 const [grams,setGrams]=useState('2.000');
 const [from,setFrom]=useState<Currency>('USD');
 const [to,setTo]=useState<Currency>('USDT');
 const [currency,setCurrency]=useState<Currency>('USD');
 const [amount,setAmount]=useState('200.00');
 const homeScrollY=useRef(new Animated.Value(0)).current;
 const [viewportHeight,setViewportHeight]=useState(600);
 const [operatorVisible,setOperatorVisible]=useState(false);
 const [metalAction,setMetalAction]=useState<'sell'|'offer'|'delivery'>('sell');
 const [sellGrams,setSellGrams]=useState('0.500');
 const [offerPrice,setOfferPrice]=useState('145.00');
 const [pending,setPending]=useState<PendingOperation|null>(null);
 const [account,setAccount]=useState<Account|null>(null);
 const [mineIdentity,setMineIdentity]=useState<{id:string;name:string}|null>(null);
 const [authExpired,setAuthExpired]=useState(false);
 const [authVisible,setAuthVisible]=useState(false);
 const [settingsVisible,setSettingsVisible]=useState(false);
 const [authMode,setAuthMode]=useState<'login'|'register'>('login');
 const [authBusy,setAuthBusy]=useState(false);
 const [authError,setAuthError]=useState('');
 const [accountRecovery,setAccountRecovery]=useState<'login'|'logout'|null>(null);
 const [recoveryAlias,setRecoveryAlias]=useState('');
 const authLock=useRef(false);
 const identityVersion=useRef(0);
 const [mineSummary,setMineSummary]=useState<MineSummary|null>(null);
 const [mineLoading,setMineLoading]=useState(false);
 const [mineError,setMineError]=useState('');
 const mineRequest=useRef(0);
 const [stockReceipt,setStockReceipt]=useState<StockReceipt|null>(null);
 const [lastStockId,setLastStockId]=useState('');
 const [operationRevision,setOperationRevision]=useState(0);
 const [mineSection,setMineSection]=useState<'management'|'inventory'|'custody'|'delivery'>('management');
 const [metalsSection,setMetalsSection]=useState<'positions'|'custody'|'delivery'>('positions');
 const [historyItems,setHistoryItems]=useState<Receipt[]>([]);
 const [historyCursor,setHistoryCursor]=useState<string|null>(null);
 const [historyTotal,setHistoryTotal]=useState(0);
 const [historyLoaded,setHistoryLoaded]=useState(false);
 const [historyLoading,setHistoryLoading]=useState(false);
 const [historyError,setHistoryError]=useState('');
 const historyRequest=useRef(0);
 const historyRetryReset=useRef(true);
 const [receiptVisible,setReceiptVisible]=useState(false);
 const [selectedReceipt,setSelectedReceipt]=useState<Receipt|null>(null);
 const [receiptLoading,setReceiptLoading]=useState(false);
 const [receiptError,setReceiptError]=useState('');
 const receiptRequest=useRef(0);
 const receiptToFetch=useRef('');
 const receiptOwner=useRef<string|null>(null);
 const [confirmation,setConfirmation]=useState<Confirmation|null>(null);
 const confirmationRef=useRef<Confirmation|null>(null);
 const actionLock=useRef(false);
 const client=useRef(createAccountClient({api:API,storage:AsyncStorage,authStorage,uuid:()=>Crypto.randomUUID()})).current;
 const isOperator=account?.role==='operator';
 const sections=isOperator?operatorSections:buyerSections;
 const tradingBlocked=busy||authBusy||!!pending||authExpired||!!accountRecovery||(!account&&!!state?.legacyReadOnly);
 useEffect(()=>{setOfferPrice(((state?.priceCentsPerGram[currentMetal]||14500)/100).toFixed(2));},[currentMetal,state?.priceCentsPerGram[currentMetal]]);
 async function load(loadSummary=false){
  const version=identityVersion.current;
  if(client.getAccount()?.role==='operator'){await loadMine();return;}
  const next=await client.get<State>('/api/demo/state');
  if(version!==identityVersion.current)return;
  setState(next);
  if(loadSummary&&!client.getAccount()){
   const nextSummary=await client.get<Summary>('/api/demo/operator/summary');
   if(version===identityVersion.current)setSummary(nextSummary);
  }
 }
 async function loadMine(){
  if(client.getAccount()?.role!=='operator')return;
  const request=++mineRequest.current;const version=identityVersion.current;
  setMineLoading(true);setMineError('');
  try{
   const result=checkedMine(await client.get<unknown>('/api/demo/mine/summary'));
   if(request===mineRequest.current&&version===identityVersion.current)setMineSummary(result);
  }catch(error){
   if(request===mineRequest.current&&version===identityVersion.current){setMineError(messageError(error));noticeExpired(error);}
  }finally{if(request===mineRequest.current)setMineLoading(false);}
 }
 function noticeExpired(error:unknown){
  if(error instanceof RequestError&&error.status===401&&client.getAccount())setAuthExpired(true);
 }
 function clearIdentityViews(){
  identityVersion.current++;historyRequest.current++;receiptRequest.current++;mineRequest.current++;
  setState(null);setSummary(null);setMineSummary(null);setMineError('');setMineLoading(false);
  setHistoryItems([]);setHistoryCursor(null);setHistoryTotal(0);setHistoryLoaded(false);setHistoryLoading(false);setHistoryError('');
  setSelectedReceipt(null);setReceiptVisible(false);setReceiptLoading(false);setReceiptError('');receiptToFetch.current='';receiptOwner.current=null;
  setStockReceipt(null);setLastStockId('');setOperatorVisible(false);
  setMetalAction('sell');
  setMineSection('management');setMetalsSection('positions');
  setSettingsVisible(false);
 }
 function acceptIdentity(initial:{session:string;pending:PendingOperation|null;account:Account|null;mine?:{id:string;name:string}|null;authExpired?:boolean}){
  setSession(initial.session);setPending(initial.pending);setAccount(initial.account);setMineIdentity(initial.mine??null);setAuthExpired(!!initial.authExpired);
  setAccountRecovery(null);setRecoveryAlias('');
 }
 function openAccount(mode:'login'|'register'='login'){
  if(busy||authBusy||actionLock.current||authLock.current||client.isSending())return;
  setAuthMode(mode);setAuthError('');setAuthVisible(true);
 }
 function openSettings(){
  if(!account||busy||authBusy||!!pending||authExpired||client.isSending())return;
  setAuthVisible(false);setSettingsVisible(true);
 }
 async function recoveredAccount(alias:string){
  try{acceptIdentity(await client.initialize());setRecoveryAlias(alias);setAuthMode('login');setAuthError('');setAuthVisible(true);}
  catch(error){setAuthError(messageError(error));setRecoveryAlias(alias);setAuthMode('login');setAuthVisible(true);}
 }
 async function submitAccount(mode:'login'|'register',alias:string,password:string,importLegacy:boolean){
  if(busy||authLock.current||actionLock.current||client.isSending())return;
  if(mode==='register'&&client.getPending()){setAuthError('Resuelve primero la operación pendiente antes de crear una cuenta.');return;}
  authLock.current=true;setAuthBusy(true);setAuthError('');
  try{
   const initial=mode==='login'?await client.login(alias,password):await client.register(alias,password,importLegacy);
   clearIdentityViews();acceptIdentity(initial);setTab(initial.account?.role==='operator'?'Mina':'Inicio');setAuthVisible(false);setProblem('');
   try{await load(true);}catch(error){noticeExpired(error);setProblem(`La cuenta está abierta, pero no pudimos actualizar sus datos. ${messageError(error)}`);}
  }catch(error){
   if(client.isIdentityUncertain()){setAccountRecovery('login');setRecoveryAlias(alias);setAuthMode('login');}
   setAuthError(messageError(error));
  }
  finally{setAuthBusy(false);authLock.current=false;}
 }
 async function signOut(){
  if(busy||authLock.current||actionLock.current||client.isSending())return;
  if(client.getPending()){setAuthError('Resuelve la operación pendiente antes de cerrar sesión.');return;}
  authLock.current=true;setAuthBusy(true);setAuthError('');
  try{
   const initial=await client.logout();clearIdentityViews();acceptIdentity(initial);setTab('Inicio');setAuthVisible(false);setProblem('');
   try{await load(true);}catch(error){setProblem(messageError(error));}
  }catch(error){if(client.isIdentityUncertain())setAccountRecovery(previous=>previous==='login'?'login':'logout');setAuthError(messageError(error));}
  finally{setAuthBusy(false);authLock.current=false;}
 }
 useEffect(()=>{void refresh();},[]);
 useEffect(()=>{homeScrollY.setValue(0);},[tab,homeScrollY]);
 useEffect(()=>{if(tab==='Más'&&session&&!historyLoaded&&!isOperator&&!authExpired)void loadHistory(true);},[tab,session,authExpired]);
 async function loadHistory(reset=true){
  const request=++historyRequest.current;
  historyRetryReset.current=reset;
  setHistoryLoading(true);setHistoryError('');
  if(reset)setHistoryLoaded(false);
  try{
   const cursor=reset?null:historyCursor;
   const page=await client.get<ReceiptHistoryPage>(`/api/demo/history?limit=20${cursor?`&before=${encodeURIComponent(cursor)}`:''}`);
   if(!Array.isArray(page.items)||page.demoOnly!==true||!Number.isSafeInteger(page.total)||
     (page.nextCursor!==null&&typeof page.nextCursor!=='string')||page.items.some(item=>!item||typeof item.id!=='string'||typeof item.action!=='string'||typeof item.at!=='string')){
    throw new Error('El historial devolvió una respuesta incompleta. Reintenta la consulta.');
   }
   if(request!==historyRequest.current)return;
   setHistoryItems(previous=>reset?page.items:[...previous,...page.items.filter(item=>!previous.some(existing=>existing.id===item.id))]);
   setHistoryCursor(page.nextCursor);setHistoryTotal(page.total);setHistoryLoaded(true);
  }catch(error){
   if(request===historyRequest.current){setHistoryError(error instanceof RequestError&&[404,405].includes(error.status)?
    'El servicio de demostración necesita actualizarse para mostrar este historial. Tus saldos y sesión siguen guardados.':messageError(error));noticeExpired(error);}
  }finally{if(request===historyRequest.current)setHistoryLoading(false);}
 }
 async function openReceipt(id:string,cached?:Receipt,ownerId?:string){
  const request=++receiptRequest.current;receiptToFetch.current=id;
  receiptOwner.current=ownerId??null;
  setSelectedReceipt(cached??(selectedReceipt?.id===id?selectedReceipt:null));
  setReceiptVisible(true);setReceiptLoading(true);setReceiptError('');
  try{
   const snapshot=cached??(selectedReceipt?.id===id?selectedReceipt:null),actor=snapshot?.actor?.id;
   const path=ownerId==='mine'?`/api/demo/mine/commands/${encodeURIComponent(id)}?kind=${snapshot?.action==='stock'?'stock':'command'}${actor?`&actor=${encodeURIComponent(actor)}`:''}`:ownerId?`/api/demo/mine/receipts/${encodeURIComponent(ownerId)}/${encodeURIComponent(id)}`:`/api/demo/receipts/${encodeURIComponent(id)}`;
   const receipt=await client.get<Receipt>(path);
   if(receipt.id!==id||receipt.demoOnly!==true||typeof receipt.action!=='string'||typeof receipt.at!=='string')throw new Error('El comprobante devolvió una respuesta incompleta.');
   if(request===receiptRequest.current)setSelectedReceipt(receipt);
  }catch(error){if(request===receiptRequest.current){setReceiptError(error instanceof RequestError&&error.status===405?
   'El servicio de demostración necesita actualizarse para consultar este comprobante. Puedes cerrar esta pantalla y reintentarlo después.':`No pudimos consultar el comprobante. ${messageError(error)}`);noticeExpired(error);}}
  finally{if(request===receiptRequest.current)setReceiptLoading(false);}
 }
 function closeReceipt(){receiptRequest.current++;setReceiptVisible(false);setReceiptLoading(false);}
 async function refresh(){
  if(actionLock.current||authLock.current||client.isSending())return;
  actionLock.current=true;setBusy(true);
  try{
   const initial=await client.initialize();acceptIdentity(initial);
   setTab(previous=>initial.account?.role==='operator'?(previous==='Cuenta'?'Cuenta':'Mina'):(previous==='Mina'||previous==='Cuenta'?'Inicio':previous));
   if(initial.authExpired){setProblem('El acceso a tu cuenta venció. Entra de nuevo con el mismo alias; tu historial permanece guardado.');return;}
   await load(true);setProblem('');
   if(!initial.account||initial.account.role==='buyer'){if(tab==='Más'||historyLoaded)void loadHistory(true);}
  }catch(e){if(client.isIdentityUncertain())setAccountRecovery(previous=>previous||'login');noticeExpired(e);setProblem(messageError(e));}finally{setBusy(false);actionLock.current=false;}
 }
 async function runOperation(send:()=>ReturnType<typeof client.retry>){
  actionLock.current=true;setBusy(true);
  try{
   const data=await send();setSummary(null);setOperatorVisible(false);setProblem('');setOperationRevision(value=>value+1);
   if(data.receipt.action==='stock'){
    mineRequest.current++;setMineLoading(false);
    setStockReceipt(data.receipt as unknown as StockReceipt);setLastStockId(data.receipt.id);
    try{setMineSummary(checkedMine(data.mine));}catch(error){setMineError(`El ingreso quedó registrado. Actualiza el panel para consultar las existencias. ${messageError(error)}`);}
   }else if(data.mine){
    mineRequest.current++;setMineLoading(false);setMineSummary(checkedMine(data.mine));
    receiptRequest.current++;receiptToFetch.current=data.receipt.id;receiptOwner.current='mine';
    setSelectedReceipt(data.receipt);setReceiptVisible(true);setReceiptLoading(false);setReceiptError('');
   }else{
    setState(data.state as State);receiptRequest.current++;receiptToFetch.current=data.receipt.id;receiptOwner.current=null;
    setSelectedReceipt(data.receipt);setReceiptVisible(true);setReceiptLoading(false);setReceiptError('');
    void loadHistory(true);
   }
  }catch(e){
   const unresolved=client.getPending();
   noticeExpired(e);
   setProblem(unresolved?`Hay una operación pendiente de confirmar. Reinténtala con el botón de abajo antes de crear otra. ${messageError(e)}`:`Operación rechazada: ${messageError(e)}`);
  }finally{setPending(client.getPending());setBusy(false);actionLock.current=false;}
 }
 function retryPending(){if(!actionLock.current&&!authLock.current&&!busy&&!authBusy&&!client.isSending()&&!authExpired&&!accountRecovery)void runOperation(()=>client.retry());}
 function perform(action:string,body:Record<string,string>,title:string,detail:string){
  if(busy||authBusy||actionLock.current||authLock.current||client.isSending()||!session)return;
  if(accountRecovery){setProblem('Resuelve primero el acceso a tu cuenta con el botón de arriba. Conservamos tus datos para evitar operar con una identidad incierta.');return;}
  if(authExpired){setProblem('Entra de nuevo en tu cuenta para continuar.');return;}
  if(state?.legacyReadOnly&&!account){setProblem('Esta sesión anterior está vinculada a una cuenta y permanece en consulta. Entra con su alias para operar.');return;}
  if(client.getPending()){
   setProblem('Reintenta primero la operación pendiente con el botón situado arriba. Conservaremos su misma clave para evitar duplicaciones.');return;
  }
  if(body.grams!==undefined){
   const quantity=parsePositiveDecimal(body.grams,3);
   if(quantity===null||quantity<0.1){setProblem('Introduce al menos 0,1 g y hasta tres decimales. Puedes usar coma o punto decimal.');return;}
  }
  if(body.amount!==undefined&&parsePositiveDecimal(body.amount,2)===null){
   setProblem('Introduce un importe positivo con hasta dos decimales, sin separadores de miles.');return;
  }
  const normalizedBody={...body};
  if(body.grams!==undefined)normalizedBody.grams=normalizeDecimalInput(body.grams);
  if(body.amount!==undefined)normalizedBody.amount=normalizeDecimalInput(body.amount);
  actionLock.current=true;
  const next={action,body:normalizedBody,title,detail};
  confirmationRef.current=next;setConfirmation(next);setProblem('');
 }
 function cancelConfirmation(){
  if(!confirmationRef.current)return;
  confirmationRef.current=null;setConfirmation(null);actionLock.current=false;
 }
 function confirmOperation(){
  const operation=confirmationRef.current;
  if(!operation)return;
  confirmationRef.current=null;setConfirmation(null);
  void runOperation(()=>client.submit(operation.action,operation.body,operation.title));
 }
 const portfolio=state?summarizePortfolio(state):{metalsValueMinor:0,usdtAvailableMinor:0,totalUsdtAndMetalsMinor:0};
 const reserved=(metal:Metal)=>state?state.offers.filter(o=>o.metal===metal&&o.status==='OPEN').reduce((a,o)=>a+o.mg,0)+state.custodyRequests.filter(d=>d.metal===metal&&['PENDING_QUOTE','QUOTED','APPROVED','PREPARING','DISPATCHED_DEMO'].includes(d.status)).reduce((a,d)=>a+d.mg,0):0;
 function accountCard(){return <Card>
  <Text style={styles.cardTitle}>{account?account.alias:state?.legacyReadOnly?'Sesión anterior vinculada':'Tu cuenta de demostración'}</Text>
  {account?<><Row left="Rol" right={account.role==='operator'?'Operador de mina':'Comprador'}/><Text style={styles.copy}>{mineIdentity?.name||'Mina de demostración'} · datos ficticios</Text><Button label="Abrir mi cuenta" secondary disabled={busy||authBusy} onPress={()=>openAccount('login')}/><Button label="Perfil y recuperación" secondary disabled={busy||authBusy||!!pending||authExpired} onPress={openSettings}/></>:<>
   <Text style={styles.copy}>{state?.legacyReadOnly?'Esta sesión permanece en consulta. Entra en la cuenta vinculada para continuar con sus saldos e historial.':'Crea una cuenta para recuperar tus datos en otro dispositivo y operar con el inventario compartido de la mina. Puedes conservar esta sesión al crearla.'}</Text>
   <View style={styles.hRow}>{!state?.legacyReadOnly&&<Button label="Crear cuenta demo" disabled={busy||authBusy||!!pending} onPress={()=>openAccount('register')}/>}<Button label="Entrar en una cuenta" secondary disabled={busy||authBusy} onPress={()=>openAccount('login')}/></View>
  </>}
 </Card>}
 function accountPage(){return <><Text style={styles.eyebrow}>ACCESO A LA DEMOSTRACIÓN</Text><Text style={styles.pageTitle}>Cuenta</Text>{accountCard()}<Text style={styles.copy}>Los roles y el inventario son de prueba. No hay verificación de identidad, pagos, reservas físicas ni custodio conectado.</Text><Text style={styles.copy}>Para usar la misma cuenta en otro dispositivo, entra con el mismo alias y su clave exclusiva de demostración.</Text></>}
 function home(){return <>
  {!account&&accountCard()}
  <Text style={styles.eyebrow}>USDT + METALES · SIMULACIÓN</Text>
  <Text style={styles.heroNumber}>{money(portfolio.totalUsdtAndMetalsMinor)}</Text>
  <Text style={styles.muted}>USDT disponible más valoración de metales. No incluye tus saldos COP, EUR y USD.</Text>
  <Card><Row left="USDT disponible" right={money(portfolio.usdtAvailableMinor)}/><Row left="Valor de tus metales" right={money(portfolio.metalsValueMinor)}/>
   <Text style={styles.mutedSmall}>{portfolio.metalsValueMinor===0?'Aún no tienes metales. Tu dinero simulado sigue disponible en USDT.':'Valor de referencia ficticio; las comisiones se muestran al operar.'}</Text>
  </Card>
  <View style={styles.hRow}>
   <Pressable onPress={()=>setTab('Mercado')} style={styles.quick}><Text style={styles.quickText}>Comprar metales  →</Text></Pressable>
   <Pressable onPress={()=>setTab('Billetera')} style={styles.quick}><Text style={styles.quickText}>Abrir billetera  →</Text></Pressable>
  </View>
  <MetalStory scrollY={homeScrollY} viewportHeight={viewportHeight}/>
  <Sub>Mercado ilustrativo</Sub>
  {metals.map(m=><Pressable key={m.code} onPress={()=>{setCurrentMetal(m.code);setTab('Mercado');}} style={styles.metalRow}>
   <View style={[styles.metalIcon,{borderColor:m.color}]}><Text style={[styles.metalText,{color:m.color}]}>{m.symbol}</Text></View>
   <View style={{flex:1}}><Text style={styles.cardTitle}>{m.name}</Text><Text style={styles.mutedSmall}>Cotización simulada por gramo</Text></View>
   <Text style={styles.rowValue}>{money(state?.priceCentsPerGram[m.code]||0)}/g</Text>
  </Pressable>)}
 </>}
 function market(){const m=meta(currentMetal);const quote=state?quoteBuy(grams,state.priceCentsPerGram[currentMetal],state.feesBps.buy):null;
  const insufficient=!!quote&&quote.totalMinor>(state?.walletMinor.USDT||0);
  const unavailable=!!quote&&quote.milligrams>(state?.inventoryMg[currentMetal]||0);
  return <><Text style={styles.eyebrow}>COMPRAVENTA DE METALES</Text><Text style={styles.pageTitle}>Mercado</Text><Text style={styles.copy}>Compra fracciones de oro, plata, platino o paladio. La liquidación simulada se realiza en USDT.</Text>
   {account&&<Card><Text style={styles.cardTitle}>Inventario compartido</Text><Text style={styles.copy}>{mineIdentity?.name||'Mina de demostración'}. Las compras de otras cuentas reducen la misma disponibilidad.</Text><Row left={`${m.name} disponible en la mina`} right={gram(state?.inventoryMg[currentMetal]||0)}/><Button label="Actualizar mercado" secondary disabled={busy} onPress={refresh}/></Card>}
   <View style={styles.metalGrid}>{metals.map(v=><Pressable key={v.code} onPress={()=>setCurrentMetal(v.code)} style={[styles.metalChoice,currentMetal===v.code&&styles.metalChoiceOn]}>
    <Text style={[styles.choiceSymbol,{color:v.color}]}>{v.symbol}</Text><Text style={styles.choiceName}>{v.name}</Text><Text style={styles.mutedSmall}>{money(state?.priceCentsPerGram[v.code]||0)}/g</Text>
   </Pressable>)}</View>
   <Card><Text style={styles.eyebrow}>{m.name.toUpperCase()} · {m.symbol}</Text><Text style={styles.cardTitle}>Comprar gramos</Text><Text style={styles.copy}>Referencia del demo: {money(state?.priceCentsPerGram[currentMetal]||0)} / g</Text>
    <Text style={styles.inputLabel}>Cantidad en gramos</Text><TextInput accessibilityLabel="Cantidad de metal en gramos" style={styles.input} value={grams} keyboardType="decimal-pad" onChangeText={setGrams} placeholder="2.000" placeholderTextColor="#667385"/>
    <Text style={styles.mutedSmall}>Para medio gramo escribe 0,5 o 0.5. Escribir 1050 significa 1050 gramos.</Text>
    <View style={styles.chips}>{['0.100','0.500','1.000','2.000'].map(q=><Chip key={q} label={`${Number(q).toLocaleString('es-CO')} g`} active={normalizeDecimalInput(grams)===q} onPress={()=>setGrams(q)}/>)}</View>
    {quote?<><Row left="Cantidad interpretada" right={`${quote.grams.toLocaleString('es-CO',{useGrouping:false,maximumFractionDigits:3})} gramos`}/>
     <Row left="Metal sin comisión" right={money(quote.baseMinor)}/><Row left="Comisión simulada" right={money(quote.feeMinor)}/><Row left="Total estimado" right={money(quote.totalMinor)}/></>:<Text style={styles.disclaimer}>Introduce al menos 0,1 g y hasta tres decimales, sin separadores de miles.</Text>}
    <Row left="USDT disponible" right={money(state?.walletMinor.USDT||0)}/>
    {quote&&!insufficient&&<Row left="USDT después de comprar" right={money((state?.walletMinor.USDT||0)-quote.totalMinor)}/>}
    {insufficient&&<Text style={styles.disclaimer}>Tu saldo USDT no alcanza para esta cantidad. Revisa los gramos o convierte saldo en Billetera.</Text>}
    {!insufficient&&unavailable&&<Text style={styles.disclaimer}>Esta cantidad supera el inventario ficticio disponible.</Text>}
    <Text style={styles.mutedSmall}>El servidor valida el importe definitivo. Al comprar, la comisión se suma al valor del metal.</Text>
    <Button label={busy?'Procesando...':'Confirmar compra simulada'} disabled={tradingBlocked||!quote||insufficient||unavailable} onPress={()=>{if(quote)perform('buy',{metal:currentMetal,grams:quote.normalizedGrams},`Comprar ${gram(quote.milligrams)} de ${m.name}`,`Metal: ${money(quote.baseMinor)}. Comisión: ${money(quote.feeMinor)}.\nTotal estimado: ${money(quote.totalMinor)}.\nUSDT después de comprar: ${money((state?.walletMinor.USDT||0)-quote.totalMinor)}.`);}}/>
   </Card>
   <Text style={styles.disclaimer}>Ningún gramo en esta pantalla representa una existencia física acreditada.</Text>
   {account&&<MarketplacePanel key={account.id} identityKey={account.id} get={client.get} submit={perform} disabled={tradingBlocked} usdtMinor={state?.walletMinor.USDT||0} refreshKey={state?.movements[0]?.id||''} onHistory={()=>setTab('Más')} onReceipt={receipt=>void openReceipt(receipt.id,receipt)}/>}
  </>;
 }
 function wallet(){
  const quote=state?quoteConversion(amount,from,to,state.demoRates):null;
  const insufficient=!!quote&&quote.amountMinor>(state?.walletMinor[from]||0);
  const overflow=!!quote&&(state?.walletMinor[to]||0)+quote.outputMinor>MAX_BALANCE_MINOR;
  const depositUnits=parsePositiveDecimal(amount,2);
  const depositMinor=depositUnits===null?null:Math.round(depositUnits*100);
  const depositOverflow=depositMinor!==null&&(state?.walletMinor[currency]||0)+depositMinor>MAX_BALANCE_MINOR;
  const withdrawalInsufficient=depositMinor!==null&&depositMinor>(state?.walletMinor[currency]||0);
  return <><Text style={styles.eyebrow}>CUENTAS MULTIDIVISA</Text><Text style={styles.pageTitle}>Billetera</Text><Text style={styles.copy}>Cuatro saldos independientes con movimientos y conversiones simuladas.</Text>
  <View style={styles.walletGrid}>{currencies.map(c=><View key={c} style={styles.walletCard}><Text style={styles.eyebrow}>{c}</Text><Text style={styles.walletValue}>{money(state?.walletMinor[c]||0,c)}</Text></View>)}</View>
  <Sub>Convertir saldo</Sub><Card><Text style={styles.inputLabel}>De</Text><View style={styles.chips}>{currencies.map(c=><Chip key={c} label={c} active={from===c} onPress={()=>{setFrom(c);if(c===to)setTo(c==='USD'?'USDT':'USD');}}/>)}</View>
   <Text style={styles.inputLabel}>A</Text><View style={styles.chips}>{currencies.map(c=><Chip key={c} label={c} active={to===c} onPress={()=>{setTo(c);if(c===from)setFrom(c==='USD'?'USDT':'USD');}}/>)}</View>
   <Text style={styles.inputLabel}>Importe</Text><TextInput accessibilityLabel="Cantidad de dinero para convertir" style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad"/>
   {quote?<View style={styles.quoteBox}>
    <Text style={styles.cardTitle}>Antes de convertir</Text>
    <Row left="Entregas" right={money(quote.amountMinor,from)}/>
    <Row left="Tasa ficticia" right={`1 ${from} = ${(quote.rateDemo/1_000_000).toLocaleString('es-CO',{useGrouping:false,maximumFractionDigits:6})} ${to}`}/>
    <Row left="Comisión de conversión" right={money(quote.feeMinor,to)}/>
    <Row left="Recibes" right={money(quote.outputMinor,to)}/>
    {!insufficient&&<Row left={`Saldo ${from} después`} right={money((state?.walletMinor[from]||0)-quote.amountMinor,from)}/>}
    {!overflow&&<Row left={`Saldo ${to} después`} right={money((state?.walletMinor[to]||0)+quote.outputMinor,to)}/>}
   </View>:<Text style={styles.disclaimer}>Introduce un importe positivo con hasta dos decimales y elige dos monedas diferentes. La conversión debe producir al menos una centésima.</Text>}
   {insufficient&&<Text accessibilityRole="alert" style={styles.disclaimer}>El saldo {from} no alcanza para esta conversión.</Text>}
   {overflow&&<Text accessibilityRole="alert" style={styles.disclaimer}>El saldo de destino superaría el límite de esta demostración.</Text>}
   <Text style={styles.mutedSmall}>Tasa fija exclusivamente de demostración. El resultado se redondea a centésimas hacia abajo; el comprobante guarda el importe definitivo.</Text>
   <Button label="Convertir en demo" disabled={tradingBlocked||!quote||insufficient||overflow} onPress={()=>{if(quote)perform('convert',{from,to,amount:quote.normalizedAmount},`Convertir ${from} a ${to}`,`Entregas: ${money(quote.amountMinor,from)}.\nRecibes: ${money(quote.outputMinor,to)}.\nComisión: ${money(quote.feeMinor,to)}.\nSaldo ${to} después: ${money((state?.walletMinor[to]||0)+quote.outputMinor,to)}.`);}}/>
  </Card>
  <Sub>Ingresos y retiros simulados</Sub><Card><Text style={styles.copy}>Estos movimientos son pruebas de saldo: no conectan bancos ni redes blockchain.</Text>
   <View style={styles.chips}>{currencies.map(c=><Chip key={c} label={c} active={currency===c} onPress={()=>setCurrency(c)}/>)}</View>
   <TextInput accessibilityLabel="Cantidad para ingresar o retirar" style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad"/>
   {depositOverflow&&<Text style={styles.disclaimer}>El ingreso superaría el límite de saldo de la demostración.</Text>}
   {withdrawalInsufficient&&<Text style={styles.disclaimer}>El saldo {currency} no alcanza para este retiro.</Text>}
   <View style={styles.hRow}><Button label="Simular ingreso" disabled={tradingBlocked||depositMinor===null||depositOverflow} onPress={()=>perform('deposit',{currency,amount},'Simular ingreso',`Abono ficticio: ${amount} ${currency}.`)}/>
   <Button label="Simular retiro" secondary disabled={tradingBlocked||depositMinor===null||withdrawalInsufficient} onPress={()=>perform('withdraw',{currency,amount},'Simular retiro',`Cargo ficticio: ${amount} ${currency}.`)}/></View>
  </Card></>}
 function metalsNavigation(){return <View style={styles.chips}><Chip label="Posiciones" active={metalsSection==='positions'} onPress={()=>setMetalsSection('positions')}/><Chip label="Lotes y certificados" active={metalsSection==='custody'} onPress={()=>setMetalsSection('custody')}/><Chip label="Entregas DEMO" active={metalsSection==='delivery'} onPress={()=>setMetalsSection('delivery')}/></View>}
 function holdings(){const m=meta(currentMetal);const available=(state?.holdingsMg[currentMetal]||0)-reserved(currentMetal);
  if(account&&metalsSection==='custody')return <>{metalsNavigation()}<CustodyPanel key={account.id} identityKey={account.id} operator={false} get={client.get} disabled={tradingBlocked} refreshKey={String(operationRevision)}/></>;
  if(account&&metalsSection==='delivery')return <>{metalsNavigation()}<DeliveryPanel key={account.id} identityKey={account.id} operator={false} get={client.get} submit={perform} disabled={tradingBlocked} refreshKey={String(operationRevision)} usdtMinor={state?.walletMinor.USDT||0}/></>;
  const quantity=parsePositiveDecimal(sellGrams,3);
  const operationMg=quantity===null?null:Math.round(quantity*1000);
  const invalid=operationMg===null||operationMg<100;
  const unavailable=operationMg!==null&&operationMg>available;
  const quote=state?quoteSell(sellGrams,state.priceCentsPerGram[currentMetal],state.feesBps.sell):null;
  const offerPriceUnits=parsePositiveDecimal(offerPrice,2);
  const offerQuote=state&&offerPriceUnits!==null?quoteSell(sellGrams,Math.round(offerPriceUnits*100),state.feesBps.sell):null;
  const overflow=!!quote&&(state?.walletMinor.USDT||0)+quote.outputMinor>MAX_BALANCE_MINOR;
  return <><Text style={styles.eyebrow}>MIS POSICIONES</Text><Text style={styles.pageTitle}>Mis metales</Text><Text style={styles.copy}>Consulta las cantidades adquiridas y su valor de referencia.</Text>
   {account&&metalsNavigation()}
   {metals.map(v=><Pressable key={v.code} onPress={()=>setCurrentMetal(v.code)} style={[styles.metalRow,currentMetal===v.code&&{borderColor:accent}]}>
    <View style={[styles.metalIcon,{borderColor:v.color}]}><Text style={[styles.metalText,{color:v.color}]}>{v.symbol}</Text></View>
    <View style={{flex:1}}><Text style={styles.cardTitle}>{v.name}</Text><Text style={styles.mutedSmall}>{gram(state?.holdingsMg[v.code]||0)} · disponible {gram((state?.holdingsMg[v.code]||0)-reserved(v.code))}</Text></View>
    <Text style={styles.rowValue}>{money(Math.ceil((state?.holdingsMg[v.code]||0)*(state?.priceCentsPerGram[v.code]||0)/1000))}</Text>
   </Pressable>)}
   <Sub>Gestionar {m.name.toLowerCase()}</Sub><Card><Row left="Disponible para operar" right={gram(available)}/><Row left="Reservado en ofertas/entrega" right={gram(reserved(currentMetal))}/>
    <View style={styles.chips}><Chip label="Vender" active={metalAction==='sell'} onPress={()=>setMetalAction('sell')}/><Chip label="Publicar oferta" active={metalAction==='offer'} onPress={()=>setMetalAction('offer')}/>{!account&&<Chip label="Entrega física" active={metalAction==='delivery'} onPress={()=>setMetalAction('delivery')}/>}</View>
    <Text style={styles.inputLabel}>Gramos</Text><TextInput accessibilityLabel="Gramos para operación" style={styles.input} value={sellGrams} onChangeText={setSellGrams} keyboardType="decimal-pad"/>
    {!invalid&&operationMg!==null&&<Row left="Cantidad interpretada" right={gram(operationMg)}/>}
    {invalid&&<Text style={styles.disclaimer}>Introduce al menos 0,1 g y hasta tres decimales. Puedes usar coma o punto decimal.</Text>}
    {unavailable&&<Text accessibilityRole="alert" style={styles.disclaimer}>La cantidad supera tus gramos disponibles. Los gramos reservados no se pueden vender ni reservar otra vez.</Text>}
    {metalAction==='offer'&&account&&<><Text style={styles.inputLabel}>Precio de venta por gramo en USDT simulado</Text><TextInput accessibilityLabel="Precio por gramo de oferta marketplace" style={styles.input} value={offerPrice} onChangeText={setOfferPrice} keyboardType="decimal-pad"/>{offerQuote?<><Row left="Total que pagará la contraparte" right={money(offerQuote.baseMinor)}/><Row left="Comisión descontada al vendedor" right={money(offerQuote.feeMinor)}/><Row left="Recibirás si se liquida" right={money(offerQuote.outputMinor)}/></>:<Text style={styles.disclaimer}>Introduce un precio positivo con hasta dos decimales y una cantidad válida.</Text>}</>}
    {metalAction==='sell'&&quote&&<View style={styles.quoteBox}>
     <Text style={styles.cardTitle}>Antes de vender</Text>
     <Row left="Precio ficticio por gramo" right={money(state?.priceCentsPerGram[currentMetal]||0)}/>
     <Row left="Valor bruto" right={money(quote.baseMinor)}/>
     <Row left="Comisión simulada" right={money(quote.feeMinor)}/>
     <Row left="Recibes neto" right={money(quote.outputMinor)}/>
     {!overflow&&<Row left="USDT después de vender" right={money((state?.walletMinor.USDT||0)+quote.outputMinor)}/>}
     {!unavailable&&<Row left="Metal restante" right={gram((state?.holdingsMg[currentMetal]||0)-quote.milligrams)}/>}
    </View>}
    {metalAction==='sell'&&overflow&&<Text style={styles.disclaimer}>El saldo USDT resultante superaría el límite de la demostración.</Text>}
    <Text style={styles.mutedSmall}>{metalAction==='delivery'?'Se solicita una cotización; no se genera un envío ni un impuesto real.':metalAction==='offer'?'La cantidad queda reservada. Publicar no significa que exista un comprador.':'La comisión se descuenta del valor bruto. El servidor valida el importe definitivo.'}</Text>
    <Button label={metalAction==='sell'?'Simular venta':metalAction==='offer'?'Publicar oferta demo':'Solicitar cotización de entrega'} disabled={tradingBlocked||invalid||unavailable||(metalAction==='sell'&&(!quote||overflow))||(metalAction==='offer'&&!!account&&!offerQuote)} onPress={()=>{
     const detail=metalAction==='sell'&&quote?`${gram(quote.milligrams)} de ${m.name}.\nValor bruto: ${money(quote.baseMinor)}.\nComisión: ${money(quote.feeMinor)}.\nRecibes neto: ${money(quote.outputMinor)}.\nUSDT después: ${money((state?.walletMinor.USDT||0)+quote.outputMinor)}.`:`${operationMg===null?sellGrams:gram(operationMg)} de ${m.name}. Se reservará esta cantidad.`;
     perform(metalAction,{metal:currentMetal,grams:normalizeDecimalInput(sellGrams),...(metalAction==='offer'&&account?{price:normalizeDecimalInput(offerPrice)}:{})},metalAction==='sell'?'Confirmar venta simulada':'Confirmar reserva simulada',`${detail}${metalAction==='offer'&&account&&offerQuote?`\nPrecio: ${money(Math.round((offerPriceUnits||0)*100))}/g.\nTotal contraparte: ${money(offerQuote.baseMinor)}. Neto vendedor: ${money(offerQuote.outputMinor)}.`:''}`);
    }}/>
   </Card>
   <Sub>Solicitudes y ofertas</Sub>
   {state?.offers.filter(o=>o.status==='OPEN').map(o=><Card key={o.id}><Row left={`Oferta ${meta(o.metal).name}`} right={gram(o.mg)}/><Button label="Cancelar oferta" secondary disabled={tradingBlocked} onPress={()=>perform('cancel_offer',{offerId:o.id},'Cancelar oferta',`Se liberan ${gram(o.mg)}.`)}/></Card>)}
   {!account&&state?.custodyRequests.filter(d=>d.status==='PENDING_QUOTE').map(d=><Card key={d.id}><Row left={`Entrega ${meta(d.metal).name}`} right={gram(d.mg)}/><Text style={styles.mutedSmall}>Pendiente de cotización · sin envío real.</Text><Button label="Cancelar solicitud" secondary disabled={tradingBlocked} onPress={()=>perform('cancel_delivery',{deliveryId:d.id},'Cancelar entrega',`Se liberan ${gram(d.mg)}.`)}/></Card>)}
   {account&&<View style={styles.hRow}><Button label="Consultar mis certificados" secondary onPress={()=>setMetalsSection('custody')}/><Button label="Solicitar o seguir entrega DEMO" secondary onPress={()=>setMetalsSection('delivery')}/></View>}
  </>}
 function more(){return <><Text style={styles.eyebrow}>CONTROL Y TRANSPARENCIA</Text><Text style={styles.pageTitle}>Actividad</Text>
  {accountCard()}<Button label="Actualizar datos" secondary disabled={busy||authBusy} onPress={refresh}/>
  <Sub>Historial de operaciones</Sub>
  <Text style={styles.copy}>Abre una operación para consultar su comprobante, importes y saldos registrados en ese momento.</Text>
  <Button label="Actualizar historial" secondary disabled={historyLoading} onPress={()=>void loadHistory(true)}/>
  {!!historyError&&<View accessibilityRole="alert" style={styles.historyError}>
   <Text style={styles.errorText}>{historyError}</Text>
   {!!historyItems.length&&<Text style={styles.errorText}>Se conserva la última lista consultada.</Text>}
   <Button label="Reintentar historial" secondary disabled={historyLoading} onPress={()=>void loadHistory(historyRetryReset.current)}/>
  </View>}
  {historyLoaded&&!historyItems.length&&!historyError&&<Text style={styles.disclaimer}>Aún no hay operaciones en esta sesión de demostración.</Text>}
  {historyItems.map(item=><Pressable accessibilityRole="button" accessibilityLabel={`Ver comprobante: ${receiptTitle(item)}, ${receiptSummary(item)}`} key={item.id} onPress={()=>void openReceipt(item.id,item)} style={styles.historyRow}>
   <Text style={styles.cardTitle}>{receiptTitle(item)}</Text>
   <Text style={styles.historyAmount}>{receiptSummary(item)}</Text>
   <Text style={styles.mutedSmall}>{new Date(item.at).toLocaleString('es-CO')}</Text>
   <Text style={styles.historyLink}>Ver comprobante →</Text>
  </Pressable>)}
  {historyLoading&&<View style={styles.historyLoading}><ActivityIndicator color={accent}/><Text style={styles.muted}>Consultando historial…</Text></View>}
  {historyLoaded&&<Text style={styles.mutedSmall}>Mostrando {historyItems.length} de {historyTotal} operaciones registradas.</Text>}
  {!!historyCursor&&<Button label="Cargar más operaciones" secondary disabled={historyLoading} onPress={()=>void loadHistory(false)}/>}
  {!account&&<><Sub>Vista anterior · esta sesión</Sub><Card><Text style={styles.copy}>Inventario, operaciones y solicitudes ficticios de esta sesión anterior. No es el panel compartido de la mina.</Text><Button label={operatorVisible?'Ocultar vista anterior':'Abrir vista de esta sesión'} onPress={async()=>{if(!operatorVisible)await refresh();setOperatorVisible(!operatorVisible);}} secondary/>
   {operatorVisible&&<><Row left="Compras y ventas del demo" right={String(summary?.transactionCount||0)}/><Row left="Comisiones simuladas" right={money(summary?.demoFeesCollectedMinor||0)}/><Row left="Ofertas pendientes" right={String(summary?.offersOpen||0)}/><Row left="Cotizaciones de entrega" right={String(summary?.deliveriesPending||0)}/>
    {metals.map(v=><Row key={v.code} left={`Inventario ficticio ${v.name}`} right={gram(summary?.inventoryMg[v.code]||0)}/>)}
   </>}
  </Card><Text style={styles.disclaimer}>Para consultar la mina compartida se necesita una cuenta de operador de demostración.</Text></>}
  </>}
 function operatorMine(){
  if(!account)return null;
  const blocked=busy||authBusy||!!pending||authExpired||!!accountRecovery;
  return <><View style={styles.chips}><Chip label="Panel gerencial" active={mineSection==='management'} onPress={()=>setMineSection('management')}/><Chip label="Inventario" active={mineSection==='inventory'} onPress={()=>setMineSection('inventory')}/><Chip label="Lotes" active={mineSection==='custody'} onPress={()=>setMineSection('custody')}/><Chip label="Entregas DEMO" active={mineSection==='delivery'} onPress={()=>setMineSection('delivery')}/></View>
   {mineSection==='management'?<ManagementPanel key={account.id} identityKey={account.id} get={client.get} disabled={blocked} refreshKey={String(operationRevision)} onReceipt={(receipt,ownerId)=>void openReceipt(receipt.id,receipt,ownerId)}/>:
    mineSection==='custody'?<CustodyPanel key={account.id} identityKey={account.id} operator get={client.get} disabled={blocked} refreshKey={String(operationRevision)}/>:
    mineSection==='delivery'?<DeliveryPanel key={account.id} identityKey={account.id} operator get={client.get} submit={perform} disabled={blocked} refreshKey={String(operationRevision)}/>:
    <MineDashboard summary={mineSummary} loading={mineLoading} error={mineError} blocked={blocked} lastStockId={lastStockId} onRefresh={()=>void loadMine()} onReceipt={(ownerId,receipt)=>void openReceipt(receipt.id,receipt,ownerId)} onStockReceipt={setStockReceipt} onRestock={body=>perform('mine/stock',body,'Crear lote de demostración',`${gram(Math.round((parsePositiveDecimal(body.grams,3)||0)*1000))} de ${meta(body.metal).name}.\nPureza ficticia: ${(Number(body.purityBps)/100).toFixed(2)} %.\nUbicación DEMO: ${body.location}.\nDocumento: ${body.documentTitle}.\nMotivo: ${body.reason}.\nSe añadirá al inventario compartido de esta demostración.`)}/>
   }</>;
 }
 return <SafeAreaView style={styles.screen}><StatusBar barStyle="light-content" backgroundColor="#090F15"/>
  <View style={styles.header}><View><Text style={styles.logo}>OPEN<Text style={{color:accent}}>MINERALS</Text></Text><Text style={styles.logoSub}>METALS · OWNERSHIP · TECHNOLOGY</Text></View><View style={styles.badge}><Text style={styles.badgeText}>DEMO</Text></View></View>
  <View style={styles.identityBar}><View style={{flex:1}}><Text numberOfLines={1} style={styles.identityTitle}>{account?`${account.role==='operator'?'Operador':'Comprador'} · ${account.alias}`:state?.legacyReadOnly?'Sesión anterior · solo consulta':'Sesión sin cuenta'}</Text><Text numberOfLines={1} style={styles.identityNote}>{account?mineIdentity?.name||'Mina de demostración':'Datos ficticios · tu historial permanece guardado'}</Text></View><Pressable accessibilityRole="button" disabled={busy||authBusy} onPress={()=>openAccount('login')} style={styles.accountLink}><Text style={styles.accountLinkText}>Cuenta</Text></Pressable></View>
  {!!problem&&<Pressable accessibilityRole="button" onPress={refresh} style={styles.errorBox}><Text style={styles.errorText}>{problem}\nToca aquí para actualizar los datos.</Text></Pressable>}
  {!account&&!!state?.legacyReadOnly&&<View style={styles.archiveBanner}><Text style={styles.archiveText}>Tu sesión anterior está vinculada a una cuenta y queda en consulta. Entra en esa cuenta para operar; no se borró el historial.</Text></View>}
  {!!accountRecovery&&<View style={styles.archiveBanner}><Text style={styles.archiveText}>{accountRecovery==='logout'?'El acceso se cerró en el servidor, pero falta finalizar el cierre guardado en este dispositivo. Tus datos permanecen conservados.':'Falta confirmar el acceso a tu cuenta. Entra con el mismo alias y clave demo antes de crear movimientos; no se borró la sesión anterior.'}</Text><Button label={accountRecovery==='logout'?'Reintentar cierre de sesión':'Resolver acceso a cuenta'} disabled={busy||authBusy} onPress={()=>accountRecovery==='logout'?void signOut():openAccount('login')}/></View>}
  {!!pending&&<View style={styles.errorBox}><Text style={styles.errorText}>Pendiente: {pending.title}. Una respuesta perdida no confirma que la operación haya fallado. Reintentar recupera el mismo comprobante y bloquea movimientos duplicados.</Text><Button label={busy?'Consultando…':'Reintentar operación pendiente'} onPress={retryPending} disabled={busy||authBusy||authExpired||!!accountRecovery}/></View>}
  {authExpired?<View style={styles.center}><Text style={styles.cardTitle}>Vuelve a entrar en tu cuenta demo</Text><Text style={styles.copy}>Conservamos la identidad y cualquier solicitud pendiente. Usa el mismo alias para recuperar el acceso.</Text><Button label="Entrar de nuevo" onPress={()=>openAccount('login')} disabled={busy||authBusy}/></View>:!state&&!isOperator?<View style={styles.center}>{!problem&&<ActivityIndicator color={accent}/>}<Text style={styles.muted}>Preparando experiencia móvil…</Text></View>:
  <Animated.ScrollView key={tab} style={{flex:1}} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}
   onLayout={event=>setViewportHeight(Math.max(1,event.nativeEvent.layout.height))}
   onScroll={Animated.event([{nativeEvent:{contentOffset:{y:homeScrollY}}}],{useNativeDriver:true})} scrollEventThrottle={16}>
   {isOperator?(tab==='Cuenta'?accountPage():operatorMine()):tab==='Inicio'?home():tab==='Mercado'?market():tab==='Billetera'?wallet():tab==='Metales'?holdings():more()}
  </Animated.ScrollView>}
  <View style={styles.tabs}>{sections.map(t=><Pressable accessibilityRole="tab" accessibilityState={{selected:tab===t}} key={t} onPress={()=>setTab(t)} style={styles.tab}><View style={[styles.tabDot,tab===t&&styles.tabDotActive]}/><Text style={[styles.tabLabel,tab===t&&styles.tabLabelActive]}>{t==='Más'?'Actividad':t}</Text></Pressable>)}</View>
  <OperationConfirmation visible={confirmation!==null} title={confirmation?.title||''} detail={confirmation?.detail||''} onCancel={cancelConfirmation} onConfirm={confirmOperation}/>
  <ReceiptDetails visible={receiptVisible} receipt={selectedReceipt} loading={receiptLoading} error={receiptError}
   onClose={closeReceipt} onRetry={()=>{if(receiptToFetch.current)void openReceipt(receiptToFetch.current,undefined,receiptOwner.current??undefined);}}
   onHistory={()=>{closeReceipt();setTab(isOperator?'Mina':'Más');}}/>
  <StockReceiptDetails receipt={stockReceipt} onClose={()=>setStockReceipt(null)}/>
  {settingsVisible&&account&&<Modal visible onRequestClose={()=>setSettingsVisible(false)} animationType="none" presentationStyle="pageSheet"><SafeAreaView style={styles.screen}><View style={styles.identityBar}><Text style={[styles.cardTitle,{flex:1}]}>Perfil de demostración</Text><Pressable accessibilityRole="button" style={styles.accountLink} onPress={()=>setSettingsVisible(false)}><Text style={styles.accountLinkText}>Cerrar</Text></Pressable></View><ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled"><AccountSettings key={account.id} identityKey={account.id} account={account} disabled={busy||authBusy||!!pending||authExpired} getProfile={client.getProfile} saveProfile={client.updateProfile} setupRecovery={client.setupRecovery} onAuthExpired={()=>{setSettingsVisible(false);setAuthExpired(true);}}/></ScrollView></SafeAreaView></Modal>}
  <AccountAccess visible={authVisible} initialMode={authMode} account={account} mineName={mineIdentity?.name} recoveryAlias={recoveryAlias} expired={authExpired} busy={authBusy} pending={!!pending} canImportLegacy={!account&&!!state&&!state.legacyReadOnly} legacyReadOnly={!!state?.legacyReadOnly}
   error={authError} onClose={()=>{if(!authBusy){setAuthVisible(false);setAuthError('');}}} onLogout={()=>void signOut()} onSubmit={(mode,alias,password,importLegacy)=>void submitAccount(mode,alias,password,importLegacy)} onSettings={openSettings} startRecovery={client.startRecovery} completeRecovery={client.completeRecovery} cancelRecovery={client.cancelRecovery} onRecoveryDone={alias=>void recoveredAccount(alias)}/>
 </SafeAreaView>;
}
const accent='#DCBC7F';
const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:'#090F15'},header:{height:78,paddingHorizontal:22,flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderBottomWidth:1,borderColor:'#24303A'},
 logo:{fontSize:19,fontWeight:'800',color:'#F7F6F2',letterSpacing:2},logoSub:{fontSize:8,color:'#88949D',letterSpacing:2.1,marginTop:5},badge:{paddingHorizontal:10,paddingVertical:6,borderColor:'#8E7350',borderWidth:1,borderRadius:5},badgeText:{color:accent,fontSize:10,fontWeight:'800',letterSpacing:1.5},
 body:{paddingHorizontal:21,paddingTop:25,paddingBottom:50},center:{flex:1,justifyContent:'center',alignItems:'center',gap:15},
 identityBar:{flexDirection:'row',alignItems:'center',gap:14,paddingHorizontal:21,paddingVertical:10,backgroundColor:'#111E28',borderBottomWidth:1,borderColor:'#273541'},identityTitle:{fontSize:12,color:'#E1D3B3',fontWeight:'700'},identityNote:{fontSize:10,color:'#98A5B0',marginTop:5},accountLink:{paddingHorizontal:14,paddingVertical:12,minHeight:44,borderRadius:8,borderWidth:1,borderColor:'#806948',justifyContent:'center'},accountLinkText:{fontSize:12,color:accent,fontWeight:'700'},archiveBanner:{backgroundColor:'#343025',paddingHorizontal:21,paddingVertical:12},archiveText:{fontSize:12,lineHeight:20,color:'#E7D7B6'},
 eyebrow:{fontSize:10,color:accent,fontWeight:'800',letterSpacing:2,marginBottom:10},heroNumber:{fontSize:35,color:'#F7F7F5',fontWeight:'700',letterSpacing:-1},pageTitle:{fontSize:31,color:'#F9F6F0',fontWeight:'700',marginBottom:10},
 muted:{color:'#92A0AC',fontSize:12,lineHeight:20},mutedSmall:{color:'#98A5B0',fontSize:11,lineHeight:18,marginTop:4},copy:{fontSize:13,color:'#BAC4CE',lineHeight:21,marginBottom:13},
 subhead:{fontSize:18,color:'#F3F2EE',fontWeight:'700',marginTop:24,marginBottom:14},card:{backgroundColor:'#141E28',borderWidth:1,borderColor:'#273541',borderRadius:16,padding:18,marginBottom:12},cardTitle:{fontSize:16,fontWeight:'700',color:'#F6F5F1',marginBottom:6},
 row:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',gap:10,marginVertical:8},rowValue:{color:'#F3F3EF',fontWeight:'700',fontSize:12,flexShrink:1,textAlign:'right'},
 barSpace:{height:180,justifyContent:'center',alignItems:'center'},barBack:{backgroundColor:'#8D6535',width:210,height:115,borderRadius:14,borderWidth:3,borderColor:'#EED09B',alignItems:'center',justifyContent:'center',shadowColor:'#D9AD69',shadowOpacity:.55,shadowRadius:22,elevation:12},barTop:{position:'absolute',top:0,left:9,right:9,height:26,backgroundColor:'#CE9E55',borderTopLeftRadius:10,borderTopRightRadius:10},barSymbol:{color:'#FFF0CB',fontSize:35,fontWeight:'900'},barWord:{fontSize:12,color:'#FFF1CB',fontWeight:'900',letterSpacing:2},barFine:{fontSize:8,color:'#FFF0CC',letterSpacing:2,marginTop:7},
 hRow:{flexDirection:'row',gap:10,marginTop:14},quick:{flex:1,borderWidth:1,borderColor:'#806948',padding:14,borderRadius:12},quickText:{color:accent,fontSize:12,fontWeight:'700'},
 button:{backgroundColor:accent,paddingVertical:14,paddingHorizontal:15,borderRadius:10,alignItems:'center',justifyContent:'center',marginTop:13,flex:1,minHeight:47},buttonSecondary:{backgroundColor:'#1D2B37',borderWidth:1,borderColor:'#4E6576'},buttonText:{fontSize:12,fontWeight:'800',color:'#15212B',textAlign:'center'},buttonSecondaryText:{color:'#EDF1F3'},
 metalRow:{backgroundColor:'#141E28',borderWidth:1,borderColor:'#25333F',flexDirection:'row',padding:12,borderRadius:13,alignItems:'center',gap:12,marginBottom:9},metalIcon:{borderWidth:1.5,width:48,height:48,borderRadius:12,alignItems:'center',justifyContent:'center'},metalText:{fontWeight:'800',fontSize:19},
 metalGrid:{flexDirection:'row',flexWrap:'wrap',gap:10,marginVertical:17},metalChoice:{width:'48%',flexGrow:1,padding:14,borderRadius:13,backgroundColor:'#141E28',borderWidth:1,borderColor:'#293846'},metalChoiceOn:{borderColor:accent,backgroundColor:'#242B2E'},choiceSymbol:{fontSize:23,fontWeight:'800'},choiceName:{color:'#F4F3EE',fontSize:14,fontWeight:'700',marginTop:8},
 inputLabel:{color:'#C1CBD2',fontSize:12,fontWeight:'600',marginTop:15,marginBottom:8},input:{color:'#FAF9F3',fontSize:18,fontWeight:'600',paddingHorizontal:15,paddingVertical:13,backgroundColor:'#09131C',borderColor:'#3C4B56',borderWidth:1,borderRadius:10,marginTop:6,marginBottom:8},
 walletGrid:{flexDirection:'row',flexWrap:'wrap',gap:10,marginTop:20},walletCard:{width:'48%',flexGrow:1,borderWidth:1,borderColor:'#36444D',backgroundColor:'#172530',padding:16,borderRadius:13},walletValue:{fontSize:16,fontWeight:'700',color:'#FFF9EB'},
 chips:{flexDirection:'row',flexWrap:'wrap',gap:7,marginVertical:6},chip:{paddingVertical:9,paddingHorizontal:11,borderRadius:8,borderWidth:1,borderColor:'#465766'},chipOn:{backgroundColor:'#665233',borderColor:accent},chipText:{color:'#AAB5BD',fontSize:11,fontWeight:'700'},chipTextOn:{color:'#FFE9B8'},
 disclaimer:{fontSize:11,lineHeight:18,color:'#98A5B0',marginVertical:15},historyRow:{padding:16,borderWidth:1,borderColor:'#273541',borderRadius:12,backgroundColor:'#141E28',marginTop:12},
 historyAmount:{color:'#F3F3EF',fontSize:14,lineHeight:22,fontWeight:'700',marginTop:4},historyLink:{color:accent,fontSize:12,lineHeight:20,fontWeight:'700',marginTop:10},historyLoading:{flexDirection:'row',gap:12,alignItems:'center',marginVertical:18},historyError:{backgroundColor:'#4B2E2A',padding:16,borderRadius:12,marginTop:14},quoteBox:{backgroundColor:'#0C1720',borderRadius:12,padding:14,marginTop:12},
 tabs:{height:68,borderTopWidth:1,borderColor:'#283540',backgroundColor:'#101922',flexDirection:'row',justifyContent:'space-around',paddingTop:10},tab:{alignItems:'center',justifyContent:'flex-start',flex:1,gap:8},tabDot:{height:4,width:19,backgroundColor:'#52606B',borderRadius:10},tabDotActive:{backgroundColor:accent},tabLabel:{fontSize:10,fontWeight:'600',color:'#90A1AE'},tabLabelActive:{color:accent},
 errorBox:{backgroundColor:'#4B2E2A',borderWidth:1,borderColor:'#AA685A',paddingHorizontal:20,paddingVertical:13},errorText:{color:'#FCE4D9',fontSize:12,lineHeight:18},
});
