import React,{useEffect,useState} from 'react';
import {ActivityIndicator,Modal,Pressable,ScrollView,StyleSheet,Switch,Text,TextInput,View} from 'react-native';
import {RecoveryAccess} from './RecoveryAccess';
import {ModalSurface} from './ModalSurface';
import type {RecoveryChallenge,RecoveryCompletion} from '../lib/account-client';

type Account={id:string;alias:string;role:'buyer'|'operator';mineId:string};
type Props={
  visible:boolean;initialMode:'login'|'register';account:Account|null;mineName?:string;recoveryAlias?:string;
  expired:boolean;busy:boolean;pending:boolean;canImportLegacy:boolean;legacyReadOnly:boolean;
  error:string;onClose:()=>void;onLogout:()=>void;
  onSubmit:(mode:'login'|'register',alias:string,password:string,importLegacy:boolean)=>void;
  onSettings?:()=>void;
  startRecovery?:(alias:string,key:string)=>Promise<RecoveryChallenge>;
  completeRecovery?:(password:string)=>Promise<RecoveryCompletion>;
  cancelRecovery?:()=>void;
  onRecoveryDone?:(alias:string)=>void;
};

export function AccountAccess({visible,initialMode,account,mineName,recoveryAlias,expired,busy,pending,canImportLegacy,legacyReadOnly,error,onClose,onLogout,onSubmit,onSettings,startRecovery,completeRecovery,cancelRecovery,onRecoveryDone}:Props){
  const [mode,setMode]=useState<'login'|'register'>(initialMode);
  const [alias,setAlias]=useState('');
  const [password,setPassword]=useState('');
  const [importLegacy,setImportLegacy]=useState(false);
  const [recoveryVisible,setRecoveryVisible]=useState(false);
  useEffect(()=>{
    setPassword('');
    if(visible){setMode(initialMode);setAlias(recoveryAlias||(expired?account?.alias||'':''));setImportLegacy(canImportLegacy);}
  },[visible,initialMode,expired,account?.id,canImportLegacy,recoveryAlias]);
  useEffect(()=>{setRecoveryVisible(false);cancelRecovery?.();},[visible,account?.id]);
  const validAlias=/^[a-z0-9_-]{3,40}$/.test(alias.trim());
  const validPassword=password.length>=10&&password.length<=128;
  const blocked=busy||!validAlias||!validPassword||(mode==='register'&&(pending||!!account));
  function close(){if(!busy){setPassword('');setRecoveryVisible(false);cancelRecovery?.();onClose();}}
  return <><Modal visible={visible} onRequestClose={close} animationType="none" presentationStyle="pageSheet">
    <ModalSurface style={styles.screen} keyboard onEscape={close}>
      <View style={styles.header}><Text accessibilityRole="header" style={styles.headerTitle}>Cuenta demo</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Cerrar acceso a cuenta" disabled={busy} onPress={close} style={styles.close}><Text style={styles.link}>Cerrar</Text></Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentInsetAdjustmentBehavior="never">
        <Text style={styles.demo}>CUENTAS FICTICIAS · SIN FONDOS REALES</Text>
        {account&&<View style={styles.card}>
          <Text style={styles.titleSmall}>{account.alias}</Text>
          <Text style={styles.copy}>{account.role==='operator'?'Operador de mina':'Comprador'} · {mineName||'Mina de demostración'}</Text>
          <Text style={styles.copy}>{expired?'Tu acceso venció. Entra de nuevo con la misma cuenta para continuar.':'Puedes abrir esta cuenta en otro dispositivo utilizando el mismo alias y su clave demo.'}</Text>
          {onSettings&&<Pressable accessibilityRole="button" disabled={busy||pending} onPress={()=>{setPassword('');onSettings();}} style={[styles.secondary,(busy||pending)&&styles.disabled]}><Text style={styles.secondaryText}>Perfil y recuperación</Text></Pressable>}
          <Pressable accessibilityRole="button" disabled={busy||pending} onPress={onLogout} style={[styles.secondary,(busy||pending)&&styles.disabled]}><Text style={styles.secondaryText}>Cerrar sesión</Text></Pressable>
        </View>}
        {pending&&<Text accessibilityRole="alert" style={styles.warning}>Hay una operación pendiente. Para evitar duplicaciones, resuélvela antes de crear o cambiar de cuenta. Si el acceso venció, puedes entrar de nuevo en esa misma cuenta.</Text>}
        <View style={styles.modeRow}>
          <Pressable accessibilityRole="button" disabled={busy} onPress={()=>{setMode('login');setPassword('');}} style={[styles.mode,mode==='login'&&styles.modeOn]}><Text style={styles.modeText}>Entrar</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={busy||pending||!!account} onPress={()=>{setMode('register');setPassword('');}} style={[styles.mode,mode==='register'&&styles.modeOn,(busy||pending||!!account)&&styles.disabled]}><Text style={styles.modeText}>Crear comprador</Text></Pressable>
        </View>
        {account&&<Text style={styles.note}>Cierra la cuenta actual antes de crear otra. Para acceder a otra cuenta existente puedes usar su alias y clave, cuando no haya una operación pendiente.</Text>}
        <Text accessibilityRole="header" style={styles.title}>{mode==='register'?'Tu cuenta de prueba':'Acceder a la demostración'}</Text>
        <Text style={styles.copy}>Usa un alias ficticio y una clave exclusiva para esta demo. No introduzcas correo, datos personales ni contraseñas que uses en otros servicios.</Text>
        <Text style={styles.label}>Alias</Text>
        <TextInput accessibilityLabel="Alias de cuenta demo" value={alias} onChangeText={value=>setAlias(value.toLowerCase())} editable={!busy} autoCapitalize="none" autoCorrect={false} autoComplete="off" maxLength={40} style={styles.input} placeholder="comprador_demo" placeholderTextColor="#667385"/>
        <Text style={styles.note}>De 3 a 40 letras minúsculas, números, guiones o guiones bajos.</Text>
        <Text style={styles.label}>Clave exclusiva de demostración</Text>
        <TextInput accessibilityLabel="Clave de cuenta demo" value={password} onChangeText={setPassword} editable={!busy} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="off" textContentType="none" maxLength={128} style={styles.input} placeholder="Al menos 10 caracteres" placeholderTextColor="#667385"/>
        {mode==='register'&&<>
          {canImportLegacy?<View style={styles.card}>
            <View style={styles.switchRow}><Text style={styles.titleSmall}>Conservar mi sesión anterior</Text><Switch accessibilityLabel="Conservar mi sesión anterior" value={importLegacy} onValueChange={setImportLegacy} disabled={busy}/></View>
            <Text style={styles.copy}>{importLegacy?'Se copiarán tus saldos, posiciones e historial a esta cuenta. La sesión anterior quedará en consulta; no se borra.':'La nueva cuenta comenzará con saldos ficticios iniciales. Tu sesión anterior permanecerá separada.'}</Text>
          </View>:<Text style={styles.note}>{legacyReadOnly?'La sesión anterior ya está vinculada a una cuenta. Para recuperar sus datos, entra con ese alias y su clave. Otra cuenta empieza con saldos ficticios iniciales.':'La cuenta nueva empieza con saldos ficticios iniciales. Cada comprador mantiene su propia billetera.'}</Text>}
          <Text style={styles.note}>Guarda el alias y la clave demo para volver a entrar. Después del registro, abre Cuenta → Perfil y recuperación y activa tu clave privada de recuperación. Se muestra una sola vez; guárdala fuera del chat. No se usa correo.</Text>
        </>}
        {mode==='login'&&<Text style={styles.note}>El rol de operador lo asigna la administración de la demostración. No se elige un rol desde este formulario.</Text>}
        {mode==='login'&&startRecovery&&completeRecovery&&cancelRecovery&&<Pressable accessibilityRole="button" disabled={busy||(pending&&!expired)} onPress={()=>{setPassword('');setRecoveryVisible(true);}} style={[styles.secondary,(busy||(pending&&!expired))&&styles.disabled]}><Text style={styles.secondaryText}>Recuperar comprador con clave privada</Text></Pressable>}
        {!!error&&<Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
        <Pressable accessibilityRole="button" disabled={blocked} onPress={()=>onSubmit(mode,alias.trim(),password,mode==='register'&&canImportLegacy&&importLegacy)} style={[styles.primary,blocked&&styles.disabled]}>
          {busy?<ActivityIndicator color="#15212B"/>:<Text style={styles.primaryText}>{mode==='register'?(canImportLegacy&&importLegacy?'Crear y vincular mi sesión':'Crear cuenta de comprador'):'Entrar en mi cuenta'}</Text>}
        </Pressable>
      </ScrollView>
    </ModalSurface>
  </Modal>
    {startRecovery&&completeRecovery&&cancelRecovery&&<RecoveryAccess visible={visible&&recoveryVisible} initialAlias={recoveryAlias||alias||account?.alias||''} currentAlias={account?.alias} pending={pending} expired={expired} startRecovery={startRecovery} completeRecovery={completeRecovery} cancelRecovery={cancelRecovery}
      onClose={recoveredAlias=>{setRecoveryVisible(false);setMode('login');setAlias(recoveredAlias);setPassword('');}}
      onDone={recoveredAlias=>{setRecoveryVisible(false);setMode('login');setAlias(recoveredAlias);setPassword('');onRecoveryDone?.(recoveredAlias);}}/>}
  </>;
}

const styles=StyleSheet.create({
  screen:{flex:1,backgroundColor:'#090F15'},header:{paddingHorizontal:20,paddingVertical:12,borderBottomWidth:1,borderColor:'#273541',flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12},headerTitle:{fontSize:20,color:'#F6F5F1',fontWeight:'700'},close:{padding:12,minHeight:48,justifyContent:'center'},link:{color:'#DCBC7F',fontWeight:'700'},
  body:{padding:22,paddingBottom:40},demo:{color:'#DCBC7F',fontSize:11,fontWeight:'800',lineHeight:19,letterSpacing:1},title:{fontSize:25,lineHeight:34,color:'#F6F5F1',fontWeight:'700',marginTop:24,marginBottom:12},titleSmall:{fontSize:15,lineHeight:23,color:'#F6F5F1',fontWeight:'700',flexShrink:1},copy:{fontSize:13,lineHeight:22,color:'#BAC4CE',marginTop:8},note:{fontSize:12,lineHeight:21,color:'#98A5B0',marginTop:8},label:{fontSize:13,color:'#D4DBE0',fontWeight:'600',marginTop:18},input:{color:'#FAF9F3',fontSize:17,paddingHorizontal:15,paddingVertical:14,backgroundColor:'#101C26',borderColor:'#3C4B56',borderWidth:1,borderRadius:10,marginTop:8},
  card:{padding:16,borderWidth:1,borderColor:'#273541',borderRadius:14,backgroundColor:'#141E28',marginTop:18},switchRow:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:16},modeRow:{flexDirection:'row',gap:10,marginTop:24},mode:{flex:1,padding:14,borderWidth:1,borderColor:'#435462',borderRadius:10,alignItems:'center'},modeOn:{backgroundColor:'#665233',borderColor:'#DCBC7F'},modeText:{color:'#F6E5C2',fontWeight:'700',fontSize:13},primary:{backgroundColor:'#DCBC7F',padding:16,borderRadius:10,minHeight:50,alignItems:'center',justifyContent:'center',marginTop:24},primaryText:{color:'#15212B',fontSize:14,fontWeight:'800',textAlign:'center'},secondary:{padding:14,borderColor:'#4E6576',borderWidth:1,borderRadius:10,minHeight:48,alignItems:'center',justifyContent:'center',marginTop:16},secondaryText:{color:'#EDF1F3',fontWeight:'700'},disabled:{opacity:.45},warning:{padding:14,backgroundColor:'#47392A',color:'#F8DFB5',fontSize:13,lineHeight:22,borderRadius:10,marginTop:18},error:{padding:14,backgroundColor:'#4B2E2A',color:'#FCE4D9',fontSize:13,lineHeight:22,borderRadius:10,marginTop:18},
});
