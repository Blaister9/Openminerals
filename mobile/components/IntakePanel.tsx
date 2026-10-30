import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {parseIntake,intakeLabels,intakeProductionQuote,type IntakeSummary} from '../lib/intake';
import {custodyGrams,custodyMetalName,custodyMetals,type CustodyMetal} from '../lib/custody';
import {parsePositiveDecimal} from '../lib/presentation';
import {LotHistory} from './LotHistory';

type Props={identityKey:string;revision:number;get:<T>(path:string)=>Promise<T>;submit:(action:string,body:Record<string,string>,title:string,detail:string)=>void;disabled:boolean};
export function IntakePanel({identityKey,revision,get,submit,disabled}:Props){
  const [snapshot,setSnapshot]=useState<{identityKey:string;value:IntakeSummary}|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  const [metal,setMetal]=useState<CustodyMetal>('XAU'),[grams,setGrams]=useState('1.000'),[reason,setReason]=useState('Producción para presentación DEMO');
  const [historyLot,setHistoryLot]=useState<string|null>(null);
  const [visibleBatches,setVisibleBatches]=useState(20);
  const data=snapshot?.identityKey===identityKey?snapshot.value:null;
  const epoch=useRef(0),getRef=useRef(get);getRef.current=get;
  async function refresh(){if(disabled)return;const request=++epoch.current;setLoading(true);try{const next=parseIntake(await getRef.current('/api/demo/mine/intake'));if(request===epoch.current){setSnapshot({identityKey,value:next});setError('');}}catch(cause){if(request===epoch.current)setError(cause instanceof Error?cause.message:'No se pudo consultar recepción.');}finally{if(request===epoch.current)setLoading(false);}}
  useEffect(()=>{setHistoryLot(null);setError('');setVisibleBatches(20);},[identityKey]);
  useEffect(()=>{if(disabled)setLoading(false);else void refresh();return()=>{epoch.current++;};},[identityKey,revision,disabled]);
  useEffect(()=>setVisibleBatches(20),[metal]);
  const total=data?.totals[metal],available=data?.availability,quantity=parsePositiveDecimal(grams,3);
  const quote=intakeProductionQuote(grams,data,metal),stale=disabled||loading||!!error||!data?.availability;
  const batches=data?.batches.filter(item=>item.metal===metal)??[];
  const canProduce=!stale&&!!quote&&reason.trim().length>=3&&reason.trim().length<=160;
  return <View style={styles.panel}>
    <Text style={styles.eyebrow}>PRODUCCIÓN → VERIFICACIÓN → RECEPCIÓN</Text><Text accessibilityRole="header" style={styles.title}>Antes de vender.</Text>
    <Text style={styles.note}>Tres etapas DEMO. Producir o verificar no aumenta el disponible. Solo la recepción confirmada crea un lote vendible. No introducir ubicaciones ni datos operativos reales.</Text>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.rail}>{custodyMetals.map(value=><Pressable key={value} testID={'intake-metal-'+value} accessibilityRole="button" accessibilityState={{selected:metal===value}} onPress={()=>setMetal(value)} style={[styles.chip,metal===value&&styles.selected]}><Text style={styles.text}>{custodyMetalName(value)}</Text></Pressable>)}</ScrollView>
    {total&&<View style={styles.metrics}>{[['Producido, sin verificar',total.producedMg],['En verificación',total.pendingVerificationMg],['Recibido acumulado',total.receivedMg],['Salidas DEMO',total.deliveredMg]].map(([label,amount])=><View style={styles.metric} key={label}><Text style={styles.note}>{label}</Text><Text style={styles.value}>{custodyGrams(amount as number)}</Text></View>)}</View>}
    {available&&<View style={styles.metrics}>{[['Disponible para venta',available.inventoryMg[metal]],['Asignado a compradores',available.allocatedMg[metal]],['Reservado en el asignado',available.reservedMg[metal]],['Comprometido para entrega',available.deliveryCommittedMg[metal]]].map(([label,amount])=><View style={styles.metric} key={label}><Text style={styles.note}>{label}</Text><Text style={styles.value}>{custodyGrams(amount as number)}</Text></View>)}</View>}
    <Text style={styles.note}>Disponible + asignado = suministro activo. Reservas y compromisos pertenecen al asignado; no suman más metal.</Text>
    <Text style={styles.note}>Producido y en verificación son estados separados. Recibido acumulado incluye saldo inicial DEMO e ingresos; no implica producción histórica acreditada.</Text>
    {!!data&&!available&&<Text accessibilityRole="alert" style={styles.error}>Disponibilidad todavía no informada. Actualiza antes de registrar producción o recepción; no se asume un inventario de cero.</Text>}
    <Text style={styles.label}>Nueva producción simulada · gramos</Text><TextInput accessibilityLabel="Gramos de producción DEMO" value={grams} onChangeText={setGrams} keyboardType="decimal-pad" editable={!disabled} style={styles.input}/>
    <Text style={styles.label}>Motivo DEMO</Text><TextInput accessibilityLabel="Motivo de producción DEMO" value={reason} onChangeText={setReason} maxLength={160} editable={!disabled} style={styles.input}/>
    {quantity!==null&&quantity>=.1&&available&&!quote&&<Text accessibilityRole="alert" style={styles.error}>La cantidad supera la capacidad restante de la demostración, incluyendo lo producido y lo pendiente.</Text>}
    <Pressable accessibilityRole="button" disabled={!canProduce} onPress={()=>{if(quote)submit('mine/intake_produce',{metal,grams:quote.grams,reason:reason.trim()},'Registrar producción DEMO','Se registra '+custodyGrams(quote.mg)+' de '+custodyMetalName(metal)+'. No se habilitan ventas ni se acredita producción física.');}} style={[styles.button,!canProduce&&styles.disabled]}><Text style={styles.buttonText}>Registrar producido DEMO</Text></Pressable>
    {loading&&<ActivityIndicator color="#DCBC7F"/>}{!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <Pressable accessibilityRole="button" disabled={disabled||loading} onPress={()=>void refresh()} style={styles.refresh}><Text style={styles.text}>Actualizar recepciones</Text></Pressable>
    {!!data&&<Text style={styles.note}>Mostrando {Math.min(visibleBatches,batches.length)} de {batches.length} producciones DEMO de {custodyMetalName(metal)}.</Text>}
    {batches.slice(0,visibleBatches).map(item=><View key={item.id} style={styles.batch}>
      <Text style={styles.text}>{custodyGrams(item.mg)} · {intakeLabels[item.status]}</Text><Text selectable style={styles.identifier}>{item.id}</Text>
      {!!item.lotId&&<Text selectable style={styles.identifier}>{item.lotId}</Text>}
      {!!item.lotId&&<Pressable accessibilityRole="button" disabled={disabled} style={styles.refresh} onPress={()=>setHistoryLot(item.lotId!)}><Text style={styles.text}>Ver movimientos del lote</Text></Pressable>}
      {item.status!=='RECEIVED_DEMO'&&<Pressable accessibilityRole="button" disabled={!!stale} onPress={()=>submit(item.status==='PRODUCED_DEMO'?'mine/intake_verify':'mine/intake_receive',{batchId:item.id,reason:item.status==='PRODUCED_DEMO'?'Paso a verificación DEMO':'Recepción confirmada exclusivamente DEMO'},item.status==='PRODUCED_DEMO'?'Pasar a verificación DEMO':'Confirmar recepción DEMO',custodyGrams(item.mg)+' de '+custodyMetalName(item.metal)+'. '+(item.status==='PRODUCED_DEMO'?'Sigue fuera del inventario vendible.':'Creará un lote y aumentará el disponible una sola vez. Sin recepción física.'))} style={[styles.button,stale&&styles.disabled]}><Text style={styles.buttonText}>{item.status==='PRODUCED_DEMO'?'Pasar a verificación DEMO':'Recibir en custodia DEMO'}</Text></Pressable>}
    </View>)}
    {visibleBatches<batches.length&&<Pressable accessibilityRole="button" disabled={disabled} onPress={()=>setVisibleBatches(value=>value+20)} style={styles.refresh}><Text style={styles.text}>Mostrar más producciones DEMO</Text></Pressable>}
    {historyLot&&<LotHistory lotId={historyLot} operator identityKey={identityKey} get={get} disabled={disabled} onClose={()=>setHistoryLot(null)}/>}
  </View>;
}
const styles=StyleSheet.create({panel:{marginVertical:20,borderTopWidth:1,borderColor:'#35423A',paddingTop:22},eyebrow:{color:'#C5AC77',fontSize:9,letterSpacing:1},title:{color:'#EEE8DC',fontSize:29,lineHeight:38,fontFamily:'serif',marginTop:10},note:{color:'#A0B1A7',fontSize:12,lineHeight:19,marginTop:7},rail:{gap:8,paddingVertical:15},chip:{minHeight:44,paddingHorizontal:17,justifyContent:'center',borderWidth:1,borderColor:'#3F5146',borderRadius:22},selected:{backgroundColor:'#423C2B',borderColor:'#C3A875'},text:{color:'#E3D8C1',fontSize:12,lineHeight:21},metrics:{flexDirection:'row',flexWrap:'wrap',gap:12},metric:{width:'46%',paddingVertical:9},value:{color:'#F2E9D5',fontSize:21,fontVariant:['tabular-nums']},label:{color:'#B1C0B8',fontSize:12,marginTop:16},input:{color:'#EFE8D7',fontSize:16,minHeight:50,padding:12,borderWidth:1,borderColor:'#425347',borderRadius:9,marginTop:8},button:{backgroundColor:'#D4B77D',padding:14,minHeight:48,alignItems:'center',justifyContent:'center',borderRadius:9,marginTop:12},buttonText:{color:'#172019',fontSize:12,fontWeight:'700',textAlign:'center'},disabled:{opacity:.4},error:{color:'#F0B2A0',fontSize:12,lineHeight:19},batch:{paddingVertical:17,borderTopWidth:1,borderColor:'#344139'},identifier:{color:'#7F9589',fontSize:9,lineHeight:17},refresh:{minHeight:48,justifyContent:'center',marginTop:8}});
