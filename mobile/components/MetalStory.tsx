import React, {useEffect,useState} from 'react';
import {AccessibilityInfo,Animated,Pressable,StyleSheet,Text,View} from 'react-native';

type Props={scrollY:Animated.Value;viewportHeight:number};
type Scene={number:string;title:string;body:string;label:string;kind:'origin'|'refining'|'custody'|'fraction'};
const scenes:Scene[]=[
  {number:'01',title:'Todo comienza en el origen',kind:'origin',label:'ORIGEN SIMULADO',
    body:'La historia de un metal empieza con el lote y su procedencia. En una operación real, esos datos deben respaldarse con documentos verificables.'},
  {number:'02',title:'Del mineral al lingote',kind:'refining',label:'ENSAYO ILUSTRATIVO',
    body:'La refinación transforma la materia prima. Peso, pureza y ensayo tendrían que comprobarse antes de ofrecer un metal real.'},
  {number:'03',title:'Una custodia que se debe acreditar',kind:'custody',label:'SIN CUSTODIA REAL',
    body:'Una bóveda es solo una imagen en esta demo. No hay un custodio conectado ni una existencia física asignada a tu cuenta.'},
  {number:'04',title:'Gramos en tu portafolio',kind:'fraction',label:'REGISTRO DEMO',
    body:'La compra simulada registra una cantidad de gramos. Puedes verla en Mis metales y seguir sus movimientos, sin tokens ni entregas reales.'},
];

// This component belongs directly to the parent ScrollView's content. Its y
// coordinate and each scene's y coordinate form the same space as scrollY.
export function MetalStory({scrollY,viewportHeight}:Props){
  const [origin,setOrigin]=useState(0);
  const [sceneOffsets,setSceneOffsets]=useState<Record<number,number>>({});
  const [systemReduced,setSystemReduced]=useState(true);
  const [manualReduced,setManualReduced]=useState(false);
  useEffect(()=>{
    let alive=true;
    void AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(alive)setSystemReduced(value);}).catch(()=>{});
    const subscription=AccessibilityInfo.addEventListener('reduceMotionChanged',setSystemReduced);
    return()=>{alive=false;subscription.remove();};
  },[]);
  const reduced=systemReduced||manualReduced;
  const visibleHeight=Math.max(240,viewportHeight);
  return <View style={styles.story} onLayout={event=>setOrigin(event.nativeEvent.layout.y)}>
    <Text style={styles.eyebrow}>DEL ORIGEN A TU PORTAFOLIO</Text>
    <Text style={styles.title}>La historia del metal</Text>
    <Text style={styles.intro}>Desliza hacia abajo para recorrer cada etapa. El movimiento del lingote sigue tu desplazamiento.</Text>
    <Pressable accessibilityRole="switch" accessibilityLabel="Reducir movimiento del recorrido"
      accessibilityState={{checked:reduced,disabled:systemReduced}} disabled={systemReduced}
      onPress={()=>setManualReduced(value=>!value)} style={styles.motionControl}>
      <View style={[styles.switchTrack,reduced&&styles.switchOn]}><View style={[styles.switchKnob,reduced&&styles.switchKnobOn]}/></View>
      <Text style={styles.motionText}>{systemReduced?'Movimiento reducido por tu dispositivo':reduced?'Movimiento reducido':'Reducir movimiento'}</Text>
    </Pressable>
    {scenes.map((scene,index)=>{
      const top=origin+(sceneOffsets[index]??(index*430+160));
      const range=[top-visibleHeight,top-visibleHeight*.30,top+200];
      const rotation=scrollY.interpolate({inputRange:range,outputRange:['-24deg','0deg','22deg'],extrapolate:'clamp'});
      const pitch=scrollY.interpolate({inputRange:range,outputRange:['16deg','-6deg','-14deg'],extrapolate:'clamp'});
      const rise=scrollY.interpolate({inputRange:range,outputRange:[35,0,-22],extrapolate:'clamp'});
      const scale=scrollY.interpolate({inputRange:range,outputRange:[.84,1,.96],extrapolate:'clamp'});
      const reveal=scrollY.interpolate({inputRange:range,outputRange:[.3,1,1],extrapolate:'clamp'});
      const light=scrollY.interpolate({inputRange:range,outputRange:[-120,0,120],extrapolate:'clamp'});
      const transforms=reduced?[]:[{perspective:850},{translateY:rise},{rotateY:rotation},{rotateX:pitch},{scale}];
      return <View key={scene.number} style={styles.scene} onLayout={event=>{
        const next=event.nativeEvent.layout.y;
        setSceneOffsets(previous=>previous[index]===next?previous:{...previous,[index]:next});
      }}>
        <View style={styles.sceneHeading}><Text style={styles.number}>{scene.number}</Text><View style={styles.rule}/><Text style={styles.down}>{index===scenes.length-1?'●':'↓'}</Text></View>
        <View style={styles.stage} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          <View style={styles.halo}/>
          {scene.kind==='custody'&&<View style={styles.vault}><View style={styles.vaultCorner}/><View style={[styles.vaultCorner,styles.vaultCornerRight]}/></View>}
          {scene.kind==='origin'&&<View style={styles.strata}><View style={styles.stratum}/><View style={[styles.stratum,styles.stratumLower]}/></View>}
          <Animated.View style={[styles.bar,scene.kind==='origin'&&styles.roughBar,{opacity:reduced?1:reveal,transform:transforms}]}>
            <View style={styles.barEdge}/>
            <Animated.View style={[styles.sheen,{transform:[{translateX:reduced?0:light}]}]}/>
            <Text style={styles.symbol}>Au</Text>
            <Text style={styles.barWord}>OPENMINERALS</Text>
            <Text style={styles.barSmall}>{scene.kind==='origin'?'MUESTRA CONCEPTUAL':'ORO · SIMULACIÓN'}</Text>
          </Animated.View>
          {scene.kind==='fraction'&&<Animated.View style={[styles.fractions,{opacity:reduced?1:reveal}]}>
            {['0,1 g','0,5 g','1,0 g'].map(label=><View key={label} style={styles.fraction}><Text style={styles.fractionText}>{label}</Text></View>)}
          </Animated.View>}
          <Text style={styles.stageLabel}>{scene.label}</Text>
        </View>
        <Text style={styles.sceneTitle}>{scene.title}</Text>
        <Text style={styles.body}>{scene.body}</Text>
      </View>;
    })}
    <Text style={styles.disclaimer}>Recorrido conceptual. Ninguna imagen acredita origen, pureza, custodia ni metales físicos reales.</Text>
  </View>;
}

