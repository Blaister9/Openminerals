import React,{useEffect,useRef,useState} from 'react';
import {AccessibilityInfo,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import type {CustodyMetal} from '../lib/custody';
import {custodyGrams} from '../lib/custody';
import {MetalEmblem} from './PortfolioComposition';
type Position={code:CustodyMetal;name:string;symbol:string;color:string;mg:number;reservedMg:number;valueMinor:number};
export function PositionRail({positions,selected,onSelect}:{positions:Position[];selected:CustodyMetal;onSelect:(value:CustodyMetal)=>void}){
  const ref=useRef<ScrollView|null>(null),[width,setWidth]=useState(280),[reduced,setReduced]=useState(true);
  const card=Math.max(230,width-26),stride=card+12,index=positions.findIndex(item=>item.code===selected);
  useEffect(()=>{let mounted=true;AccessibilityInfo.isReduceMotionEnabled().then(value=>{if(mounted)setReduced(value);}).catch(()=>{});const listener=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduced);return()=>{mounted=false;listener.remove();};},[]);
  useEffect(()=>{ref.current?.scrollTo({x:Math.max(0,index)*stride,animated:!reduced});},[index,stride,reduced]);
  return <View onLayout={event=>setWidth(event.nativeEvent.layout.width)}>
    <View style={styles.selectors}>{positions.map(item=><Pressable key={item.code} testID={'portfolio-metal-'+item.code} accessibilityRole="button" accessibilityLabel={'Gestionar '+item.name} accessibilityState={{selected:item.code===selected}} onPress={()=>onSelect(item.code)} style={[styles.selector,item.code===selected&&styles.selected]}><Text style={styles.name}>{item.name}</Text></Pressable>)}</View>
    <ScrollView horizontal ref={ref} directionalLockEnabled nestedScrollEnabled showsHorizontalScrollIndicator={false} decelerationRate="fast" snapToInterval={stride} disableIntervalMomentum contentContainerStyle={{gap:12,paddingRight:26,paddingBottom:12}} onMomentumScrollEnd={event=>{const next=positions[Math.round(event.nativeEvent.contentOffset.x/stride)];if(next)onSelect(next.code);}}>
      {positions.map(item=><View key={item.code} style={[styles.card,{width:card}]}><View style={styles.heading}><MetalEmblem symbol={item.symbol} color={item.color} small/><Text style={styles.title}>{item.name}</Text></View><Text style={styles.quantity}>{custodyGrams(item.mg)}</Text><Text style={styles.copy}>Disponible {custodyGrams(item.mg-item.reservedMg)} · reservado {custodyGrams(item.reservedMg)}</Text><Text style={styles.value}>USDT {(item.valueMinor/100).toLocaleString('es-CO',{minimumFractionDigits:2,maximumFractionDigits:2})} · referencia DEMO</Text></View>)}
    </ScrollView><Text style={styles.hint}>Desliza las posiciones ↔ o selecciona un metal arriba.</Text>
  </View>;
}
const styles=StyleSheet.create({selectors:{flexDirection:'row',gap:6,marginVertical:14},selector:{flex:1,minHeight:44,justifyContent:'center',alignItems:'center',borderWidth:1,borderColor:'#3C4B43',borderRadius:8},selected:{borderColor:'#D4BA82',backgroundColor:'#3A3526'},name:{color:'#D7CBB3',fontSize:11},card:{padding:18,borderWidth:1,borderColor:'#3A4940',borderRadius:15,backgroundColor:'#111A17'},heading:{flexDirection:'row',alignItems:'center',gap:12},title:{color:'#E9E1D1',fontSize:21,fontFamily:'serif'},quantity:{color:'#F0E7D6',fontSize:29,fontVariant:['tabular-nums'],marginTop:18},copy:{color:'#ACBCB2',fontSize:12,lineHeight:19,marginTop:8},value:{color:'#C7B88E',fontSize:12,lineHeight:19,marginTop:12},hint:{color:'#80998C',fontSize:10,lineHeight:17}});
