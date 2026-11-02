import React,{useEffect,useMemo,useRef,useState} from 'react';
import {ActivityIndicator,AppState,Pressable,StyleSheet,Text,TextInput,View} from 'react-native';
import {createReferenceReader,displayedStatus,historyPlot,isHistoryReference,isMetalReference,parseExchangeReference,parseReferenceEnvelope,quoteCanConfirm,referenceConversion,referenceStatusLabel,type CommercialQuote,type ExchangeReference,type HistoryReference,type MetalCode,type MetalReference,type ReferenceEnvelope,type ReferencePeriod} from '../lib/market-reference';
import {normalizeDecimalInput} from '../lib/presentation';

type Props={api:string;metal:MetalCode;accountId?:string;active:boolean;disabled:boolean;refreshKey:string;quoteTrade:(body:{action:'buy'|'sell';metal:MetalCode;grams:string})=>Promise<CommercialQuote>;submit:(action:string,body:Record<string,string>,title:string,detail:string)=>void};
const usd=(value:number|null,digits=4)=>value===null?'No publicado':`USD ${value.toLocaleString('es-CO',{maximumFractionDigits:digits,minimumFractionDigits:digits})}`;
const usdt=(minor:number)=>`USDT ${(minor/100).toLocaleString('es-CO',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
const date=(value:string)=>new Date(value).toLocaleString('es-CO');
const message=(error:unknown)=>error instanceof Error?error.message:'Referencia no disponible.';
function Row({label,value}:{label:string;value:string}){return <View style={styles.row}><Text style={styles.copy}>{label}</Text><Text style={styles.value}>{value}</Text></View>}
function Control({label,onPress,disabled=false,selected=false}:{label:string;onPress:()=>void;disabled?:boolean;selected?:boolean}){return <Pressable accessibilityRole="button" accessibilityState={{disabled,selected}} disabled={disabled} onPress={onPress} style={[styles.button,selected&&styles.selected,disabled&&{opacity:0.4}]}><Text style={styles.value}>{label}</Text></Pressable>}

export function MarketReferencesPanel({api,metal,accountId,active,disabled,refreshKey,quoteTrade,submit}:Props){
  const reader=useMemo(()=>createReferenceReader(api),[api]);
  const request=useRef(0),quoteRequest=useRef(0);
  const [foreground,setForeground]=useState(AppState.currentState===null||AppState.currentState==='active');
  const [period,setPeriod]=useState<ReferencePeriod>('7d'),[revision,setRevision]=useState(0),[loading,setLoading]=useState(false),[error,setError]=useState('');
  const [reference,setReference]=useState<ReferenceEnvelope<MetalReference>|null>(null),[history,setHistory]=useState<ReferenceEnvelope<HistoryReference>|null>(null),[exchange,setExchange]=useState<ExchangeReference|null>(null);
  const [action,setAction]=useState<'buy'|'sell'>('buy'),[grams,setGrams]=useState('0.100'),[quote,setQuote]=useState<CommercialQuote|null>(null),[quoting,setQuoting]=useState(false),[quoteError,setQuoteError]=useState(''),[now,setNow]=useState(Date.now()),[width,setWidth]=useState(280);
  const [referenceAmount,setReferenceAmount]=useState('1'),[referenceFrom,setReferenceFrom]=useState('USD'),[referenceTo,setReferenceTo]=useState('COP');
  useEffect(()=>{const subscription=AppState.addEventListener('change',state=>setForeground(state==='active'));return ()=>subscription.remove();},[]);
  useEffect(()=>{
    const expected=++request.current;setLoading(false);
    if(!foreground||!active){reader.cancel();return;}
    setReference(null);setHistory(null);setExchange(null);setError('');setLoading(true);
    void Promise.allSettled([reader.get<unknown>(`/api/demo/market/metals/${metal}`),reader.get<unknown>(`/api/demo/market/metals/${metal}/history?period=${period}`),reader.get<ExchangeReference>('/api/demo/market/exchange')]).then(results=>{
      if(request.current!==expected)return;
      try{if(results[0].status==='rejected')throw results[0].reason;const result=parseReferenceEnvelope(results[0].value,isMetalReference);if(result.data&&result.data.metal!==metal)throw new Error('La referencia no corresponde al metal.');setReference(result);}catch(cause){setError(message(cause));}
      try{if(results[1].status==='rejected')throw results[1].reason;setHistory(parseReferenceEnvelope(results[1].value,isHistoryReference));}catch(cause){setError(message(cause));}
      try{if(results[2].status==='rejected')throw results[2].reason;setExchange(parseExchangeReference(results[2].value));}catch(cause){setError(message(cause));}setLoading(false);
    });
    return ()=>{request.current++;reader.cancel();};
  },[reader,metal,period,revision,foreground,active]);
  useEffect(()=>{quoteRequest.current++;setQuote(null);setQuoteError('');setQuoting(false);},[metal,accountId,action,grams,refreshKey]);
  useEffect(()=>{if(!foreground||!active)return;setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),quote?1000:30000);return ()=>clearInterval(timer);},[quote,foreground,active]);
  useEffect(()=>()=>{quoteRequest.current++;},[]);
  async function obtainQuote(){
    if(disabled||!foreground||!active||!accountId||quoting)return;const expected=++quoteRequest.current;setQuoting(true);setQuote(null);setQuoteError('');
    try{const result=await quoteTrade({action,metal,grams:normalizeDecimalInput(grams)});if(quoteRequest.current!==expected)return;if(result.action!==action||result.metal!==metal)throw new Error('La cotización no coincide. Solicita una nueva.');setNow(Date.now());setQuote(result);}
    catch(cause){if(quoteRequest.current===expected)setQuoteError(message(cause));}finally{if(quoteRequest.current===expected)setQuoting(false);}
  }
  const data=reference?.data,points=history?.data?.points??[],plot=historyPlot(points,Math.max(0,width-12),100),valid=quoteCanConfirm(quote,now,disabled||!foreground||!active);
  const conversion=referenceConversion(exchange,normalizeDecimalInput(referenceAmount),referenceFrom,referenceTo,now);
  return <View style={styles.panel}>
    <Text accessibilityRole="header" style={styles.title}>Referencia internacional · {metal}</Text>
    <Text style={styles.notice}>Datos externos de referencia. Billetera, compras, custodia y entregas siguen siendo SIMULADAS. El portafolio y las conversiones habituales conservan sus valores DEMO.</Text>
    {loading&&<ActivityIndicator accessibilityLabel="Consultando referencias" color="#D8B676"/>}
    {!!error&&<Text accessibilityRole="alert" style={styles.notice}>{error}</Text>}
    {reference&&<Text style={styles.copy}>{referenceStatusLabel(displayedStatus(reference,now,300000))}</Text>}
    {data&&<>
      <Text style={styles.referenceLabel}>PRECIO EXTERNO · USD · NO ES PRECIO DE COMPRA OPENMINERALS</Text>
      <Row label="Referencia por gramo" value={usd(data.reference)}/><Row label="Referencia por onza troy" value={usd(data.perTroyOunce,2)}/>
      <Row label="Bid / g" value={usd(data.bid)}/><Row label="Ask / g" value={usd(data.ask)}/>
      <Row label="Máximo / mínimo del proveedor, por g" value={`${usd(data.high)} / ${usd(data.low)}`}/>
      <Row label="Variación vs. día de mercado anterior" value={data.changePercent===null?'No publicada':`${data.changePercent.toLocaleString('es-CO')} %`}/>
      <Text style={styles.copy}>{data.provider} · precio de {date(data.asOf)}. Estado de apertura/cierre no confirmado. La última referencia conserva su fecha durante periodos sin actividad; no se garantiza tiempo real.</Text>
    </>}
    <View style={styles.controls}>{(['24h','7d','30d','1y'] as const).map(value=><Control key={value} label={value==='1y'?'1 año':value} selected={period===value} onPress={()=>setPeriod(value)}/>)}</View>
    {history&&<Text style={styles.copy}>{referenceStatusLabel(history.status)} · histórico diario USD/g. {period==='24h'?'El proveedor no ofrece esta serie intradía.':''}</Text>}
    {points.length>0?<>
      <View onLayout={event=>setWidth(event.nativeEvent.layout.width)} accessible accessibilityRole="image" accessibilityLabel={`Histórico diario: ${points.length} observaciones desde ${points[0].date} hasta ${points.at(-1)!.date}. Sin rellenar fechas ausentes.`} style={styles.chart}>
        {plot.segments.map((line,i)=><View key={'line'+i} style={{position:'absolute',left:line.x-line.length/2+6,top:line.y+8,width:line.length,height:2,backgroundColor:'#D8B676',transform:[{rotate:`${line.angle}rad`}]}}/>)}
        {plot.dots.map((dot,i)=><View key={'dot'+i} style={{position:'absolute',left:dot.x+4,top:dot.y+6,width:4,height:4,borderRadius:2,backgroundColor:'#D8B676'}}/>)}
      </View><Text style={styles.copy}>{points[0].date} — {points.at(-1)!.date} · {points.length} observaciones. Huecos sin interpolar.</Text>
    </>:!loading&&<Text style={styles.copy}>Sin observaciones disponibles para este periodo.</Text>}
    <Text style={styles.title}>Tasas de referencia</Text>
    {exchange?.fiat?.data?.map(rate=><Row key={rate.quote} label={`1 ${rate.base} → ${rate.quote}`} value={`${rate.rate.toLocaleString('es-CO')} · ${date(rate.asOf)}`}/>)}
    {exchange?.fiat&&<Text style={styles.copy}>{referenceStatusLabel(displayedStatus(exchange.fiat,now,4*86400000))} · Frankfurter, referencia diaria agregada.</Text>}
    {exchange?.usdt?.data&&<Row label="1 USDT → USD" value={`${exchange.usdt.data.rate.toLocaleString('es-CO',{maximumFractionDigits:6})} · ${date(exchange.usdt.data.asOf)}`}/>}
    {exchange?.usdt&&<Text style={styles.copy}>{referenceStatusLabel(displayedStatus(exchange.usdt,now,120000))} · Coinbase Exchange, último negocio USDT/USD; puede diferir de 1.</Text>}
    <Text style={styles.title}>Conversión de referencia</Text>
    <Text style={styles.copy}>Calculadora informativa con fuentes fechadas. No convierte saldos ni envía operaciones a la billetera.</Text>
    <TextInput accessibilityLabel="Importe de conversión de referencia" style={styles.input} value={referenceAmount} onChangeText={setReferenceAmount} keyboardType="decimal-pad"/>
    <Text style={styles.copy}>De</Text><View style={styles.controls}>{['USD','EUR','COP','USDT'].map(currency=><Control key={currency} label={currency} selected={referenceFrom===currency} onPress={()=>setReferenceFrom(currency)}/>)}</View>
    <Text style={styles.copy}>A</Text><View style={styles.controls}>{['USD','EUR','COP','USDT'].map(currency=><Control key={currency} label={currency} selected={referenceTo===currency} onPress={()=>setReferenceTo(currency)}/>)}</View>
    {conversion?<><Row label="Estimación con referencias externas" value={`${conversion.output.toLocaleString('es-CO',{maximumFractionDigits:6})} ${conversion.to}`}/><Text style={styles.copy}>{conversion.sources.map(source=>`${source.provider} · ${date(source.asOf)}`).join('\n')}. Tasa cruzada calculada; no es una cotización comercial.</Text></>:<Text style={styles.notice}>No hay referencias vigentes y autorizadas para este par, o el importe no es válido. No se aplica una tasa ficticia como sustituto.</Text>}
    <Control label="Consultar referencias" disabled={loading||!foreground||!active} onPress={()=>setRevision(value=>value+1)}/>
    {accountId&&<>
      <Text style={styles.commercialLabel}>PRECIO COMERCIAL OPENMINERALS · SIMULADO</Text>
      <Text style={styles.copy}>Cotización independiente en USDT ficticios, con diferencial, comisión y vencimiento. No cambia las tasas de conversión de billetera.</Text>
      <View style={styles.controls}><Control label="Compra DEMO" selected={action==='buy'} onPress={()=>setAction('buy')}/><Control label="Venta DEMO" selected={action==='sell'} onPress={()=>setAction('sell')}/></View>
      <TextInput accessibilityLabel="Gramos para cotización con referencia externa" style={styles.input} value={grams} onChangeText={setGrams} keyboardType="decimal-pad"/>
      <Control label={quoting?'Solicitando…':'Solicitar nueva cotización DEMO'} disabled={disabled||quoting||!foreground||!active} onPress={()=>void obtainQuote()}/>
      {!!quoteError&&<Text accessibilityRole="alert" style={styles.notice}>{quoteError}</Text>}
      {quote&&<>
        <Row label="Precio comercial SIMULADO por gramo" value={`${usdt(quote.priceCentsPerGram)} / g`}/>
        <Row label="Diferencial incluido en el precio" value={`${(quote.spreadBps/100).toLocaleString('es-CO')} %`}/>
        <Row label="Cantidad cotizada" value={`${quote.grams} g`}/>
        <Row label="Metal sin comisión adicional" value={usdt(quote.baseMinor)}/><Row label={`Comisión adicional DEMO (${quote.feeBps/100} %)`} value={usdt(quote.feeMinor)}/><Row label={action==='buy'?'Total DEMO':'Recibes DEMO'} value={usdt(quote.totalMinor??quote.outputMinor??0)}/>
        <Text style={styles.copy}>{quote.id} · válida hasta {date(quote.expiresAt)}. {quote.reference.provider} + {quote.exchange.provider}.</Text>
        {!valid&&<Text accessibilityRole="alert" style={styles.notice}>Cotización vencida o no confirmable. Solicita una nueva antes de operar.</Text>}
        <Control label="Revisar y confirmar operación DEMO" disabled={!valid} onPress={()=>{if(quoteCanConfirm(quote,Date.now(),disabled||!foreground||!active))submit('reference_trade',{quoteId:quote.id},action==='buy'?'Compra DEMO con referencia':'Venta DEMO con referencia',`${quote.grams} g de ${quote.metal}.\n${action==='buy'?'Total':'Recibes'}: ${usdt(quote.totalMinor??quote.outputMinor??0)}.\nCotización: ${quote.id}.\nVence: ${date(quote.expiresAt)}. El servidor comprobará su vigencia.`);}}/>
      </>}
    </>}
  </View>;
}
const styles=StyleSheet.create({panel:{padding:16,backgroundColor:'#101B24',borderRadius:16,marginVertical:16,gap:12},title:{color:'#EBD4A7',fontSize:18,fontWeight:'700'},referenceLabel:{color:'#9BD6ED',backgroundColor:'#152D3A',padding:12,fontSize:13,fontWeight:'700'},commercialLabel:{color:'#E9C990',backgroundColor:'#352C1B',padding:12,fontSize:15,fontWeight:'700'},copy:{color:'#BCC5CC',fontSize:13,flexShrink:1},value:{color:'#F3F3EF',fontSize:13,fontWeight:'600',flexShrink:1},notice:{color:'#E9C990',fontSize:13,lineHeight:19},row:{flexDirection:'row',justifyContent:'space-between',gap:16},controls:{flexDirection:'row',flexWrap:'wrap',gap:8},button:{padding:12,borderWidth:1,borderColor:'#46535F',borderRadius:10},selected:{borderColor:'#D8B676',backgroundColor:'#29313A'},chart:{height:120,marginVertical:8},input:{borderColor:'#46535F',borderWidth:1,borderRadius:10,padding:12,color:'#F3F3EF'}});
