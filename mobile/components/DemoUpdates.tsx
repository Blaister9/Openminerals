import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Platform,Pressable,StyleSheet,Text,View} from 'react-native';
import * as Updates from 'expo-updates';

// Native startup downloads compatible updates in the background. Applying them
// on the next cold launch leaves pending-operation persistence in charge of
// recovery; fetching here never reloads a running financial demonstration.
export function DemoUpdates({disabled=false}:{disabled?:boolean}){
  const enabled=Platform.OS==='android'&&Updates.isEnabled;
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const mounted=useRef(true),running=useRef(false),blocked=useRef(disabled);blocked.current=disabled;
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  async function check(){
    if(!enabled||blocked.current||running.current)return;
    running.current=true;setBusy(true);setNotice('');
    try{
      const result=await Updates.checkForUpdateAsync();
      if(!result.isAvailable&&!result.isRollBackToEmbedded){
        if(mounted.current)setNotice('Ya tienes la última actualización compatible.');
        return;
      }
      const fetched=await Updates.fetchUpdateAsync();
      if(mounted.current)setNotice(fetched.isNew||fetched.isRollBackToEmbedded
        ?'Actualización descargada. Cierra y vuelve a abrir la app para aplicarla; tus datos se conservan.'
        :'Ya tienes la última actualización compatible.');
    }catch{
      if(mounted.current)setNotice('No se pudo comprobar la actualización. Puedes seguir usando esta versión y reintentar con conexión.');
    }finally{
      running.current=false;if(mounted.current)setBusy(false);
    }
  }
  return <View style={styles.card}>
    <Text accessibilityRole="header" style={styles.title}>Actualizaciones de la demo</Text>
    <Text style={styles.copy}>{enabled?`Versión Android ${Updates.runtimeVersion??'instalada'}`:'Disponible en el APK Android instalado'}</Text>
    <Text testID="demo-update-source" style={styles.note}>{enabled
      ?Updates.isEmbeddedLaunch?'Versión incluida en el APK':`Actualización aplicada · ${Updates.updateId?.slice(0,8)??'remota'}`
      :'La vista de desarrollo no recibe actualizaciones instalables.'}</Text>
    <Text style={styles.copy}>Los cambios compatibles se descargan al abrir la app y se aplican al volver a abrirla. Los cambios nativos requieren un APK nuevo.</Text>
    {enabled&&<Pressable accessibilityRole="button" disabled={disabled||busy} onPress={()=>void check()} style={[styles.button,(disabled||busy)&&styles.disabled]}>
      {busy&&<ActivityIndicator color="#D8B66A" size="small"/>}<Text style={styles.buttonText}>{busy?'Comprobando actualización…':'Buscar actualización'}</Text>
    </Pressable>}
    {!!notice&&<Text accessibilityLiveRegion="polite" style={styles.note}>{notice}</Text>}
  </View>;
}
const styles=StyleSheet.create({
  card:{padding:18,borderRadius:18,borderWidth:1,borderColor:'#243440',backgroundColor:'#101B24',gap:10,marginVertical:14},
  title:{color:'#F5F0E6',fontSize:18,fontWeight:'700'},copy:{color:'#C1CED6',fontSize:14,lineHeight:21},
  note:{color:'#D8B66A',fontSize:13,lineHeight:20},button:{minHeight:48,borderWidth:1,borderColor:'#56634F',borderRadius:12,padding:12,alignItems:'center',justifyContent:'center',flexDirection:'row',gap:10},
  buttonText:{color:'#E6CD94',fontSize:14,fontWeight:'700'},disabled:{opacity:0.45}
});
