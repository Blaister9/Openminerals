import React from 'react';
import {StyleSheet,Text,View} from 'react-native';
type Position={code:string;name:string;color:string;mg:number;reservedMg:number;valueMinor:number};
export function PortfolioComposition({positions}:{positions:Position[]}){
  const owned=positions.filter(item=>item.mg>0),total=owned.reduce((sum,item)=>sum+item.valueMinor,0);
  return <View style={styles.card}>
    <Text style={styles.kicker}>COMPOSICIÓN DEL PORTAFOLIO</Text>
    <Text style={styles.title}>Tus metales, en perspectiva</Text>
    {!owned.length?<Text style={styles.note}>Todavía no tienes posiciones de metal. Tus compras aparecerán aquí con su cantidad y disponibilidad.</Text>:<>
      <View style={styles.track} accessible accessibilityLabel="Distribución por valoración simulada de los metales">
        {owned.map(item=><View key={item.code} style={{flex:item.valueMinor,backgroundColor:item.color,height:6}}/>)}
      </View>
      {owned.map(item=><View key={item.code} style={styles.row}>
        <View style={[styles.dot,{backgroundColor:item.color}]}/><View style={styles.description}><Text style={styles.name}>{item.name}</Text><Text style={styles.note}>{((item.mg-item.reservedMg)/1000).toLocaleString('es-CO',{minimumFractionDigits:3})} g disponibles{item.reservedMg>0?` · ${(item.reservedMg/1000).toLocaleString('es-CO',{minimumFractionDigits:3})} g comprometidos`:''}</Text></View>
        <Text style={styles.percent}>{(total?item.valueMinor/total*100:0).toLocaleString('es-CO',{maximumFractionDigits:1})}%</Text>
      </View>)}
      <Text style={styles.caption}>Proporción por valor de referencia ficticio. Los saldos de billetera se muestran por separado.</Text>
    </>}
  </View>;
}
export function MetalEmblem({symbol,color,small=false}:{symbol:string;color:string;small?:boolean}){
  return <View accessible={false} importantForAccessibility="no" style={[styles.emblem,small&&styles.small]}>
    <View style={[styles.bar,{backgroundColor:color}]}><View style={styles.edge}/><Text style={[styles.symbol,small&&styles.smallSymbol]}>{symbol}</Text><View style={styles.stamp}/></View>
  </View>;
}
const styles=StyleSheet.create({
  card:{borderWidth:1,borderColor:'#343A3A',backgroundColor:'#11191D',borderRadius:17,padding:19,marginVertical:14},kicker:{fontSize:9,lineHeight:16,letterSpacing:1.5,color:'#CDB78C',fontWeight:'700'},title:{fontSize:17,lineHeight:25,color:'#F2EEE5',fontWeight:'600',marginTop:7},note:{fontSize:12,lineHeight:20,color:'#A9B4B5',marginTop:4},track:{flexDirection:'row',gap:3,borderRadius:4,overflow:'hidden',marginTop:22,marginBottom:15},row:{flexDirection:'row',alignItems:'center',gap:11,paddingVertical:10},dot:{width:7,height:7,borderRadius:4},description:{flex:1},name:{fontSize:14,color:'#F2EEE5',fontWeight:'600'},percent:{fontSize:17,color:'#E2D0AA',fontVariant:['tabular-nums']},caption:{fontSize:11,lineHeight:18,color:'#8E9A9A',borderTopWidth:1,borderColor:'#303937',marginTop:12,paddingTop:12},
  emblem:{width:78,height:58,justifyContent:'center',alignItems:'center'},small:{width:48,height:47},bar:{width:'88%',height:'72%',borderRadius:6,transform:[{skewX:'-12deg'},{rotateZ:'-8deg'}],borderTopWidth:2,borderTopColor:'#FFF2CC',borderBottomWidth:5,borderBottomColor:'#62563D',alignItems:'center',justifyContent:'center',overflow:'hidden'},edge:{position:'absolute',left:4,right:4,top:3,bottom:4,borderWidth:1,borderColor:'rgba(40,33,20,0.3)',borderRadius:3},symbol:{fontSize:23,fontWeight:'600',color:'#302A22'},smallSymbol:{fontSize:17},stamp:{width:15,height:1,backgroundColor:'rgba(40,33,20,0.4)',marginTop:1},
});
