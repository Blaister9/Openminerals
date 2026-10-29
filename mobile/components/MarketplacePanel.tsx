import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,StyleSheet,Switch,Text,View} from 'react-native';
import {filterMarketplaceOffers,marketplaceBuyBlocked,marketplaceBuyCommand,marketplaceGrams,marketplaceMetalName,marketplaceMetals,marketplaceMoney,parseMarketplaceCatalog,parseMarketplaceHistory,type MarketplaceCatalog,type MarketplaceFilter,type MarketplaceHistory,type MarketplaceOffer} from '../lib/marketplace';
import {receiptSummary,receiptTitle,type Receipt} from '../lib/receipt-presentation';

type Props={
  identityKey:string;get:<T>(path:string)=>Promise<T>;submit:(action:string,body:Record<string,string>,title:string,detail:string)=>void;
  disabled?:boolean;usdtMinor:number;refreshKey?:string;onHistory?:()=>void;onReceipt?:(receipt:Receipt)=>void;
};
type Scoped<T>={scope:string;value:T};
const message=(cause:unknown)=>cause instanceof Error?cause.message:'No se pudo consultar el marketplace demo. Reintenta.';
function Row({label,value}:{label:string;value:string}){return <View style={styles.row}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>}

export function MarketplacePanel({identityKey,get,submit,disabled=false,usdtMinor,refreshKey='',onHistory,onReceipt}:Props){
  const scope=identityKey,currentScope=useRef(scope);currentScope.current=scope;
  const getRef=useRef(get);getRef.current=get;
  const requests=useRef(0),initialized=useRef('');
  const [catalog,setCatalog]=useState<Scoped<MarketplaceCatalog>|null>(null);
  const [activity,setActivity]=useState<Scoped<MarketplaceHistory>|null>(null);
  const [loading,setLoading]=useState<Scoped<boolean>|null>(null);
  const [error,setError]=useState<Scoped<string>|null>(null);
  const [activityError,setActivityError]=useState<Scoped<string>|null>(null);
  const [filter,setFilter]=useState<MarketplaceFilter>('ALL');
  const [onlyOpen,setOnlyOpen]=useState(true);
  const data=catalog?.scope===scope?catalog.value:null;
  const history=activity?.scope===scope?activity.value:null;
  const busy=loading?.scope===scope&&loading.value;
  const problem=error?.scope===scope?error.value:'';
  const historyProblem=activityError?.scope===scope?activityError.value:'';
  const visible=data?filterMarketplaceOffers(data.offers,filter):[];
  const recent=history?.items.filter(receipt=>filter==='ALL'||(receipt.metal??receipt.offer?.metal)===filter)??[];
  async function refresh(){
    if(disabled)return;
    const request=++requests.current,requestedScope=scope;
    setLoading({scope,value:true});setError({scope,value:''});setActivityError({scope,value:''});
    const results=await Promise.allSettled([getRef.current<unknown>('/api/demo/marketplace'),getRef.current<unknown>('/api/demo/history?limit=50')]);
    if(currentScope.current!==requestedScope||request!==requests.current)return;
    try{
      if(results[0].status==='rejected')throw results[0].reason;
      setCatalog({scope,value:parseMarketplaceCatalog(results[0].value,identityKey)});
    }catch(cause){setError({scope,value:message(cause)});}
    try{
      if(results[1].status==='rejected')throw results[1].reason;
      setActivity({scope,value:parseMarketplaceHistory(results[1].value)});
    }catch(cause){setActivityError({scope,value:message(cause)});}
    setLoading({scope,value:false});
  }
  useEffect(()=>{
    initialized.current='';setFilter('ALL');setOnlyOpen(true);
    return ()=>{requests.current++;};
  },[scope]);
  useEffect(()=>{
    const update=`${scope}:${refreshKey}`;
    if(!disabled&&initialized.current!==update){initialized.current=update;void refresh();}
  },[scope,disabled,refreshKey]);
  function buy(offer:MarketplaceOffer){
    if(disabled||busy||problem)return;
    try{const command=marketplaceBuyCommand(offer,identityKey,usdtMinor);submit(command.action,command.body,command.title,command.detail);}
    catch(cause){setError({scope,value:message(cause)});}
  }
  return <>
    <Text style={styles.eyebrow}>MARKETPLACE · SIMULADO</Text><Text accessibilityRole="header" style={styles.title}>Entre compradores</Text>
    <View style={styles.notice}><Text style={styles.noticeTitle}>OFERTAS DEMO · SIN FONDOS REALES</Text><Text style={styles.copy}>Compra una oferta completa de otra cuenta de tu misma mina. Los USDT y los gramos son ficticios; no hay entrega física.</Text></View>
    <Text style={styles.copy}>Para publicar, entra en Metales y elige «Publicar oferta». Los gramos quedan reservados hasta vender o cancelar.</Text>
    <Row label="Tu saldo disponible" value={marketplaceMoney(usdtMinor)}/>
    <Pressable accessibilityRole="button" disabled={disabled||busy} onPress={()=>void refresh()} style={[styles.secondary,(disabled||busy)&&styles.disabled]}><Text style={styles.secondaryText}>Actualizar marketplace</Text></Pressable>
    {busy&&<View style={styles.loading}><ActivityIndicator color="#DCBC7F"/><Text style={styles.note}>Consultando ofertas de la mina…</Text></View>}
    {!!problem&&<View accessibilityRole="alert" style={styles.error}><Text style={styles.errorText}>{problem}</Text>{data&&<Text style={styles.errorText}>Se conserva el catálogo anterior. Actualiza antes de comprar.</Text>}</View>}
    <View style={styles.filters}>{(['ALL',...marketplaceMetals] as MarketplaceFilter[]).map(value=><Pressable key={value} accessibilityRole="button" accessibilityState={{selected:filter===value}} onPress={()=>setFilter(value)} style={[styles.chip,filter===value&&styles.chipOn]}><Text style={styles.chipText}>{value==='ALL'?'Todos':marketplaceMetalName(value)}</Text></Pressable>)}</View>
    <View style={styles.toggle}><Text style={styles.toggleLabel}>Solo ofertas abiertas</Text><Switch accessibilityLabel="Solo ofertas abiertas" value={onlyOpen} onValueChange={setOnlyOpen}/></View>
    {data&&<><Text style={styles.section}>{data.mine.name}</Text><Text style={styles.note}>{data.disclaimer}</Text><Text style={styles.note}>{visible.length} ofertas abiertas en el filtro seleccionado.</Text>
      {!visible.length&&<View style={styles.card}><Text style={styles.cardTitle}>Sin ofertas abiertas</Text><Text style={styles.note}>Prueba otro metal o publica una oferta con precio desde Metales.</Text></View>}
      {visible.map(offer=>{
        const blocked=marketplaceBuyBlocked(offer,identityKey,usdtMinor);
        return <View key={`${offer.seller.id}:${offer.id}`} style={styles.card}>
          <View style={styles.cardHeading}><Text style={styles.cardTitle}>{marketplaceMetalName(offer.metal)}</Text><Text style={styles.badge}>{offer.isOwn?'TU OFERTA':'ABIERTA'}</Text></View>
          <Row label="Cantidad completa" value={marketplaceGrams(offer.mg)}/><Row label="Vendedor demo" value={offer.seller.alias}/>
          {offer.priceMinorPerGram!==null?<>
            <Row label="Precio por gramo" value={marketplaceMoney(offer.priceMinorPerGram)}/><Row label={offer.isOwn?'Importe bruto':'Total que pagas'} value={marketplaceMoney(offer.baseMinor!)}/>
            <Row label={`Comisión del vendedor (${(offer.feeBps/100).toLocaleString('es-CO')}%)`} value={marketplaceMoney(offer.feeMinor!)}/><Row label="Neto para el vendedor" value={marketplaceMoney(offer.sellerNetMinor!)}/>
            <Text style={styles.note}>La comisión sale del importe del vendedor. El comprador paga el total indicado; no se añade otra comisión.</Text>
          </>:<Text style={styles.warning}>Reserva anterior sin precio: sus gramos siguen reservados y esta oferta no se puede comprar.</Text>}
          <Text style={styles.note}>Publicada: {new Date(offer.createdAt).toLocaleString('es-CO')}</Text><Text selectable style={styles.identifier}>{offer.id}</Text>
          {!!blocked&&<Text style={offer.isOwn?styles.note:styles.warning}>{blocked}</Text>}
          {offer.isOwn?<Pressable accessibilityRole="button" disabled={disabled||busy||!!problem} onPress={()=>submit('cancel_offer',{offerId:offer.id},'Cancelar oferta demo',`Se liberan ${marketplaceGrams(offer.mg)} de ${marketplaceMetalName(offer.metal)}. No se realiza ninguna venta.`)} style={[styles.secondary,(disabled||busy||!!problem)&&styles.disabled]}><Text style={styles.secondaryText}>Cancelar mi oferta</Text></Pressable>:<Pressable accessibilityRole="button" accessibilityLabel={`Comprar oferta completa de ${marketplaceGrams(offer.mg)} de ${marketplaceMetalName(offer.metal)} de ${offer.seller.alias}`} disabled={disabled||busy||!!problem||!!blocked} onPress={()=>buy(offer)} style={[styles.primary,(disabled||busy||!!problem||!!blocked)&&styles.disabled]}><Text style={styles.primaryText}>Revisar compra completa</Text></Pressable>}
        </View>;
      })}
    </>}
    {!onlyOpen&&<>
      <Text accessibilityRole="header" style={styles.section}>Mi actividad de marketplace</Text><Text style={styles.note}>Tus publicaciones, cancelaciones, compras y ventas. Los movimientos de otras cuentas permanecen privados.</Text>
      {!!historyProblem&&<View accessibilityRole="alert" style={styles.error}><Text style={styles.errorText}>{historyProblem}</Text><Text style={styles.note}>Actualiza el marketplace para reintentar esta consulta.</Text></View>}
      {history&&<Text style={styles.note}>Buscando en las {history.scannedCount} operaciones más recientes de tu cuenta{history.hasMore?`; hay ${history.totalOperations} operaciones en total`:''}.</Text>}
      {history&&!recent.length&&<Text style={styles.note}>No hay movimientos de marketplace para este metal en las operaciones consultadas.</Text>}
      {recent.map(receipt=>{
        const content=<><Text style={styles.cardTitle}>{receiptTitle(receipt)}</Text><Text style={styles.activityAmount}>{receiptSummary(receipt)}</Text><Text style={styles.note}>{receipt.action==='cancel_offer'?'Oferta cancelada':receipt.action==='offer'?'Publicación registrada':'Compra/venta registrada'} · {new Date(receipt.at).toLocaleString('es-CO')}</Text>{!!receipt.counterparty&&<Text style={styles.note}>Cuenta demo: {receipt.counterparty.alias}</Text>}{!!receipt.tradeId&&<Text selectable style={styles.identifier}>Operación compartida: {receipt.tradeId}</Text>}{onReceipt&&<Text style={styles.link}>Consultar comprobante →</Text>}</>;
        return onReceipt?<Pressable key={receipt.id} accessibilityRole="button" accessibilityLabel={`Ver comprobante: ${receiptTitle(receipt)}`} onPress={()=>onReceipt(receipt)} style={styles.card}>{content}</Pressable>:<View key={receipt.id} style={styles.card}>{content}</View>;
      })}
      {onHistory&&<Pressable accessibilityRole="button" onPress={onHistory} style={styles.secondary}><Text style={styles.secondaryText}>Abrir todo mi historial</Text></Pressable>}
      {!onHistory&&<Text style={styles.note}>Abre Actividad para consultar el historial completo y sus comprobantes.</Text>}
    </>}
  </>;
}
const styles=StyleSheet.create({
  eyebrow:{color:'#DCBC7F',fontSize:10,fontWeight:'800',letterSpacing:1.4,lineHeight:19,marginTop:30},title:{color:'#F6F5F1',fontSize:28,lineHeight:38,fontWeight:'700',marginVertical:10},copy:{color:'#BAC4CE',fontSize:13,lineHeight:22,marginVertical:7},notice:{padding:16,borderRadius:12,borderWidth:1,borderColor:'#665233',backgroundColor:'#241F18',marginVertical:10},noticeTitle:{color:'#DCBC7F',fontWeight:'800',fontSize:12,lineHeight:20},note:{color:'#98A5B0',fontSize:12,lineHeight:21,marginVertical:5},row:{flexDirection:'row',gap:16,alignItems:'flex-start',justifyContent:'space-between',paddingVertical:9},label:{color:'#AAB6C0',fontSize:12,lineHeight:21,flex:1},value:{color:'#F6F5F1',fontSize:13,lineHeight:21,fontWeight:'600',flex:1,textAlign:'right'},secondary:{minHeight:48,padding:14,borderRadius:10,borderWidth:1,borderColor:'#4E6576',backgroundColor:'#1D2B37',alignItems:'center',justifyContent:'center',marginTop:12},secondaryText:{color:'#EDF1F3',fontSize:13,fontWeight:'700',textAlign:'center'},primary:{minHeight:48,padding:15,borderRadius:10,backgroundColor:'#DCBC7F',alignItems:'center',justifyContent:'center',marginTop:12},primaryText:{color:'#15212B',fontSize:13,fontWeight:'800',textAlign:'center'},disabled:{opacity:.45},loading:{flexDirection:'row',gap:12,alignItems:'center',marginVertical:12},error:{backgroundColor:'#4B2E2A',padding:15,borderRadius:12,marginTop:15},errorText:{color:'#FCE4D9',fontSize:13,lineHeight:22},filters:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:20},chip:{minHeight:48,padding:11,borderWidth:1,borderColor:'#465766',borderRadius:9,justifyContent:'center'},chipOn:{backgroundColor:'#665233',borderColor:'#DCBC7F'},chipText:{fontSize:12,color:'#F7E4BD',fontWeight:'700'},toggle:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:16,marginTop:18},toggleLabel:{color:'#BAC4CE',fontSize:13,flex:1},section:{color:'#F6F5F1',fontSize:18,lineHeight:27,fontWeight:'700',marginTop:25,marginBottom:7},card:{backgroundColor:'#141E28',borderColor:'#273541',borderWidth:1,borderRadius:14,padding:17,marginTop:16},cardHeading:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:14},cardTitle:{color:'#F6F5F1',fontSize:16,lineHeight:25,fontWeight:'700',flexShrink:1},badge:{color:'#DCBC7F',fontSize:10,fontWeight:'800',lineHeight:20},warning:{color:'#E5C7A0',fontSize:12,lineHeight:21,marginTop:10},identifier:{color:'#98A5B0',fontSize:10,lineHeight:18,marginTop:8},activityAmount:{color:'#F6E5C2',fontSize:15,lineHeight:24,fontWeight:'700',marginTop:9},link:{color:'#DCBC7F',fontSize:12,lineHeight:21,fontWeight:'700',marginTop:10},
});
