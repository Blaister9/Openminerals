import React,{useCallback,useEffect,useLayoutEffect,useMemo,useRef,useState,type ComponentType,type ReactNode} from 'react';
import {Animated,AppState,PanResponder,PixelRatio,Platform,Pressable,StyleSheet,Text,View} from 'react-native';
import {requireOptionalNativeModule} from 'expo-modules-core';
import type {ExpoWebGLRenderingContext,GLViewProps} from 'expo-gl';
import {createFrameScheduler,createGoldBarMesh,createStudioFloorMesh,goldBarMatrices,goldBarPose,goldRenderScale,horizontalDrag,scrollProgress,GOLD_FRAGMENT_SHADER,GOLD_VERTEX_SHADER} from '../lib/gold-bar-3d';
import {immersivePose,IMMERSIVE_VERTEX_SHADER,IMMERSIVE_FRAGMENT_SHADER,renderBudget} from '../lib/immersive-story';

type Props={scrollY:Animated.Value;initialScrollY:number;startY:number;endY:number;active:boolean;reducedMotion:boolean;height?:number;cinematic?:boolean;onLimited?:()=>void};
type Renderer={draw:(progress:number,drag:number)=>void;dispose:()=>void};
type Scheduler=ReturnType<typeof createFrameScheduler>;

function availableGLView():ComponentType<GLViewProps>|null {
  try{
    // A guarded import keeps accounts usable in older APKs without ExpoGL.
    if(Platform.OS!=='web'&&!requireOptionalNativeModule('ExpoGL'))return null;
    return require('expo-gl').GLView as ComponentType<GLViewProps>;
  }catch{return null;}
}

function createRenderer(gl:ExpoWebGLRenderingContext,cinematic=false):Renderer {
  const buffers:WebGLBuffer[]=[],shaders:WebGLShader[]=[];
  let program:WebGLProgram|null=null,disposed=false;
  const dispose=()=>{
    if(disposed)return;disposed=true;
    // GLView owns this context; the headless destroy API must not be used.
    for(const buffer of buffers)try{gl.deleteBuffer(buffer);}catch{}
    for(const shader of shaders)try{gl.deleteShader(shader);}catch{}
    if(program)try{gl.deleteProgram(program);}catch{}
  };
  try{
    const compile=(type:number,source:string)=>{
      const shader=gl.createShader(type);if(!shader)throw new Error('GL shader unavailable.');shaders.push(shader);
      gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS))throw new Error('GL shader compilation failed.');
      return shader;
    };
    const vertex=compile(gl.VERTEX_SHADER,cinematic?IMMERSIVE_VERTEX_SHADER:GOLD_VERTEX_SHADER),fragment=compile(gl.FRAGMENT_SHADER,cinematic?IMMERSIVE_FRAGMENT_SHADER:GOLD_FRAGMENT_SHADER);
    program=gl.createProgram();if(!program)throw new Error('GL program unavailable.');
    gl.attachShader(program,vertex);gl.attachShader(program,fragment);gl.linkProgram(program);
    if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error('GL program linking failed.');
    gl.useProgram(program);
    const mesh=createGoldBarMesh(),floor=createStudioFloorMesh();
    const attribute=(name:string,data:Float32Array)=>{
      const location=gl.getAttribLocation(program!,name);
      if(location<0)throw new Error('GL attribute unavailable.');
      const buffer=gl.createBuffer();
      if(!buffer)throw new Error('GL attribute unavailable.');buffers.push(buffer);
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
      gl.enableVertexAttribArray(location);gl.vertexAttribPointer(location,3,gl.FLOAT,false,0,0);
    };
    attribute('a_position',new Float32Array([...mesh.positions,...floor.positions]));attribute('a_normal',new Float32Array([...mesh.normals,...floor.normals]));
    const uniform=(name:string)=>{const location=gl.getUniformLocation(program!,name);if(location===null)throw new Error('GL uniform unavailable.');return location;};
    const locations={model:uniform('u_model'),mvp:uniform('u_mvp'),camera:uniform('u_camera'),light:uniform('u_light'),refinement:uniform('u_refinement'),surface:uniform('u_surface'),shadowAngle:uniform('u_shadowAngle')};
    const storyProgress=cinematic?uniform('u_storyProgress'):null;
    gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.CULL_FACE);gl.cullFace(gl.BACK);gl.frontFace(gl.CCW);
    gl.clearColor(10/255,13/255,16/255,1);gl.clearDepth(1);
    return {
      draw(progress,drag){
        if(disposed)return;
        const width=gl.drawingBufferWidth,height=gl.drawingBufferHeight;
        if(width<=0||height<=0)throw new Error('GL viewport unavailable.');
        const pose=cinematic?immersivePose(progress,drag):goldBarPose(progress,drag),matrices=goldBarMatrices(pose,width/height);
        gl.viewport(0,0,width,height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);gl.useProgram(program);
        if(storyProgress!==null)gl.uniform1f(storyProgress,progress);
        gl.uniform3f(locations.camera,...matrices.camera);gl.uniform3f(locations.light,...pose.light);gl.uniform1f(locations.refinement,pose.refinement);gl.uniform1f(locations.shadowAngle,pose.yaw);
        gl.uniform1f(locations.surface,1);gl.uniformMatrix4fv(locations.model,false,matrices.floorModel);gl.uniformMatrix4fv(locations.mvp,false,matrices.floorMvp);
        gl.drawArrays(gl.TRIANGLES,mesh.vertexCount,floor.vertexCount);
        gl.uniform1f(locations.surface,0);gl.uniformMatrix4fv(locations.model,false,matrices.model);gl.uniformMatrix4fv(locations.mvp,false,matrices.mvp);
        gl.drawArrays(gl.TRIANGLES,0,mesh.vertexCount);gl.flush();gl.endFrameEXP();
      },dispose,
    };
  }catch(error){dispose();throw error;}
}

