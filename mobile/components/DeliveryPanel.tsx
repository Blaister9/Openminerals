import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,StyleSheet,Switch,Text,TextInput,View} from 'react-native';
import {acceptDeliveryCommand,deliveryAcceptBlocked,deliveryCanCancel,deliveryMoney,deliveryPolicyCommand,deliveryPolicyInitialForm,deliveryStatusLabel,nextDeliveryStatus,parseDeliverySummary,requestDeliveryCommand,transitionDeliveryCommand,type DeliveryCommand,type DeliveryPolicy,type DeliveryPolicyForm,type DeliveryQuote,type DeliveryRequest,type DeliverySummary} from '../lib/delivery';
import {custodyGrams,custodyMetalName,custodyMetals,type CustodyMetal} from '../lib/custody';

type Submit=(action:string,body:Record<string,string>,title:string,detail:string)=>void;
type Props={operator:boolean;identityKey:string;get:<T>(path:string)=>Promise<T>;submit:Submit;disabled?:boolean;refreshKey:string;usdtMinor?:number};
type Scoped<T>={scope:string;value:T};
const message=(cause:unknown)=>cause instanceof Error?cause.message:'No se pudo consultar la entrega demo. Reintenta.';
function Row({label,value}:{label:string;value:string}){return <View style={styles.row}><Text style={styles.label}>{label}</Text><Text selectable style={styles.value}>{value}</Text></View>}
function Button({label,onPress,disabled=false,secondary=false}:{label:string;onPress:()=>void;disabled?:boolean;secondary?:boolean}){return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[secondary?styles.secondary:styles.primary,disabled&&styles.disabled]}><Text style={secondary?styles.secondaryText:styles.primaryText}>{label}</Text></Pressable>}
function Field({label,value,onChange,disabled=false,multiline=false,numeric=false,maxLength=160}:{label:string;value:string;onChange:(value:string)=>void;disabled?:boolean;multiline?:boolean;numeric?:boolean;maxLength?:number}){return <><Text style={styles.inputLabel}>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={onChange} editable={!disabled} multiline={multiline} keyboardType={numeric?'decimal-pad':'default'} autoCorrect={false} maxLength={maxLength} style={[styles.input,multiline&&styles.multiline]}/></>}
function dispatch(submit:Submit,command:DeliveryCommand){submit(command.action,command.body,command.title,command.detail);}
function Policies({items,value,onChange,disabled}:{items:DeliveryPolicy[];value:string;onChange:(value:string)=>void;disabled:boolean}){return <View style={styles.chips}>{items.map(policy=><Pressable key={policy.id} accessibilityRole="button" accessibilityState={{selected:value===policy.id}} disabled={disabled} onPress={()=>onChange(policy.id)} style={[styles.chip,value===policy.id&&styles.chipOn,disabled&&styles.disabled]}><Text style={styles.chipText}>{policy.label}</Text></Pressable>)}</View>}
function QuoteDetails({quote,now,awaitingAcceptance,showRequirements}:{quote:DeliveryQuote;now:number;awaitingAcceptance:boolean;showRequirements:boolean}){return <View style={styles.quote}>
  <Text style={styles.cardTitle}>Cotización DEMO</Text><Text style={styles.note}>{quote.jurisdiction.label} · política versión {quote.policyVersion}</Text>
  <Row label="Servicio ficticio" value={deliveryMoney(quote.serviceMinor)}/><Row label="Preparación ficticia" value={deliveryMoney(quote.preparationMinor)}/><Row label="Transporte ficticio" value={deliveryMoney(quote.transportMinor)}/>
  <Row label={`Seguro demo (${(quote.insuranceBps/100).toLocaleString('es-CO')}%)`} value={deliveryMoney(quote.insuranceMinor)}/><Row label="Subtotal de costes" value={deliveryMoney(quote.subtotalMinor)}/>
  <Row label={`Impuesto DEMO (${(quote.taxBps/100).toLocaleString('es-CO')}%)`} value={deliveryMoney(quote.taxMinor)}/><Row label="Total de costes simulados" value={deliveryMoney(quote.totalMinor)}/>
  <Text style={styles.note}>Valor ficticio del metal usado como referencia para el seguro: {deliveryMoney(quote.metalValueMinor)}. El metal ya está en la posición del comprador y no se cobra de nuevo.</Text>
  <Text style={styles.warning}>Las tasas, los impuestos, el seguro y los requisitos son ficticios. No son una cotización logística ni obligaciones legales reales.</Text>
  {showRequirements&&<><Text style={styles.smallHeading}>Requisitos ficticios de esta cotización</Text>{quote.requirements.map((requirement,index)=><Text key={index} style={styles.note}>• {requirement}</Text>)}</>}
  <Text style={awaitingAcceptance&&Date.parse(quote.expiresAt)<=now?styles.warning:styles.note}>Vigencia original para aceptar: {new Date(quote.expiresAt).toLocaleString('es-CO')}{awaitingAcceptance&&Date.parse(quote.expiresAt)<=now?' · vencida':''}</Text>
  <Text selectable style={styles.identifier}>{quote.id}</Text>
</View>}
function RequestForm({summary,submit,disabled}:{summary:DeliverySummary;submit:Submit;disabled:boolean}){
  const [metal,setMetal]=useState<CustodyMetal>('XAU'),[grams,setGrams]=useState('0.100'),[jurisdiction,setJurisdiction]=useState(summary.policies.jurisdictions[0].id);
  const [problem,setProblem]=useState('');
  const selected=summary.policies.jurisdictions.find(policy=>policy.id===jurisdiction)??summary.policies.jurisdictions[0];
  let command:DeliveryCommand|null=null;let validation='';
  try{command=requestDeliveryCommand(metal,grams,selected,summary.availableMg[metal]);}catch(cause){validation=message(cause);}
  function request(){if(!command||disabled)return;try{dispatch(submit,command);setProblem('');}catch(cause){setProblem(message(cause));}}
  return <View style={styles.card}><Text style={styles.cardTitle}>Solicitar cotización de entrega</Text><Text style={styles.note}>Reserva gramos de tu posición. No introduzcas dirección, identidad ni documentos personales.</Text>
    <View style={styles.chips}>{custodyMetals.map(value=><Pressable key={value} testID={`delivery-metal-${value}`} accessibilityRole="button" accessibilityState={{selected:metal===value}} disabled={disabled} onPress={()=>setMetal(value)} style={[styles.chip,metal===value&&styles.chipOn]}><Text style={styles.chipText}>{custodyMetalName(value)}</Text></Pressable>)}</View>
    <Row label="Disponible sin reservar" value={custodyGrams(summary.availableMg[metal])}/><Field label="Gramos para entrega simulada" value={grams} onChange={setGrams} disabled={disabled} numeric maxLength={20}/>
    <Text style={styles.inputLabel}>Jurisdicción ficticia</Text><Policies items={summary.policies.jurisdictions} value={selected.id} onChange={setJurisdiction} disabled={disabled}/>
    <Text style={styles.note}>Requisitos ficticios que aparecerán en la cotización:</Text>{selected.requirements.map((requirement,index)=><Text key={index} style={styles.note}>• {requirement}</Text>)}
    {!!validation&&<Text style={styles.warning}>{validation}</Text>}{!!problem&&<Text accessibilityRole="alert" style={styles.errorText}>{problem}</Text>}
    <Button label="Revisar solicitud demo" onPress={request} disabled={disabled||!command}/>
  </View>;
}
function RequestCard({request,summary,operator,submit,disabled,usdtMinor,now}:{request:DeliveryRequest;summary:DeliverySummary;operator:boolean;submit:Submit;disabled:boolean;usdtMinor:number;now:number}){
  const [reason,setReason]=useState(''),[acknowledged,setAcknowledged]=useState<string[]>([]),[problem,setProblem]=useState('');
  const [jurisdiction,setJurisdiction]=useState(request.quote?.jurisdiction.id??request.jurisdiction);
  useEffect(()=>{setAcknowledged([]);setProblem('');},[request.quote?.id]);
  useEffect(()=>{setReason('');},[request.status]);
  const selected=summary.policies.jurisdictions.find(policy=>policy.id===jurisdiction)??summary.policies.jurisdictions[0];
  const blocked=deliveryAcceptBlocked(request,usdtMinor,acknowledged,now),next=nextDeliveryStatus(request.status),beforeAcceptance=deliveryCanCancel(request.status);
  const reasonValid=reason.trim().length>=3&&reason.trim().length<=160;
  function run(work:()=>DeliveryCommand){if(disabled)return;try{dispatch(submit,work());setProblem('');}catch(cause){setProblem(message(cause));}}
  return <View style={styles.card}>
    <Text style={styles.eyebrow}>{deliveryStatusLabel(request.status).toUpperCase()}</Text><Text style={styles.cardTitle}>{custodyGrams(request.mg)} de {custodyMetalName(request.metal).toLowerCase()}</Text>
    {operator&&<Row label="Comprador demo" value={request.account.alias}/>}<Text style={styles.note}>Solicitada: {new Date(request.createdAt).toLocaleString('es-CO')}</Text><Text selectable style={styles.identifier}>{request.id}</Text>
    <Text style={styles.note}>Jurisdicción solicitada: {summary.policies.jurisdictions.find(policy=>policy.id===request.jurisdiction)?.label??'Jurisdicción ficticia anterior'}</Text>
    {request.quote&&<QuoteDetails quote={request.quote} now={now} awaitingAcceptance={request.status==='QUOTED'} showRequirements={operator||request.status!=='QUOTED'}/>}
    {!operator&&request.status==='QUOTED'&&request.quote&&<>
      <Text style={styles.smallHeading}>Requisitos de demostración</Text><Text style={styles.note}>Confirma que leíste cada requisito ficticio. No se recopilan documentos ni se verifica una identidad real.</Text>
      {request.quote.requirements.map((requirement,index)=><View key={`${request.quote!.id}:${index}`} style={styles.requirement}><Text style={styles.requirementText}>{requirement}</Text><Switch accessibilityLabel={`Leí el requisito ficticio: ${requirement}`} disabled={disabled} value={acknowledged.includes(requirement)} onValueChange={checked=>setAcknowledged(values=>checked?[...values,requirement]:values.filter(value=>value!==requirement))}/></View>)}
      {!!blocked&&<Text style={styles.warning}>{blocked}</Text>}<Button label="Revisar aceptación y pago demo" disabled={disabled||!!blocked} onPress={()=>run(()=>acceptDeliveryCommand(request,usdtMinor,acknowledged,Date.now()))}/>
    </>}
    {!operator&&beforeAcceptance&&<>
      <Text style={styles.note}>Antes de aceptar puedes cancelar o rechazar; se liberarán los gramos reservados y no se cobrarán costes.</Text>
      <Button label="Cancelar solicitud demo" secondary disabled={disabled} onPress={()=>run(()=>({action:'cancel_delivery',body:{deliveryId:request.id},title:'Cancelar solicitud demo',detail:`Se liberan ${custodyGrams(request.mg)} reservados. No hay coste cobrado ni envío real.`}))}/>
      <Button label="Rechazar cotización o solicitud" secondary disabled={disabled} onPress={()=>run(()=>({action:'delivery_reject',body:{deliveryId:request.id},title:'Rechazar entrega demo',detail:`Se libera la reserva de ${custodyGrams(request.mg)}. No se ejecutará la entrega simulada.`}))}/>
    </>}
    {operator&&beforeAcceptance&&<>
      <Text style={styles.smallHeading}>{request.quote?'Preparar nueva cotización':'Cotizar esta solicitud'}</Text><Policies items={summary.policies.jurisdictions} value={selected.id} onChange={setJurisdiction} disabled={disabled}/>
      <Text style={styles.note}>Usará la política demo versión {summary.policies.version}, con vigencia de {summary.policies.quoteValidityHours} horas. Una nueva cotización sustituye la anterior para aceptar; no cobra al comprador.</Text>
      <Button label={request.quote?'Revisar nueva cotización demo':'Revisar cotización demo'} disabled={disabled} onPress={()=>run(()=>({action:'mine/delivery_quote',body:{buyerId:request.account.id,deliveryId:request.id,jurisdiction:selected.id},title:'Emitir cotización de entrega DEMO',detail:`Comprador demo: ${request.account.alias}.\nJurisdicción ficticia: ${selected.label}.\nServicio: ${deliveryMoney(selected.serviceMinor)}; preparación: ${deliveryMoney(selected.preparationMinor)}; transporte: ${deliveryMoney(selected.transportMinor)}.\nSeguro e impuesto se calcularán con las tasas ficticias configuradas. El comprador revisará el desglose y los requisitos antes de aceptar.\nUna cotización nueva invalida la aceptación de la anterior. No hay logística ni impuestos reales.`}))}/>
    </>}
    {operator&&(beforeAcceptance||next)&&<>
      <Field label="Motivo ficticio del cambio de entrega" value={reason} onChange={setReason} disabled={disabled} maxLength={160}/><Text style={styles.note}>De 3 a 160 caracteres. Quedará registrado; no incluyas datos personales.</Text>
      {beforeAcceptance&&<Button label="Rechazar solicitud antes de aceptar" secondary disabled={disabled||!reasonValid} onPress={()=>run(()=>transitionDeliveryCommand(request,'REJECTED',reason))}/>}
      {next&&<Button label={`Revisar: ${deliveryStatusLabel(next).toLowerCase()}`} disabled={disabled||!reasonValid} onPress={()=>run(()=>transitionDeliveryCommand(request,next,reason))}/>}
    </>}
    {!beforeAcceptance&&!['CANCELLED','REJECTED'].includes(request.status)&&<><Row label="Costes pagados en simulación" value={deliveryMoney(request.paidMinor)}/><Text style={styles.note}>{request.status==='DELIVERED_DEMO'?'La entrega ficticia retiró estos gramos de la posición y del peso activo del lote. El peso original y el registro se conservan.':'Los gramos siguen reservados para esta entrega. La cancelación posterior a la aceptación no está disponible en esta fase.'}</Text></>}
    {!!problem&&<Text accessibilityRole="alert" style={styles.errorText}>{problem}</Text>}
    <Text style={styles.smallHeading}>Seguimiento simulado</Text>
    {!request.timeline.length&&<Text style={styles.note}>Sin pasos adicionales registrados.</Text>}
    {request.timeline.slice(-8).map((event,index)=><View key={`${event.at}:${index}`} style={styles.timeline}><Text style={styles.timelineTitle}>{deliveryStatusLabel(event.status)}</Text><Text style={styles.note}>{event.label}</Text><Text style={styles.note}>{new Date(event.at).toLocaleString('es-CO')}</Text></View>)}
  </View>;
}
function PolicyForm({policy,hours,submit,disabled}:{policy:DeliveryPolicy;hours:number;submit:Submit;disabled:boolean}){
  const [form,setForm]=useState<DeliveryPolicyForm>(()=>deliveryPolicyInitialForm(policy,hours)),[problem,setProblem]=useState('');
  const change=(key:keyof DeliveryPolicyForm)=>(value:string)=>setForm(current=>({...current,[key]:value}));
  let command:DeliveryCommand|null=null;let validation='';try{command=deliveryPolicyCommand(policy.id,form);}catch(cause){validation=message(cause);}
  return <>
    <Field label="Nombre de jurisdicción ficticia" value={form.label} onChange={change('label')} disabled={disabled} maxLength={80}/>
    <Field label="Servicio ficticio en USDT" value={form.service} onChange={change('service')} disabled={disabled} numeric maxLength={15}/><Field label="Preparación ficticia en USDT" value={form.preparation} onChange={change('preparation')} disabled={disabled} numeric maxLength={15}/><Field label="Transporte ficticio en USDT" value={form.transport} onChange={change('transport')} disabled={disabled} numeric maxLength={15}/>
    <Field label="Seguro demo en porcentaje" value={form.insurancePercent} onChange={change('insurancePercent')} disabled={disabled} numeric maxLength={8}/><Field label="Impuesto DEMO en porcentaje" value={form.taxPercent} onChange={change('taxPercent')} disabled={disabled} numeric maxLength={8}/>
    <Field label="Vigencia demo en horas" value={form.quoteValidityHours} onChange={change('quoteValidityHours')} disabled={disabled} numeric maxLength={3}/><Text style={styles.note}>De 1 a 168 horas; esta vigencia se comparte entre las jurisdicciones ficticias de la mina. Las tasas ficticias permiten de 0 a 100%; no representan reglas legales.</Text>
    <Field label="Notas internas DEMO, una por línea" value={form.requirements} onChange={change('requirements')} disabled={disabled} multiline maxLength={1288}/>
    <Text style={styles.note}>Nombres y notas internos son solo para el operador. El comprador recibe textos DEMO estándar y los importes de la cotización. No introducir ubicaciones ni datos de seguridad reales.</Text>
    <Field label="Motivo ficticio de configuración" value={form.reason} onChange={change('reason')} disabled={disabled} maxLength={160}/>
    {!!validation&&<Text style={styles.note}>{validation}</Text>}{!!problem&&<Text accessibilityRole="alert" style={styles.errorText}>{problem}</Text>}
    <Button label="Revisar política ficticia" disabled={disabled||!command} onPress={()=>{if(!command)return;try{dispatch(submit,command);setProblem('');}catch(cause){setProblem(message(cause));}}}/>
  </>;
}
function PolicyEditor({summary,submit,disabled}:{summary:DeliverySummary;submit:Submit;disabled:boolean}){
  const [open,setOpen]=useState(false),[selectedId,setSelectedId]=useState(summary.policies.jurisdictions[0].id);
  const selected=summary.policies.jurisdictions.find(policy=>policy.id===selectedId)??summary.policies.jurisdictions[0];
  return <View style={styles.card}><Text style={styles.cardTitle}>Políticas ficticias de entrega</Text><Text style={styles.warning}>Configura importes, tasas y requisitos únicamente para esta simulación. No introduzcas tarifas ni obligaciones legales como si estuvieran verificadas.</Text><Button label={open?'Ocultar configuración demo':'Configurar costes y requisitos demo'} secondary onPress={()=>setOpen(value=>!value)}/>
    {open&&<><Policies items={summary.policies.jurisdictions} value={selected.id} onChange={setSelectedId} disabled={disabled}/><Text style={styles.note}>Versión actual {summary.policies.version}. Los cambios aplican a nuevas cotizaciones; los desgloses ya emitidos se conservan.</Text><PolicyForm key={`${selected.id}:${summary.policies.version}`} policy={selected} hours={summary.policies.quoteValidityHours} submit={submit} disabled={disabled}/></>}
  </View>;
}

