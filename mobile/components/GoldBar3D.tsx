import React,{useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type ComponentType,type ReactNode} from 'react';
import {Animated,AppState,PanResponder,PixelRatio,Platform,Pressable,StyleSheet,Text,View} from 'react-native';
import {requireOptionalNativeModule} from 'expo-modules-core';
import type {ExpoWebGLRenderingContext,GLViewProps} from 'expo-gl';
import {createFrameScheduler,goldRenderScale,horizontalDrag,scrollProgress} from '../lib/gold-bar-3d';
import {renderBudget} from '../lib/immersive-story';
import {createStoryRenderer} from '../lib/scene-renderer';
import {metalMaterial,type MetalCode} from '../lib/metal-materials';
import {advanceSceneOrbit} from '../lib/scene-controls';

type Props={scrollY:Animated.Value;initialScrollY:number;startY:number;endY:number;active:boolean;reducedMotion:boolean;height?:number;cinematic?:boolean;sceneDescription?:string;metal?:MetalCode;onLimited?:()=>void};
type Renderer={draw:(progress:number,drag:number,metal?:MetalCode,minePeek?:number)=>void;dispose:()=>void};
type Scheduler=ReturnType<typeof createFrameScheduler>;

function availableGLView():ComponentType<GLViewProps>|null {
  try{
    // A guarded import keeps accounts usable in older APKs without ExpoGL.
    if(Platform.OS!=='web'&&!requireOptionalNativeModule('ExpoGL'))return null;
    return require('expo-gl').GLView as ComponentType<GLViewProps>;
  }catch{return null;}
}

class GLBoundary extends React.Component<{children:ReactNode;onFailure:()=>void},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(){this.props.onFailure();}
  render(){return this.state.failed?null:this.props.children;}
}

