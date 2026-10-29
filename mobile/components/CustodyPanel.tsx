import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Modal,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {ModalSurface} from './ModalSurface';
import {LotHistory} from './LotHistory';
import {certificatePath,custodyDocumentKind,custodyGrams,custodyMetalName,custodyMetals,custodyStatus,parseCustodyCertificate,parseCustodySummary,validCertificateId,type CustodyCertificate,type CustodyDocument,type CustodySummary} from '../lib/custody';

type Props={operator:boolean;identityKey:string;get:<T>(path:string)=>Promise<T>;disabled?:boolean;refreshKey?:string};
type Scoped<T>={scope:string;value:T};
const message=(error:unknown)=>error instanceof Error?error.message:'No se pudo consultar la custodia demo. Reintenta.';
function Row({label,value}:{label:string;value:string}){return <View style={styles.row}><Text style={styles.label}>{label}</Text><Text selectable style={styles.value}>{value}</Text></View>}
function Documents({items}:{items:CustodyDocument[]}){
  const [expanded,setExpanded]=useState<string|null>(null);
  return <><Text style={styles.smallHeading}>Documentos de demostración</Text>
    {!items.length&&<Text style={styles.note}>Este lote no tiene documentos demo asociados.</Text>}
    {items.map(item=><View key={item.id} style={styles.document}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Consultar documento demo: ${item.title}`} accessibilityState={{expanded:expanded===item.id}} onPress={()=>setExpanded(expanded===item.id?null:item.id)} style={styles.documentButton}>
        <Text style={styles.documentTitle}>{item.title}</Text><Text style={styles.link}>{expanded===item.id?'Ocultar':'Consultar'}</Text>
      </Pressable>
      <Text style={styles.note}>{custodyDocumentKind(item.kind)} · sin validación física</Text>
      {expanded===item.id&&<><Text selectable style={styles.documentContent}>{item.content}</Text><Text selectable style={styles.identifier}>{item.id}</Text></>}
    </View>)}
  </>;
}

// identityKey must be the authenticated account id. Also mount with key={account.id}
// so a different identity never receives another account's visible documents.
export function CustodyPanel({operator,identityKey,get,disabled=false,refreshKey=''}:Props){
  const scope=`${operator?'operator':'buyer'}:${identityKey}`;
  const currentScope=useRef(scope);currentScope.current=scope;
  const getRef=useRef(get);getRef.current=get;
  const summaryRequest=useRef(0),certificateRequest=useRef(0);
  const initialized=useRef('');
  const [snapshot,setSnapshot]=useState<Scoped<CustodySummary>|null>(null);
  const [loading,setLoading]=useState<Scoped<boolean>|null>(null);
  const [problem,setProblem]=useState<Scoped<string>|null>(null);
  const [certificateInput,setCertificateInput]=useState('');
  const [historyLot,setHistoryLot]=useState<string|null>(null);
  const [certificateId,setCertificateId]=useState<Scoped<string>|null>(null);
  const [certificate,setCertificate]=useState<Scoped<CustodyCertificate>|null>(null);
  const [certificateLoading,setCertificateLoading]=useState<Scoped<boolean>|null>(null);
  const [certificateError,setCertificateError]=useState<Scoped<string>|null>(null);
  const [verifiedAt,setVerifiedAt]=useState<Scoped<string>|null>(null);
  const data=snapshot?.scope===scope?snapshot.value:null;
  const busy=loading?.scope===scope&&loading.value;
  const error=problem?.scope===scope?problem.value:'';
  const selectedId=certificateId?.scope===scope?certificateId.value:null;
  const selected=certificate?.scope===scope?certificate.value:null;
  const verifying=certificateLoading?.scope===scope&&certificateLoading.value;
  const verificationError=certificateError?.scope===scope?certificateError.value:'';

  async function refresh(){
    if(disabled)return;
    const request=++summaryRequest.current,requestedScope=scope;
    setLoading({scope,value:true});setProblem({scope,value:''});
    try{
      const response=await getRef.current<unknown>(operator?'/api/demo/mine/custody':'/api/demo/custody');
      if(currentScope.current!==requestedScope||request!==summaryRequest.current)return;
      setSnapshot({scope,value:parseCustodySummary(response,operator,identityKey)});
    }catch(cause){if(currentScope.current===requestedScope&&request===summaryRequest.current)setProblem({scope,value:message(cause)});}
    finally{if(currentScope.current===requestedScope&&request===summaryRequest.current)setLoading({scope,value:false});}
  }
  useEffect(()=>{
    initialized.current='';setCertificateInput('');setHistoryLot(null);
    return ()=>{summaryRequest.current++;certificateRequest.current++;};
  },[scope]);
  useEffect(()=>{
    const update=`${scope}:${refreshKey}`;
    if(!disabled&&initialized.current!==update){initialized.current=update;void refresh();}
  },[scope,disabled,refreshKey]);

  function closeCertificate(){certificateRequest.current++;setCertificateId(null);setCertificate(null);setCertificateError(null);setCertificateLoading(null);setVerifiedAt(null);}
  async function verify(rawId:string){
    if(disabled)return;
    const requestedId=rawId.trim(),requestedScope=scope,request=++certificateRequest.current;
    setCertificateId({scope,value:requestedId});setCertificate(null);setVerifiedAt(null);
    setCertificateLoading({scope,value:true});setCertificateError({scope,value:''});
    try{
      const response=await getRef.current<unknown>(certificatePath(requestedId));
      if(currentScope.current!==requestedScope||request!==certificateRequest.current)return;
      setCertificate({scope,value:parseCustodyCertificate(response,requestedId,operator,identityKey)});
      setVerifiedAt({scope,value:new Date().toLocaleString('es-CO')});
    }catch(cause){if(currentScope.current===requestedScope&&request===certificateRequest.current)setCertificateError({scope,value:message(cause)});}
    finally{if(currentScope.current===requestedScope&&request===certificateRequest.current)setCertificateLoading({scope,value:false});}
  }
  return <>
    <Text style={styles.eyebrow}>CUSTODIA · DATOS SIMULADOS</Text>
    <Text accessibilityRole="header" style={styles.title}>{operator?'Lotes de la mina':'Mi custodia simulada'}</Text>
    <View style={styles.notice}><Text style={styles.noticeTitle}>DEMO · SIN METALES FÍSICOS</Text><Text style={styles.copy}>Los lotes, documentos y asignaciones son ficticios. Los certificados no tienen valor legal ni acreditan propiedad o custodia real.</Text></View>
    <Text style={styles.copy}>{operator?'Consulta los lotes y las asignaciones de los compradores de tu mina de demostración.':'Consulta los lotes vinculados a tus gramos y los certificados de tu cuenta de demostración.'}</Text>
    <Pressable accessibilityRole="button" disabled={disabled||busy} onPress={()=>void refresh()} style={[styles.secondary,(disabled||busy)&&styles.disabled]}><Text style={styles.secondaryText}>Actualizar custodia demo</Text></Pressable>
    {busy&&<View style={styles.loading}><ActivityIndicator color="#DCBC7F"/><Text style={styles.note}>Consultando lotes y asignaciones…</Text></View>}
    {!!error&&<View accessibilityRole="alert" style={styles.error}><Text style={styles.errorText}>{error}</Text><Text style={styles.note}>Reintenta con «Actualizar custodia demo».</Text></View>}
    {data&&<>
      <Text style={styles.smallHeading}>{data.mine.name}</Text>
      <Text style={styles.note}>{data.disclaimer}</Text>
      <View style={styles.card}><Text style={styles.cardTitle}>{operator?'Total de lotes registrados':'Resumen de los lotes vinculados'}</Text>
        {custodyMetals.map(metal=><View key={metal}><Row label={custodyMetalName(metal)} value={custodyGrams(data.totals[metal].activeWeightMg)}/>{data.totals[metal].deliveredMg>0&&<Text style={styles.note}>{custodyGrams(data.totals[metal].deliveredMg)} entregados en la simulación; peso registrado original {custodyGrams(data.totals[metal].weightMg)}.</Text>}</View>)}
      </View>
      {!data.lots.length&&<View style={styles.card}><Text style={styles.cardTitle}>{operator?'No hay lotes registrados':'Todavía no tienes lotes vinculados'}</Text><Text style={styles.note}>{operator?'Los ingresos ficticios de metal permiten registrar lotes para esta demostración.':'Tus compras simuladas podrán vincular gramos a lotes de la mina. Tus saldos anteriores permanecen en el portafolio.'}</Text></View>}
      {data.lots.map(lot=>{
        const allocations=data.allocations.filter(entry=>entry.lotId===lot.id);
        return <View key={lot.id} style={styles.card}>
          <Text style={styles.eyebrow}>LOTE DEMO</Text><Text style={styles.cardTitle}>{custodyMetalName(lot.metal)}</Text><Text selectable style={styles.identifier}>{lot.id}</Text>
          <Row label="Pureza declarada de prueba" value={lot.purity}/><Row label="Peso original del lote" value={custodyGrams(lot.originalWeightMg)}/>
          <Row label="Entregado en la simulación" value={custodyGrams(lot.deliveredMg)}/><Row label="Peso que sigue en custodia demo" value={custodyGrams(lot.activeWeightMg)}/>
          <Row label="Ubicación ficticia" value={lot.location}/><Row label="Estado" value={custodyStatus(lot.status)}/>
          <Row label={operator?'Asignado en el lote':'Asignado a mi cuenta'} value={custodyGrams(lot.allocatedMg)}/><Row label="Disponible en el lote" value={custodyGrams(lot.availableMg)}/>
          <Documents items={lot.documents}/>
          <Pressable accessibilityRole="button" accessibilityLabel={`Consultar historial del lote ${lot.id}`} disabled={disabled} onPress={()=>setHistoryLot(lot.id)} style={[styles.secondary,disabled&&styles.disabled]}><Text style={styles.secondaryText}>Ver movimientos del lote</Text></Pressable>
          <Text style={styles.smallHeading}>{operator?'Asignaciones de compradores':'Mis asignaciones'}</Text>
          {!allocations.length&&<Text style={styles.note}>Sin asignaciones registradas en este lote.</Text>}
          {allocations.map(allocation=><View key={allocation.id} style={styles.allocation}>
            {operator&&<Text style={styles.documentTitle}>{allocation.account.alias}</Text>}
            <Row label="Cantidad asignada actual" value={custodyGrams(allocation.mg)}/><Text style={styles.note}>{custodyStatus(allocation.status)}</Text>
            <Text style={styles.note}>Registrada: {new Date(allocation.createdAt).toLocaleString('es-CO')}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel={`Consultar certificado demo ${allocation.certificateId}`} disabled={disabled} onPress={()=>void verify(allocation.certificateId)} style={[styles.secondary,disabled&&styles.disabled]}><Text style={styles.secondaryText}>Ver certificado demo</Text></Pressable>
          </View>)}
        </View>;
      })}
    </>}
    <View style={styles.card}><Text style={styles.cardTitle}>Consultar un certificado</Text><Text style={styles.note}>Introduce su identificador. Solo puedes consultar certificados autorizados para tu cuenta o tu mina.</Text>
      <TextInput accessibilityLabel="Identificador de certificado demo" value={certificateInput} onChangeText={setCertificateInput} editable={!disabled} autoCapitalize="none" autoCorrect={false} maxLength={128} placeholder="Identificador del certificado" placeholderTextColor="#667385" style={styles.input}/>
      <Pressable accessibilityRole="button" disabled={disabled||!validCertificateId(certificateInput.trim())} onPress={()=>void verify(certificateInput)} style={[styles.primary,(disabled||!validCertificateId(certificateInput.trim()))&&styles.disabled]}><Text style={styles.primaryText}>Consultar certificado demo</Text></Pressable>
    </View>
    {historyLot&&<LotHistory key={`${scope}:${historyLot}`} lotId={historyLot} operator={operator} identityKey={identityKey} get={get} disabled={disabled} onClose={()=>setHistoryLot(null)}/>}
    <Modal visible={selectedId!==null} onRequestClose={closeCertificate} animationType="none" presentationStyle="pageSheet">
      <ModalSurface style={styles.screen} onEscape={closeCertificate}>
        <View style={styles.header}><Text accessibilityRole="header" style={styles.headerTitle}>Certificado demo</Text><Pressable accessibilityRole="button" accessibilityLabel="Cerrar certificado demo" onPress={closeCertificate} style={styles.close}><Text style={styles.link}>Cerrar</Text></Pressable></View>
        <ScrollView contentContainerStyle={styles.modalBody} contentInsetAdjustmentBehavior="never">
          <Text style={styles.eyebrow}>SIMULADO · SIN VALOR LEGAL</Text>
          <Text style={styles.copy}>Este documento ficticio no acredita propiedad, existencia física, ensayo ni custodia real de metales.</Text>
          {verifying&&<View style={styles.loading}><ActivityIndicator color="#DCBC7F"/><Text style={styles.note}>Consultando certificado…</Text></View>}
          {!!verificationError&&<View accessibilityRole="alert" style={styles.error}><Text style={styles.errorText}>{verificationError}</Text><Pressable accessibilityRole="button" disabled={disabled||verifying} onPress={()=>selectedId&&void verify(selectedId)} style={styles.secondary}><Text style={styles.secondaryText}>Reintentar certificado</Text></Pressable></View>}
          {selected&&<>
            <Text accessibilityRole="header" style={styles.certificateTitle}>{selected.label}</Text>
            <View style={styles.verification}><Text style={styles.ok}>Registro demo consultado</Text><Text style={styles.note}>{verifiedAt?.scope===scope?verifiedAt.value:''}</Text><Text style={styles.note}>Consulta autorizada del registro actual; no es una certificación física ni una firma digital.</Text></View>
            <Row label="Identificador" value={selected.id}/><Row label="Estado de la asignación" value={custodyStatus(selected.status)}/>
            <Row label="Mina demo" value={selected.mine.name}/><Row label="Alias de cuenta demo" value={selected.account.alias}/>
            <Row label="Metal" value={custodyMetalName(selected.lot.metal)}/><Row label="Lote demo" value={selected.lot.id}/><Row label="Pureza de prueba" value={selected.lot.purity}/>
            <Row label="Cantidad emitida" value={custodyGrams(selected.issuedMg)}/><Row label="Asignación actual" value={custodyGrams(selected.allocatedMg)}/>
            <Row label="Ubicación ficticia" value={selected.lot.location}/><Row label="Fecha de emisión demo" value={new Date(selected.issuedAt).toLocaleString('es-CO')}/>
            <Documents items={selected.lot.documents}/><Text style={styles.note}>{selected.disclaimer}</Text>
          </>}
        </ScrollView>
      </ModalSurface>
    </Modal>
  </>;
}

const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:'#090F15'},eyebrow:{color:'#DCBC7F',fontSize:10,fontWeight:'800',letterSpacing:1.4,lineHeight:19,marginTop:14},title:{color:'#F6F5F1',fontSize:29,lineHeight:38,fontWeight:'700',marginTop:7,marginBottom:10},copy:{color:'#BAC4CE',fontSize:13,lineHeight:22,marginVertical:7},notice:{padding:16,borderRadius:12,borderWidth:1,borderColor:'#665233',backgroundColor:'#241F18',marginVertical:10},noticeTitle:{color:'#DCBC7F',fontWeight:'800',fontSize:12,lineHeight:20},card:{backgroundColor:'#141E28',borderColor:'#273541',borderWidth:1,borderRadius:14,padding:17,marginTop:18},cardTitle:{color:'#F6F5F1',fontSize:18,lineHeight:27,fontWeight:'700'},smallHeading:{color:'#F6F5F1',fontSize:15,lineHeight:23,fontWeight:'700',marginTop:21,marginBottom:6},row:{flexDirection:'row',gap:16,alignItems:'flex-start',justifyContent:'space-between',paddingVertical:9},label:{color:'#AAB6C0',fontSize:12,lineHeight:21,flex:1},value:{color:'#F6F5F1',fontSize:13,lineHeight:21,fontWeight:'600',flex:1,textAlign:'right'},note:{color:'#98A5B0',fontSize:12,lineHeight:21,marginVertical:5},identifier:{color:'#AAB6C0',fontSize:11,lineHeight:19,marginTop:6},secondary:{minHeight:48,padding:14,borderRadius:10,borderWidth:1,borderColor:'#4E6576',backgroundColor:'#1D2B37',alignItems:'center',justifyContent:'center',marginTop:12},secondaryText:{color:'#EDF1F3',fontSize:13,fontWeight:'700',textAlign:'center'},primary:{minHeight:48,padding:15,borderRadius:10,backgroundColor:'#DCBC7F',alignItems:'center',justifyContent:'center',marginTop:12},primaryText:{color:'#15212B',fontSize:13,fontWeight:'800',textAlign:'center'},disabled:{opacity:.45},loading:{flexDirection:'row',gap:12,alignItems:'center',marginVertical:12},error:{backgroundColor:'#4B2E2A',padding:15,borderRadius:12,marginTop:15},errorText:{color:'#FCE4D9',fontSize:13,lineHeight:22},document:{marginTop:10,padding:12,borderRadius:10,borderWidth:1,borderColor:'#33414D',backgroundColor:'#101A23'},documentButton:{minHeight:48,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},documentTitle:{color:'#F6F5F1',fontSize:13,lineHeight:22,fontWeight:'600',flexShrink:1},documentContent:{color:'#D4DBE0',fontSize:13,lineHeight:23,marginTop:12},link:{color:'#DCBC7F',fontSize:13,fontWeight:'700'},allocation:{borderTopWidth:1,borderColor:'#33414D',paddingTop:12,marginTop:12},input:{color:'#FAF9F3',fontSize:15,lineHeight:23,minHeight:50,paddingHorizontal:14,paddingVertical:12,backgroundColor:'#09131C',borderWidth:1,borderColor:'#3C4B56',borderRadius:10,marginTop:12},header:{paddingHorizontal:20,paddingVertical:12,borderBottomWidth:1,borderColor:'#273541',flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},headerTitle:{color:'#F6F5F1',fontSize:20,fontWeight:'700',flexShrink:1},close:{padding:12,minHeight:48,justifyContent:'center'},modalBody:{padding:22,paddingBottom:40},certificateTitle:{color:'#F6F5F1',fontSize:23,lineHeight:33,fontWeight:'700',marginTop:20},verification:{backgroundColor:'#152D26',borderColor:'#315449',borderWidth:1,borderRadius:12,padding:15,marginVertical:20},ok:{color:'#9FCAB6',fontSize:14,fontWeight:'700',lineHeight:22},
});