export function DeliveryPanel({operator,identityKey,get,submit,disabled=false,refreshKey,usdtMinor=0}:Props){
  const scope=`${operator?'operator':'buyer'}:${identityKey}`,currentScope=useRef(scope);currentScope.current=scope;
  const getRef=useRef(get);getRef.current=get;const requests=useRef(0),initialized=useRef('');
  const [snapshot,setSnapshot]=useState<Scoped<DeliverySummary>|null>(null),[loading,setLoading]=useState<Scoped<boolean>|null>(null),[error,setError]=useState<Scoped<string>|null>(null),[now,setNow]=useState(Date.now());
  const data=snapshot?.scope===scope?snapshot.value:null,busy=loading?.scope===scope&&loading.value,problem=error?.scope===scope?error.value:'';
  const liveQuotes=data?.requests.some(request=>request.status==='QUOTED'&&request.quote&&Date.parse(request.quote.expiresAt)>now)??false;
  useEffect(()=>{if(!liveQuotes)return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[liveQuotes]);
  async function refresh(){
    if(disabled)return;const request=++requests.current,requestedScope=scope;setLoading({scope,value:true});setError({scope,value:''});
    try{const response=await getRef.current<unknown>(operator?'/api/demo/mine/deliveries':'/api/demo/deliveries');if(currentScope.current!==requestedScope||request!==requests.current)return;setSnapshot({scope,value:parseDeliverySummary(response,operator,identityKey)});setNow(Date.now());}
    catch(cause){if(currentScope.current===requestedScope&&request===requests.current)setError({scope,value:message(cause)});}
    finally{if(currentScope.current===requestedScope&&request===requests.current)setLoading({scope,value:false});}
  }
  useEffect(()=>{initialized.current='';return()=>{requests.current++;};},[scope]);
  useEffect(()=>{const update=`${scope}:${refreshKey}`;if(!disabled&&initialized.current!==update){initialized.current=update;void refresh();}},[scope,disabled,refreshKey]);
  const blocked=disabled||!!busy||!!problem;
  return <>
    <Text style={styles.eyebrow}>ENTREGAS · SIMULACIÓN COMPLETA</Text><Text accessibilityRole="header" style={styles.title}>{operator?'Gestionar entregas demo':'Mis entregas simuladas'}</Text>
    <View style={styles.notice}><Text style={styles.noticeTitle}>DEMO · SIN TRANSPORTE NI IMPUESTOS REALES</Text><Text style={styles.copy}>Los costes, requisitos, jurisdicciones y estados son ficticios. No hay dirección de entrega, transportista, seguro real ni verificación de identidad.</Text></View>
    {!operator&&<Row label="USDT de tu cuenta demo" value={deliveryMoney(usdtMinor)}/>}
    <Button label="Actualizar entregas demo" secondary onPress={()=>void refresh()} disabled={disabled||!!busy}/>
    {busy&&<View style={styles.loading}><ActivityIndicator color="#DCBC7F"/><Text style={styles.note}>Consultando solicitudes y políticas…</Text></View>}
    {!!problem&&<View accessibilityRole="alert" style={styles.error}><Text style={styles.errorText}>{problem}</Text>{data&&<Text style={styles.errorText}>Se conserva la consulta anterior. Actualiza para continuar.</Text>}</View>}
    {data&&<>
      <Text style={styles.section}>{data.mine.name}</Text><Text style={styles.note}>{data.disclaimer}</Text>
      {operator?<PolicyEditor summary={data} submit={submit} disabled={blocked}/>:<RequestForm summary={data} submit={submit} disabled={blocked}/>}
      <Text accessibilityRole="header" style={styles.section}>{operator?'Solicitudes de compradores':'Mis solicitudes y estados'}</Text>
      {!data.requests.length&&<Text style={styles.note}>No hay solicitudes de entrega registradas en este alcance de demostración.</Text>}
      {data.requests.map(request=><RequestCard key={`${request.account.id}:${request.id}`} request={request} summary={data} operator={operator} submit={submit} disabled={blocked} usdtMinor={usdtMinor} now={now}/>)}
      {!operator&&<Text style={styles.note}>Los comprobantes de solicitudes, aceptación y cambios se conservan en Actividad.</Text>}
      {operator&&<><Text style={styles.section}>Últimos cambios de política</Text><Text style={styles.note}>Mostrando hasta 20 registros de configuración de esta mina.</Text>{!data.audit.length&&<Text style={styles.note}>Sin cambios de configuración registrados.</Text>}{data.audit.slice(0,20).map(event=><View key={event.id} style={styles.card}><Text style={styles.cardTitle}>Política versión {event.policyVersion}</Text><Row label="Operador demo" value={event.actor.alias}/><Text style={styles.note}>{event.reason}</Text><Text style={styles.note}>{new Date(event.at).toLocaleString('es-CO')}</Text></View>)}</>}
    </>}
  </>;
}
const styles=StyleSheet.create({
  eyebrow:{color:'#DCBC7F',fontSize:10,fontWeight:'800',letterSpacing:1.3,lineHeight:19,marginTop:24},title:{color:'#F6F5F1',fontSize:28,lineHeight:38,fontWeight:'700',marginVertical:10},copy:{color:'#BAC4CE',fontSize:13,lineHeight:22,marginVertical:7},notice:{padding:16,borderRadius:12,borderWidth:1,borderColor:'#665233',backgroundColor:'#241F18',marginVertical:10},noticeTitle:{color:'#DCBC7F',fontWeight:'800',fontSize:12,lineHeight:20},note:{color:'#98A5B0',fontSize:12,lineHeight:21,marginVertical:5},warning:{color:'#E5C7A0',fontSize:12,lineHeight:21,marginTop:10},row:{flexDirection:'row',gap:16,alignItems:'flex-start',justifyContent:'space-between',paddingVertical:9},label:{color:'#AAB6C0',fontSize:12,lineHeight:21,flex:1},value:{color:'#F6F5F1',fontSize:13,lineHeight:21,fontWeight:'600',flex:1,textAlign:'right'},card:{backgroundColor:'#141E28',borderColor:'#273541',borderWidth:1,borderRadius:14,padding:17,marginTop:17},cardTitle:{color:'#F6F5F1',fontSize:17,lineHeight:26,fontWeight:'700'},smallHeading:{color:'#F6F5F1',fontSize:14,lineHeight:23,fontWeight:'700',marginTop:21,marginBottom:6},section:{color:'#F6F5F1',fontSize:18,lineHeight:27,fontWeight:'700',marginTop:26,marginBottom:7},chips:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:16},chip:{minHeight:48,padding:11,borderWidth:1,borderColor:'#465766',borderRadius:9,justifyContent:'center'},chipOn:{backgroundColor:'#665233',borderColor:'#DCBC7F'},chipText:{fontSize:12,color:'#F7E4BD',fontWeight:'700'},secondary:{minHeight:48,padding:14,borderRadius:10,borderWidth:1,borderColor:'#4E6576',backgroundColor:'#1D2B37',alignItems:'center',justifyContent:'center',marginTop:12},secondaryText:{color:'#EDF1F3',fontSize:13,fontWeight:'700',textAlign:'center'},primary:{minHeight:48,padding:15,borderRadius:10,backgroundColor:'#DCBC7F',alignItems:'center',justifyContent:'center',marginTop:12},primaryText:{color:'#15212B',fontSize:13,fontWeight:'800',textAlign:'center'},disabled:{opacity:.45},inputLabel:{color:'#AAB6C0',fontSize:12,lineHeight:21,fontWeight:'600',marginTop:17},input:{color:'#FAF9F3',fontSize:15,lineHeight:23,minHeight:50,paddingHorizontal:14,paddingVertical:12,backgroundColor:'#09131C',borderWidth:1,borderColor:'#3C4B56',borderRadius:10,marginTop:7},multiline:{minHeight:105,textAlignVertical:'top'},error:{backgroundColor:'#4B2E2A',padding:15,borderRadius:12,marginTop:15},errorText:{color:'#FCE4D9',fontSize:13,lineHeight:22},loading:{flexDirection:'row',gap:12,alignItems:'center',marginVertical:12},identifier:{color:'#98A5B0',fontSize:10,lineHeight:18,marginTop:8},quote:{marginTop:18,padding:14,backgroundColor:'#101A23',borderColor:'#35434F',borderWidth:1,borderRadius:12},requirement:{flexDirection:'row',alignItems:'center',gap:12,paddingVertical:8},requirementText:{color:'#BAC4CE',fontSize:12,lineHeight:21,flex:1},timeline:{borderLeftWidth:2,borderColor:'#665233',paddingLeft:13,marginTop:12},timelineTitle:{color:'#E7D9BE',fontSize:13,lineHeight:21,fontWeight:'600'},
});
