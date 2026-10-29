import React,{useEffect,useMemo,useRef,useState} from 'react';
import {AccessibilityInfo,Animated,Platform,Pressable,StyleSheet,Text,View} from 'react-native';
import {GoldBar3D} from './GoldBar3D';
import {scrollProgress,storyStage} from '../lib/gold-bar-3d';
import {metalStoryScenes as scenes} from '../lib/story-scenes';

type Props={scrollY:Animated.Value;viewportHeight:number;onSkip?:()=>void};
type Scene=typeof scenes[number];
const PIN=10;

function Chapter({scene}:{scene:Scene}){
  return <View style={styles.chapter}>
    <View style={styles.chapterHeading}><Text style={styles.number}>{scene.number}</Text><View style={styles.rule}/><Text style={styles.chapterLabel}>{scene.label}</Text></View>
    <Text accessibilityRole="header" style={styles.sceneTitle}>{scene.title}</Text>
    <Text style={styles.body}>{scene.body}</Text>
    <View style={styles.detailRow}><View style={styles.detailMark}/><Text style={styles.detail}>{scene.detail}</Text></View>
  </View>;
}

// One canvas and one editorial panel stay together through all seven chapters.
// Text changes by chapter; it never scrolls underneath an opaque GL surface.
export function MetalStory({scrollY,viewportHeight,onSkip}:Props){
  const [origin,setOrigin]=useState(0),[headerHeight,setHeaderHeight]=useState(240),[viewerHeight,setViewerHeight]=useState(560);
  const [originMeasured,setOriginMeasured]=useState(false),[headerMeasured,setHeaderMeasured]=useState(false);
  const [controlsHeight,setControlsHeight]=useState(58),[captionHeight,setCaptionHeight]=useState(43),[readingHeight,setReadingHeight]=useState(0);
  const [chapterHeights,setChapterHeights]=useState<Record<string,number>>({});
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
  const visibleHeight=Math.max(240,Number.isFinite(viewportHeight)?viewportHeight:600);
  const chapterHeight=Math.max(180,...Object.values(chapterHeights));
  const chromeHeight=controlsHeight+captionHeight+chapterHeight+2;
  const readingLayout=chromeHeight+140>visibleHeight-24;
  const figureHeight=readingLayout?160:Math.max(140,Math.min(300,visibleHeight-chromeHeight-24));
  const stepHeight=Math.max(430,visibleHeight*.9);
  const normalTravel=stepHeight*(scenes.length-1);
  const readingEstimate=controlsHeight+figureHeight+captionHeight+scenes.reduce((sum,scene)=>sum+(chapterHeights[scene.number]??chapterHeight),0);
  const travel=readingLayout?Math.max(1,(readingHeight||readingEstimate)-controlsHeight):normalTravel;
  const viewerStart=origin+headerHeight,endY=viewerStart+travel;
  const measured=originMeasured&&headerMeasured;
  const geometry=useRef({viewerStart,endY,travel,viewerHeight,visibleHeight,controlsHeight,figureHeight,readingLayout,skipped,measured});
  geometry.current={viewerStart,endY,travel,viewerHeight,visibleHeight,controlsHeight,figureHeight,readingLayout,skipped,measured};
  const update=useRef((value:number)=>{});
  update.current=(value:number)=>{
    lastScroll.current=value;
    const g=geometry.current,progress=scrollProgress(value,g.viewerStart-PIN,g.endY-PIN),index=storyStage(progress,scenes.length);
    if(lastStage.current!==index){lastStage.current=index;setStage(index);}
    const local=g.viewerStart+Math.max(0,Math.min(g.travel,value-g.viewerStart+PIN));
    const canvasTop=(g.readingLayout?g.viewerStart:local)+g.controlsHeight;
    const visible=g.measured&&!g.skipped&&canvasTop+g.figureHeight>value-60&&canvasTop<value+g.visibleHeight+60;
    if(lastActive.current!==visible){lastActive.current=visible;setActive(visible);}
  };
  useEffect(()=>{const listener=scrollY.addListener(({value})=>update.current(value));return()=>scrollY.removeListener(listener);},[scrollY]);
  useEffect(()=>{update.current(lastScroll.current);},[origin,headerHeight,viewerHeight,viewportHeight,travel,controlsHeight,figureHeight,readingLayout,skipped,measured]);
  const translateY=useMemo(()=>scrollY.interpolate({inputRange:[viewerStart-PIN,endY-PIN],outputRange:[0,travel],extrapolate:'clamp'}),[scrollY,viewerStart,endY,travel]);
  const skip=()=>{setSkipped(true);onSkip?.();};
  const controls=<View style={styles.controls} onLayout={event=>{const value=event.nativeEvent.layout.height;setControlsHeight(previous=>Math.abs(previous-value)>.5?value:previous);}}>
    <Pressable accessibilityRole="switch" accessibilityLabel="Reducir movimiento del recorrido" accessibilityState={{checked:reduced,disabled:systemReduced}} disabled={systemReduced}
      onPress={()=>setManualReduced(value=>!value)} style={styles.motionControl}>
      <View style={[styles.switchTrack,reduced&&styles.switchOn]}><View style={[styles.switchKnob,reduced&&styles.switchKnobOn]}/></View>
      <Text style={styles.motionText}>{systemReduced?'Movimiento reducido del dispositivo':reduced?'Movimiento reducido':'Reducir movimiento'}</Text>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Saltar recorrido y continuar con la demo" onPress={skip} style={styles.skip}><Text style={styles.skipText}>Saltar recorrido</Text><Text style={styles.skipArrow}>↗</Text></Pressable>
  </View>;
  const caption=<View style={styles.caption} onLayout={event=>{const value=event.nativeEvent.layout.height;setCaptionHeight(previous=>Math.abs(previous-value)>.5?value:previous);}}>
    <View style={styles.captionTop}><View style={styles.demoPill}><View style={styles.demoDot}/><Text style={styles.demoText}>DEMO</Text></View><Text style={styles.sequence}>{readingLayout?'SIETE ETAPAS':`${scenes[stage].number} / 07`}</Text></View>
    <View style={styles.steps}>{scenes.map((scene,index)=><View key={scene.number} style={[styles.step,index<=stage&&styles.completedStep,index===stage&&styles.currentStep]}/>)}</View>
  </View>;
  const figure=<GoldBar3D scrollY={scrollY} initialScrollY={lastScroll.current} startY={viewerStart-PIN} endY={endY-PIN}
    active={active} reducedMotion={reduced} height={figureHeight}/>;

  return <View style={styles.story} onLayout={event=>{setOrigin(event.nativeEvent.layout.y);setOriginMeasured(true);}}>
    <View onLayout={event=>{setHeaderHeight(event.nativeEvent.layout.height);setHeaderMeasured(true);}} style={styles.header}>
      <View style={styles.headerTop}><Text style={styles.eyebrow}>OPENMINERALS / RECORRIDO</Text><Text style={styles.edition}>01—07</Text></View>
      <Text style={styles.title}>La historia{`\n`}<Text style={styles.titleAccent}>del metal.</Text></Text>
      <Text style={styles.intro}>De la mina a la entrega. Siete momentos conectan el metal con tu portafolio.</Text>
      <View style={styles.scrollCue}><View style={styles.cueRule}/><Text style={styles.cueText}>DESLIZA PARA EXPLORAR</Text><Text style={styles.cueArrow}>↓</Text></View>
    </View>
    {skipped?<View style={styles.skipped}><Text style={styles.body}>Recorrido omitido. Las operaciones siguen disponibles desde Mercado.</Text><Pressable accessibilityRole="button" onPress={()=>setSkipped(false)} style={styles.reopen}><Text style={styles.skipText}>Volver al recorrido ↗</Text></Pressable></View>:<>
      {/* Hidden measuring copies stabilize the panel for all chapters and fonts.
          They are excluded from both Android/iOS accessibility and hit testing. */}
      <View style={styles.measurements} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {scenes.map(scene=><View key={scene.number} onLayout={event=>{const height=event.nativeEvent.layout.height;setChapterHeights(previous=>Math.abs((previous[scene.number]??0)-height)>.5?{...previous,[scene.number]:height}:previous);}}><Chapter scene={scene}/></View>)}
      </View>
      {readingLayout?<>
        <Animated.View style={[styles.anchoredViewer,{top:headerHeight,transform:[{translateY}]}]}>{controls}</Animated.View>
        <View style={{paddingTop:controlsHeight}} onLayout={event=>{const height=event.nativeEvent.layout.height;setReadingHeight(previous=>Math.abs(previous-height)>.5?height:previous);}}>
          {figure}{caption}{scenes.map(scene=><Chapter key={scene.number} scene={scene}/>)}
        </View>
      </>:<>
        <Animated.View style={[styles.anchoredViewer,{top:headerHeight,transform:[{translateY}]}]}>
          <View style={styles.viewer} onLayout={event=>{const height=event.nativeEvent.layout.height;setViewerHeight(previous=>Math.abs(previous-height)>.5?height:previous);}}>
            {controls}{figure}{caption}<View style={{minHeight:chapterHeight}}><Chapter scene={scenes[stage]}/></View>
          </View>
        </Animated.View>
        <View style={{height:travel+viewerHeight+Math.max(0,visibleHeight-viewerHeight)-PIN}} importantForAccessibility="no"/>
      </>}
    </>}
    <View style={styles.footer}><Text style={styles.footerMark}>OM</Text><Text style={styles.disclaimer}>Datos y operaciones simulados. Este recorrido no acredita origen, pureza, custodia ni metales físicos reales.</Text></View>
  </View>;
}

