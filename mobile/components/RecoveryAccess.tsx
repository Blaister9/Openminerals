import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Modal,Pressable,SafeAreaView,ScrollView,StyleSheet,Switch,Text,TextInput,View} from 'react-native';
import type {RecoveryChallenge,RecoveryCompletion} from '../lib/account-client';

type Props={visible:boolean;initialAlias?:string;currentAlias?:string;pending:boolean;expired:boolean;startRecovery:(alias:string,key:string)=>Promise<RecoveryChallenge>;completeRecovery:(password:string)=>Promise<RecoveryCompletion>;cancelRecovery:()=>void;onDone:(alias:string)=>void;onClose:(alias:string)=>void};
const message=(cause:unknown)=>cause instanceof Error?cause.message:'No se pudo recuperar esta cuenta demo.';
export function RecoveryAccess({visible,initialAlias='',currentAlias,pending,expired,startRecovery,completeRecovery,cancelRecovery,onDone,onClose}:Props){
  const [alias,setAlias]=useState(initialAlias),[proof,setProof]=useState(''),[password,setPassword]=useState(''),[confirmation,setConfirmation]=useState('');
  const [stage,setStage]=useState<'proof'|'password'|'done'>('proof'),[expiresAt,setExpiresAt]=useState(''),[newKey,setNewKey]=useState<string|null>(null),[understood,setUnderstood]=useState(false),[saved,setSaved]=useState(false),[busy,setBusy]=useState(false),[problem,setProblem]=useState('');
  const generation=useRef(0),running=useRef(false),callbacks=useRef({cancelRecovery});callbacks.current={cancelRecovery};
  const blockedByPending=pending&&(!expired||!!currentAlias&&alias.trim().toLowerCase()!==currentAlias.toLowerCase());
  useEffect(()=>{
    generation.current++;running.current=false;callbacks.current.cancelRecovery();setAlias(pending&&currentAlias?currentAlias:initialAlias);setProof('');setPassword('');setConfirmation('');setNewKey(null);setUnderstood(false);setSaved(false);setStage('proof');setExpiresAt('');setBusy(false);setProblem('');
    return()=>{generation.current++;running.current=false;callbacks.current.cancelRecovery();};
  },[visible,initialAlias,currentAlias]);
  function close(){if(busy)return;generation.current++;cancelRecovery();setProof('');setPassword('');setConfirmation('');setNewKey(null);setUnderstood(false);setSaved(false);onClose(alias.trim().toLowerCase());}
  async function start(){
    if(running.current||busy||blockedByPending)return;const request=++generation.current,secret=proof.trim();running.current=true;setBusy(true);setProof('');setProblem('');
    try{const result=await startRecovery(alias.trim().toLowerCase(),secret);if(request!==generation.current)return;setAlias(result.alias);setExpiresAt(result.expiresAt);setStage('password');}
    catch(cause){if(request===generation.current)setProblem(message(cause));}
    finally{if(request===generation.current){running.current=false;setBusy(false);}}
  }
  async function complete(){
    if(running.current||busy||blockedByPending||!understood||password!==confirmation||password.length<10)return;
    const request=++generation.current,secret=password;running.current=true;setBusy(true);setPassword('');setConfirmation('');setProblem('');
    try{const result=await completeRecovery(secret);if(request!==generation.current)return;setAlias(result.alias);setNewKey(result.recoveryKey);setStage('done');setExpiresAt('');setUnderstood(false);}
    catch(cause){if(request===generation.current){setProblem(`${message(cause)} Si el cambio llegó al servidor, podrás entrar con la nueva clave y generar otra clave de recuperación desde Cuenta.`);setStage('proof');setExpiresAt('');cancelRecovery();}}
    finally{if(request===generation.current){running.current=false;setBusy(false);}}
  }
  function finish(){if(!saved||busy)return;const recoveredAlias=alias;generation.current++;cancelRecovery();setNewKey(null);setProof('');setPassword('');setConfirmation('');onDone(recoveredAlias);}
  return <Modal visible={visible} onRequestClose={close} animationType="none" presentationStyle="pageSheet"><SafeAreaView style={styles.screen} accessibilityViewIsModal>
    <View style={styles.header}><Text accessibilityRole="header" style={styles.headerTitle}>Recuperar cuenta demo</Text><Pressable accessibilityRole="button" accessibilityLabel="Cerrar recuperación demo" disabled={busy} onPress={close} style={styles.close}><Text style={styles.link}>Cerrar</Text></Pressable></View>
    <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
      <Text style={styles.demo}>RECUPERACIÓN DEMO · SIN CORREO NI IDENTIDAD REAL</Text>
      <Text style={styles.copy}>Necesitas el alias ficticio y la clave de recuperación configurada previamente en Cuenta. Guárdala fuera del chat; la app no conserva una copia.</Text>
      {pending&&<Text style={styles.warning}>Tu operación pendiente conserva la misma cuenta y su clave de solicitud. Con el acceso vencido puedes recuperar esa misma cuenta y después volver a entrar para resolverla.</Text>}
      {blockedByPending&&<Text accessibilityRole="alert" style={styles.error}>Resuelve la operación pendiente antes de recuperar otra cuenta. Si tu acceso venció, usa el mismo alias guardado.</Text>}
      {!!problem&&<Text accessibilityRole="alert" style={styles.error}>{problem}</Text>}
      {busy&&<View style={styles.loading}><ActivityIndicator color="#DCBC7F"/><Text style={styles.note}>Consultando recuperación demo…</Text></View>}
      {stage==='proof'&&<>
        <Text style={styles.label}>Alias de comprador demo</Text><TextInput accessibilityLabel="Alias para recuperar cuenta demo" value={alias} onChangeText={value=>setAlias(value.toLowerCase())} editable={!busy&&!pending} autoCapitalize="none" autoCorrect={false} autoComplete="off" maxLength={40} style={styles.input}/>
        <Text style={styles.label}>Clave de recuperación privada</Text><TextInput accessibilityLabel="Clave privada de recuperación demo" value={proof} onChangeText={setProof} editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="off" textContentType="none" maxLength={100} style={styles.input}/>
        <Text style={styles.note}>Este acceso temporal vence a los diez minutos y sirve una sola vez. El operador compartido se administra por separado.</Text>
        <Pressable accessibilityRole="button" disabled={busy||blockedByPending||!/^[a-z0-9_-]{3,40}$/.test(alias.trim())||!/^[A-Za-z0-9_-]{43}$/.test(proof.trim())} onPress={()=>void start()} style={[styles.primary,(busy||blockedByPending||!/^[a-z0-9_-]{3,40}$/.test(alias.trim())||!/^[A-Za-z0-9_-]{43}$/.test(proof.trim()))&&styles.disabled]}><Text style={styles.primaryText}>Validar recuperación demo</Text></Pressable>
      </>}
      {stage==='password'&&<>
        <Text style={styles.title}>Nueva clave para {alias}</Text><Text style={styles.note}>El acceso temporal vence el {new Date(expiresAt).toLocaleString('es-CO')}. No se guarda en el dispositivo.</Text>
        <Text style={styles.label}>Nueva clave exclusiva de esta demo</Text><TextInput accessibilityLabel="Nueva clave de cuenta demo" value={password} onChangeText={setPassword} editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="off" textContentType="none" maxLength={128} style={styles.input}/>
        <Text style={styles.label}>Repetir nueva clave</Text><TextInput accessibilityLabel="Repetir nueva clave demo" value={confirmation} onChangeText={setConfirmation} editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="off" textContentType="none" maxLength={128} style={styles.input}/>
        <Text style={styles.note}>De 10 a 128 caracteres; no reutilices contraseñas personales.</Text>
        <Text style={styles.warning}>Confirmar cambia la clave, cierra todos los accesos de esta cuenta y reemplaza su clave de recuperación. Los saldos, las posiciones, el historial y la operación pendiente se conservan.</Text>
        <View style={styles.confirm}><Text style={styles.confirmText}>Entiendo la revocación de accesos y guardaré la nueva clave de recuperación.</Text><Switch accessibilityLabel="Confirmar cambio de clave y revocación de accesos" value={understood} onValueChange={setUnderstood} disabled={busy}/></View>
        <Pressable accessibilityRole="button" disabled={busy||blockedByPending||!understood||password.length<10||password!==confirmation} onPress={()=>void complete()} style={[styles.primary,(busy||blockedByPending||!understood||password.length<10||password!==confirmation)&&styles.disabled]}><Text style={styles.primaryText}>Cambiar clave y revocar accesos</Text></Pressable>
      </>}
      {stage==='done'&&newKey&&<>
        <Text style={styles.title}>Cuenta recuperada</Text><Text style={styles.copy}>Los accesos anteriores fueron revocados. Ahora entra con el mismo alias y la nueva clave de la cuenta.</Text>
        <View style={styles.secretBox}><Text style={styles.warning}>Nueva clave de recuperación: se muestra una sola vez. Guárdala en un lugar privado fuera del chat antes de continuar.</Text><Text selectable style={styles.secret}>{newKey}</Text></View>
        <View style={styles.confirm}><Text style={styles.confirmText}>Ya guardé la nueva clave de recuperación por un medio privado.</Text><Switch accessibilityLabel="Confirmar guardado privado de la nueva clave de recuperación" value={saved} onValueChange={setSaved}/></View>
        <Pressable accessibilityRole="button" disabled={!saved} onPress={finish} style={[styles.primary,!saved&&styles.disabled]}><Text style={styles.primaryText}>Ocultar clave y volver a entrar</Text></Pressable>
      </>}
    </ScrollView>
  </SafeAreaView></Modal>;
}
const styles=StyleSheet.create({screen:{flex:1,backgroundColor:'#090F15'},header:{paddingHorizontal:20,paddingVertical:12,borderBottomWidth:1,borderColor:'#273541',flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},headerTitle:{fontSize:19,color:'#F6F5F1',fontWeight:'700',flexShrink:1},close:{padding:12,minHeight:48,justifyContent:'center'},link:{color:'#DCBC7F',fontWeight:'700'},body:{padding:22,paddingBottom:40},demo:{color:'#DCBC7F',fontSize:10,fontWeight:'800',lineHeight:19,letterSpacing:1},title:{fontSize:24,lineHeight:34,color:'#F6F5F1',fontWeight:'700',marginTop:24,marginBottom:12},copy:{fontSize:13,lineHeight:22,color:'#BAC4CE',marginTop:10},note:{fontSize:12,lineHeight:21,color:'#98A5B0',marginTop:8},label:{fontSize:13,color:'#D4DBE0',fontWeight:'600',marginTop:18},input:{color:'#FAF9F3',fontSize:17,paddingHorizontal:15,paddingVertical:14,backgroundColor:'#101C26',borderColor:'#3C4B56',borderWidth:1,borderRadius:10,marginTop:8},primary:{backgroundColor:'#DCBC7F',padding:16,borderRadius:10,minHeight:50,alignItems:'center',justifyContent:'center',marginTop:24},primaryText:{color:'#15212B',fontSize:14,fontWeight:'800',textAlign:'center'},disabled:{opacity:.45},warning:{padding:14,backgroundColor:'#47392A',color:'#F8DFB5',fontSize:12,lineHeight:22,borderRadius:10,marginTop:18},error:{padding:14,backgroundColor:'#4B2E2A',color:'#FCE4D9',fontSize:13,lineHeight:22,borderRadius:10,marginTop:18},loading:{flexDirection:'row',gap:12,alignItems:'center',marginVertical:12},confirm:{flexDirection:'row',alignItems:'center',gap:14,marginTop:18},confirmText:{color:'#BAC4CE',fontSize:12,lineHeight:21,flex:1},secretBox:{padding:14,borderRadius:10,borderWidth:1,borderColor:'#665233',backgroundColor:'#241F18',marginTop:18},secret:{color:'#F8E8C9',fontSize:15,lineHeight:25,marginTop:18,fontWeight:'700'}});
