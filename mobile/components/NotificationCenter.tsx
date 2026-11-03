import React,{useEffect,useRef,useState} from 'react';
import {AppState,Modal,Platform,Pressable,ScrollView,StyleSheet,Switch,Text,TextInput,View,Linking} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import {authStorage} from '../lib/auth-storage';
import type {createAccountClient} from '../lib/account-client';
import {createAndroidPushController,type NativePushPort} from '../lib/android-push';
import {decimalPrice,noticeFromPush,type NotificationCenterData,type NotificationPreferences,type PriceAlert} from '../lib/notifications';

type Props={api:string;accountId:string;client:ReturnType<typeof createAccountClient>;visible:boolean;disabled:boolean;onOpen:()=>void;onClose:()=>void};
const labels:Record<keyof NotificationPreferences,string>={enabled:'Recibir notificaciones',push:'Push Android',purchases:'Compras DEMO',sales:'Ventas DEMO',offers:'Ofertas aceptadas',deliveries:'Estados de entrega',priceAlerts:'Alertas de precio'};
export function NotificationCenter({api,accountId,client,visible,disabled,onOpen,onClose}:Props){
  const [data,setData]=useState<NotificationCenterData|null>(null),[busy,setBusy]=useState(false),[problem,setProblem]=useState(''),[pushState,setPushState]=useState('No activado');
  const [metal,setMetal]=useState<PriceAlert['metal']>('XAU'),[direction,setDirection]=useState<PriceAlert['direction']>('above'),[threshold,setThreshold]=useState('100'),[sample,setSample]=useState('101');
  const [alertId,setAlertId]=useState(()=>Crypto.randomUUID()),[sampleId,setSampleId]=useState(()=>Crypto.randomUUID());
  const generation=useRef(0),running=useRef(false),blocked=useRef(disabled);blocked.current=disabled;
  const controller=useRef<ReturnType<typeof createAndroidPushController>|null>(null),open=useRef(onOpen);open.current=onOpen;
  const pushConsent=useRef(false);pushConsent.current=!!data?.preferences.enabled&&!!data?.preferences.push;
  const current=()=>client.getAccount()?.id===accountId;
  async function load(before?:string){
    const version=generation.current,result=await client.getNotifications(before);
    if(version===generation.current&&current())setData(previous=>before&&previous?{...result,items:[...previous.items,...result.items.filter(item=>!previous.items.some(old=>old.id===item.id))]}:result);
    return result;
  }
  async function run(work:()=>Promise<unknown>,reload=true){
    if(disabled||running.current)return;running.current=true;setBusy(true);setProblem('');const version=generation.current;
    try{await work();if(reload&&version===generation.current&&current())await load();}
    catch(error){if(version===generation.current&&current())setProblem(error instanceof Error?error.message:'No se pudo actualizar el centro DEMO.');}
    finally{if(version===generation.current){running.current=false;setBusy(false);}}
  }
  useEffect(()=>{
    if(disabled||Platform.OS!=='android')return;
    let cancelled=false,refreshRunning=false;const cleanups:(()=>void)[]=[];
    const refresh=async()=>{
      if(cancelled||blocked.current||refreshRunning||!current()||['background','inactive'].includes(AppState.currentState))return;refreshRunning=true;
      try{const center=await client.getNotifications();if(cancelled)return;setData(center);const result=await controller.current?.sync({enabled:center.preferences.enabled&&center.preferences.push});if(!cancelled&&result)setPushState(result);}
      catch(error){if(!cancelled)setPushState(error instanceof Error?error.message:'Push pendiente.');}finally{refreshRunning=false;}
    };
    void (async()=>{
      try{
        const [Notifications,{default:Constants}]=await Promise.all([import('expo-notifications'),import('expo-constants')]);if(cancelled)return;
        const native:NativePushPort={channel:()=>Notifications.setNotificationChannelAsync('openminerals-demo',{name:'Actividad Openminerals DEMO',importance:Notifications.AndroidImportance.DEFAULT}),permission:()=>Notifications.getPermissionsAsync(),request:()=>Notifications.requestPermissionsAsync(),token:async projectId=>(await Notifications.getExpoPushTokenAsync({projectId})).data};
        const projectId=Constants.expoConfig?.extra?.notificationsProjectId as string|undefined;
        const sameAccount=()=>{if(cancelled||!current())throw new Error('La cuenta cambió. No se registró el dispositivo.');};
        const push=createAndroidPushController({api,accountId,projectId,storage:authStorage,uuid:Crypto.randomUUID,native,
          register:async body=>{sameAccount();return client.registerPushDevice(body);},release:async body=>{sameAccount();return client.releasePushInstallation(body);}});controller.current=push;cleanups.push(()=>push.cancel());
        Notifications.setNotificationHandler({handleNotification:async notification=>{
          const own=!!noticeFromPush(notification.request.content.data,accountId)&&current()&&!cancelled&&pushConsent.current;
          return {shouldPlaySound:own,shouldSetBadge:false,shouldShowBanner:own,shouldShowList:own};
        }});cleanups.push(()=>Notifications.setNotificationHandler(null));
        const handled=new Set<string>();
        const response=(value:Awaited<ReturnType<typeof Notifications.getLastNotificationResponseAsync>>)=>{
          const id=noticeFromPush(value?.notification.request.content.data,accountId);if(!id||handled.has(id)||cancelled||!current())return;
          handled.add(id);open.current();if(!blocked.current)void client.readNotifications({id}).then(()=>refresh()).catch(()=>{});
        };
        const received=Notifications.addNotificationReceivedListener(()=>{void refresh();}),tapped=Notifications.addNotificationResponseReceivedListener(response),rotated=Notifications.addPushTokenListener(()=>{void refresh();});
        cleanups.push(()=>received.remove(),()=>tapped.remove(),()=>rotated.remove());
        response(await Notifications.getLastNotificationResponseAsync());await refresh();
      }catch(error){if(!cancelled)setPushState(error instanceof Error?error.message:'Push requiere una compilación Android compatible.');}
    })();
    const active=AppState.addEventListener('change',state=>{if(state==='active')void refresh();});
    return()=>{cancelled=true;generation.current++;running.current=false;controller.current=null;active.remove();for(const cleanup of cleanups)cleanup();};
  },[api,accountId,disabled]);
  useEffect(()=>{if(visible&&!disabled)void run(async()=>{});},[visible,disabled]);
  const button=(label:string,work:()=>Promise<unknown>,reload=true)=><Pressable accessibilityRole="button" disabled={disabled||busy} style={styles.button} onPress={()=>void run(work,reload)}><Text style={styles.link}>{label}</Text></Pressable>;
  async function preference(key:keyof NotificationPreferences,value:boolean){
    if(key==='push'&&value){
      if(!controller.current)throw new Error('Push Android no está preparado. Configura la preview independiente.');
      await client.notificationPreferences({push:true});const result=await controller.current.sync({enabled:true,requestPermission:true});setPushState(result);
      if(['denied','settings-required'].includes(result))await client.notificationPreferences({push:false});
    }else{await client.notificationPreferences({[key]:value});if(key==='push'||key==='enabled')await controller.current?.sync({enabled:value&&(key==='enabled'?!!data?.preferences.push:!!data?.preferences.enabled)});}
  }
  if(!visible)return null;
  return <Modal visible animationType="none" onRequestClose={onClose}><SafeAreaView style={styles.screen}><View style={styles.row}><Text style={styles.title}>Notificaciones DEMO</Text><Pressable accessibilityRole="button" onPress={onClose}><Text style={styles.link}>Cerrar</Text></Pressable></View><ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
    <Text style={styles.note}>Actividad simulada. Los precios de prueba no son cotizaciones reales.</Text>
    {!!problem&&<Text accessibilityRole="alert" style={styles.error}>{problem}</Text>}{button('Actualizar centro',async()=>{})}
    {data&&<>
      <Text style={styles.heading}>Preferencias individuales</Text>
      {(Object.keys(labels) as (keyof NotificationPreferences)[]).map(key=><View key={key} style={styles.row}><Text style={styles.text}>{labels[key]}</Text><Switch accessibilityLabel={labels[key]} value={data.preferences[key]} disabled={disabled||busy||(key==='push'&&!data.preferences.enabled)} onValueChange={value=>void run(()=>preference(key,value))}/></View>)}
      <Text style={styles.note}>Push: {pushState}. {data.push.configured?'Servidor de envío configurado.':'Envío real pendiente de configurar en un entorno aislado.'}</Text>
      {data.preferences.enabled&&button('Activar push en este Android',()=>preference('push',true))}
      <Pressable accessibilityRole="button" style={styles.button} onPress={()=>void Linking.openSettings()}><Text style={styles.link}>Permisos en ajustes Android</Text></Pressable>
      {data.devices.map(device=><View key={device.id} style={styles.card}><Text style={styles.text}>Android DEMO · {device.active?'activo':'revocado'} · {device.id.slice(0,8)}</Text>{device.active&&button('Revocar este dispositivo',()=>client.revokePushDevice(device.id))}</View>)}
      <Text style={styles.heading}>Alertas de precio DEMO · USD/g</Text><Text style={styles.note}>Referencias reales sin habilitar. Prueba umbrales con muestras manuales DEMO.</Text>
      <View style={styles.row}>{(['XAU','XAG','XPT','XPD'] as const).map(value=><Pressable key={value} accessibilityRole="button" onPress={()=>{setMetal(value);setAlertId(Crypto.randomUUID());}}><Text style={[styles.link,metal===value&&styles.selected]}>{value}</Text></Pressable>)}</View>
      <View style={styles.row}>{(['above','below'] as const).map(value=><Pressable key={value} accessibilityRole="button" onPress={()=>setDirection(value)}><Text style={[styles.link,direction===value&&styles.selected]}>{value==='above'?'Al subir hasta':'Al bajar hasta'}</Text></Pressable>)}</View>
      <TextInput accessibilityLabel="Umbral DEMO USD por gramo" value={threshold} onChangeText={setThreshold} keyboardType="decimal-pad" style={styles.input}/>
      {button('Guardar alerta DEMO',async()=>{await client.savePriceAlert({id:alertId,metal,direction,threshold:decimalPrice(threshold),enabled:true,source:'demo'});setAlertId(Crypto.randomUUID());})}
      {data.alerts.map(alert=><View key={alert.id} style={styles.card}><Text style={styles.text}>{alert.metal} · {alert.direction==='above'?'≥':'≤'} {alert.thresholdMicros/1000000} USD/g · DEMO</Text><Switch accessibilityLabel={`Activar alerta ${alert.metal}`} value={alert.enabled} disabled={disabled||busy} onValueChange={enabled=>void run(()=>client.savePriceAlert({id:alert.id,metal:alert.metal,direction:alert.direction,threshold:String(alert.thresholdMicros/1000000),enabled,source:'demo',cooldownSeconds:alert.cooldownSeconds}))}/>{button('Eliminar alerta',()=>client.deletePriceAlert(alert.id))}</View>)}
      <TextInput accessibilityLabel="Muestra de precio ficticio USD por gramo" value={sample} editable={!busy&&!disabled} onChangeText={value=>{setSample(value);setSampleId(Crypto.randomUUID());}} keyboardType="decimal-pad" style={styles.input}/>
      {button('Probar con precio DEMO',async()=>{await client.demoPriceSample({sampleId,metal,price:decimalPrice(sample),source:'demo'});setSampleId(Crypto.randomUUID());})}
      <Text style={styles.heading}>Historial · {data.unreadCount} sin leer</Text>{button('Marcar todo como leído',()=>client.readNotifications({all:true}))}
      {data.items.length===0&&<Text style={styles.note}>Todavía no hay notificaciones para esta cuenta.</Text>}
      {data.items.map(item=><View key={item.id} style={styles.card}><Text style={[styles.text,!item.readAt&&styles.selected]}>{item.title} · {item.readAt?'leída':'sin leer'}</Text><Text style={styles.text}>{item.body}</Text><Text style={styles.note}>{new Date(item.at).toLocaleString()} · DEMO</Text>{item.price&&<Text style={styles.note}>{item.price.micros/1000000} USD/g · {item.price.provider} · ficticio</Text>}{!item.readAt&&button('Marcar como leída',()=>client.readNotifications({id:item.id}))}</View>)}
      {data.nextCursor&&button('Cargar notificaciones anteriores',()=>load(data.nextCursor!),false)}
    </>}
  </ScrollView></SafeAreaView></Modal>;
}
const styles=StyleSheet.create({screen:{flex:1,backgroundColor:'#090F15'},body:{padding:18,gap:12,paddingBottom:40},row:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',padding:12,gap:8},title:{fontSize:20,color:'#F1E7D1',fontWeight:'700'},heading:{fontSize:18,color:'#F1E7D1',fontWeight:'700',marginTop:16},text:{color:'#DEE4E8',flexShrink:1},note:{fontSize:12,color:'#9BACB5',lineHeight:18},link:{color:'#D8B676',fontWeight:'600'},selected:{color:'#F7E5AE',fontWeight:'800'},button:{paddingVertical:12},input:{backgroundColor:'#15212C',color:'#FFF',borderColor:'#40515D',borderWidth:1,padding:12,borderRadius:8},card:{backgroundColor:'#12202B',padding:14,borderRadius:10,gap:6},error:{color:'#F4A59A'}});
