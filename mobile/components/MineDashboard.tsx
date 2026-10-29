import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Pressable,StyleSheet,Text,TextInput,View} from 'react-native';
import {normalizeDecimalInput,parsePositiveDecimal} from '../lib/presentation';
import {receiptSummary,receiptTitle,type Receipt} from '../lib/receipt-presentation';
import {deliveryStatusLabel,type DeliveryStatus} from '../lib/delivery';

type Metal='XAU'|'XAG'|'XPT'|'XPD';
type Account={id:string;alias:string};
type Reservation={id:string;metal:Metal;mg:number;status:string};
export type StockReceipt={id:string;action:'stock';status:string;at:string;demoOnly:true;metal:Metal;mg:number;reason:string;lotId?:string;inventoryAfterMg:Record<Metal,number>;totalSupplyAfterMg:Record<Metal,number>;actor:Account;replayed?:boolean};
export type MineSummary={
  demoOnly:boolean;mine:{id:string;name:string};inventoryMg:Record<Metal,number>;totalSupplyMg:Record<Metal,number>;allocatedMg:Record<Metal,number>;reservedMg:Record<Metal,number>;
  accountCount:number;transactionCount:number;demoFeesCollectedMinor:number;offersOpen:number;deliveriesPending:number;reconciled:boolean;
  operations:{account:Account;receipt:Receipt}[];
  pendingOffers:{account:Account;offer:Reservation}[];
  pendingDeliveries:{account:Account;delivery:Reservation}[];
  stockAdjustments:StockReceipt[];
};
type Props={summary:MineSummary|null;loading:boolean;error:string;blocked:boolean;lastStockId?:string;onRefresh:()=>void;onRestock:(body:{metal:Metal;grams:string;reason:string;purityBps:string;location:string;documentTitle:string;documentContent:string})=>void;onReceipt:(accountId:string,receipt:Receipt)=>void;onStockReceipt:(receipt:StockReceipt)=>void};
const metals:{code:Metal;name:string}[]=[{code:'XAU',name:'Oro'},{code:'XAG',name:'Plata'},{code:'XPT',name:'Platino'},{code:'XPD',name:'Paladio'}];
const gram=(mg:number)=>`${(mg/1000).toLocaleString('es-CO',{minimumFractionDigits:3,maximumFractionDigits:3})} g`;
const money=(value:number)=>`USDT ${(value/100).toLocaleString('es-CO',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const name=(metal:Metal)=>metals.find(item=>item.code===metal)?.name||metal;
function Row({label,value}:{label:string;value:string}){return <View style={styles.row}><Text style={styles.label}>{label}</Text><Text style={styles.value}>{value}</Text></View>}

export function MineDashboard({summary,loading,error,blocked,lastStockId,onRefresh,onRestock,onReceipt,onStockReceipt}:Props){
  const [metal,setMetal]=useState<Metal>('XAU');const [grams,setGrams]=useState('1.000');const [reason,setReason]=useState('');
  const [purity,setPurity]=useState('9999');const [location,setLocation]=useState('Bóveda de presentación');
  const [documentTitle,setDocumentTitle]=useState('Registro de lote DEMO');const [documentContent,setDocumentContent]=useState('Documento ficticio de presentación sin valor legal ni acreditación de custodia física.');
  useEffect(()=>setPurity(({XAU:'9999',XAG:'9990',XPT:'9995',XPD:'9995'})[metal]),[metal]);
  useEffect(()=>{if(lastStockId)setReason('');},[lastStockId]);
  const units=parsePositiveDecimal(grams,3);const mg=units===null?null:Math.round(units*1000);
  const invalid=mg===null||mg<100;const overflow=!!summary&&mg!==null&&summary.totalSupplyMg[metal]+mg>1_000_000_000;
  const balanced=summary?.reconciled&&metals.every(item=>summary.inventoryMg[item.code]+summary.allocatedMg[item.code]===summary.totalSupplyMg[item.code]&&summary.reservedMg[item.code]<=summary.allocatedMg[item.code]);
  const metadataValid=/^[1-9]\d{0,4}$/.test(purity)&&Number(purity)<=10000&&location.trim().length>=3&&location.trim().length<=120&&documentTitle.trim().length>=3&&documentContent.trim().length>=3;
  const canSubmit=!!balanced&&!blocked&&!loading&&!invalid&&!overflow&&metadataValid&&reason.trim().length>=3&&reason.trim().length<=160;
  return <>
    <Text style={styles.eyebrow}>OPERADOR · INVENTARIO COMPARTIDO</Text>
    <Text accessibilityRole="header" style={styles.title}>{summary?.mine.name||'Panel de mina'}</Text>
    <Text style={styles.copy}>Compradores distintos operan sobre estas mismas existencias ficticias. Los saldos personales permanecen separados.</Text>
    <Pressable accessibilityRole="button" disabled={loading} onPress={onRefresh} style={[styles.secondary,loading&&styles.disabled]}><Text style={styles.secondaryText}>Actualizar panel de mina</Text></Pressable>
    {loading&&<View style={styles.loading}><ActivityIndicator color="#DCBC7F"/><Text style={styles.copy}>Consultando mina…</Text></View>}
    {!!error&&<View style={styles.error}><Text accessibilityRole="alert" style={styles.errorText}>{error}</Text><Pressable accessibilityRole="button" disabled={loading} onPress={onRefresh} style={styles.secondary}><Text style={styles.secondaryText}>Reintentar panel de mina</Text></Pressable></View>}
    {summary&&<>
      <View style={styles.card}><Row label="Cuentas compradoras" value={String(summary.accountCount)}/><Row label="Compras y ventas en esta mina" value={String(summary.transactionCount)}/><Row label="Comisiones ficticias de esas operaciones" value={money(summary.demoFeesCollectedMinor)}/>
        <Text style={styles.note}>Las operaciones anteriores a vincular una sesión se conservan en el comprador; no se cuentan como ventas nuevas de esta mina.</Text>
      </View>
      <Text accessibilityRole="header" style={styles.section}>Existencias por metal</Text>
      <Text style={[styles.note,balanced?styles.ok:styles.errorText]} accessibilityRole={balanced?undefined:'alert'}>{balanced?'Disponible + asignado coincide con el total registrado en esta demo.':'Hay una diferencia en el inventario. Actualiza el panel antes de operar.'}</Text>
      {metals.map(item=><View key={item.code} style={styles.card}><Text style={styles.cardTitle}>{item.name}</Text><Row label="Disponible para compras" value={gram(summary.inventoryMg[item.code])}/><Row label="Asignado a compradores" value={gram(summary.allocatedMg[item.code])}/><Row label="Reservado dentro de esas posiciones" value={gram(summary.reservedMg[item.code])}/><Row label="Total registrado" value={gram(summary.totalSupplyMg[item.code])}/></View>)}
      <Text accessibilityRole="header" style={styles.section}>Ingreso ficticio de metal</Text>
      <View style={styles.card}>
        <Text style={styles.copy}>Crea un lote ficticio con asignaciones trazables dentro de la demo. El registro no acredita recepción ni custodia física real.</Text>
        <View style={styles.chips}>{metals.map(item=><Pressable key={item.code} accessibilityRole="button" disabled={blocked} onPress={()=>setMetal(item.code)} style={[styles.chip,metal===item.code&&styles.chipOn]}><Text style={styles.chipText}>{item.name}</Text></Pressable>)}</View>
        <Text style={styles.label}>Cantidad en gramos</Text><TextInput accessibilityLabel="Gramos para ingreso de mina" style={styles.input} value={grams} onChangeText={setGrams} editable={!blocked} keyboardType="decimal-pad"/>
        {!invalid&&mg!==null&&<Row label="Cantidad interpretada" value={gram(mg)}/>}
        {invalid&&<Text style={styles.note}>Introduce al menos 0,1 g y hasta tres decimales, con coma o punto.</Text>}
        {overflow&&<Text accessibilityRole="alert" style={styles.note}>La cantidad superaría el límite de existencias de la demostración.</Text>}
        <Text style={styles.label}>Motivo ficticio</Text><TextInput accessibilityLabel="Motivo del ingreso de mina" style={styles.input} value={reason} onChangeText={setReason} editable={!blocked} maxLength={160} placeholder="Reposición para la demostración" placeholderTextColor="#667385"/>
        <Text style={styles.note}>De 3 a 160 caracteres. No incluyas datos personales.</Text>
        <Text style={styles.label}>Pureza ficticia en centésimas de porcentaje</Text><TextInput accessibilityLabel="Pureza del lote demo" style={styles.input} value={purity} onChangeText={setPurity} editable={!blocked} keyboardType="number-pad" maxLength={5}/><Text style={styles.note}>9999 equivale a 99,99 %. Metadato de demostración; no es un ensayo.</Text>
        <Text style={styles.label}>Ubicación de custodia simulada</Text><TextInput accessibilityLabel="Ubicación ficticia del lote" style={styles.input} value={location} onChangeText={setLocation} editable={!blocked} maxLength={120}/>
        <Text style={styles.label}>Título del documento DEMO</Text><TextInput accessibilityLabel="Título documento de lote demo" style={styles.input} value={documentTitle} onChangeText={setDocumentTitle} editable={!blocked} maxLength={100}/>
        <Text style={styles.label}>Contenido ficticio del documento</Text><TextInput accessibilityLabel="Contenido documento de lote demo" style={styles.input} value={documentContent} onChangeText={setDocumentContent} editable={!blocked} multiline maxLength={2000}/>
        <Pressable accessibilityRole="button" disabled={!canSubmit} onPress={()=>onRestock({metal,grams:normalizeDecimalInput(grams),reason:reason.trim(),purityBps:purity,location:location.trim(),documentTitle:documentTitle.trim(),documentContent:documentContent.trim()})} style={[styles.primary,!canSubmit&&styles.disabled]}><Text style={styles.primaryText}>Revisar ingreso ficticio</Text></Pressable>
      </View>
      <Text accessibilityRole="header" style={styles.section}>Últimas 20 operaciones de compradores</Text>
      <Text style={styles.note}>Compras, ventas y reservas del inventario compartido. Las conversiones y los ingresos a billeteras personales no aparecen aquí.</Text>
      {!summary.operations.length&&<Text style={styles.note}>Todavía no hay operaciones nuevas en este inventario compartido.</Text>}
      {summary.operations.map(item=><Pressable key={`${item.account.id}-${item.receipt.id}`} accessibilityRole="button" accessibilityLabel={`Ver operación de ${item.account.alias}: ${receiptTitle(item.receipt)}`} onPress={()=>onReceipt(item.account.id,item.receipt)} style={styles.card}>
        <Text style={styles.cardTitle}>{item.account.alias}</Text><Text style={styles.copy}>{receiptTitle(item.receipt)}</Text><Text style={styles.value}>{receiptSummary(item.receipt)}</Text><Text style={styles.note}>{new Date(item.receipt.at).toLocaleString('es-CO')}</Text><Text style={styles.link}>Consultar comprobante →</Text>
      </Pressable>)}
      <Text accessibilityRole="header" style={styles.section}>Ofertas reservadas</Text>
      <Text style={styles.note}>Mostrando {summary.pendingOffers.length} de {summary.offersOpen} ofertas abiertas, hasta 100 en este panel.</Text>
      {!summary.pendingOffers.length&&<Text style={styles.note}>Sin ofertas abiertas.</Text>}
      {summary.pendingOffers.map(item=><View key={`${item.account.id}-${item.offer.id}`} style={styles.card}><Text style={styles.cardTitle}>{item.account.alias}</Text><Row label={name(item.offer.metal)} value={gram(item.offer.mg)}/><Text style={styles.note}>Oferta abierta; no representa una venta a otra persona.</Text></View>)}
      <Text accessibilityRole="header" style={styles.section}>Solicitudes de cotización</Text>
      <Text style={styles.note}>Mostrando {summary.pendingDeliveries.length} de {summary.deliveriesPending} solicitudes pendientes, hasta 100 en este panel.</Text>
      {!summary.pendingDeliveries.length&&<Text style={styles.note}>Sin cotizaciones de entrega pendientes.</Text>}
      {summary.pendingDeliveries.map(item=><View key={`${item.account.id}-${item.delivery.id}`} style={styles.card}><Text style={styles.cardTitle}>{item.account.alias}</Text><Row label={name(item.delivery.metal)} value={gram(item.delivery.mg)}/><Text style={styles.note}>{deliveryStatusLabel(item.delivery.status as DeliveryStatus)}. Consulta el trámite en Entregas DEMO; no hay un envío real.</Text></View>)}
      <Text accessibilityRole="header" style={styles.section}>Últimos 20 ingresos registrados</Text>
      {!summary.stockAdjustments.length&&<Text style={styles.note}>Aún no se han registrado reposiciones.</Text>}
      {summary.stockAdjustments.map(item=><Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`Ver ingreso de ${name(item.metal)}: ${gram(item.mg)}`} onPress={()=>onStockReceipt(item)} style={styles.card}><Row label={`Ingreso de ${name(item.metal)}`} value={gram(item.mg)}/><Text style={styles.copy}>{item.reason}</Text><Text style={styles.note}>{item.actor?.alias||'Operador'} · {new Date(item.at).toLocaleString('es-CO')}</Text><Text style={styles.link}>Consultar ingreso →</Text></Pressable>)}
    </>}
  </>;
}

const styles=StyleSheet.create({
  eyebrow:{fontSize:10,color:'#DCBC7F',fontWeight:'800',letterSpacing:1.5,marginBottom:10},title:{fontSize:29,lineHeight:38,color:'#F9F6F0',fontWeight:'700',marginBottom:10},copy:{fontSize:13,lineHeight:22,color:'#BAC4CE',marginVertical:6},note:{fontSize:12,lineHeight:21,color:'#98A5B0',marginVertical:7},section:{fontSize:19,lineHeight:27,color:'#F3F2EE',fontWeight:'700',marginTop:26,marginBottom:12},card:{backgroundColor:'#141E28',borderWidth:1,borderColor:'#273541',borderRadius:14,padding:17,marginTop:12},cardTitle:{fontSize:16,lineHeight:24,color:'#F6F5F1',fontWeight:'700'},row:{flexDirection:'row',justifyContent:'space-between',gap:16,marginVertical:8,alignItems:'flex-start'},label:{color:'#AAB6C0',fontSize:12,lineHeight:21,flexShrink:1},value:{color:'#F6F5F1',fontSize:13,lineHeight:21,fontWeight:'700',flexShrink:1,textAlign:'right'},input:{color:'#FAF9F3',fontSize:17,paddingHorizontal:14,paddingVertical:13,backgroundColor:'#09131C',borderWidth:1,borderColor:'#3C4B56',borderRadius:10,marginTop:8,marginBottom:12},chips:{flexDirection:'row',flexWrap:'wrap',gap:8,marginVertical:14},chip:{padding:11,borderWidth:1,borderColor:'#465766',borderRadius:9},chipOn:{backgroundColor:'#665233',borderColor:'#DCBC7F'},chipText:{fontSize:12,color:'#F7E4BD',fontWeight:'700'},primary:{padding:15,minHeight:48,borderRadius:10,backgroundColor:'#DCBC7F',alignItems:'center',justifyContent:'center',marginTop:16},primaryText:{fontSize:13,fontWeight:'800',color:'#15212B'},secondary:{padding:14,minHeight:48,borderRadius:10,borderWidth:1,borderColor:'#4E6576',backgroundColor:'#1D2B37',alignItems:'center',justifyContent:'center',marginTop:12},secondaryText:{color:'#EDF1F3',fontSize:13,fontWeight:'700'},disabled:{opacity:.45},loading:{flexDirection:'row',gap:12,alignItems:'center',marginVertical:12},error:{padding:15,borderRadius:12,backgroundColor:'#4B2E2A',marginTop:14},errorText:{color:'#FCE4D9',fontSize:13,lineHeight:22},ok:{color:'#9FCAB6'},link:{color:'#DCBC7F',fontSize:12,fontWeight:'700',marginTop:12},
});