export function GoldBar3D({scrollY,initialScrollY,startY,endY,active,reducedMotion,height=290,cinematic=false,sceneDescription='Materia virtual DEMO',metal='XAU',onLimited}:Props){
  const [width,setWidth]=useState(0),[balanced,setBalanced]=useState(false);
  const material=metalMaterial(metal),metalRef=useRef(metal);metalRef.current=metal;
  const renderScale=goldRenderScale(width,height,PixelRatio.get())*(balanced?.75:1);
  const NativeGLView=useMemo(availableGLView,[]);
  const [foreground,setForeground]=useState(AppState.currentState===null||AppState.currentState==='active');
  const [failure,setFailure]=useState(false),[ready,setReady]=useState(false),[retry,setRetry]=useState(0);
  const renderer=useRef<Renderer|null>(null),scheduler=useRef<Scheduler|null>(null),timeout=useRef<ReturnType<typeof setTimeout>|null>(null);
  const lastScroll=useRef(initialScrollY),drag=useRef(0),minePeek=useRef(0),lastDragDx=useRef(0),readyRef=useRef(false);
  const previousAppState=useRef(AppState.currentState);
  const samples=useRef<number[]>([]),limited=useRef(false),limitCallback=useRef(onLimited);limitCallback.current=onLimited;
  const enabled=active&&foreground&&!reducedMotion&&!failure&&NativeGLView!==null;
  const session=useMemo(()=>Symbol('gold-bar-context'),[enabled,retry,width,height,renderScale]);
  const currentSession=useRef(session);currentSession.current=session;
  const latest=useRef({startY,endY,enabled});latest.current={startY,endY,enabled};
  const stop=useCallback(()=>{
    if(timeout.current!==null){clearTimeout(timeout.current);timeout.current=null;}
    scheduler.current?.dispose();scheduler.current=null;
    renderer.current?.dispose();renderer.current=null;readyRef.current=false;
  },[]);
  const fail=useCallback((expected:symbol)=>{
    if(currentSession.current!==expected)return;
    stop();setReady(false);setFailure(true);
  },[stop]);

  useLayoutEffect(()=>{
    currentSession.current=session;latest.current.enabled=enabled;
    setReady(false);readyRef.current=false;
    if(enabled)timeout.current=setTimeout(()=>fail(session),8000);
    return()=>{
      if(currentSession.current===session){currentSession.current=Symbol('disposed-context');latest.current.enabled=false;}
      stop();
    };
  },[enabled,session,fail,stop]);
  useEffect(()=>{
    const listener=scrollY.addListener(({value})=>{lastScroll.current=value;scheduler.current?.invalidate();});
    return()=>scrollY.removeListener(listener);
  },[scrollY]);
  useEffect(()=>{scheduler.current?.invalidate();},[startY,endY,height,width,renderScale,metal]);
  useLayoutEffect(()=>{
    if(!renderer.current)return;
    // A new label is ready only after a frame with its material was submitted.
    readyRef.current=false;setReady(false);scheduler.current?.invalidate();
  },[metal]);
  useEffect(()=>{
    const subscription=AppState.addEventListener('change',state=>{
      const resumed=state==='active'&&previousAppState.current!=='active';
      previousAppState.current=state;
      if(state!=='active'){currentSession.current=Symbol('background-context');latest.current.enabled=false;stop();setReady(false);}
      // A quick inactive -> active pair can be batched into the same React
      // commit. The boolean alone would not recreate the disposed GL context.
      if(resumed)setRetry(value=>value+1);
      setForeground(state==='active');
    });
    return()=>subscription.remove();
  },[stop]);

  const createContext=(gl:ExpoWebGLRenderingContext,expected:symbol)=>{
    if(currentSession.current!==expected||!latest.current.enabled)return;
    stop();
    try{
      samples.current=[];const next=createStoryRenderer(gl,cinematic);renderer.current=next;
      scheduler.current=createFrameScheduler({request:callback=>requestAnimationFrame(callback),cancel:cancelAnimationFrame,maxFps:balanced?30:60,now:()=>performance.now(),
        draw:()=>{
          if(currentSession.current!==expected||!latest.current.enabled)return;
          const began=performance.now();next.draw(scrollProgress(lastScroll.current,latest.current.startY,latest.current.endY),drag.current,metalRef.current,minePeek.current);
          if(cinematic&&!limited.current){samples.current.push(performance.now()-began);if(samples.current.length>120)samples.current.shift();if(!balanced&&samples.current.length>=45&&[...samples.current].sort((a,b)=>a-b)[Math.floor(samples.current.length*.9)]>20)setBalanced(true);if(balanced&&renderBudget(samples.current)){limited.current=true;limitCallback.current?.();}}
          if(!readyRef.current){readyRef.current=true;if(timeout.current!==null){clearTimeout(timeout.current);timeout.current=null;}setReady(true);}
        },onError:()=>fail(expected)});
      timeout.current=setTimeout(()=>fail(expected),8000);scheduler.current.invalidate();
    }catch{fail(expected);}
  };
  const responder=useMemo(()=>PanResponder.create({
    onStartShouldSetPanResponder:()=>false,
    onMoveShouldSetPanResponder:(_event,gesture)=>latest.current.enabled&&horizontalDrag(gesture.dx,gesture.dy,gesture.numberActiveTouches),
    onMoveShouldSetPanResponderCapture:(_event,gesture)=>latest.current.enabled&&horizontalDrag(gesture.dx,gesture.dy,gesture.numberActiveTouches),
    onPanResponderGrant:()=>{lastDragDx.current=0;},
    onPanResponderMove:(_event,gesture)=>{if(Number.isFinite(gesture.dx)){const orbit=advanceSceneOrbit({yaw:drag.current,peek:minePeek.current},gesture.dx-lastDragDx.current);lastDragDx.current=gesture.dx;drag.current=orbit.yaw;minePeek.current=orbit.peek;scheduler.current?.invalidate();}},
    onPanResponderTerminationRequest:()=>true,
  }),[]);
  const reset=()=>{drag.current=0;minePeek.current=0;lastDragDx.current=0;scheduler.current?.invalidate();};
  const retry3D=()=>{stop();setReady(false);setFailure(false);setRetry(value=>value+1);};
  const fallback=reducedMotion?'Movimiento reducido':failure||!NativeGLView?'Vista simplificada':!foreground?'Visor pausado':enabled?'Preparando 3D…':'Recorrido del metal';
  // Lightweight geometry stays still. Only narrative fades follow the user's
  // scroll, including reverse scroll; there is no timer, camera or idle loop.
  const fallbackFade=useMemo(()=>{
    const span=Math.max(1,endY-startY);
    return {
      mine:scrollY.interpolate({inputRange:[startY+span*.24,startY+span*.4],outputRange:[1,0],extrapolate:'clamp'}),
      bar:scrollY.interpolate({inputRange:[startY+span*.1,startY+span*.25],outputRange:[0,1],extrapolate:'clamp'}),
    };
  },[scrollY,startY,endY]);
  return <View collapsable={false} accessible={cinematic} accessibilityRole={cinematic?'image':undefined} accessibilityLabel={cinematic?sceneDescription:undefined} testID={cinematic?(enabled&&ready?'immersive-gl-ready':reducedMotion||failure||!NativeGLView?'immersive-scene-light':'immersive-scene-pending'):undefined} style={[styles.stage,cinematic&&styles.cinematicStage,{height}]} onLayout={event=>{const nextWidth=event.nativeEvent.layout.width;setWidth(previous=>Math.abs(previous-nextWidth)>.5?nextWidth:previous);}} {...responder.panHandlers}>
    <View style={styles.fallback} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {cinematic&&<Animated.View pointerEvents="none" style={[styles.lightMine,{opacity:fallbackFade.mine}]}>
        <View style={styles.tunnelOpening}/><View style={styles.tunnelGlow}/>
        <View style={[styles.tunnelArch,styles.tunnelFar]}/><View style={[styles.tunnelArch,styles.tunnelMiddle]}/><View style={[styles.tunnelArch,styles.tunnelNear]}/>
        <View style={[styles.rockLayer,styles.rockFar]}><View style={[styles.rock,styles.rockFarFace]}/><View style={[styles.rock,styles.rockFarFace,styles.rockSplit]}/></View>
        <View style={[styles.rockLayer,styles.rockMiddle]}><View style={[styles.rock,styles.rockMiddleFace]}/><View style={[styles.rock,styles.rockMiddleFace,styles.rockSplit]}/><View style={styles.rockVein}/></View>
        <View style={[styles.rockLayer,styles.rockNear]}><View style={[styles.rock,styles.rockNearFace]}/><View style={[styles.rock,styles.rockNearFace,styles.rockSplit]}/><View style={[styles.rockVein,styles.nearVein]}/></View>
        <View style={styles.tunnelGround}/>
      </Animated.View>}
      {!cinematic&&<><View style={styles.halo}/><View style={styles.floorLine}/></>}
      <Animated.View pointerEvents="none" style={[styles.lightBarStage,{opacity:cinematic?fallbackFade.bar:1}]}>
        <View style={styles.staticShadow}/>
        <View style={[styles.staticBar,metal==='XAU'?styles.goldSurface:styles.whiteSurface,cinematic&&styles.cinematicStaticBar]}>
          <View style={[styles.staticFace,metal==='XAU'?styles.goldFace:styles.whiteFace]}>
            <Text style={[styles.maker,metal!=='XAU'&&styles.whiteEngraving]}>⌁</Text><Text style={[styles.symbol,metal!=='XAU'&&styles.whiteEngraving]}>{material.symbol}</Text><Text style={[styles.word,metal!=='XAU'&&styles.whiteEngraving]}>DEMO</Text>
          </View>
          <View style={[styles.staticEdge,metal!=='XAU'&&styles.whiteEdge]}/>
        </View>
      </Animated.View>
    </View>
    {enabled&&NativeGLView&&width>0&&<GLBoundary key={`${retry}:${width}:${height}:${renderScale}`} onFailure={()=>fail(session)}>
      <NativeGLView style={{position:'absolute',top:0,left:0,width:width*renderScale,height:height*renderScale,transformOrigin:'top left',transform:[{scale:1/renderScale}],opacity:ready?1:0}} onContextCreate={gl=>createContext(gl,session)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"/>
    </GLBoundary>}
    {!cinematic&&<><View pointerEvents="none" style={styles.edition}><Text style={styles.simulated}>OBJETO DE ESTUDIO</Text><Text style={styles.editionNumber}>{material.symbol} · DEMO</Text></View>
    <Text pointerEvents="none" style={styles.demo}>METAL SIMULADO</Text></>}
    {!cinematic&&(ready?<View style={styles.helpRow}><Text style={styles.hint}>Arrastra ↔ · Desliza ↓</Text><Pressable accessibilityRole="button" accessibilityLabel="Restablecer orientación del lingote" onPress={reset} style={styles.smallButton}><Text style={styles.smallButtonText}>Restablecer</Text></Pressable></View>:
      <View style={styles.status}><Text style={styles.statusText}>{fallback}</Text>{(failure||!NativeGLView)&&!reducedMotion&&<Pressable accessibilityRole="button" onPress={retry3D} style={styles.smallButton}><Text style={styles.smallButtonText}>Reintentar 3D</Text></Pressable>}</View>)}
  </View>;
}

const styles=StyleSheet.create({
  cinematicStage:{borderRadius:0},cinematicStaticBar:{width:280,height:150},
  stage:{overflow:'hidden',backgroundColor:'#0A0D10',borderRadius:12},fallback:{position:'absolute',top:0,right:0,bottom:0,left:0,alignItems:'center',justifyContent:'center'},lightBarStage:{position:'absolute',top:0,right:0,bottom:0,left:0,alignItems:'center',justifyContent:'center'},
  lightMine:{position:'absolute',top:0,right:0,bottom:0,left:0,overflow:'hidden'},tunnelOpening:{position:'absolute',left:'14%',right:'14%',top:'18%',height:'62%',borderTopLeftRadius:170,borderTopRightRadius:140,backgroundColor:'#0B1516'},tunnelGlow:{position:'absolute',left:'35%',top:'42%',width:'34%',height:'28%',borderRadius:100,backgroundColor:'#1B2926'},
  tunnelArch:{position:'absolute',borderStyle:'solid',borderTopLeftRadius:210,borderTopRightRadius:175,borderBottomLeftRadius:40,borderBottomRightRadius:55},tunnelFar:{left:'20%',top:'26%',width:'62%',height:'51%',borderWidth:25,borderColor:'#202D29',borderTopColor:'#34413A'},tunnelMiddle:{left:'4%',top:'15%',width:'94%',height:'69%',borderWidth:33,borderColor:'#2C342D',borderTopColor:'#4A4D3E',transform:[{rotate:'-3deg'}]},tunnelNear:{left:'-15%',top:'4%',width:'128%',height:'88%',borderWidth:48,borderColor:'#383D32',borderTopColor:'#5A5A48',borderRightColor:'#292F28',transform:[{rotate:'4deg'}]},
  rockLayer:{position:'absolute',flexDirection:'row',gap:5},rock:{height:'100%',width:'67%',borderWidth:1,borderTopLeftRadius:22,borderTopRightRadius:7,borderBottomRightRadius:28,borderBottomLeftRadius:8},rockSplit:{width:'48%',transform:[{rotate:'18deg'},{translateY:12}]},rockFar:{left:'62%',top:'43%',width:65,height:88,transform:[{rotate:'-14deg'}]},rockFarFace:{backgroundColor:'#26362E',borderColor:'#4A5543'},rockMiddle:{left:'-4%',top:'31%',width:115,height:147,transform:[{rotate:'-19deg'}]},rockMiddleFace:{backgroundColor:'#484B3C',borderColor:'#73715A'},rockNear:{right:'-7%',top:'10%',width:155,height:213,transform:[{rotate:'23deg'}]},rockNearFace:{backgroundColor:'#575646',borderColor:'#85806A'},rockVein:{position:'absolute',left:'36%',top:7,width:2,height:'83%',backgroundColor:'#A4A48D',transform:[{rotate:'13deg'}]},nearVein:{backgroundColor:'#B8AE8E',width:3,transform:[{rotate:'-11deg'}]},tunnelGround:{position:'absolute',left:'16%',right:'16%',top:'69%',height:'39%',borderRadius:55,backgroundColor:'#1E2925',borderTopWidth:1,borderTopColor:'#485346',transform:[{perspective:600},{rotateX:'65deg'}]},
  halo:{position:'absolute',width:250,height:180,borderRadius:120,backgroundColor:'#141C21'},floorLine:{position:'absolute',left:22,right:22,bottom:'24%',height:1,backgroundColor:'#20282C'},staticShadow:{position:'absolute',width:205,height:33,borderRadius:30,backgroundColor:'#070C10',top:'62%',transform:[{rotate:'-8deg'}]},
  staticBar:{width:190,height:105,borderRadius:15,borderWidth:2,transform:[{perspective:700},{rotateX:'24deg'},{rotateZ:'-9deg'}],elevation:9,shadowColor:'#000',shadowOffset:{width:0,height:14},shadowOpacity:.4,shadowRadius:15},goldSurface:{borderTopColor:'#FAE6AA',borderLeftColor:'#CBA355',borderRightColor:'#AE7D30',borderBottomColor:'#715022',backgroundColor:'#C59A48'},whiteSurface:{borderTopColor:'#EFF1EF',borderLeftColor:'#B9BFBD',borderRightColor:'#848D8B',borderBottomColor:'#505B59',backgroundColor:'#A5ADAA'},staticFace:{flex:1,borderRadius:11,borderWidth:1,margin:6,alignItems:'center',justifyContent:'center'},goldFace:{borderColor:'#94713A'},whiteFace:{borderColor:'#6E7975'},staticEdge:{position:'absolute',left:3,right:3,bottom:-5,height:5,borderBottomLeftRadius:12,borderBottomRightRadius:12,backgroundColor:'#7C591F'},whiteEdge:{backgroundColor:'#606D68'},whiteEngraving:{color:'#3F4C47',textShadowColor:'#EBF0EB'},maker:{color:'#755018',fontSize:18,lineHeight:18},symbol:{fontSize:36,lineHeight:40,fontWeight:'600',letterSpacing:4,color:'#5D421D',textShadowColor:'#F9D88D',textShadowOffset:{width:0,height:1},textShadowRadius:1},word:{fontSize:8,fontWeight:'700',letterSpacing:4,color:'#765326'},
  edition:{position:'absolute',top:17,left:16},simulated:{fontSize:8,fontWeight:'600',letterSpacing:2,color:'#AFA68F'},editionNumber:{fontSize:12,fontWeight:'500',letterSpacing:1,color:'#E3D3AF',marginTop:5},demo:{position:'absolute',right:15,top:18,fontSize:7,fontWeight:'600',letterSpacing:1.25,color:'#ABAC9D'},
  helpRow:{position:'absolute',bottom:7,left:10,right:5,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},hint:{fontSize:10,color:'#B6C2CB'},smallButton:{minHeight:42,paddingHorizontal:10,justifyContent:'center'},smallButtonText:{fontSize:11,color:'#E4C58B',fontWeight:'700'},
  status:{position:'absolute',bottom:0,left:10,right:5,minHeight:46,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},statusText:{fontSize:11,color:'#B6C2CB',flex:1},
});
