import React,{useEffect,useMemo,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,Modal,Platform,Pressable,ScrollView,StyleSheet,Text,View,useWindowDimensions} from 'react-native';
import {GoldBar3D} from './GoldBar3D';
import {chapterAt,immersiveChapters,immersiveTravel} from '../lib/immersive-story';
import {scrollProgress} from '../lib/gold-bar-3d';
import {metalMaterial,type MetalCode} from '../lib/metal-materials';

type Target='Metales'|'Mercado'|'Billetera';
type Props={metal?:MetalCode;onMetalChange?:(metal:MetalCode)=>void;scrollY:Animated.Value;viewportHeight:number;onSkip?:()=>void;onSeek?:(offset:number)=>void;onAction?:(target:Target)=>void};
export function MetalStory({metal='XAU',onMetalChange,scrollY,viewportHeight,onSkip,onSeek,onAction}:Props){
 const {fontScale}=useWindowDimensions();
 const [origin,setOrigin]=useState<number|null>(null),[chapter,setChapter]=useState(0);
 const [systemReduced,setSystemReduced]=useState(true),[manualReduced,setManualReduced]=useState(false),[light,setLight]=useState(false),[limited,setLimited]=useState(false);
 const [screenReader,setScreenReader]=useState(false),[active,setActive]=useState(true),[menu,setMenu]=useState(false),[chaptersOpen,setChaptersOpen]=useState(false);
 const lastY=useRef(0),lastChapter=useRef(0),lastActive=useRef(true);
 // The supplied height already excludes safe-area insets and bottom tabs.
 const height=Math.max(1,viewportHeight),travel=immersiveTravel(height),start=origin??0,end=start+travel,compact=height<540;
 const reduced=systemReduced||manualReduced||screenReader,reading=fontScale>1.3||screenReader,simplified=reduced||light||limited;
 useEffect(()=>{
  let mounted=true;
  AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(mounted)setSystemReduced(value);}).catch(()=>{});
  if(Platform.OS!=='web')AccessibilityInfo.isScreenReaderEnabled().then(value=>{if(mounted)setScreenReader(value);}).catch(()=>{});
  const motion=AccessibilityInfo.addEventListener('reduceMotionChanged',setSystemReduced),reader=AccessibilityInfo.addEventListener('screenReaderChanged',setScreenReader);
  return()=>{mounted=false;motion.remove();reader.remove();};
 },[]);
 useEffect(()=>{
  const update=(value:number)=>{
   lastY.current=value;const next=chapterAt(scrollProgress(value,start,end));
   if(next!==lastChapter.current){lastChapter.current=next;setChapter(next);}
   const visible=origin!==null&&value>=start-height&&value<=end+height;
   if(visible!==lastActive.current){lastActive.current=visible;setActive(visible);}
  };
  update(lastY.current);const id=scrollY.addListener(({value})=>update(value));return()=>scrollY.removeListener(id);
 },[scrollY,start,end,height,origin]);
 const pin=useMemo(()=>scrollY.interpolate({inputRange:[start,end],outputRange:[0,travel],extrapolate:'clamp'}),[scrollY,start,end,travel]);
 const layers=useMemo(()=>{
  const phase=(index:number,values:number[],span=.75)=>scrollY.interpolate({inputRange:[start+Math.max(0,index-span)/6*travel,start+index/6*travel,start+Math.min(6,index+span)/6*travel].filter((value,i,all)=>i===0||value>all[i-1]),outputRange:index===0?values.slice(1):index===6?values.slice(0,2):values,extrapolate:'clamp'});
  return {vaultOpacity:phase(5,[0,.65,0]),vaultScale:scrollY.interpolate({inputRange:[start+travel*.64,start+travel*.83,start+travel],outputRange:[1.7,1,.65],extrapolate:'clamp'}),fractionOpacity:phase(6,[0,.65,.65]),headings:immersiveChapters.map((_,index)=>({opacity:phase(index,[.88,1,.88],.5),translateY:phase(index,[4,0,-4])})),hint:scrollY.interpolate({inputRange:[start,start+travel*.08],outputRange:[.7,0],extrapolate:'clamp'})};
 },[scrollY,start,travel]);
 const closeMenu=()=>{setMenu(false);setChaptersOpen(false);};
 const seek=(index:number)=>{closeMenu();onSeek?.(start+index/6*travel);};
 const operate=()=>{closeMenu();if(onSkip)onSkip();else onAction?.('Mercado');};
 const action=(target:Target)=>{closeMenu();if(onAction)onAction(target);else onSkip?.();};
 const title=immersiveChapters[chapter];
 return <View collapsable={false} testID="immersive-story" style={styles.story} onLayout={event=>setOrigin(event.nativeEvent.layout.y)}>
  <View style={{height:travel+height}} importantForAccessibility="no"/>
  <Animated.View collapsable={false} testID="immersive-stage" style={[styles.stage,{height,transform:[{translateY:pin}]}]}>
   <View style={StyleSheet.absoluteFill}>
    <GoldBar3D metal={metal} scrollY={scrollY} initialScrollY={lastY.current} startY={start} endY={end} active={active&&origin!==null} reducedMotion={simplified} height={height} cinematic sceneDescription={metalMaterial(metal).label+' DEMO. '+(limited?'Vista ligera activada por coste de render. Materia virtual DEMO.':light?'Materia virtual DEMO en modo ligero.':reduced?'Materia virtual DEMO con movimiento reducido.':'Materia tridimensional DEMO controlada por desplazamiento.')} onLimited={()=>setLimited(true)}/>
    {!simplified&&<View pointerEvents="none" style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
     <Animated.View style={[styles.vault,{opacity:layers.vaultOpacity,transform:[{scale:layers.vaultScale}]}]}><View style={styles.vaultInner}/><View style={styles.vaultAxis}/></Animated.View>
     <Animated.View style={[styles.fractions,{opacity:layers.fractionOpacity}]}>{Array.from({length:12},(_,i)=><View key={i} style={styles.fraction}/>)}</Animated.View>
    </View>}
   </View>
   <View style={styles.topline}>
    <Text style={styles.demo}>DEMO</Text>
    <View style={styles.topActions}>
     <Pressable accessibilityRole="button" accessibilityLabel="Saltar recorrido y continuar con la demo" onPress={operate} style={styles.topButton}><Text style={styles.operate}>Operar ↗</Text></Pressable>
     <Pressable accessibilityRole="button" accessibilityLabel="Opciones del recorrido" accessibilityState={{expanded:menu}} onPress={()=>setMenu(true)} style={styles.menuButton}><Text style={styles.menuGlyph}>⋯</Text></Pressable>
    </View>
   </View>
   {reading&&<View style={styles.readerControls}>
    <Pressable accessibilityRole="button" accessibilityLabel="Etapa anterior" disabled={chapter===0} onPress={()=>seek(chapter-1)} style={styles.readerButton}><Text style={[styles.readerText,chapter===0&&styles.disabled]}>← Anterior</Text></Pressable>
    {chapter<6&&<Pressable accessibilityRole="button" accessibilityLabel="Etapa siguiente" onPress={()=>seek(chapter+1)} style={styles.readerButton}><Text style={styles.readerText}>Continuar →</Text></Pressable>}
   </View>}
   <Animated.View pointerEvents="none" testID="immersive-progress" accessible accessibilityRole="header" accessibilityLabel={'Etapa '+(chapter+1)+' de 7: '+title.label} accessibilityHint={title.body} style={[styles.caption,{bottom:chapter===6?162:compact?62:86,opacity:simplified?1:layers.headings[chapter].opacity,transform:[{translateY:simplified?0:layers.headings[chapter].translateY}]}]}>
    <Text style={[styles.title,compact&&styles.compactTitle]} maxFontSizeMultiplier={2} numberOfLines={4} adjustsFontSizeToFit minimumFontScale={.75}>{title.title}</Text>
   </Animated.View>
   {chapter===0&&!reading&&<Animated.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.scrollCue,{opacity:layers.hint}]}><Text style={styles.scrollText}>Desliza para explorar</Text><Text style={styles.arrow}>↓</Text></Animated.View>}
   {chapter===6&&<View style={styles.destination}>
    <Pressable accessibilityRole="button" accessibilityLabel="Abrir mi portafolio" onPress={()=>action('Metales')} style={styles.primaryAction}><Text style={styles.primaryText}>Mi portafolio ↗</Text></Pressable>
    <View style={styles.destinationLinks}>
     <Pressable accessibilityRole="button" accessibilityLabel="Operar con metales DEMO" onPress={()=>action('Mercado')} style={styles.textAction}><Text style={styles.linkText}>Comprar o vender</Text></Pressable>
     <Pressable accessibilityRole="button" accessibilityLabel="Abrir mi billetera" onPress={()=>action('Billetera')} style={styles.textAction}><Text style={styles.linkText}>Billetera ↗</Text></Pressable>
    </View>
   </View>}
  </Animated.View>
  <Modal visible={menu} transparent animationType="none" onRequestClose={closeMenu}>
   <View style={styles.menuScrim}>
    <Pressable accessible={false} style={StyleSheet.absoluteFill} onPress={closeMenu}/>
    <View accessibilityViewIsModal style={[styles.menuPanel,{maxHeight:Math.max(180,height*.8)}]}>
     <View style={styles.menuHeader}><Text style={styles.menuTitle}>Elige cómo explorar</Text><Pressable accessibilityRole="button" accessibilityLabel="Cerrar opciones del recorrido" onPress={closeMenu} style={styles.menuButton}><Text style={styles.closeGlyph}>×</Text></Pressable></View>
     <ScrollView nestedScrollEnabled contentContainerStyle={styles.menuContent}>
      <Pressable accessibilityRole="switch" accessibilityLabel="Reducir movimiento del recorrido" accessibilityState={{checked:reduced,disabled:systemReduced}} disabled={systemReduced} onPress={()=>setManualReduced(value=>!value)} style={styles.option}><View style={styles.optionCopy}><Text style={styles.optionTitle}>Movimiento reducido</Text>{systemReduced&&<Text style={styles.optionHint}>Activado en tu dispositivo</Text>}</View><Text style={styles.optionValue}>{reduced?'Sí':'No'}</Text></Pressable>
      <Pressable accessibilityRole="switch" accessibilityLabel="Usar modo visual ligero" accessibilityState={{checked:light||limited}} onPress={()=>{setLimited(false);setLight(!(light||limited));}} style={styles.option}><Text style={styles.optionTitle}>Modo ligero</Text><Text style={styles.optionValue}>{light||limited?'Sí':'No'}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Elegir una etapa" accessibilityState={{expanded:chaptersOpen}} onPress={()=>setChaptersOpen(value=>!value)} style={styles.option}><Text style={styles.optionTitle}>Ir a un momento</Text><Text style={styles.optionValue}>{chaptersOpen?'−':'+'}</Text></Pressable>
      {chaptersOpen&&immersiveChapters.map((scene,index)=><Pressable key={scene.label} accessibilityRole="button" accessibilityLabel={'Ir a etapa '+(index+1)+': '+scene.label} accessibilityState={{selected:index===chapter}} onPress={()=>seek(index)} style={styles.chapterOption}><Text style={[styles.chapterLabel,index===chapter&&styles.selected]}>{scene.label}</Text></Pressable>)}
      {onMetalChange&&<View><Text style={styles.optionTitle}>Metal de la representación</Text><View style={{flexDirection:'row',gap:6,marginTop:10,marginBottom:10}}>{(['XAU','XAG','XPT','XPD'] as const).map(code=><Pressable key={code} accessibilityRole="button" accessibilityLabel={'Representar '+metalMaterial(code).label} accessibilityState={{selected:metal===code}} onPress={()=>onMetalChange(code)} style={{flex:1,minHeight:48,borderRadius:10,borderWidth:1,borderColor:metal===code?'#D5B97F':'#344148',alignItems:'center',justifyContent:'center'}}><Text style={{color:'#DFDDD3',fontSize:15}}>{metalMaterial(code).symbol}</Text><Text style={{color:'#A8B2AE',fontSize:9}}>{metalMaterial(code).label}</Text></Pressable>)}</View><Text style={styles.optionHint}>Materiales ilustrativos DEMO. Ag, Pt y Pd son plateados; el símbolo identifica cada metal.</Text></View>}
     </ScrollView>
    </View>
   </View>
  </Modal>
 </View>;
}
const styles=StyleSheet.create({
 story:{position:'relative',backgroundColor:'#0A0D10'},stage:{position:'absolute',top:0,left:0,right:0,overflow:'hidden',backgroundColor:'#0A0D10'},
 topline:{position:'absolute',top:10,left:22,right:12,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},demo:{fontSize:9,fontWeight:'600',letterSpacing:2.3,color:'#BAAC8E'},topActions:{flexDirection:'row',alignItems:'center',gap:8},topButton:{minHeight:44,paddingHorizontal:10,justifyContent:'center'},operate:{fontSize:12,color:'#DCC8A3'},menuButton:{minHeight:44,minWidth:44,alignItems:'center',justifyContent:'center'},menuGlyph:{color:'#C5C5B9',fontSize:28,lineHeight:32},
 caption:{position:'absolute',left:24,right:24},title:{fontFamily:Platform.OS==='ios'||Platform.OS==='web'?'Georgia':'serif',fontSize:42,lineHeight:47,fontWeight:'400',letterSpacing:-1.5,color:'#F1EEE4'},compactTitle:{fontSize:34,lineHeight:39,letterSpacing:-1.1},
 scrollCue:{position:'absolute',bottom:18,left:24,right:24,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},scrollText:{fontSize:10,letterSpacing:.7,color:'#A0A59D'},arrow:{fontSize:22,lineHeight:30,color:'#C5B28B'},
 vault:{position:'absolute',width:'88%',aspectRatio:1,borderRadius:500,borderWidth:1,borderColor:'#A8B9A777',alignSelf:'center',top:'18%',alignItems:'center',justifyContent:'center'},vaultInner:{position:'absolute',top:14,left:14,right:14,bottom:14,borderRadius:500,borderWidth:1,borderColor:'#A8B9A733'},vaultAxis:{width:'100%',height:1,backgroundColor:'#A8B9A755',transform:[{rotate:'-40deg'}]},
 fractions:{position:'absolute',left:'12%',right:'12%',top:'32%',flexDirection:'row',flexWrap:'wrap',gap:8,justifyContent:'center'},fraction:{width:'20%',aspectRatio:1.25,borderWidth:1,borderColor:'#DDC88D88',backgroundColor:'#D3AE5020',borderRadius:2},
 destination:{position:'absolute',left:24,right:24,bottom:18},primaryAction:{minHeight:50,paddingHorizontal:20,backgroundColor:'#DDC28B',borderRadius:28,justifyContent:'center',alignItems:'center'},primaryText:{color:'#171A17',fontSize:14,fontWeight:'600'},destinationLinks:{flexDirection:'row',justifyContent:'space-between',marginTop:5},textAction:{minHeight:44,paddingHorizontal:4,justifyContent:'center'},linkText:{fontSize:12,color:'#CFCAB9'},
 readerControls:{position:'absolute',left:16,right:16,top:60,flexDirection:'row',justifyContent:'space-between'},readerButton:{minHeight:44,paddingHorizontal:10,justifyContent:'center'},readerText:{fontSize:13,color:'#D8C18F'},disabled:{opacity:.35},
 menuScrim:{flex:1,backgroundColor:'#00000088',justifyContent:'flex-end',padding:16},menuPanel:{backgroundColor:'#141D22',borderRadius:22,paddingHorizontal:18,paddingTop:6,paddingBottom:16},menuHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},menuTitle:{fontSize:15,color:'#ECE7DA'},closeGlyph:{fontSize:26,color:'#D5D8CE'},menuContent:{paddingBottom:8},option:{minHeight:58,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},optionCopy:{flex:1},optionTitle:{fontSize:14,color:'#D4D7CC'},optionHint:{fontSize:11,color:'#92A199',marginTop:4},optionValue:{fontSize:13,color:'#D5B97F',minWidth:25,textAlign:'right'},chapterOption:{minHeight:44,justifyContent:'center',paddingLeft:12},chapterLabel:{fontSize:11,letterSpacing:.6,color:'#A4B1A8'},selected:{color:'#E3C992'},
});