const styles=StyleSheet.create({
  story:{marginTop:28,marginBottom:12},eyebrow:{fontSize:10,fontWeight:'800',letterSpacing:1.7,color:'#DCBC7F',marginBottom:10},
  title:{fontSize:27,lineHeight:34,fontWeight:'700',color:'#F7F6F2',marginBottom:9},intro:{fontSize:13,lineHeight:21,color:'#B6C2CB'},
  motionControl:{minHeight:48,flexDirection:'row',alignItems:'center',gap:10,marginVertical:12},motionText:{color:'#B6C2CB',fontSize:12,flex:1},
  switchTrack:{width:36,height:22,borderRadius:12,backgroundColor:'#2B3B48',padding:3},switchOn:{backgroundColor:'#715B38'},switchKnob:{width:16,height:16,borderRadius:8,backgroundColor:'#B6C2CB'},switchKnobOn:{backgroundColor:'#F0D49C',alignSelf:'flex-end'},
  scene:{paddingTop:22,paddingBottom:28,borderTopWidth:1,borderTopColor:'#293742'},sceneHeading:{flexDirection:'row',alignItems:'center',gap:14},
  number:{color:'#DCBC7F',fontSize:15,fontWeight:'800',letterSpacing:2},rule:{height:1,backgroundColor:'#34424C',flex:1},down:{color:'#8A9AA7',fontSize:17},
  stage:{height:230,alignItems:'center',justifyContent:'center',marginTop:10,overflow:'hidden'},halo:{position:'absolute',width:205,height:205,borderRadius:105,borderWidth:1,borderColor:'#514533',backgroundColor:'#1C2529'},
  bar:{width:190,height:112,borderRadius:13,borderWidth:2,borderColor:'#EED39C',backgroundColor:'#AD7B3D',alignItems:'center',justifyContent:'center',overflow:'hidden',elevation:7,shadowColor:'#D1AC68',shadowOpacity:.25,shadowRadius:15,shadowOffset:{width:0,height:8}},
  roughBar:{borderRadius:32,backgroundColor:'#82603B',borderColor:'#AF8955',transform:[{rotate:'-5deg'}]},barEdge:{position:'absolute',top:0,left:0,right:0,height:22,backgroundColor:'#DEB56E'},
  sheen:{position:'absolute',width:50,height:180,backgroundColor:'#F7DEAC',opacity:.15},symbol:{fontSize:34,fontWeight:'900',color:'#FFF0CB',marginTop:6},barWord:{fontSize:10,letterSpacing:1.7,fontWeight:'800',color:'#FFF0CB'},barSmall:{fontSize:7,letterSpacing:1.3,color:'#FFF0CB',marginTop:7},
  stageLabel:{position:'absolute',bottom:5,fontSize:9,letterSpacing:2,color:'#BBA47D'},vault:{position:'absolute',width:245,height:175,borderWidth:6,borderColor:'#55626B',borderRadius:24,backgroundColor:'#101A22'},
  vaultCorner:{position:'absolute',top:12,left:12,width:12,height:12,borderWidth:2,borderColor:'#92A2AB',borderRadius:6},vaultCornerRight:{left:undefined,right:12},
  strata:{position:'absolute',bottom:34,width:260,height:90},stratum:{position:'absolute',bottom:20,width:240,height:52,borderRadius:30,backgroundColor:'#3D352B',transform:[{rotate:'-9deg'}]},stratumLower:{bottom:0,left:15,width:220,backgroundColor:'#292F30',transform:[{rotate:'7deg'}]},
  fractions:{position:'absolute',bottom:27,flexDirection:'row',gap:9},fraction:{paddingHorizontal:14,paddingVertical:7,borderRadius:6,borderWidth:1,borderColor:'#D3B271',backgroundColor:'#3A3327'},fractionText:{color:'#F4DCAB',fontSize:11,fontWeight:'700'},
  sceneTitle:{fontSize:22,lineHeight:29,fontWeight:'700',color:'#F7F6F2',marginTop:15,marginBottom:9},body:{color:'#AFBDC7',fontSize:13,lineHeight:22},disclaimer:{color:'#92A0AC',fontSize:11,lineHeight:18,marginTop:8},
});