class GLBoundary extends React.Component<{children:ReactNode;onFailure:()=>void},{failed:boolean}> {
  state={failed:false};
  static getDerivedStateFromError(){return {failed:true};}
  componentDidCatch(){this.props.onFailure();}
  render(){return this.state.failed?null:this.props.children;}
}

export function GoldBar3D({scrollY,initialScrollY,startY,endY,active,reducedMotion,height=290,cinematic=false,onLimited}:Props){
  const [width,setWidth]=useState(0);
  const renderScale=goldRenderScale(width,height,PixelRatio.get());
  const NativeGLView=useMemo(availableGLView,[]);
  const [foreground,setForeground]=useState(AppState.currentState===null||AppState.currentState==='active');
  const [failure,setFailure]=useState(false),[ready,setReady]=useState(false),[retry,setRetry]=useState(0);
  const renderer=useRef<Renderer|null>(null),scheduler=useRef<Scheduler|null>(null),timeout=useRef<ReturnType<typeof setTimeout>|null>(null);
  const lastScroll=useRef(initialScrollY),drag=useRef(0),dragStart=useRef(0),readyRef=useRef(false);
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
  useEffect(()=>{scheduler.current?.invalidate();},[startY,endY,height,width,renderScale]);
  useEffect(()=>{
    const subscription=AppState.addEventListener('change',state=>{
      if(state!=='active'){currentSession.current=Symbol('background-context');latest.current.enabled=false;stop();}
      setForeground(state==='active');
    });
    return()=>subscription.remove();
  },[stop]);

  const createContext=(gl:ExpoWebGLRenderingContext,expected:symbol)=>{
    if(currentSession.current!==expected||!latest.current.enabled)return;
    stop();
    try{
      const next=createRenderer(gl,cinematic);renderer.current=next;
      scheduler.current=createFrameScheduler({request:callback=>requestAnimationFrame(callback),cancel:cancelAnimationFrame,maxFps:30,now:()=>performance.now(),
        draw:()=>{
          if(currentSession.current!==expected||!latest.current.enabled)return;
          const began=performance.now();next.draw(scrollProgress(lastScroll.current,latest.current.startY,latest.current.endY),drag.current);
          if(cinematic&&!limited.current){samples.current.push(performance.now()-began);if(samples.current.length>120)samples.current.shift();if(renderBudget(samples.current)){limited.current=true;limitCallback.current?.();}}
          if(!readyRef.current){readyRef.current=true;if(timeout.current!==null){clearTimeout(timeout.current);timeout.current=null;}setReady(true);}
        },onError:()=>fail(expected)});
      timeout.current=setTimeout(()=>fail(expected),8000);scheduler.current.invalidate();
    }catch{fail(expected);}
  };
  const responder=useMemo(()=>PanResponder.create({
    onStartShouldSetPanResponder:()=>false,
    onMoveShouldSetPanResponder:(_event,gesture)=>latest.current.enabled&&horizontalDrag(gesture.dx,gesture.dy,gesture.numberActiveTouches),
    onMoveShouldSetPanResponderCapture:(_event,gesture)=>latest.current.enabled&&horizontalDrag(gesture.dx,gesture.dy,gesture.numberActiveTouches),
    onPanResponderGrant:()=>{dragStart.current=drag.current;},
    onPanResponderMove:(_event,gesture)=>{if(Number.isFinite(gesture.dx)){drag.current=dragStart.current+gesture.dx*.012;scheduler.current?.invalidate();}},
    onPanResponderTerminationRequest:()=>true,
  }),[]);
  const reset=()=>{drag.current=0;scheduler.current?.invalidate();};
  const retry3D=()=>{stop();setReady(false);setFailure(false);setRetry(value=>value+1);};
  const fallback=reducedMotion?'Movimiento reducido':failure||!NativeGLView?'Vista simplificada':!foreground?'Visor pausado':enabled?'Preparando 3D…':'Recorrido del metal';
  return <View style={[styles.stage,{height}]} onLayout={event=>setWidth(previous=>Math.abs(previous-event.nativeEvent.layout.width)>.5?event.nativeEvent.layout.width:previous)} {...responder.panHandlers}>
    <View style={styles.fallback} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.halo}/><View style={styles.floorLine}/><View style={styles.staticShadow}/><View style={styles.staticBar}><View style={styles.staticFace}><Text style={styles.maker}>⌁</Text><Text style={styles.symbol}>AU</Text><Text style={styles.word}>DEMO</Text></View><View style={styles.staticEdge}/></View>
    </View>
    {enabled&&NativeGLView&&width>0&&<GLBoundary key={`${retry}:${width}:${height}:${renderScale}`} onFailure={()=>fail(session)}>
      <NativeGLView style={{position:'absolute',top:0,left:0,width:width*renderScale,height:height*renderScale,transformOrigin:'top left',transform:[{scale:1/renderScale}],opacity:ready?1:0}} onContextCreate={gl=>createContext(gl,session)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants"/>
    </GLBoundary>}
    {!cinematic&&<><View pointerEvents="none" style={styles.edition}><Text style={styles.simulated}>OBJETO DE ESTUDIO</Text><Text style={styles.editionNumber}>Au / 79</Text></View>
    <Text pointerEvents="none" style={styles.demo}>METAL SIMULADO</Text></>}
    {ready?<View style={styles.helpRow}><Text style={styles.hint}>Arrastra ↔ · Desliza ↓</Text><Pressable accessibilityRole="button" accessibilityLabel="Restablecer orientación del lingote" onPress={reset} style={styles.smallButton}><Text style={styles.smallButtonText}>Restablecer</Text></Pressable></View>:
      <View style={styles.status}><Text style={styles.statusText}>{fallback}</Text>{(failure||!NativeGLView)&&!reducedMotion&&<Pressable accessibilityRole="button" onPress={retry3D} style={styles.smallButton}><Text style={styles.smallButtonText}>Reintentar 3D</Text></Pressable>}</View>}
  </View>;
}

