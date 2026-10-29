import React from 'react';
import {Modal,Pressable,ScrollView,StyleSheet,Text,View} from 'react-native';
import {ModalSurface} from './ModalSurface';

type Props={visible:boolean;title:string;detail:string;onCancel:()=>void;onConfirm:()=>void};

export function OperationConfirmation({visible,title,detail,onCancel,onConfirm}:Props){
  return <Modal visible={visible} onRequestClose={onCancel} animationType="none" presentationStyle="pageSheet">
    <ModalSurface style={styles.screen} onEscape={onCancel}>
      <ScrollView contentContainerStyle={styles.body} contentInsetAdjustmentBehavior="never">
        <Text style={styles.demo}>CONFIRMACIÓN · DEMOSTRACIÓN</Text>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text>
        <Text style={styles.detail}>{detail}</Text>
        <Text style={styles.note}>Esta operación es 100 % simulada. El comprobante mostrará el resultado registrado por el servidor.</Text>
      </ScrollView>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={onCancel} style={styles.secondary}><Text style={styles.secondaryText}>Cancelar</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={onConfirm} style={styles.primary}><Text style={styles.primaryText}>Confirmar demo</Text></Pressable>
      </View>
    </ModalSurface>
  </Modal>;
}

const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:'#090F15'},body:{padding:24,paddingTop:36},
  demo:{fontSize:11,lineHeight:19,color:'#DCBC7F',fontWeight:'800',letterSpacing:1},
  title:{fontSize:26,lineHeight:35,color:'#F6F5F1',fontWeight:'700',marginTop:24},
  detail:{fontSize:16,lineHeight:28,color:'#F6F5F1',marginTop:24},note:{fontSize:13,lineHeight:22,color:'#AAB6C0',marginTop:30},
  actions:{flexDirection:'row',flexWrap:'wrap',gap:12,padding:20,borderTopWidth:1,borderColor:'#273541'},
  secondary:{flex:1,minWidth:100,minHeight:50,padding:14,borderWidth:1,borderColor:'#4E6576',borderRadius:10,alignItems:'center',justifyContent:'center'},secondaryText:{color:'#EDF1F3',fontSize:14,fontWeight:'700'},
  primary:{flex:1,minWidth:150,minHeight:50,padding:14,backgroundColor:'#DCBC7F',borderRadius:10,alignItems:'center',justifyContent:'center'},primaryText:{color:'#15212B',fontSize:14,fontWeight:'800'},
});
