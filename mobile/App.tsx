import React, {useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Alert,Animated,Pressable,SafeAreaView,ScrollView,StatusBar,StyleSheet,Text,TextInput,View} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';

// DEMO: todas las cifras, inventarios y solicitudes son simulados.
// No hay autenticación real, pasarela de pagos, exchange ni bóveda conectada.
type Metal = 'XAU'|'XAG'|'XPT'|'XPD';
type Currency = 'COP'|'EUR'|'USD'|'USDT';
type Tab = 'Inicio'|'Mercado'|'Billetera'|'Metales'|'Más';
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
};
type Summary = {transactionCount:number;demoFeesCollectedMinor:number;offersOpen:number;deliveriesPending:number;inventoryMg:Record<Metal,number>;holdingsMg:Record<Metal,number>};
const API=(process.env.EXPO_PUBLIC_API_URL||'').replace(/\/$/,'');
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
const sections:Tab[]=['Inicio','Mercado','Billetera','Metales','Más'];
const story=[
  {title:'01 · Origen',text:'La mina registra el origen y la disponibilidad del lote de metal.'},
  {title:'02 · Refinación',text:'Se documentan pureza, peso y el proceso de verificación del metal.'},
  {title:'03 · Custodia',text:'El activo se vincula a un esquema de custodia que deberá verificarse contractualmente.'},
  {title:'04 · Fracción digital',text:'El usuario compra gramos y ve su posición en un registro digital.'},
];