const styles=StyleSheet.create({
  stage:{overflow:'hidden',backgroundColor:'#0A0D10',borderRadius:12},fallback:{position:'absolute',top:0,right:0,bottom:0,left:0,alignItems:'center',justifyContent:'center'},
  halo:{position:'absolute',width:250,height:180,borderRadius:120,backgroundColor:'#141C21'},floorLine:{position:'absolute',left:22,right:22,bottom:'24%',height:1,backgroundColor:'#20282C'},staticShadow:{position:'absolute',width:205,height:33,borderRadius:30,backgroundColor:'#070C10',top:'62%',transform:[{rotate:'-8deg'}]},
  staticBar:{width:190,height:105,borderRadius:15,borderWidth:2,borderTopColor:'#FAE6AA',borderLeftColor:'#CBA355',borderRightColor:'#AE7D30',borderBottomColor:'#715022',backgroundColor:'#C59A48',transform:[{perspective:700},{rotateX:'24deg'},{rotateZ:'-9deg'}],elevation:9,shadowColor:'#000',shadowOffset:{width:0,height:14},shadowOpacity:.4,shadowRadius:15},staticFace:{flex:1,borderRadius:11,borderWidth:1,borderColor:'#94713A',margin:6,alignItems:'center',justifyContent:'center'},staticEdge:{position:'absolute',left:3,right:3,bottom:-5,height:5,borderBottomLeftRadius:12,borderBottomRightRadius:12,backgroundColor:'#7C591F'},maker:{color:'#755018',fontSize:18,lineHeight:18},symbol:{fontSize:36,lineHeight:40,fontWeight:'600',letterSpacing:4,color:'#5D421D',textShadowColor:'#F9D88D',textShadowOffset:{width:0,height:1},textShadowRadius:1},word:{fontSize:8,fontWeight:'700',letterSpacing:4,color:'#765326'},
  edition:{position:'absolute',top:17,left:16},simulated:{fontSize:8,fontWeight:'600',letterSpacing:2,color:'#AFA68F'},editionNumber:{fontSize:12,fontWeight:'500',letterSpacing:1,color:'#E3D3AF',marginTop:5},demo:{position:'absolute',right:15,top:18,fontSize:7,fontWeight:'600',letterSpacing:1.25,color:'#ABAC9D'},
  helpRow:{position:'absolute',bottom:7,left:10,right:5,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},hint:{fontSize:10,color:'#B6C2CB'},smallButton:{minHeight:42,paddingHorizontal:10,justifyContent:'center'},smallButtonText:{fontSize:11,color:'#E4C58B',fontWeight:'700'},
  status:{position:'absolute',bottom:0,left:10,right:5,minHeight:46,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},statusText:{fontSize:11,color:'#B6C2CB',flex:1},
});
