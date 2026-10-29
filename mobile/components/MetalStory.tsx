import React,{useEffect,useMemo,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,Pressable,StyleSheet,Text,View} from 'react-native';
import {GoldBar3D} from './GoldBar3D';
import {scrollProgress,storyStage} from '../lib/gold-bar-3d';

type Props={scrollY:Animated.Value;viewportHeight:number;onSkip?:()=>void};
const scenes=[
  {number:'01',title:'Todo comienza en el origen',label:'ORIGEN SIMULADO',body:'La historia de un metal empieza con el lote y su procedencia. En una operación real, esos datos deben respaldarse con documentos verificables.',detail:'La mina puede registrar lotes ficticios con origen, peso y pureza declarados.'},
  {number:'02',title:'Del mineral al lingote',label:'REFINACIÓN CONCEPTUAL',body:'La refinación transforma la materia prima. Peso, pureza y ensayo tendrían que comprobarse antes de ofrecer un metal real.',detail:'Esta representación del oro es conceptual. No acredita un ensayo ni una existencia física.'},
  {number:'03',title:'Tu compra, gramo a gramo',label:'COMPRA SIMULADA',body:'Convierte tu saldo demo a USDT y elige los gramos de metal. Una compra confirmada descuenta USDT y registra tu posición en Mis metales.',detail:'El recorrido no compra nada por ti. Las operaciones se confirman desde Mercado.'},
  {number:'04',title:'Una custodia que se debe acreditar',label:'CUSTODIA DEMO',body:'Consulta la asignación por lote y su certificado simulado. En una operación real harían falta un custodio y documentos verificables; aquí no hay metal físico asignado a tu cuenta.',detail:'Las reservas y entregas también son ficticias y quedan trazadas en el historial.'},
  {number:'05',title:'De tu portafolio al marketplace',label:'MARKETPLACE DEMO',body:'Publica una oferta de tus gramos o acepta una oferta de otro comprador. La simulación registra el intercambio, el pago en USDT y los movimientos entre lotes.',detail:'Sin tokens, blockchain, dinero ni entregas reales. Puedes consultar después cada comprobante.'},
];

// One viewer follows the parent ScrollView through all five text sections.
export function MetalStory({scrollY,viewportHeight,onSkip}:Props){
  const [origin,setOrigin]=useState(0),[headerHeight,setHeaderHeight]=useState(142),[viewerHeight,setViewerHeight]=useState(360);
  const [textHeight,setTextHeight]=useState(260);
  const [systemReduced,setSystemReduced]=useState(true),[manualReduced,setManualReduced]=useState(false),[skipped,setSkipped]=useState(false);
  const [stage,setStage]=useState(0),[active,setActive]=useState(false);
  const lastScroll=useRef(0),lastStage=useRef(0),lastActive=useRef(false);
  useEffect(()=>{
    let alive=true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(alive)setSystemReduced(value);}).catch(()=>{});
    const subscription=AccessibilityInfo.addEventListener('reduceMotionChanged',setSystemReduced);
    return()=>{alive=false;subscription.remove();};
  },[]);
  const reduced=systemReduced||manualReduced;
  const visibleHeight=Math.max(240,viewportHeight),stepHeight=Math.max(560,visibleHeight,viewerHeight+textHeight+52);
  const viewerStart=origin+headerHeight,travel=stepHeight*(scenes.length-1),endY=viewerStart+travel;
  const geometry=useRef({viewerStart,endY,travel,viewerHeight,visibleHeight,reduced,skipped});geometry.current={viewerStart,endY,travel,viewerHeight,visibleHeight,reduced,skipped};
  const update=useRef((value:number)=>{});
  update.current=(value:number)=>{
    lastScroll.current=value;
    const g=geometry.current,progress=scrollProgress(value,g.viewerStart-12,g.endY-12);
    const index=storyStage(progress);
    if(lastStage.current!==index){lastStage.current=index;setStage(index);}
    const local=g.viewerStart+Math.max(0,Math.min(g.travel,value-g.viewerStart+12));
    const visible=!g.skipped&&local+g.viewerHeight>value-80&&local<value+g.visibleHeight+80;
    if(lastActive.current!==visible){lastActive.current=visible;setActive(visible);}
  };
  useEffect(()=>{const listener=scrollY.addListener(({value})=>update.current(value));return()=>scrollY.removeListener(listener);},[scrollY]);
  useEffect(()=>{update.current(lastScroll.current);},[origin,headerHeight,viewerHeight,viewportHeight,stepHeight,reduced,skipped]);
  const translateY=useMemo(()=>scrollY.interpolate({inputRange:[viewerStart-12,endY-12],outputRange:[0,travel],extrapolate:'clamp'}),[scrollY,viewerStart,endY,travel]);
  const skip=()=>{setSkipped(true);onSkip?.();};
  const viewer=<View style={styles.viewer} onLayout={event=>{const height=event.nativeEvent.layout.height;if(Math.abs(height-viewerHeight)>.5)setViewerHeight(height);}}>
    <View style={styles.controls}>
      <Pressable accessibilityRole="switch" accessibilityLabel="Reducir movimiento del recorrido" accessibilityState={{checked:reduced,disabled:systemReduced}} disabled={systemReduced} onPress={()=>setManualReduced(value=>!value)} style={styles.motionControl}>
        <View style={[styles.switchTrack,reduced&&styles.switchOn]}><View style={[styles.switchKnob,reduced&&styles.switchKnobOn]}/></View>
        <Text style={styles.motionText}>{systemReduced?'Movimiento reducido del dispositivo':reduced?'Movimiento reducido':'Reducir movimiento'}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Saltar recorrido y continuar con la demo" onPress={skip} style={styles.skip}><Text style={styles.skipText}>Saltar recorrido →</Text></Pressable>
    </View>
    <GoldBar3D scrollY={scrollY} initialScrollY={lastScroll.current} startY={viewerStart-12} endY={endY-12} active={active} reducedMotion={reduced}/>
    <View style={styles.caption}><Text style={styles.stageLabel}>{scenes[stage].number} / 05 · {scenes[stage].label}</Text><View style={styles.steps}>{scenes.map((scene,index)=><View key={scene.number} style={[styles.step,index===stage&&styles.currentStep]}/>)}</View></View>
  </View>;
  return <View style={styles.story} onLayout={event=>setOrigin(event.nativeEvent.layout.y)}>
    <View onLayout={event=>setHeaderHeight(event.nativeEvent.layout.height)} style={styles.header}>
      <Text style={styles.eyebrow}>DEL ORIGEN AL MARKETPLACE</Text><Text style={styles.title}>La historia del metal</Text>
      <Text style={styles.intro}>Un lingote, cinco etapas. Desliza hacia abajo para seguir su recorrido; arrástralo horizontalmente para explorar su volumen.</Text>
    </View>
    {skipped?<View style={styles.skipped}><Text style={styles.body}>Recorrido omitido. Las operaciones siguen disponibles desde Mercado.</Text><Pressable accessibilityRole="button" onPress={()=>setSkipped(false)} style={styles.reopen}><Text style={styles.skipText}>Volver al recorrido</Text></Pressable></View>:<>
      <Animated.View style={[styles.anchoredViewer,{top:headerHeight,transform:[{translateY}]}]}>{viewer}</Animated.View>
      {scenes.map((scene,index)=><View key={scene.number} style={[styles.scene,{minHeight:stepHeight,paddingTop:viewerHeight+26}]}>
        <View onLayout={event=>{const height=event.nativeEvent.layout.height;setTextHeight(previous=>height>previous+.5?height:previous);}}>
          <View style={styles.sceneHeading}><Text style={styles.number}>{scene.number}</Text><View style={styles.rule}/><Text style={styles.down}>{index===scenes.length-1?'●':'↓'}</Text></View>
          <Text style={styles.sceneTitle}>{scene.title}</Text><Text style={styles.body}>{scene.body}</Text><Text style={styles.detail}>{scene.detail}</Text>
        </View>
      </View>)}
    </>}
    <Text style={styles.disclaimer}>DEMO · Datos y operaciones simulados. Este recorrido no acredita origen, pureza, custodia ni metales físicos reales.</Text>
  </View>;
}