function Chip({label,active,onPress}:{label:string;active:boolean;onPress:()=>void}){
 return <Pressable onPress={onPress} style={[styles.chip,active&&styles.chipOn]}><Text style={[styles.chipText,active&&styles.chipTextOn]}>{label}</Text></Pressable>;
}
function Button({label,onPress,secondary=false,disabled=false}:{label:string;onPress:()=>void;secondary?:boolean;disabled?:boolean}){
 return <Pressable disabled={disabled} onPress={onPress} style={[styles.button,secondary&&styles.buttonSecondary,disabled&&{opacity:.45}]}><Text style={[styles.buttonText,secondary&&styles.buttonSecondaryText]}>{label}</Text></Pressable>;
}
function Card({children}:{children:React.ReactNode}){return <View style={styles.card}>{children}</View>}
function Sub({children}:{children:React.ReactNode}){return <Text style={styles.subhead}>{children}</Text>}
function Row({left,right}:{left:string;right:string}){return <View style={styles.row}><Text style={styles.muted}>{left}</Text><Text style={styles.rowValue}>{right}</Text></View>}
function GoldBar(){
 const spin=useRef(new Animated.Value(0)).current;
 useEffect(()=>{const loop=Animated.loop(Animated.sequence([
  Animated.timing(spin,{toValue:1,duration:2200,useNativeDriver:true}),
  Animated.timing(spin,{toValue:0,duration:2200,useNativeDriver:true})]));loop.start();return()=>loop.stop();},[spin]);
 const tilt=spin.interpolate({inputRange:[0,1],outputRange:['-12deg','14deg']});
 return <View style={styles.barSpace}><Animated.View style={[styles.barBack,{transform:[{perspective:650},{rotateY:tilt}]}]}>
  <View style={styles.barTop}/><Text style={styles.barSymbol}>Au</Text><Text style={styles.barWord}>OPENMINERALS</Text><Text style={styles.barFine}>FINE GOLD · CONCEPTO</Text>
 </Animated.View></View>;
}
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
 const [storyStep,setStoryStep]=useState(0);
 const [operatorVisible,setOperatorVisible]=useState(false);
 const [metalAction,setMetalAction]=useState<'sell'|'offer'|'delivery'>('sell');
 const [sellGrams,setSellGrams]=useState('0.500');
 const sessionRef=useRef('');
 async function load(id:string,loadSummary=false){
  if(!API) throw new Error('Falta EXPO_PUBLIC_API_URL en mobile/.env. Conecta primero la API de Railway.');
  const res=await fetch(`${API}/api/demo/state`,{headers:{'x-demo-session':id}});
  const json=await res.json();if(!res.ok)throw new Error(json.error||'Error en API');setState(json);
  if(loadSummary){const sum=await fetch(`${API}/api/demo/operator/summary`,{headers:{'x-demo-session':id}});if(sum.ok)setSummary(await sum.json());}
 }
 useEffect(()=>{let alive=true;(async()=>{
  try{let id=await AsyncStorage.getItem('openminerals-demo-session');
   if(!id){id=Crypto.randomUUID();await AsyncStorage.setItem('openminerals-demo-session',id);}
   if(!alive)return;sessionRef.current=id;setSession(id);await load(id);
  }catch(e){if(alive)setProblem(messageError(e));}
 })();return()=>{alive=false};},[]);
 async function refresh(){if(!session)return;setBusy(true);try{await load(session,true);setProblem('');}catch(e){setProblem(messageError(e));}finally{setBusy(false);}}
 async function perform(action:string,body:Record<string,string>,title:string,detail:string){
  if(busy||!session)return;
  Alert.alert(title,`${detail}\n\nEsta operación es 100 % simulada.`,[
   {text:'Cancelar',style:'cancel'},
   {text:'Confirmar demo',onPress:async()=>{
    setBusy(true);
    try{
     const res=await fetch(`${API}/api/demo/${action}`,{method:'POST',headers:{'Content-Type':'application/json','x-demo-session':session,'Idempotency-Key':Crypto.randomUUID()},body:JSON.stringify(body)});
     const data=await res.json();if(!res.ok)throw new Error(data.error||'Operación rechazada');setState(data.state);setProblem('');
     Alert.alert('Operación simulada',`Comprobante: ${data.receipt.id}\nOperación registrada en el historial.`);
    }catch(e){Alert.alert('No se pudo completar',messageError(e));}finally{setBusy(false);}
   }}
  ]);
 }
 const pos=state?metals.reduce((a,m)=>a+Math.ceil(state.holdingsMg[m.code]*state.priceCentsPerGram[m.code]/1000),0):0;
 const reserved=(metal:Metal)=>state?state.offers.filter(o=>o.metal===metal&&o.status==='OPEN').reduce((a,o)=>a+o.mg,0)+state.custodyRequests.filter(d=>d.metal===metal&&d.status==='PENDING_QUOTE').reduce((a,d)=>a+d.mg,0):0;
 function home(){return <>
  <Text style={styles.eyebrow}>PATRIMONIO DE METALES · DEMO</Text>
  <Text style={styles.heroNumber}>{money(pos)}</Text>
  <Text style={styles.muted}>Valor indicativo de tus posiciones · precios ficticios</Text>
  <GoldBar/>
  <View style={styles.hRow}>
   <Pressable onPress={()=>setTab('Mercado')} style={styles.quick}><Text style={styles.quickText}>Comprar metales  →</Text></Pressable>
   <Pressable onPress={()=>setTab('Billetera')} style={styles.quick}><Text style={styles.quickText}>Abrir billetera  →</Text></Pressable>
  </View>
  <Sub>Del origen a tu portafolio</Sub>
  <Card><Text style={styles.eyebrow}>RECORRIDO INTERACTIVO {storyStep+1} / 4</Text><Text style={styles.cardTitle}>{story[storyStep].title}</Text><Text style={styles.copy}>{story[storyStep].text}</Text>
   <View style={styles.hRow}><Button label="Anterior" secondary onPress={()=>setStoryStep(Math.max(0,storyStep-1))}/><Button label={storyStep===3?'Reiniciar':'Siguiente'} onPress={()=>setStoryStep((storyStep+1)%4)}/></View>
   <Text style={styles.mutedSmall}>Narrativa conceptual. Sin certificaciones ni inventario real verificados.</Text>
  </Card>
  <Sub>Mercado ilustrativo</Sub>
  {metals.map(m=><Pressable key={m.code} onPress={()=>{setCurrentMetal(m.code);setTab('Mercado');}} style={styles.metalRow}>
   <View style={[styles.metalIcon,{borderColor:m.color}]}><Text style={[styles.metalText,{color:m.color}]}>{m.symbol}</Text></View>
   <View style={{flex:1}}><Text style={styles.cardTitle}>{m.name}</Text><Text style={styles.mutedSmall}>Cotización simulada por gramo</Text></View>
   <Text style={styles.rowValue}>{money(state?.priceCentsPerGram[m.code]||0)}/g</Text>
  </Pressable>)}
 </>}
 function market(){const m=meta(currentMetal);const estimated=state?Math.ceil(state.priceCentsPerGram[currentMetal]*Number(grams||0)*1.01):0;
  return <><Text style={styles.eyebrow}>COMPRAVENTA DE METALES</Text><Text style={styles.pageTitle}>Mercado</Text><Text style={styles.copy}>Compra fracciones de oro, plata, platino o paladio. La liquidación simulada se realiza en USDT.</Text>
   <View style={styles.metalGrid}>{metals.map(v=><Pressable key={v.code} onPress={()=>setCurrentMetal(v.code)} style={[styles.metalChoice,currentMetal===v.code&&styles.metalChoiceOn]}>
    <Text style={[styles.choiceSymbol,{color:v.color}]}>{v.symbol}</Text><Text style={styles.choiceName}>{v.name}</Text><Text style={styles.mutedSmall}>{money(state?.priceCentsPerGram[v.code]||0)}/g</Text>
   </Pressable>)}</View>
   <Card><Text style={styles.eyebrow}>{m.name.toUpperCase()} · {m.symbol}</Text><Text style={styles.cardTitle}>Comprar gramos</Text><Text style={styles.copy}>Referencia del demo: {money(state?.priceCentsPerGram[currentMetal]||0)} / g</Text>
    <Text style={styles.inputLabel}>Cantidad en gramos</Text><TextInput accessibilityLabel="Cantidad de metal en gramos" style={styles.input} value={grams} keyboardType="decimal-pad" onChangeText={setGrams} placeholder="2.000" placeholderTextColor="#667385"/>
    <Row left="Importe estimado con comisión" right={money(estimated)}/><Row left="Saldo USDT" right={money(state?.walletMinor.USDT||0)}/>
    <Text style={styles.mutedSmall}>El servidor calcula el importe definitivo. Comisión de compra demo: 1 %.</Text>
    <Button label={busy?'Procesando...':'Confirmar compra simulada'} disabled={busy} onPress={()=>perform('buy',{metal:currentMetal,grams},`Comprar ${grams} g de ${m.name}`,`Coste aproximado: ${money(estimated)}. Se descontará de tu saldo USDT.`)}/>
   </Card>
   <Text style={styles.disclaimer}>Ningún gramo en esta pantalla representa una existencia física acreditada.</Text>
  </>;
 }
 function wallet(){return <><Text style={styles.eyebrow}>CUENTAS MULTIDIVISA</Text><Text style={styles.pageTitle}>Billetera</Text><Text style={styles.copy}>Cuatro saldos independientes con movimientos y conversiones simuladas.</Text>
  <View style={styles.walletGrid}>{currencies.map(c=><View key={c} style={styles.walletCard}><Text style={styles.eyebrow}>{c}</Text><Text style={styles.walletValue}>{money(state?.walletMinor[c]||0,c)}</Text></View>)}</View>
  <Sub>Convertir saldo</Sub><Card><Text style={styles.inputLabel}>De</Text><View style={styles.chips}>{currencies.map(c=><Chip key={c} label={c} active={from===c} onPress={()=>{setFrom(c);if(c===to)setTo(c==='USD'?'USDT':'USD');}}/>)}</View>
   <Text style={styles.inputLabel}>A</Text><View style={styles.chips}>{currencies.map(c=><Chip key={c} label={c} active={to===c} onPress={()=>{setTo(c);if(c===from)setFrom(c==='USD'?'USDT':'USD');}}/>)}</View>
   <Text style={styles.inputLabel}>Importe</Text><TextInput accessibilityLabel="Cantidad de dinero para convertir" style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad"/>
   <Text style={styles.mutedSmall}>Tasa fija exclusivamente de demostración.</Text><Button label="Convertir en demo" disabled={busy} onPress={()=>perform('convert',{from,to,amount},`Convertir ${from} a ${to}`,`Importe: ${amount} ${from}.`)}/>
  </Card>
  <Sub>Ingresos y retiros simulados</Sub><Card><Text style={styles.copy}>Estos movimientos son pruebas de saldo: no conectan bancos ni redes blockchain.</Text>
   <View style={styles.chips}>{currencies.map(c=><Chip key={c} label={c} active={currency===c} onPress={()=>setCurrency(c)}/>)}</View>
   <TextInput accessibilityLabel="Cantidad para ingresar o retirar" style={styles.input} value={amount} onChangeText={setAmount} keyboardType="decimal-pad"/>
   <View style={styles.hRow}><Button label="Simular ingreso" onPress={()=>perform('deposit',{currency,amount},'Simular ingreso',`Abono ficticio: ${money(Number(amount||0)*100,currency)}.`)}/>
   <Button label="Simular retiro" secondary onPress={()=>perform('withdraw',{currency,amount},'Simular retiro',`Cargo ficticio: ${amount} ${currency}.`)}/></View>
  </Card></>}
 function holdings(){const m=meta(currentMetal);const available=(state?.holdingsMg[currentMetal]||0)-reserved(currentMetal);
  return <><Text style={styles.eyebrow}>MIS POSICIONES</Text><Text style={styles.pageTitle}>Mis metales</Text><Text style={styles.copy}>Consulta las cantidades adquiridas y su valor de referencia.</Text>
   {metals.map(v=><Pressable key={v.code} onPress={()=>setCurrentMetal(v.code)} style={[styles.metalRow,currentMetal===v.code&&{borderColor:accent}]}>
    <View style={[styles.metalIcon,{borderColor:v.color}]}><Text style={[styles.metalText,{color:v.color}]}>{v.symbol}</Text></View>
    <View style={{flex:1}}><Text style={styles.cardTitle}>{v.name}</Text><Text style={styles.mutedSmall}>{gram(state?.holdingsMg[v.code]||0)} · disponible {gram((state?.holdingsMg[v.code]||0)-reserved(v.code))}</Text></View>
    <Text style={styles.rowValue}>{money(Math.ceil((state?.holdingsMg[v.code]||0)*(state?.priceCentsPerGram[v.code]||0)/1000))}</Text>
   </Pressable>)}
   <Sub>Gestionar {m.name.toLowerCase()}</Sub><Card><Row left="Disponible para operar" right={gram(available)}/><Row left="Reservado en ofertas/entrega" right={gram(reserved(currentMetal))}/>
    <View style={styles.chips}><Chip label="Vender" active={metalAction==='sell'} onPress={()=>setMetalAction('sell')}/><Chip label="Publicar oferta" active={metalAction==='offer'} onPress={()=>setMetalAction('offer')}/><Chip label="Entrega física" active={metalAction==='delivery'} onPress={()=>setMetalAction('delivery')}/></View>
    <Text style={styles.inputLabel}>Gramos</Text><TextInput accessibilityLabel="Gramos para operación" style={styles.input} value={sellGrams} onChangeText={setSellGrams} keyboardType="decimal-pad"/>
    <Text style={styles.mutedSmall}>{metalAction==='delivery'?'Se solicita una cotización; no se genera un envío ni un impuesto real.':metalAction==='offer'?'La cantidad queda reservada. Publicar no significa que exista un comprador.':'La recompra se simula a precio de referencia, menos 1,2 % de comisión.'}</Text>
    <Button label={metalAction==='sell'?'Simular venta':metalAction==='offer'?'Publicar oferta demo':'Solicitar cotización de entrega'} disabled={busy} onPress={()=>perform(metalAction,{metal:currentMetal,grams:sellGrams},'Confirmar operación',`${sellGrams} gramos de ${m.name}.`)}/>
   </Card>
   <Sub>Solicitudes y ofertas</Sub>
   {state?.offers.filter(o=>o.status==='OPEN').map(o=><Card key={o.id}><Row left={`Oferta ${meta(o.metal).name}`} right={gram(o.mg)}/><Button label="Cancelar oferta" secondary onPress={()=>perform('cancel_offer',{offerId:o.id},'Cancelar oferta',`Se liberan ${gram(o.mg)}.`)}/></Card>)}
   {state?.custodyRequests.filter(d=>d.status==='PENDING_QUOTE').map(d=><Card key={d.id}><Row left={`Entrega ${meta(d.metal).name}`} right={gram(d.mg)}/><Text style={styles.mutedSmall}>Pendiente de cotización · sin envío real.</Text><Button label="Cancelar solicitud" secondary onPress={()=>perform('cancel_delivery',{deliveryId:d.id},'Cancelar entrega',`Se liberan ${gram(d.mg)}.`)}/></Card>)}
  </>}
 function more(){return <><Text style={styles.eyebrow}>CONTROL Y TRANSPARENCIA</Text><Text style={styles.pageTitle}>Actividad</Text>
  <Card><Text style={styles.cardTitle}>Cuenta de demostración</Text><Text style={styles.copy}>Sin verificación de identidad, sin dinero depositado y sin titularidad real acreditada.</Text><Row left="Modo" right="SIMULACIÓN"/><Row left="Sesión" right={`${session.slice(0,8)}…`}/><Button label="Actualizar datos" secondary onPress={refresh}/></Card>
  <Sub>Movimientos recientes</Sub>{!state?.movements.length&&<Text style={styles.muted}>Aún no hay operaciones.</Text>}
  {state?.movements.slice(0,20).map(item=><View key={item.id} style={styles.historyRow}><Text style={styles.rowValue}>{item.label}</Text><Text style={styles.mutedSmall}>{new Date(item.at).toLocaleString('es-CO')} · {item.id}</Text></View>)}
  <Sub>Vista del operador de la mina</Sub><Card><Text style={styles.copy}>Muestra qué podría consultar la empresa: inventario, operaciones y solicitudes. Datos ficticios y sin permisos reales.</Text><Button label={operatorVisible?'Ocultar panel':'Abrir panel de la mina'} onPress={async()=>{if(!operatorVisible)await refresh();setOperatorVisible(!operatorVisible);}} secondary/>
   {operatorVisible&&<><Row left="Compras y ventas del demo" right={String(summary?.transactionCount||0)}/><Row left="Comisiones simuladas" right={money(summary?.demoFeesCollectedMinor||0)}/><Row left="Ofertas pendientes" right={String(summary?.offersOpen||0)}/><Row left="Cotizaciones de entrega" right={String(summary?.deliveriesPending||0)}/>
    {metals.map(v=><Row key={v.code} left={`Inventario ficticio ${v.name}`} right={gram(summary?.inventoryMg[v.code]||0)}/>)}
   </>}
  </Card><Text style={styles.disclaimer}>El panel del operador requerirá roles, permisos y auditoría para uso real.</Text>
  </>}
 return <SafeAreaView style={styles.screen}><StatusBar barStyle="light-content" backgroundColor="#090F15"/>
  <View style={styles.header}><View><Text style={styles.logo}>OPEN<Text style={{color:accent}}>MINERALS</Text></Text><Text style={styles.logoSub}>METALS · OWNERSHIP · TECHNOLOGY</Text></View><View style={styles.badge}><Text style={styles.badgeText}>DEMO</Text></View></View>
  {!!problem&&<Pressable onPress={refresh} style={styles.errorBox}><Text style={styles.errorText}>{problem}\nToca aquí para volver a intentar.</Text></Pressable>}
  {!state?<View style={styles.center}>{!problem&&<ActivityIndicator color={accent}/>}<Text style={styles.muted}>Preparando experiencia móvil…</Text></View>:
  <ScrollView key={tab} style={{flex:1}} contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
   {tab==='Inicio'?home():tab==='Mercado'?market():tab==='Billetera'?wallet():tab==='Metales'?holdings():more()}
  </ScrollView>}
  <View style={styles.tabs}>{sections.map(t=><Pressable key={t} onPress={()=>setTab(t)} style={styles.tab}><View style={[styles.tabDot,tab===t&&styles.tabDotActive]}/><Text style={[styles.tabLabel,tab===t&&styles.tabLabelActive]}>{t}</Text></Pressable>)}</View>
 </SafeAreaView>;
}
const accent='#DCBC7F';
const styles=StyleSheet.create({
 screen:{flex:1,backgroundColor:'#090F15'},header:{height:78,paddingHorizontal:22,flexDirection:'row',justifyContent:'space-between',alignItems:'center',borderBottomWidth:1,borderColor:'#24303A'},
 logo:{fontSize:19,fontWeight:'800',color:'#F7F6F2',letterSpacing:2},logoSub:{fontSize:8,color:'#88949D',letterSpacing:2.1,marginTop:5},badge:{paddingHorizontal:10,paddingVertical:6,borderColor:'#8E7350',borderWidth:1,borderRadius:5},badgeText:{color:accent,fontSize:10,fontWeight:'800',letterSpacing:1.5},
 body:{paddingHorizontal:21,paddingTop:25,paddingBottom:50},center:{flex:1,justifyContent:'center',alignItems:'center',gap:15},
 eyebrow:{fontSize:10,color:accent,fontWeight:'800',letterSpacing:2,marginBottom:10},heroNumber:{fontSize:35,color:'#F7F7F5',fontWeight:'700',letterSpacing:-1},pageTitle:{fontSize:31,color:'#F9F6F0',fontWeight:'700',marginBottom:10},
 muted:{color:'#92A0AC',fontSize:12,lineHeight:20},mutedSmall:{color:'#98A5B0',fontSize:11,lineHeight:18,marginTop:4},copy:{fontSize:13,color:'#BAC4CE',lineHeight:21,marginBottom:13},
 subhead:{fontSize:18,color:'#F3F2EE',fontWeight:'700',marginTop:24,marginBottom:14},card:{backgroundColor:'#141E28',borderWidth:1,borderColor:'#273541',borderRadius:16,padding:18,marginBottom:12},cardTitle:{fontSize:16,fontWeight:'700',color:'#F6F5F1',marginBottom:6},
 row:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:10,marginVertical:8},rowValue:{color:'#F3F3EF',fontWeight:'700',fontSize:12},
 barSpace:{height:180,justifyContent:'center',alignItems:'center'},barBack:{backgroundColor:'#8D6535',width:210,height:115,borderRadius:14,borderWidth:3,borderColor:'#EED09B',alignItems:'center',justifyContent:'center',shadowColor:'#D9AD69',shadowOpacity:.55,shadowRadius:22,elevation:12},barTop:{position:'absolute',top:0,left:9,right:9,height:26,backgroundColor:'#CE9E55',borderTopLeftRadius:10,borderTopRightRadius:10},barSymbol:{color:'#FFF0CB',fontSize:35,fontWeight:'900'},barWord:{fontSize:12,color:'#FFF1CB',fontWeight:'900',letterSpacing:2},barFine:{fontSize:8,color:'#FFF0CC',letterSpacing:2,marginTop:7},
 hRow:{flexDirection:'row',gap:10,marginTop:14},quick:{flex:1,borderWidth:1,borderColor:'#806948',padding:14,borderRadius:12},quickText:{color:accent,fontSize:12,fontWeight:'700'},
 button:{backgroundColor:accent,paddingVertical:14,paddingHorizontal:15,borderRadius:10,alignItems:'center',justifyContent:'center',marginTop:13,flex:1,minHeight:47},buttonSecondary:{backgroundColor:'#1D2B37',borderWidth:1,borderColor:'#4E6576'},buttonText:{fontSize:12,fontWeight:'800',color:'#15212B',textAlign:'center'},buttonSecondaryText:{color:'#EDF1F3'},
 metalRow:{backgroundColor:'#141E28',borderWidth:1,borderColor:'#25333F',flexDirection:'row',padding:12,borderRadius:13,alignItems:'center',gap:12,marginBottom:9},metalIcon:{borderWidth:1.5,width:48,height:48,borderRadius:12,alignItems:'center',justifyContent:'center'},metalText:{fontWeight:'800',fontSize:19},
 metalGrid:{flexDirection:'row',flexWrap:'wrap',gap:10,marginVertical:17},metalChoice:{width:'48%',flexGrow:1,padding:14,borderRadius:13,backgroundColor:'#141E28',borderWidth:1,borderColor:'#293846'},metalChoiceOn:{borderColor:accent,backgroundColor:'#242B2E'},choiceSymbol:{fontSize:23,fontWeight:'800'},choiceName:{color:'#F4F3EE',fontSize:14,fontWeight:'700',marginTop:8},
 inputLabel:{color:'#C1CBD2',fontSize:12,fontWeight:'600',marginTop:15,marginBottom:8},input:{color:'#FAF9F3',fontSize:18,fontWeight:'600',paddingHorizontal:15,paddingVertical:13,backgroundColor:'#09131C',borderColor:'#3C4B56',borderWidth:1,borderRadius:10,marginTop:6,marginBottom:8},
 walletGrid:{flexDirection:'row',flexWrap:'wrap',gap:10,marginTop:20},walletCard:{width:'48%',flexGrow:1,borderWidth:1,borderColor:'#36444D',backgroundColor:'#172530',padding:16,borderRadius:13},walletValue:{fontSize:16,fontWeight:'700',color:'#FFF9EB'},
 chips:{flexDirection:'row',flexWrap:'wrap',gap:7,marginVertical:6},chip:{paddingVertical:9,paddingHorizontal:11,borderRadius:8,borderWidth:1,borderColor:'#465766'},chipOn:{backgroundColor:'#665233',borderColor:accent},chipText:{color:'#AAB5BD',fontSize:11,fontWeight:'700'},chipTextOn:{color:'#FFE9B8'},
 disclaimer:{fontSize:11,lineHeight:18,color:'#98A5B0',marginVertical:15},historyRow:{paddingVertical:12,borderBottomWidth:1,borderColor:'#273541'},
 tabs:{height:68,borderTopWidth:1,borderColor:'#283540',backgroundColor:'#101922',flexDirection:'row',justifyContent:'space-around',paddingTop:10},tab:{alignItems:'center',justifyContent:'flex-start',flex:1,gap:8},tabDot:{height:4,width:19,backgroundColor:'#52606B',borderRadius:10},tabDotActive:{backgroundColor:accent},tabLabel:{fontSize:10,fontWeight:'600',color:'#90A1AE'},tabLabelActive:{color:accent},
 errorBox:{backgroundColor:'#4B2E2A',borderWidth:1,borderColor:'#AA685A',paddingHorizontal:20,paddingVertical:13},errorText:{color:'#FCE4D9',fontSize:12,lineHeight:18},
});
