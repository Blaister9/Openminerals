import React,{useEffect,useMemo,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,Platform,Pressable,StyleSheet,Text,View,useWindowDimensions} from 'react-native';
import {GoldBar3D} from './GoldBar3D';
import {chapterAt,immersiveChapters,immersiveTravel} from '../lib/immersive-story';
import {scrollProgress} from '../lib/gold-bar-3d';

type Props={scrollY:Animated.Value;viewportHeight:number;onSkip?:()=>void;onSeek?:(offset:number)=>void};
export function MetalStory({scrollY,viewportHeight,onSkip,onSeek}:Props){
  const {fontScale}=useWindowDimensions();
  const [origin,setOrigin]=useState<number|null>(null),[chapter,setChapter]=useState(0);
  const [systemReduced,setSystemReduced]=useState(true),[manualReduced,setManualReduced]=useState(false),[light,setLight]=useState(false),[limited,setLimited]=useState(false);
  const [screenReader,setScreenReader]=useState(false),[active,setActive]=useState(true);
  const lastY=useRef(0),lastChapter=useRef(0),lastActive=useRef(true);
  const height=Math.max(420,viewportHeight-18),travel=immersiveTravel(height),start=origin??0,end=start+travel;
  const compact=height<540;
  const reduced=systemReduced||manualReduced||screenReader,reading=fontScale>1.3||screenReader;
  const simplified=reduced||light||limited;
  useEffect(()=>{
    let mounted=true;
    AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(mounted)setSystemReduced(value);}).catch(()=>{});
    // react-native-web reports screen-reader detection as always true; native
    // Android has the actual setting. Web retains semantic headings/ARIA.
    if(Platform.OS!=='web')AccessibilityInfo.isScreenReaderEnabled().then(value=>{if(mounted)setScreenReader(value);}).catch(()=>{});
    const motion=AccessibilityInfo.addEventListener('reduceMotionChanged',setSystemReduced);
    const reader=AccessibilityInfo.addEventListener('screenReaderChanged',setScreenReader);
    return()=>{mounted=false;motion.remove();reader.remove();};
  },[]);
  useEffect(()=>{
    const update=(value:number)=>{
      lastY.current=value;
      const next=chapterAt(scrollProgress(value,start,end));
      if(next!==lastChapter.current){lastChapter.current=next;setChapter(next);}
      const visible=origin!==null&&value>=start-height&&value<=end+height;
      if(visible!==lastActive.current){lastActive.current=visible;setActive(visible);}
    };
    update(lastY.current);
    const id=scrollY.addListener(({value})=>update(value));return()=>scrollY.removeListener(id);
  },[scrollY,start,end,height,origin]);
  const pin=useMemo(()=>scrollY.interpolate({inputRange:[start,end],outputRange:[0,travel],extrapolate:'clamp'}),[scrollY,start,end,travel]);
  const layers=useMemo(()=>{
    const phase=(index:number,values:number[],span=.75)=>scrollY.interpolate({inputRange:[start+Math.max(0,index-span)/6*travel,start+index/6*travel,start+Math.min(6,index+span)/6*travel].filter((value,i,all)=>i===0||value>all[i-1]),outputRange:index===0?values.slice(1):index===6?values.slice(0,2):values,extrapolate:'clamp'});
    return {vaultOpacity:phase(4,[0,.8,0]),vaultScale:scrollY.interpolate({inputRange:[start+travel*.47,start+travel*.67,start+travel*.84],outputRange:[1.6,1,.65],extrapolate:'clamp'}),fractionOpacity:phase(5,[0,1,0]),headings:immersiveChapters.map((_,index)=>({opacity:phase(index,[0,1,0],.5),translateY:phase(index,[24,0,-24])})),captions:immersiveChapters.map((_,index)=>phase(index,[0,1,0],.5))};
  },[scrollY,start,travel]);
  const {vaultOpacity,vaultScale,fractionOpacity}=layers;
  const title=immersiveChapters[chapter];
  const renderChapter=(index:number)=>{
    const scene=immersiveChapters[index];
    return <View><Text style={styles.chapter}>{String(index+1).padStart(2,'0')} / 07 · {scene.label}</Text><Text accessibilityRole="header" style={styles.title}>{scene.title}</Text><Text style={styles.body}>{scene.body}</Text><Text style={styles.detail}>{scene.detail}</Text></View>;
  };
  return <View collapsable={false} testID="immersive-story" style={styles.story} onLayout={event=>setOrigin(event.nativeEvent.layout.y)}>
    {reading?<View style={styles.reading}>
      <Text style={styles.eyebrow}>OPENMINERALS / LECTURA ACCESIBLE</Text>
      <Text style={styles.note}>Bóveda y proceso ficticios. Sin instalaciones reales.</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Saltar recorrido y continuar con la demo" onPress={onSkip} style={styles.action}><Text style={styles.actionText}>Ir a las operaciones ↗</Text></Pressable>
      {immersiveChapters.map((scene,index)=><View key={scene.label} style={styles.readingChapter}>{renderChapter(index)}</View>)}
    </View>:<>
      <View style={{height:travel+height}} importantForAccessibility="no"/>
      <Animated.View collapsable={false} testID="immersive-stage" style={[styles.pinned,{height,transform:[{translateY:pin}]}]}>
        <View style={styles.topline}><Text style={styles.eyebrow}>OPENMINERALS / MATERIA & VALOR</Text><Text style={styles.demo}>SIMULADO</Text></View>
        <View style={styles.controls}>
          <Pressable accessibilityRole="switch" accessibilityLabel="Reducir movimiento del recorrido" accessibilityState={{checked:reduced,disabled:systemReduced}} disabled={systemReduced} onPress={()=>setManualReduced(value=>!value)} style={styles.control}><Text style={styles.controlText}>{reduced?'Movimiento reducido':'Reducir movimiento'}</Text></Pressable>
          <Pressable accessibilityRole="switch" accessibilityLabel="Usar modo visual ligero" accessibilityState={{checked:light||limited}} onPress={()=>{setLimited(false);setLight(!(light||limited));}} style={styles.control}><Text style={styles.controlText}>{light||limited?'Modo ligero ✓':'Modo ligero'}</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Saltar recorrido y continuar con la demo" onPress={onSkip} style={styles.control}><Text style={styles.actionText}>Operar ↗</Text></Pressable>
        </View>
        <View style={[styles.visual,{top:compact?126:Math.max(130,height*.22),height:compact?160:Math.max(190,height*.48)}]}>
          <GoldBar3D scrollY={scrollY} initialScrollY={lastY.current} startY={start} endY={end} active={active&&origin!==null} reducedMotion={simplified} height={compact?160:Math.max(190,height*.48)} cinematic onLimited={()=>setLimited(true)}/>
          {!simplified&&<View pointerEvents="none" style={StyleSheet.absoluteFill}>
            <Animated.View style={[styles.vault,{opacity:vaultOpacity,transform:[{scale:vaultScale}]}]}><View style={styles.vaultInner}/><View style={styles.vaultAxis}/><Text style={styles.vaultLabel}>VIRTUAL / DEMO</Text></Animated.View>
            <Animated.View style={[styles.fractions,{opacity:fractionOpacity}]}>{Array.from({length:12},(_,i)=><View key={i} style={styles.fraction}/>)}</Animated.View>
          </View>}
        </View>
        {simplified?<View style={styles.simpleCaption}><Text style={styles.simpleLabel}>{title.label}</Text><Text style={styles.note}>{limited?'Vista ligera activada por coste de render.':reduced?'Sin movimiento de cámara.':'Visor 3D desactivado.'} La narrativa y las operaciones siguen disponibles.</Text></View>:null}
        <View pointerEvents="none" style={[styles.headings,compact&&{top:76,height:96}]}>
          {immersiveChapters.map((scene,index)=><Animated.View key={scene.label} aria-hidden={index!==chapter} accessibilityElementsHidden={index!==chapter} importantForAccessibility={index===chapter?'auto':'no-hide-descendants'} style={[styles.heading,{opacity:simplified?(index===chapter?1:0):layers.headings[index].opacity,transform:[{translateY:simplified?0:layers.headings[index].translateY}]}]}>
            <Text style={styles.chapter}>{String(index+1).padStart(2,'0')} / 07 · {scene.label}</Text>
            <Text accessibilityRole="header" style={[styles.title,compact&&{fontSize:27,lineHeight:30,marginTop:7}]}>{scene.title}</Text>
          </Animated.View>)}
        </View>
        <View pointerEvents="none" style={[styles.captions,compact&&{bottom:48,height:80}]}>
          {immersiveChapters.map((scene,index)=><Animated.View key={scene.label} aria-hidden={index!==chapter} accessibilityElementsHidden={index!==chapter} importantForAccessibility={index===chapter?'auto':'no-hide-descendants'} style={[styles.caption,{opacity:simplified?(index===chapter?1:0):layers.captions[index]}]}>
            <Text numberOfLines={compact?3:undefined} style={[styles.body,compact&&{fontSize:12,lineHeight:17}]}>{scene.body}</Text><Text numberOfLines={compact?1:undefined} style={[styles.detail,compact&&{fontSize:9.5,lineHeight:13,marginTop:6}]}>{scene.detail}</Text>
          </Animated.View>)}
        </View>
        <View style={styles.bottom}>
          <View style={styles.track}>{immersiveChapters.map((scene,index)=><Pressable key={scene.label} accessibilityRole="button" accessibilityLabel={'Ir a etapa '+(index+1)+': '+scene.label} accessibilityState={{selected:index===chapter}} disabled={!onSeek} onPress={()=>onSeek?.(start+index/6*travel)} style={styles.segmentButton}><View style={[styles.segment,index<=chapter&&styles.segmentOn]}/></Pressable>)}</View>
          <View style={styles.bottomRow}><Text testID="immersive-progress" accessibilityLabel={'Etapa '+(chapter+1)+' de 7: '+title.label} style={styles.progress}>{String(chapter+1).padStart(2,'0')} / 07</Text><Text style={styles.hint}>DESLIZA ↓ ↑ · ARRASTRA ↔</Text></View>
        </View>
      </Animated.View>
    </>}
    <Text style={styles.disclaimer}>Representación virtual ficticia. No acredita origen, producción, custodia, derechos reales ni documentos jurídicos.</Text>
  </View>;
}
const serif=Platform.OS==='android'?'serif':'Georgia';
const styles=StyleSheet.create({
  story:{marginHorizontal:-21,marginTop:-25,backgroundColor:'#0A0D10'},pinned:{position:'absolute',top:0,left:0,right:0,backgroundColor:'#0A0D10',overflow:'hidden'},
  topline:{paddingHorizontal:21,paddingTop:18,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},eyebrow:{color:'#B9A77F',fontSize:8,letterSpacing:1.4,fontWeight:'700'},demo:{color:'#A8B7B1',fontSize:8,letterSpacing:1},
  controls:{flexDirection:'row',justifyContent:'space-between',paddingHorizontal:12,borderBottomWidth:1,borderColor:'#272D2D'},control:{paddingHorizontal:8,minHeight:44,justifyContent:'center'},controlText:{color:'#A9B5AF',fontSize:10},actionText:{color:'#E7C992',fontSize:12,fontWeight:'700'},
  visual:{position:'absolute',left:0,right:0},headings:{position:'absolute',top:86,left:22,right:22,height:132,backgroundColor:'#0A0D10'},heading:{position:'absolute',left:0,right:0,top:0},chapter:{color:'#C5AD7A',fontSize:9,lineHeight:18,fontWeight:'700',letterSpacing:1.5},title:{fontFamily:serif,fontWeight:'400',fontSize:36,lineHeight:39,letterSpacing:-1,color:'#F1EADD',marginTop:9},
  captions:{position:'absolute',bottom:60,left:22,right:22,height:115},caption:{position:'absolute',left:0,right:0,bottom:0,backgroundColor:'#0A0D10'},body:{fontSize:13,lineHeight:20,color:'#BAC7C0'},detail:{fontSize:10,lineHeight:16,color:'#B4A382',marginTop:9},
  bottom:{position:'absolute',bottom:12,left:22,right:22},track:{flexDirection:'row',gap:5},segmentButton:{flex:1,minHeight:44,justifyContent:'center'},segment:{height:2,width:'100%',backgroundColor:'#303935'},segmentOn:{backgroundColor:'#C9AD75'},bottomRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},progress:{color:'#DBBE85',fontSize:10,fontFamily:'monospace'},hint:{color:'#7E9088',fontSize:8,letterSpacing:1},
  vault:{position:'absolute',alignSelf:'center',top:'4%',width:230,height:230,borderRadius:115,borderWidth:2,borderColor:'#667A72',alignItems:'center',justifyContent:'center'},vaultInner:{position:'absolute',width:210,height:210,borderRadius:105,borderWidth:1,borderColor:'#40574B'},vaultAxis:{position:'absolute',width:260,height:1,backgroundColor:'#8C9A87',transform:[{rotate:'45deg'}]},vaultLabel:{position:'absolute',bottom:12,color:'#A0ADA3',fontSize:7,letterSpacing:2},
  fractions:{position:'absolute',left:'14%',right:'14%',top:'32%',flexDirection:'row',flexWrap:'wrap',gap:6,justifyContent:'center'},fraction:{width:40,height:28,borderWidth:1,borderColor:'#E0C994',backgroundColor:'#AE87452A',borderRadius:3},
  simpleCaption:{position:'absolute',left:22,right:22,top:'59%'},simpleLabel:{color:'#D3BD92',fontSize:9,letterSpacing:1},note:{color:'#94A49D',fontSize:11,lineHeight:17,marginTop:7},disclaimer:{color:'#7D9288',fontSize:10,lineHeight:17,paddingHorizontal:22,paddingTop:12,paddingBottom:24},
  reading:{paddingHorizontal:22,paddingTop:22},readingChapter:{paddingVertical:24,borderBottomWidth:1,borderColor:'#2B3530'},action:{minHeight:48,justifyContent:'center',marginTop:12},
});