const styles=StyleSheet.create({
  story:{marginTop:28,marginBottom:12},header:{paddingBottom:20},eyebrow:{fontSize:10,fontWeight:'800',letterSpacing:1.7,color:'#DCBC7F',marginBottom:10},title:{fontSize:27,lineHeight:34,fontWeight:'700',color:'#F7F6F2',marginBottom:9},intro:{fontSize:13,lineHeight:21,color:'#B6C2CB'},
  anchoredViewer:{position:'absolute',left:0,right:0,zIndex:2,elevation:3},viewer:{backgroundColor:'#101C26',borderWidth:1,borderColor:'#35414A',borderRadius:16,padding:7},controls:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',paddingHorizontal:4,paddingBottom:4,gap:2},
  motionControl:{minHeight:46,flexDirection:'row',alignItems:'center',gap:7,flexShrink:1},motionText:{color:'#B6C2CB',fontSize:10,flexShrink:1,maxWidth:150},switchTrack:{width:30,height:20,borderRadius:12,backgroundColor:'#2B3B48',padding:3},switchOn:{backgroundColor:'#715B38'},switchKnob:{width:14,height:14,borderRadius:8,backgroundColor:'#B6C2CB'},switchKnobOn:{backgroundColor:'#F0D49C',alignSelf:'flex-end'},
  skip:{minHeight:46,paddingHorizontal:7,justifyContent:'center'},skipText:{fontSize:11,fontWeight:'700',color:'#F0D49C'},caption:{paddingTop:13,paddingBottom:8,paddingHorizontal:7},stageLabel:{fontSize:10,fontWeight:'700',letterSpacing:1.1,color:'#D6BA82'},steps:{flexDirection:'row',gap:5,marginTop:10},step:{height:3,flex:1,backgroundColor:'#38434A',borderRadius:2},currentStep:{backgroundColor:'#D7B879'},
  scene:{paddingBottom:26},sceneHeading:{flexDirection:'row',alignItems:'center',gap:14},number:{color:'#DCBC7F',fontSize:15,fontWeight:'800',letterSpacing:2},rule:{height:1,backgroundColor:'#34424C',flex:1},down:{color:'#8A9AA7',fontSize:17},sceneTitle:{fontSize:22,lineHeight:29,fontWeight:'700',color:'#F7F6F2',marginTop:15,marginBottom:9},body:{color:'#AFBDC7',fontSize:13,lineHeight:22},detail:{color:'#D0BA91',fontSize:11,lineHeight:19,marginTop:13},disclaimer:{color:'#92A0AC',fontSize:11,lineHeight:18,marginTop:12},skipped:{padding:16,borderWidth:1,borderColor:'#35414A',borderRadius:12},reopen:{minHeight:46,justifyContent:'center'},
});
