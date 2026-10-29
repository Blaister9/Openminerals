import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Modal,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {ModalSurface} from './ModalSurface';
import {custodyGrams,custodyMetalName} from '../lib/custody';
import {lotHistoryPath,lotMovementLabel,mergeLotHistory,parseLotHistory,type LotHistory as History} from '../lib/custody-history';

type Props={lotId:string;operator:boolean;identityKey:string;get:<T>(path:string)=>Promise<T>;disabled:boolean;onClose:()=>void};
export function LotHistory({lotId,operator,identityKey,get,disabled,onClose}:Props){
  const scope=`${operator}:${identityKey}:${lotId}`,active=useRef(scope);active.current=scope;
  const requests=useRef(0),lastReset=useRef(true),getRef=useRef(get);getRef.current=get;
  const [snapshot,setSnapshot]=useState<{scope:string;value:History}|null>(null),[loading,setLoading]=useState(false),[problem,setProblem]=useState('');
  const data=snapshot?.scope===scope?snapshot.value:null;
  async function load(reset=true){
    if(disabled||!reset&&!data?.nextCursor)return;
    const request=++requests.current,requestedScope=scope;lastReset.current=reset;setLoading(true);setProblem('');
    try{
      const response=await getRef.current<unknown>(lotHistoryPath(lotId,reset?null:data!.nextCursor));
      if(request!==requests.current||active.current!==requestedScope)return;
      const page=parseLotHistory(response,lotId,operator,identityKey);
      setSnapshot({scope,value:{...page,items:reset?page.items:mergeLotHistory(data?.items??[],page.items)}});
    }catch(error){if(request===requests.current&&active.current===requestedScope)setProblem(error instanceof Error?error.message:'No se pudo consultar el historial del lote. Reintenta.');}
    finally{if(request===requests.current&&active.current===requestedScope)setLoading(false);}
  }
  useEffect(()=>{if(disabled)setLoading(false);else void load();return()=>{requests.current++;};},[scope,disabled]);
  return <Modal visible animationType="none" presentationStyle="pageSheet" onRequestClose={onClose}>
    <ModalSurface onEscape={onClose}>
      <View style={styles.header}><Text accessibilityRole="header" style={styles.title}>Historial del lote DEMO</Text><Pressable accessibilityRole="button" accessibilityLabel="Cerrar historial del lote" onPress={onClose} style={styles.close}><Text style={styles.link}>Cerrar</Text></Pressable></View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text selectable style={styles.identifier}>{lotId}</Text><Text style={styles.notice}>MOVIMIENTOS SIMULADOS · SIN CUSTODIA FÍSICA</Text>
        <Pressable accessibilityRole="button" disabled={disabled||loading} onPress={()=>void load()} style={styles.button}><Text style={styles.link}>Actualizar historial del lote</Text></Pressable>
        {loading&&<View style={styles.loading}><ActivityIndicator color="#DCBC7F"/><Text style={styles.note}>Consultando movimientos del lote…</Text></View>}
        {!!problem&&<View accessibilityRole="alert" style={styles.error}><Text style={styles.errorText}>{problem}</Text>{!!data&&<Text style={styles.errorText}>Conservamos los movimientos ya consultados.</Text>}<Pressable accessibilityRole="button" disabled={disabled||loading} onPress={()=>void load(lastReset.current)} style={styles.button}><Text style={styles.link}>Reintentar historial del lote</Text></Pressable></View>}
        {data&&<>
          <Text style={styles.heading}>{custodyMetalName(data.lot.metal)} · {data.mine.name}</Text><Text style={styles.note}>{data.disclaimer}</Text>
          <View style={styles.baseline}><Text style={styles.notice}>Inicio del registro: {new Date(data.historyStartedAt).toLocaleString('es-CO')}</Text><Text style={styles.note}>Los saldos iniciales reflejan el estado existente al habilitar este historial. No reconstruyen operaciones anteriores ni acreditan un movimiento físico.</Text></View>
          <Text style={styles.note}>Mostrando {data.items.length} de {data.total} movimientos {operator?'de este lote':'autorizados para tu cuenta'}.</Text>
          {!data.items.length&&<Text style={styles.note}>No hay movimientos disponibles para esta consulta.</Text>}
          {data.items.map(event=><View key={event.id} style={styles.card}>
            <Text style={styles.heading}>{lotMovementLabel(event.kind,event.direction)}</Text><Text style={styles.amount}>{custodyGrams(event.mg)}</Text><Text style={styles.note}>{new Date(event.at).toLocaleString('es-CO')}</Text>
            {operator&&event.account&&<Text style={styles.note}>{event.kind==='MARKET_TRANSFER'?'Vendedor demo':'Cuenta demo'}: {event.account.alias}</Text>}{operator&&event.counterparty&&<Text style={styles.note}>Comprador demo: {event.counterparty.alias}</Text>}
            {!!event.referenceId&&<Text selectable style={styles.identifier}>Referencia: {event.referenceId}</Text>}<Text selectable style={styles.identifier}>{event.id}</Text>
          </View>)}
          {!!data.nextCursor&&<Pressable accessibilityRole="button" disabled={disabled||loading} onPress={()=>void load(false)} style={styles.button}><Text style={styles.link}>Cargar más movimientos del lote</Text></Pressable>}
        </>}
      </ScrollView>
    </ModalSurface>
  </Modal>;
}
const styles=StyleSheet.create({
  header:{padding:16,borderBottomWidth:1,borderColor:'#273541',flexDirection:'row',gap:12,alignItems:'center'},title:{color:'#F6F5F1',fontSize:20,fontWeight:'700',flex:1},close:{minHeight:48,padding:12,justifyContent:'center'},body:{padding:22,paddingBottom:48},heading:{color:'#F6F5F1',fontSize:16,lineHeight:25,fontWeight:'700',marginVertical:5},note:{color:'#AAB6C0',fontSize:12,lineHeight:21,marginVertical:5},notice:{color:'#DCBC7F',fontSize:12,lineHeight:21,fontWeight:'700',marginVertical:10},identifier:{color:'#AAB6C0',fontSize:10,lineHeight:19,marginVertical:5},card:{padding:16,marginTop:14,borderRadius:12,borderWidth:1,borderColor:'#33414D',backgroundColor:'#141E28'},amount:{color:'#F6E5C2',fontSize:19,lineHeight:28,fontWeight:'700'},button:{minHeight:48,padding:14,marginTop:14,borderRadius:10,borderWidth:1,borderColor:'#4E6576',backgroundColor:'#1D2B37',alignItems:'center',justifyContent:'center'},link:{color:'#DCBC7F',fontSize:13,lineHeight:21,fontWeight:'700',textAlign:'center'},loading:{flexDirection:'row',gap:12,alignItems:'center',marginVertical:12},baseline:{padding:14,borderWidth:1,borderColor:'#665233',backgroundColor:'#241F18',borderRadius:12,marginVertical:12},error:{backgroundColor:'#4B2E2A',padding:15,borderRadius:12,marginTop:15},errorText:{color:'#FCE4D9',fontSize:13,lineHeight:22},
});
