import React from 'react';
import {ActivityIndicator,Modal,Pressable,SafeAreaView,ScrollView,StyleSheet,Text,View} from 'react-native';
import {receiptDetails,receiptTitle,type Receipt} from '../lib/receipt-presentation';

type Props={
  visible:boolean;
  receipt:Receipt|null;
  loading:boolean;
  error:string;
  onClose:()=>void;
  onRetry:()=>void;
  onHistory:()=>void;
};

export function ReceiptDetails({visible,receipt,loading,error,onClose,onRetry,onHistory}:Props){
  return <Modal visible={visible} onRequestClose={onClose} animationType="none" presentationStyle="pageSheet">
    <SafeAreaView style={styles.screen} accessibilityViewIsModal>
      <View style={styles.header}>
        <Text accessibilityRole="header" style={styles.headerTitle}>Comprobante</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar comprobante" onPress={onClose} style={styles.close}>
          <Text style={styles.closeText}>Cerrar</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body}>
        <Text style={styles.demo}>SIMULACIÓN · SIN FONDOS NI METALES REALES</Text>
        {loading&&<View style={styles.loading}><ActivityIndicator color="#DCBC7F"/><Text style={styles.note}>Consultando comprobante…</Text></View>}
        {!!error&&<View accessibilityRole="alert" style={styles.error}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable accessibilityRole="button" onPress={onRetry} disabled={loading} style={styles.retry}>
            <Text style={styles.closeText}>Reintentar consulta</Text>
          </Pressable>
        </View>}
        {receipt&&<>
          <Text accessibilityRole="header" style={styles.title}>{receiptTitle(receipt)}</Text>
          <Text style={styles.status}>{receipt.status==='COMPLETED'?'Operación registrada':receipt.status} · demostración</Text>
          {!!receipt.replayed&&<Text style={styles.replayed}>Solicitud recuperada con el mismo comprobante. No se registró otra operación.</Text>}
          <Text style={styles.label}>Fecha</Text>
          <Text style={styles.value}>{new Date(receipt.at).toLocaleString('es-CO')}</Text>
          <Text style={styles.label}>Identificador del comprobante</Text>
          <Text selectable style={styles.identifier}>{receipt.id}</Text>
          <View style={styles.details}>
            {receiptDetails(receipt).map((row,index)=><View key={`${row.label}-${index}`} style={styles.row}>
              <Text style={styles.rowLabel}>{row.label}</Text>
              <Text selectable style={styles.rowValue}>{row.value}</Text>
            </View>)}
          </View>
          <Text style={styles.note}>Los saldos posteriores corresponden al momento de esta operación cuando fueron registrados. Pueden diferir de tus saldos actuales.</Text>
          <Text style={styles.note}>Este comprobante no acredita un pago, una transferencia blockchain ni la custodia de metal físico.</Text>
        </>}
      </ScrollView>
      <View style={styles.footer}>
        <Pressable accessibilityRole="button" onPress={onHistory} style={styles.primary}>
          <Text style={styles.primaryText}>Ver historial</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  </Modal>;
}

const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:'#090F15'},
  header:{paddingHorizontal:20,paddingVertical:12,borderBottomWidth:1,borderColor:'#273541',flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},
  headerTitle:{fontSize:20,color:'#F6F5F1',fontWeight:'700',flexShrink:1},
  close:{padding:12,minHeight:48,justifyContent:'center'},closeText:{fontSize:14,color:'#DCBC7F',fontWeight:'700'},
  body:{padding:22,paddingBottom:32},demo:{color:'#DCBC7F',fontSize:11,fontWeight:'800',lineHeight:18,letterSpacing:1},
  title:{color:'#F6F5F1',fontSize:26,fontWeight:'700',marginTop:22},status:{color:'#9FCAB6',fontSize:13,marginTop:10},
  label:{color:'#98A5B0',fontSize:12,marginTop:20},value:{color:'#F6F5F1',fontSize:14,marginTop:5,lineHeight:21},
  identifier:{color:'#F6F5F1',fontSize:13,marginTop:5,lineHeight:21},
  details:{marginTop:24,borderWidth:1,borderColor:'#273541',borderRadius:14,paddingHorizontal:16,backgroundColor:'#141E28'},
  row:{flexDirection:'row',gap:14,borderBottomWidth:1,borderColor:'#273541',paddingVertical:14,alignItems:'flex-start'},
  rowLabel:{color:'#AAB6C0',fontSize:13,lineHeight:21,flex:1},rowValue:{color:'#F6F5F1',fontSize:14,lineHeight:21,fontWeight:'600',flex:1,textAlign:'right'},
  note:{color:'#98A5B0',fontSize:12,lineHeight:20,marginTop:18},replayed:{color:'#DCBC7F',fontSize:13,lineHeight:20,marginTop:16},
  loading:{flexDirection:'row',alignItems:'center',gap:12,marginTop:15},
  error:{backgroundColor:'#4B2E2A',borderRadius:12,padding:15,marginTop:18},errorText:{color:'#FCE4D9',fontSize:13,lineHeight:21},retry:{paddingVertical:12,minHeight:48,justifyContent:'center'},
  footer:{padding:18,borderTopWidth:1,borderColor:'#273541'},primary:{backgroundColor:'#DCBC7F',borderRadius:10,minHeight:48,padding:15,alignItems:'center',justifyContent:'center'},primaryText:{color:'#15212B',fontSize:14,fontWeight:'800'},
});
