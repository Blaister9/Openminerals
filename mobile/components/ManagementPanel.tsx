import React,{useEffect,useRef,useState} from 'react';
import {institutional} from '../lib/visual-theme';
import {ActivityIndicator,Pressable,StyleSheet,Text,TextInput,View} from 'react-native';
import {createManagementQuery,emptyManagementFilters,managementActionLabel,managementInventoryReconciled,managementStatusLabel,mergeManagementEvents,parseManagementSummary,type ManagementFilters,type ManagementSummary} from '../lib/management';
import {custodyGrams,custodyMetalName,custodyMetals} from '../lib/custody';
import {deliveryMoney} from '../lib/delivery';
import {receiptSummary,type Receipt} from '../lib/receipt-presentation';

type Props={identityKey:string;get:<T>(path:string)=>Promise<T>;disabled?:boolean;refreshKey:string;onReceipt:(receipt:Receipt,ownerId?:string)=>void};
type Scoped<T>={key:string;value:T};
type Option={value:string;label:string};
const message=(cause:unknown)=>cause instanceof Error?cause.message:'No se pudo consultar la actividad de mina. Reintenta.';
function Row({label,value}:{label:string;value:string}){return <View style={styles.row}><Text style={styles.label}>{label}</Text><Text selectable style={styles.value}>{value}</Text></View>}
function Button({label,onPress,disabled=false}:{label:string;onPress:()=>void;disabled?:boolean}){return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[styles.button,disabled&&styles.disabled]}><Text style={styles.buttonText}>{label}</Text></Pressable>}
function Selector({label,value,options,onChange,disabled}:{label:string;value:string;options:Option[];onChange:(value:string)=>void;disabled:boolean}){
  const [open,setOpen]=useState(false),[search,setSearch]=useState('');
  const selected=options.find(option=>option.value===value)?.label??value??'Todos';
  const visible=options.filter(option=>!search||option.label.toLocaleLowerCase('es-CO').includes(search.toLocaleLowerCase('es-CO')));
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${selected}`} accessibilityState={{expanded:open}} disabled={disabled} onPress={()=>setOpen(current=>!current)} style={styles.selector}><Text style={styles.selectorLabel}>{label}</Text><Text style={styles.selectorValue}>{selected||'Todos'} {open?'−':'+'}</Text></Pressable>
    {open&&<View style={styles.selection}>
      {options.length>12&&<TextInput accessibilityLabel={`Buscar ${label.toLowerCase()}`} value={search} onChangeText={setSearch} editable={!disabled} autoCorrect={false} placeholder="Buscar alias o tipo ficticio" placeholderTextColor="#667385" style={styles.input}/>}
      <View style={styles.chips}>{visible.map(option=><Pressable key={option.value||'all'} accessibilityRole="button" accessibilityState={{selected:value===option.value}} disabled={disabled} onPress={()=>{onChange(option.value);setOpen(false);setSearch('');}} style={[styles.chip,value===option.value&&styles.chipOn]}><Text style={styles.chipText}>{option.label}</Text></Pressable>)}</View>
      {!visible.length&&<Text style={styles.note}>No hay opciones para esa búsqueda.</Text>}
    </View>}
  </>;
}
function Filters({draft,setDraft,summary,disabled,onApply,onClear}:{draft:ManagementFilters;setDraft:(value:ManagementFilters)=>void;summary:ManagementSummary|null;disabled:boolean;onApply:()=>void;onClear:()=>void}){
  const [open,setOpen]=useState(false);
  const options=summary?.options;
  let problem='';try{createManagementQuery(draft);}catch(cause){problem=message(cause);}
  const change=(key:keyof ManagementFilters)=>(value:string)=>setDraft({...draft,[key]:value});
  return <View style={styles.card}>
    <Text style={styles.cardTitle}>Filtros del historial</Text><Text style={styles.note}>Los filtros cambian el historial y sus indicadores. El inventario, los compradores y las obligaciones muestran la mina actual.</Text>
    <Button label={open?'Ocultar filtros':'Filtrar metal, tipo, estado, comprador o fecha'} onPress={()=>setOpen(value=>!value)}/>
    {open&&<>
      <Selector label="Metal" value={draft.metal} options={[{value:'',label:'Todos los metales'},...(options?.metals??custodyMetals).map(value=>({value,label:custodyMetalName(value)}))]} onChange={change('metal')} disabled={disabled}/>
      <Selector label="Tipo de operación" value={draft.action} options={[{value:'',label:'Todos los tipos'},...(options?.actions??[]).map(value=>({value,label:managementActionLabel(value)}))]} onChange={change('action')} disabled={disabled}/>
      <Selector label="Estado del evento" value={draft.status} options={[{value:'',label:'Todos los estados'},...(options?.statuses??[]).map(value=>({value,label:managementStatusLabel(value)}))]} onChange={change('status')} disabled={disabled}/>
      <Selector label="Comprador demo" value={draft.buyer} options={[{value:'',label:'Todos los compradores'},...(options?.buyers??[]).map(value=>({value:value.id,label:value.alias}))]} onChange={change('buyer')} disabled={disabled}/>
      <Text style={styles.inputLabel}>Fecha inicial · Bogotá</Text><TextInput accessibilityLabel="Fecha inicial de actividad en Bogotá" value={draft.fromDate} onChangeText={change('fromDate')} editable={!disabled} autoCorrect={false} autoCapitalize="none" placeholder="AAAA-MM-DD" placeholderTextColor="#667385" maxLength={10} style={styles.input}/>
      <Text style={styles.inputLabel}>Fecha final · Bogotá</Text><TextInput accessibilityLabel="Fecha final de actividad en Bogotá" value={draft.toDate} onChangeText={change('toDate')} editable={!disabled} autoCorrect={false} autoCapitalize="none" placeholder="AAAA-MM-DD" placeholderTextColor="#667385" maxLength={10} style={styles.input}/>
      <Text style={styles.note}>El rango incluye los días completos en hora de Bogotá (UTC−5). Deja las fechas vacías para consultar todos los registros.</Text>
      {!!problem&&<Text accessibilityRole="alert" style={styles.warning}>{problem}</Text>}
      <Button label="Aplicar filtros" onPress={onApply} disabled={disabled||!!problem}/><Button label="Limpiar filtros" onPress={onClear} disabled={disabled}/>
    </>}
  </View>;
}
function Kpis({summary}:{summary:ManagementSummary}){
  const value=summary.kpis;
  return <View style={styles.card}><Text style={styles.cardTitle}>Resultados del historial filtrado</Text>
    <Row label="Eventos que coinciden" value={String(value.eventsMatched)}/><Row label="Compras directas de compradores" value={String(value.directBuys)}/><Row label="Volumen de compras directas" value={deliveryMoney(value.directBuyVolumeMinor)}/>
    <Row label="Ventas directas de compradores" value={String(value.directSells)}/><Row label="Volumen de ventas directas" value={deliveryMoney(value.directSellVolumeMinor)}/>
    <Row label="Liquidaciones de marketplace" value={String(value.marketplaceTrades)}/><Row label="Volumen de marketplace" value={deliveryMoney(value.marketplaceVolumeMinor)}/>
    <Row label="Comisiones ficticias de negociación" value={deliveryMoney(value.tradingFeesMinor)}/><Row label="Costes demo cobrados por entregas" value={deliveryMoney(value.deliveryCostsCollectedMinor)}/>
    <Row label="Ingresos de metal" value={String(value.stockEntries)}/><Row label="Gramos ingresados en el filtro" value={custodyGrams(value.stockMg)}/><Row label="Cambios de política" value={String(value.policyChanges)}/>
    <Text style={styles.note}>Cada liquidación de marketplace se cuenta una vez, aunque tenga comprobante de compra y de venta. Estos importes son simulados.</Text>
    {value.metalVolumesMg&&<><Text style={styles.section}>Gramos negociados por metal</Text><Text style={styles.note}>Cantidades de los comprobantes persistidos que coinciden con el filtro. Cada intercambio entre compradores se cuenta una vez.</Text>{custodyMetals.map(metal=>{const volumes=value.metalVolumesMg![metal];return <View key={metal} style={styles.subcard}><Text style={styles.cardTitle}>{custodyMetalName(metal)}</Text><Row label="Compras directas" value={custodyGrams(volumes.directBuy)}/><Row label="Ventas directas" value={custodyGrams(volumes.directSell)}/><Row label="Marketplace entre compradores" value={custodyGrams(volumes.marketplace)}/></View>;})}</>}
  </View>;
}
function Snapshot({summary}:{summary:ManagementSummary}){
  const [open,setOpen]=useState(false),[showBuyers,setShowBuyers]=useState(false);
  const balanced=custodyMetals.every(metal=>managementInventoryReconciled(summary.metals[metal])&&summary.obligations.offersMg[metal]+summary.obligations.deliveryMg[metal]===summary.metals[metal].reservedMg);
  return <View style={styles.card}><Text style={styles.cardTitle}>Foto actual de la mina</Text><Text style={styles.note}>Este inventario y los compromisos actuales se consultan completos; no se limitan por el filtro del historial.</Text>
    <Text accessibilityRole={balanced?undefined:'alert'} style={balanced?styles.ok:styles.warning}>{balanced?'Inventario activo, asignaciones y reservas conciliados en la simulación.':'Hay diferencias en el inventario o sus reservas. Actualiza antes de continuar; este panel no permite corregir saldos.'}</Text>
    <Row label="Ofertas abiertas" value={String(summary.obligations.offersOpen)}/><Row label="Entregas activas" value={String(summary.obligations.deliveriesActive)}/><Row label="Costes demo pagados en entregas" value={deliveryMoney(summary.obligations.paidDeliveryCostsMinor)}/>
    <Text style={styles.note}>Para cotizar o tramitar una solicitud abre Mina → Entregas. Los lotes y certificados se consultan en Mina → Lotes.</Text>
    <Button label={open?'Ocultar inventario por metal':'Ver inventario y compromisos por metal'} onPress={()=>setOpen(value=>!value)}/>
    {open&&custodyMetals.map(metal=>{const values=summary.metals[metal];return <View key={metal} style={styles.subcard}><Text style={styles.cardTitle}>{custodyMetalName(metal)}</Text><Row label="Peso original registrado" value={custodyGrams(values.originalWeightMg)}/><Row label="Entregado en la simulación" value={custodyGrams(values.deliveredMg)}/><Row label="Suministro activo" value={custodyGrams(values.activeSupplyMg)}/><Row label="Disponible en mina" value={custodyGrams(values.availableMg)}/><Row label="Asignado a compradores" value={custodyGrams(values.allocatedMg)}/><Row label="Reservado dentro de las posiciones" value={custodyGrams(values.reservedMg)}/><Row label="Reservado para ofertas" value={custodyGrams(summary.obligations.offersMg[metal])}/><Row label="Reservado para entregas" value={custodyGrams(summary.obligations.deliveryMg[metal])}/><Text style={managementInventoryReconciled(values)?styles.ok:styles.warning}>{managementInventoryReconciled(values)?'Disponible + asignado = activo; activo + entregado = original.':'Las cantidades de este metal no concuerdan.'}</Text></View>;})}
    <Button label={showBuyers?'Ocultar compradores demo':`Ver compradores ficticios (${summary.buyers.length})`} onPress={()=>setShowBuyers(value=>!value)}/>
    {showBuyers&&<><Text style={styles.note}>Solo alias, posiciones y reservas de esta mina. No se muestran saldos de billeteras, ingresos, retiros ni conversiones personales.</Text>
      {!summary.buyers.length&&<Text style={styles.note}>No hay cuentas compradoras en esta mina.</Text>}
      {summary.buyers.map(buyer=><View key={buyer.id} style={styles.subcard}><Text style={styles.cardTitle}>{buyer.alias}</Text><Row label="Ofertas abiertas" value={String(buyer.activeOffers)}/><Row label="Entregas activas" value={String(buyer.activeDeliveries)}/>{custodyMetals.map(metal=><Row key={metal} label={custodyMetalName(metal)} value={`${custodyGrams(buyer.holdingsMg[metal])} · reservado ${custodyGrams(buyer.reservedMg[metal])}`}/>)}</View>)}
    </>}
  </View>;
}

export function ManagementPanel({identityKey,get,disabled=false,refreshKey,onReceipt}:Props){
  const [applied,setApplied]=useState<ManagementFilters>(emptyManagementFilters),[draft,setDraft]=useState<ManagementFilters>(emptyManagementFilters);
  const baseQuery=createManagementQuery(applied),viewKey=`${identityKey}:${baseQuery.path}`;
  const currentView=useRef(viewKey);currentView.current=viewKey;const getRef=useRef(get);getRef.current=get;
  const requests=useRef(0),initialized=useRef(''),lastReset=useRef(true);
  const [snapshot,setSnapshot]=useState<Scoped<ManagementSummary>|null>(null),[loading,setLoading]=useState<Scoped<boolean>|null>(null),[error,setError]=useState<Scoped<string>|null>(null);
  const data=snapshot?.key===viewKey?snapshot.value:null,busy=loading?.key===viewKey&&loading.value,problem=error?.key===viewKey?error.value:'';
  const filterOptions=snapshot?.key.startsWith(`${identityKey}:`)?snapshot.value:null;
  async function fetchPage(reset:boolean){
    if(disabled)return;const before=reset?null:data?.history.nextCursor??null;if(!reset&&!before)return;
    const requestedView=viewKey,request=++requests.current,query=createManagementQuery(applied,before);lastReset.current=reset;
    setLoading({key:viewKey,value:true});setError({key:viewKey,value:''});
    try{
      const raw=await getRef.current<unknown>(query.path);if(currentView.current!==requestedView||request!==requests.current)return;
      const received=parseManagementSummary(raw,query.filters);
      setSnapshot({key:viewKey,value:{...received,history:{...received.history,items:reset?received.history.items:mergeManagementEvents(data?.history.items??[],received.history.items)}}});
    }catch(cause){if(currentView.current===requestedView&&request===requests.current)setError({key:viewKey,value:message(cause)});}
    finally{if(currentView.current===requestedView&&request===requests.current)setLoading({key:viewKey,value:false});}
  }
  useEffect(()=>{initialized.current='';setApplied(emptyManagementFilters());setDraft(emptyManagementFilters());return()=>{requests.current++;};},[identityKey]);
  useEffect(()=>{const update=`${viewKey}:${refreshKey}`;if(!disabled&&initialized.current!==update){initialized.current=update;void fetchPage(true);}},[viewKey,disabled,refreshKey]);
  function apply(){const query=createManagementQuery(draft);if(query.path===baseQuery.path)void fetchPage(true);else setApplied({...draft});}
  function clear(){const empty=emptyManagementFilters();setDraft(empty);if(createManagementQuery(empty).path===baseQuery.path)void fetchPage(true);else setApplied(empty);}
  const filterDescription=[applied.metal?custodyMetalName(applied.metal as typeof custodyMetals[number]):'',applied.action?managementActionLabel(applied.action):'',applied.status?managementStatusLabel(applied.status):'',applied.buyer?filterOptions?.options.buyers.find(buyer=>buyer.id===applied.buyer)?.alias??'Comprador seleccionado':'',applied.fromDate?`Desde ${applied.fromDate}`:'',applied.toDate?`Hasta ${applied.toDate}`:''].filter(Boolean).join(' · ');
  return <>
    <Text style={styles.eyebrow}>ADMINISTRACIÓN DE MINA · DEMO</Text><Text accessibilityRole="header" style={[styles.title,institutional.heading]}>Actividad y control</Text>
    <View style={styles.notice}><Text style={styles.noticeTitle}>DATOS SIMULADOS · SIN FONDOS NI METALES REALES</Text><Text style={styles.note}>Consulta operaciones de esta mina, inventario y compromisos ficticios. Este panel no acredita existencias físicas ni permite editar saldos o aplicar ajustes libres.</Text></View>
    <Filters draft={draft} setDraft={setDraft} summary={filterOptions} disabled={disabled||!!busy} onApply={apply} onClear={clear}/>
    <Text style={styles.note}>Filtro aplicado: {filterDescription||'todo el historial de la mina'}.</Text>
    <Button label="Actualizar actividad de mina" onPress={()=>void fetchPage(true)} disabled={disabled||!!busy}/>
    {busy&&<View style={styles.loading}><ActivityIndicator color="#DCBC7F"/><Text style={styles.note}>Consultando actividad y conciliación…</Text></View>}
    {!!problem&&<View accessibilityRole="alert" style={styles.error}><Text style={styles.errorText}>{problem}</Text>{data&&<Text style={styles.errorText}>Se conserva la última página consultada.</Text>}<Button label="Reintentar consulta" onPress={()=>void fetchPage(lastReset.current)} disabled={disabled||!!busy}/></View>}
    {data&&<>
      <Text style={styles.section}>{data.mine.name}</Text><Text style={styles.note}>{data.disclaimer}</Text><Kpis summary={data}/><Snapshot summary={data}/>
      <Text accessibilityRole="header" style={styles.section}>Historial de la mina</Text><Text style={styles.note}>Mostrando {data.history.items.length} de {data.history.total} eventos que coinciden. Incluye cuentas, ingresos de metal y configuración; omite movimientos privados de billeteras.</Text>
      {!data.history.items.length&&<View style={styles.card}><Text style={styles.cardTitle}>Sin eventos para este filtro</Text><Text style={styles.note}>Amplía el rango de fechas o limpia los filtros para consultar otras operaciones de la mina.</Text></View>}
      {data.history.items.map(event=><Pressable key={event.id} accessibilityRole="button" accessibilityLabel={`Ver comprobante de mina: ${event.label}`} disabled={disabled} onPress={()=>onReceipt(event.receipt,event.ownerId)} style={[styles.card,disabled&&styles.disabled]}>
        <Text style={styles.eventType}>{managementActionLabel(event.action)} · {managementStatusLabel(event.status)}</Text><Text style={styles.cardTitle}>{event.label}</Text><Text style={styles.activityAmount}>{receiptSummary(event.receipt)}</Text>
        {!!event.buyer&&<Text style={styles.note}>Comprador demo: {event.buyer.alias}</Text>}{!!event.actor&&<Text style={styles.note}>Operador demo: {event.actor.alias}</Text>}
        <Text style={styles.note}>{new Date(event.at).toLocaleString('es-CO')}</Text><Text selectable style={styles.identifier}>{event.receipt.id}</Text><Text style={styles.link}>Consultar comprobante →</Text>
      </Pressable>)}
      {!!data.history.nextCursor&&<Button label="Cargar más actividad de mina" onPress={()=>void fetchPage(false)} disabled={disabled||!!busy}/>}
      {!data.history.nextCursor&&data.history.items.length>0&&<Text style={styles.note}>Fin de los eventos que coinciden con este filtro.</Text>}
    </>}
  </>;
}
const styles=StyleSheet.create({
  eyebrow:{color:'#DCBC7F',fontSize:10,fontWeight:'800',letterSpacing:1.3,lineHeight:19,marginTop:18},title:{color:'#F6F5F1',fontSize:28,lineHeight:38,fontWeight:'700',marginVertical:10},notice:{padding:16,borderRadius:12,borderWidth:1,borderColor:'#665233',backgroundColor:'#241F18',marginVertical:10},noticeTitle:{color:'#DCBC7F',fontWeight:'800',fontSize:11,lineHeight:20},note:{color:'#98A5B0',fontSize:12,lineHeight:21,marginVertical:5},warning:{color:'#E5C7A0',fontSize:12,lineHeight:21,marginTop:10},ok:{color:'#9FCAB6',fontSize:12,lineHeight:21,marginTop:10},row:{flexDirection:'row',gap:16,alignItems:'flex-start',justifyContent:'space-between',paddingVertical:9},label:{color:'#AAB6C0',fontSize:12,lineHeight:21,flex:1},value:{color:'#F6F5F1',fontSize:13,lineHeight:21,fontWeight:'600',flex:1,textAlign:'right'},card:{backgroundColor:'#141E28',borderColor:'#273541',borderWidth:1,borderRadius:14,padding:17,marginTop:17},subcard:{backgroundColor:'#101A23',borderColor:'#33414D',borderWidth:1,borderRadius:12,padding:14,marginTop:15},cardTitle:{color:'#F6F5F1',fontSize:16,lineHeight:25,fontWeight:'700'},section:{color:'#F6F5F1',fontSize:18,lineHeight:27,fontWeight:'700',marginTop:26,marginBottom:7},button:{minHeight:48,padding:14,borderRadius:10,borderWidth:1,borderColor:'#4E6576',backgroundColor:'#1D2B37',alignItems:'center',justifyContent:'center',marginTop:12},buttonText:{color:'#EDF1F3',fontSize:13,fontWeight:'700',textAlign:'center'},disabled:{opacity:.45},inputLabel:{color:'#AAB6C0',fontSize:12,lineHeight:21,fontWeight:'600',marginTop:17},input:{color:'#FAF9F3',fontSize:15,lineHeight:23,minHeight:50,paddingHorizontal:14,paddingVertical:12,backgroundColor:'#09131C',borderWidth:1,borderColor:'#3C4B56',borderRadius:10,marginTop:7},selector:{minHeight:50,paddingVertical:12,marginTop:10,borderBottomWidth:1,borderColor:'#33414D',flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},selectorLabel:{color:'#AAB6C0',fontSize:12,lineHeight:21,flex:1},selectorValue:{color:'#F6E5C2',fontSize:12,lineHeight:21,fontWeight:'700',flex:1,textAlign:'right'},selection:{padding:10,backgroundColor:'#101A23',borderRadius:10,marginTop:8},chips:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:12},chip:{minHeight:48,padding:11,borderWidth:1,borderColor:'#465766',borderRadius:9,justifyContent:'center'},chipOn:{backgroundColor:'#665233',borderColor:'#DCBC7F'},chipText:{fontSize:12,color:'#F7E4BD',fontWeight:'700'},loading:{flexDirection:'row',gap:12,alignItems:'center',marginVertical:12},error:{backgroundColor:'#4B2E2A',padding:15,borderRadius:12,marginTop:15},errorText:{color:'#FCE4D9',fontSize:13,lineHeight:22},eventType:{color:'#DCBC7F',fontSize:10,lineHeight:19,marginBottom:7},activityAmount:{color:'#F6E5C2',fontSize:15,lineHeight:24,fontWeight:'700',marginTop:9},identifier:{color:'#98A5B0',fontSize:10,lineHeight:18,marginTop:8},link:{color:'#DCBC7F',fontSize:12,lineHeight:21,fontWeight:'700',marginTop:10},
});
