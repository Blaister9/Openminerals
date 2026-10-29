import React from 'react';
import {Modal,Pressable,SafeAreaView,ScrollView,StyleSheet,Text,View} from 'react-native';
import type {StockReceipt} from './MineDashboard';

type Props={receipt:StockReceipt|null;onClose:()=>void};
const names={XAU:'Oro',XAG:'Plata',XPT:'Platino',XPD:'Paladio'};
const gram=(mg:number)=>`${(mg/1000).toLocaleString('es-CO',{minimumFractionDigits:3,maximumFractionDigits:3})} g`;
export function StockReceiptDetails({receipt,onClose}:Props){return <Modal visible={receipt!==null} onRequestClose={onClose} animationType="none" presentationStyle="pageSheet">
  <SafeAreaView style={styles.screen} accessibilityViewIsModal><View style={styles.header}><Text accessibilityRole="header" style={styles.headerTitle}>Ingreso registrado</Text><Pressable accessibilityRole="button" accessibilityLabel="Cerrar comprobante de ingreso" onPress={onClose} style={styles.close}><Text style={styles.link}>Cerrar</Text></Pressable></View>
    <ScrollView contentContainerStyle={styles.body}>{receipt&&<>
      <Text style={styles.demo}>REGISTRO DE DEMOSTRACIÓN</Text><Text style={styles.title}>Ingreso ficticio de {names[receipt.metal].toLowerCase()}</Text>
      {!!receipt.replayed&&<Text style={styles.note}>Se recuperó el mismo registro. No se añadió metal dos veces.</Text>}
      <Text style={styles.label}>Cantidad ingresada</Text><Text style={styles.value}>{gram(receipt.mg)}</Text>
      <Text style={styles.label}>Motivo</Text><Text style={styles.value}>{receipt.reason}</Text>
      <Text style={styles.label}>Disponible después</Text><Text style={styles.value}>{gram(receipt.inventoryAfterMg[receipt.metal])}</Text>
      <Text style={styles.label}>Total registrado después</Text><Text style={styles.value}>{gram(receipt.totalSupplyAfterMg[receipt.metal])}</Text>
      <Text style={styles.label}>Operador</Text><Text style={styles.value}>{receipt.actor.alias}</Text>
      <Text style={styles.label}>Fecha</Text><Text style={styles.value}>{new Date(receipt.at).toLocaleString('es-CO')}</Text>
      <Text style={styles.label}>Comprobante</Text><Text selectable style={styles.value}>{receipt.id}</Text>
      <Text style={styles.note}>Estos valores son los registrados en ese momento. No acreditan recepción física, ensayo, asignación de lotes ni custodia real.</Text>
    </>}</ScrollView>
  </SafeAreaView>
</Modal>}
const styles=StyleSheet.create({screen:{flex:1,backgroundColor:'#090F15'},header:{paddingHorizontal:20,paddingVertical:12,borderBottomWidth:1,borderColor:'#273541',flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},headerTitle:{fontSize:20,color:'#F6F5F1',fontWeight:'700',flexShrink:1},close:{padding:12,minHeight:48,justifyContent:'center'},link:{color:'#DCBC7F',fontWeight:'700'},body:{padding:24,paddingBottom:40},demo:{color:'#DCBC7F',fontSize:11,fontWeight:'800',lineHeight:18,letterSpacing:1},title:{fontSize:26,lineHeight:35,color:'#F6F5F1',fontWeight:'700',marginTop:22},label:{fontSize:12,color:'#98A5B0',marginTop:24},value:{fontSize:16,lineHeight:25,color:'#F6F5F1',marginTop:7},note:{fontSize:13,lineHeight:22,color:'#AAB6C0',marginTop:24}});