const serif=Platform.select({ios:'Georgia',android:'serif',default:'Georgia'});
const mono=Platform.select({ios:'Menlo',android:'monospace',default:'monospace'});
const styles=StyleSheet.create({
  story:{marginTop:32,marginBottom:14,backgroundColor:'#0B1013',borderWidth:1,borderColor:'#2D3030',borderRadius:20},
  header:{paddingTop:25,paddingHorizontal:20,paddingBottom:23},headerTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',gap:8},eyebrow:{fontSize:9,fontWeight:'700',letterSpacing:1.5,color:'#C6AD7D'},edition:{fontFamily:mono,fontSize:10,color:'#727C7D'},
  title:{fontFamily:serif,fontSize:43,lineHeight:46,fontWeight:'400',letterSpacing:-1.6,color:'#F2EADD',marginTop:23},titleAccent:{color:'#D7BD88',fontStyle:'italic'},intro:{fontSize:13,lineHeight:21,color:'#A9B1AF',marginTop:16,maxWidth:325},
  scrollCue:{flexDirection:'row',alignItems:'center',gap:10,marginTop:24},cueRule:{height:1,width:28,backgroundColor:'#8B7651'},cueText:{fontSize:8,fontWeight:'700',letterSpacing:1.5,color:'#BAB3A3'},cueArrow:{fontSize:18,color:'#D7BD88',marginLeft:'auto'},
  anchoredViewer:{position:'absolute',left:0,right:0,zIndex:3,elevation:4,backgroundColor:'#0B1013'},viewer:{backgroundColor:'#0B1013',borderTopWidth:1,borderBottomWidth:1,borderColor:'#35362F'},
  controls:{flexDirection:'row',flexWrap:'wrap',alignItems:'center',justifyContent:'space-between',paddingHorizontal:12,paddingVertical:5,gap:4,backgroundColor:'#0B1013',borderBottomWidth:1,borderBottomColor:'#292E2E'},motionControl:{minHeight:46,flexDirection:'row',alignItems:'center',gap:7,flexShrink:1},motionText:{color:'#AEB8B5',fontSize:10,lineHeight:15,flexShrink:1,maxWidth:132},
  switchTrack:{width:28,height:18,borderRadius:10,backgroundColor:'#333A3A',padding:3},switchOn:{backgroundColor:'#6C5C3F'},switchKnob:{width:12,height:12,borderRadius:6,backgroundColor:'#B0B6B0'},switchKnobOn:{backgroundColor:'#ECD7AB',alignSelf:'flex-end'},
  skip:{minHeight:46,paddingHorizontal:7,flexDirection:'row',gap:8,alignItems:'center'},skipText:{fontSize:11,fontWeight:'700',color:'#E4CFAB'},skipArrow:{fontSize:19,color:'#D1B681'},
  caption:{paddingTop:10,paddingHorizontal:20,paddingBottom:4},captionTop:{flexDirection:'row',alignItems:'center',justifyContent:'space-between'},demoPill:{flexDirection:'row',alignItems:'center',gap:5},demoDot:{width:4,height:4,borderRadius:2,backgroundColor:'#D1B681'},demoText:{fontSize:8,fontWeight:'700',letterSpacing:1.7,color:'#C7B085'},sequence:{fontFamily:mono,fontSize:9,letterSpacing:1.2,color:'#AEB2A8'},steps:{flexDirection:'row',gap:4,marginTop:9},step:{height:2,flex:1,backgroundColor:'#303736'},completedStep:{backgroundColor:'#77664A'},currentStep:{backgroundColor:'#E0C38D'},
  chapter:{paddingHorizontal:20,paddingTop:14,paddingBottom:15},chapterHeading:{flexDirection:'row',alignItems:'center',gap:9},number:{fontFamily:mono,fontSize:10,color:'#D5B87F',letterSpacing:1.1},rule:{height:1,width:22,backgroundColor:'#554C3A'},chapterLabel:{fontSize:8,fontWeight:'700',letterSpacing:1.2,color:'#9B9989',flexShrink:1},sceneTitle:{fontFamily:serif,fontSize:25,lineHeight:29,fontWeight:'400',letterSpacing:-.5,color:'#F2EADD',marginTop:8,marginBottom:8},body:{fontSize:13,lineHeight:18,color:'#BEC5C1'},detailRow:{flexDirection:'row',gap:9,marginTop:9},detailMark:{width:2,backgroundColor:'#806D4C',alignSelf:'stretch'},detail:{fontSize:10,lineHeight:15,color:'#9CA59F',flex:1},
  measurements:{position:'absolute',top:0,left:0,right:0,height:0,overflow:'hidden',opacity:0},footer:{paddingHorizontal:20,paddingTop:18,paddingBottom:22,flexDirection:'row',gap:13,alignItems:'flex-start'},footerMark:{fontFamily:serif,fontSize:20,color:'#927F5C'},disclaimer:{fontSize:10,lineHeight:17,color:'#7E8C88',flex:1},skipped:{paddingHorizontal:20,paddingVertical:18,borderTopWidth:1,borderTopColor:'#343832'},reopen:{minHeight:48,justifyContent:'center',marginTop:5},
});
