import React,{useEffect,useRef,useState} from 'react';
import {ActivityIndicator,Pressable,StyleSheet,Switch,Text,TextInput,View} from 'react-native';
import {RequestError} from '../lib/demo-client';
import {validateDemoProfile,type AccountProfileResult,type DemoProfile,type PublicAccount,type RecoverySetupResult} from '../lib/account-client';

type Props={identityKey:string;account:PublicAccount;disabled?:boolean;getProfile:()=>Promise<AccountProfileResult>;saveProfile:(profile:DemoProfile)=>Promise<AccountProfileResult>;setupRecovery:(password:string)=>Promise<RecoverySetupResult>;onAuthExpired?:()=>void};
const jurisdictionNames={DEMO_LOCAL:'Jurisdicción DEMO A',DEMO_REGIONAL:'Jurisdicción DEMO B',DEMO_INTERNATIONAL:'Jurisdicción DEMO C'};
const message=(cause:unknown)=>cause instanceof Error?cause.message:'No se pudo actualizar la cuenta de demostración.';
function Button({label,onPress,disabled=false,primary=false}:{label:string;onPress:()=>void;disabled?:boolean;primary?:boolean}){return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[primary?styles.primary:styles.secondary,disabled&&styles.disabled]}><Text style={primary?styles.primaryText:styles.secondaryText}>{label}</Text></Pressable>}

// Render inside the parent's account-settings ScrollView. Secrets belong only
// to this mounted component and are discarded when it closes or changes owner.
export function AccountSettings({identityKey,account,disabled=false,getProfile,saveProfile,setupRecovery,onAuthExpired}:Props){
  const scope=identityKey,currentScope=useRef(scope);currentScope.current=scope;
  const callbacks=useRef({getProfile,saveProfile,setupRecovery,onAuthExpired});callbacks.current={getProfile,saveProfile,setupRecovery,onAuthExpired};
  const generation=useRef(0),running=useRef(false),initialized=useRef('');
  const [profile,setProfile]=useState<DemoProfile|null>(null),[recoveryEnabled,setRecoveryEnabled]=useState(false),[busy,setBusy]=useState(false),[problem,setProblem]=useState(''),[notice,setNotice]=useState('');
  const [password,setPassword]=useState(''),[understood,setUnderstood]=useState(false),[recoveryKey,setRecoveryKey]=useState<string|null>(null);
  const blocked=disabled||busy;
  function report(cause:unknown){setProblem(message(cause));if(cause instanceof RequestError&&cause.status===401)callbacks.current.onAuthExpired?.();}
  async function load(){
    if(disabled||running.current)return;const request=++generation.current,requestedScope=scope;running.current=true;setBusy(true);setProblem('');
    try{const result=await callbacks.current.getProfile();if(currentScope.current!==requestedScope||request!==generation.current)return;setProfile(result.profile);setRecoveryEnabled(result.recovery.enabled);}
    catch(cause){if(currentScope.current===requestedScope&&request===generation.current)report(cause);}
    finally{if(currentScope.current===requestedScope&&request===generation.current){running.current=false;setBusy(false);}}
  }
  useEffect(()=>{initialized.current='';setProfile(null);setPassword('');setRecoveryKey(null);setUnderstood(false);setNotice('');setProblem('');return()=>{generation.current++;running.current=false;};},[scope]);
  useEffect(()=>{if(!disabled&&initialized.current!==scope){initialized.current=scope;void load();}},[scope,disabled]);
  async function save(){
    if(blocked||running.current||!profile)return;const request=++generation.current,requestedScope=scope;running.current=true;setBusy(true);setProblem('');setNotice('');
    try{const result=await callbacks.current.saveProfile(validateDemoProfile(profile));if(currentScope.current!==requestedScope||request!==generation.current)return;setProfile(result.profile);setNotice('Perfil ficticio guardado. El alias, el rol, la mina y los saldos conservan sus valores.');}
    catch(cause){if(currentScope.current===requestedScope&&request===generation.current)report(cause);}
    finally{if(currentScope.current===requestedScope&&request===generation.current){running.current=false;setBusy(false);}}
  }
  async function generate(){
    if(blocked||running.current||!understood||password.length<10||password.length>128||account.role!=='buyer')return;
    const request=++generation.current,requestedScope=scope,proof=password;running.current=true;setBusy(true);setPassword('');setProblem('');setNotice('');setRecoveryKey(null);
    try{const result=await callbacks.current.setupRecovery(proof);if(currentScope.current!==requestedScope||request!==generation.current)return;setRecoveryKey(result.recoveryKey);setRecoveryEnabled(true);setUnderstood(false);}
    catch(cause){if(currentScope.current===requestedScope&&request===generation.current)report(cause);}
    finally{if(currentScope.current===requestedScope&&request===generation.current){running.current=false;setBusy(false);}}
  }
  let validation='';if(profile){try{validateDemoProfile(profile);}catch(cause){validation=message(cause);}}
  return <>
    <Text style={styles.eyebrow}>CUENTA FICTICIA · DEMOSTRACIÓN</Text><Text accessibilityRole="header" style={styles.title}>Perfil y recuperación</Text>
    <Text style={styles.copy}>Usa nombres de prueba. No introduzcas correo, teléfono, dirección, datos personales ni contraseñas utilizadas en otros servicios.</Text>
    <View style={styles.card}><Text style={styles.cardTitle}>{account.alias}</Text><Text style={styles.note}>{account.role==='operator'?'Operador de mina':'Comprador'} · alias y rol asignados por el servidor</Text></View>
    {busy&&<View style={styles.loading}><ActivityIndicator color="#DCBC7F"/><Text style={styles.note}>Actualizando cuenta demo…</Text></View>}
    {!!problem&&<Text accessibilityRole="alert" style={styles.error}>{problem}</Text>}{!!notice&&<Text style={styles.notice}>{notice}</Text>}
    {!profile&&!busy&&<Button label="Reintentar consulta del perfil" onPress={()=>void load()} disabled={disabled}/>}
    {profile&&<View style={styles.card}>
      <Text style={styles.cardTitle}>Preferencias ficticias</Text><Text style={styles.label}>Nombre visible de prueba</Text>
      <TextInput accessibilityLabel="Nombre visible ficticio" value={profile.displayName} onChangeText={displayName=>setProfile(current=>current?{...current,displayName}:null)} editable={!blocked} autoCorrect={false} autoComplete="off" maxLength={40} style={styles.input}/>
      <Text style={styles.label}>Divisa preferida</Text><View style={styles.chips}>{(['COP','EUR','USD','USDT'] as const).map(preferredCurrency=><Pressable key={preferredCurrency} accessibilityRole="button" accessibilityState={{selected:profile.preferredCurrency===preferredCurrency}} disabled={blocked} onPress={()=>setProfile(current=>current?{...current,preferredCurrency}:null)} style={[styles.chip,profile.preferredCurrency===preferredCurrency&&styles.chipOn]}><Text style={styles.chipText}>{preferredCurrency}</Text></Pressable>)}</View>
      <Text style={styles.label}>Jurisdicción ficticia preferida</Text><View style={styles.chips}>{(Object.keys(jurisdictionNames) as DemoProfile['jurisdiction'][]).map(jurisdiction=><Pressable key={jurisdiction} accessibilityRole="button" accessibilityState={{selected:profile.jurisdiction===jurisdiction}} disabled={blocked} onPress={()=>setProfile(current=>current?{...current,jurisdiction}:null)} style={[styles.chip,profile.jurisdiction===jurisdiction&&styles.chipOn]}><Text style={styles.chipText}>{jurisdictionNames[jurisdiction]}</Text></Pressable>)}</View>
      <Text style={styles.note}>Son preferencias de la demo; no convierten saldos ni cambian una cotización de entrega.</Text>{!!validation&&<Text style={styles.warning}>{validation}</Text>}
      <Button label="Guardar perfil ficticio" onPress={()=>void save()} disabled={blocked||!!validation} primary/>
    </View>}
    {account.role==='operator'?<View style={styles.card}><Text style={styles.cardTitle}>Acceso compartido de operador</Text><Text style={styles.note}>Las credenciales de este operador demo se administran por separado. Esta cuenta compartida no permite recuperar ni cambiar su clave desde aquí.</Text></View>:<View style={styles.card}>
      <Text style={styles.cardTitle}>Recuperación sin correo</Text><Text style={styles.note}>{recoveryEnabled?'La cuenta tiene una clave de recuperación configurada. Puedes generar otra con tu clave actual.':'Activa una clave de recuperación para poder recuperar esta cuenta de prueba sin correo ni datos personales.'}</Text>
      {recoveryKey?<View style={styles.secretBox}>
        <Text style={styles.warning}>Se muestra una sola vez. Guárdala en un lugar privado fuera del chat antes de ocultarla. La app no guarda una copia.</Text><Text testID="recovery-generated-key" selectable style={styles.secret}>{recoveryKey}</Text>
        <Button label="Ya guardé mi clave; ocultar" onPress={()=>{setRecoveryKey(null);setNotice('Clave de recuperación ocultada. Consérvala por un medio privado.');}}/>
      </View>:<>
        <Text style={styles.warning}>Generar otra clave de recuperación reemplaza la anterior. Si cierras esta pantalla antes de guardarla, tendrás que generar una nueva con tu clave actual.</Text>
        <Text style={styles.label}>Clave actual de esta cuenta demo</Text><TextInput accessibilityLabel="Clave actual para activar recuperación" value={password} onChangeText={setPassword} editable={!blocked} secureTextEntry autoCapitalize="none" autoCorrect={false} autoComplete="off" textContentType="none" maxLength={128} style={styles.input}/>
        <View style={styles.confirm}><Text style={styles.confirmText}>Entiendo que la clave de recuperación anterior dejará de funcionar y guardaré la nueva por un medio privado.</Text><Switch accessibilityLabel="Confirmar reemplazo de la clave de recuperación" value={understood} onValueChange={setUnderstood} disabled={blocked}/></View>
        <Button label="Generar y mostrar clave una vez" onPress={()=>void generate()} disabled={blocked||!understood||password.length<10} primary/>
      </>}
    </View>}
  </>;
}
const styles=StyleSheet.create({eyebrow:{color:'#DCBC7F',fontSize:10,fontWeight:'800',letterSpacing:1.3,lineHeight:19,marginTop:16},title:{color:'#F6F5F1',fontSize:27,lineHeight:37,fontWeight:'700',marginVertical:10},copy:{color:'#BAC4CE',fontSize:13,lineHeight:22,marginVertical:7},card:{padding:17,borderWidth:1,borderColor:'#273541',borderRadius:14,backgroundColor:'#141E28',marginTop:18},cardTitle:{color:'#F6F5F1',fontSize:16,lineHeight:25,fontWeight:'700'},note:{color:'#98A5B0',fontSize:12,lineHeight:21,marginTop:8},label:{color:'#D4DBE0',fontSize:12,lineHeight:21,fontWeight:'600',marginTop:17},input:{color:'#FAF9F3',fontSize:16,paddingHorizontal:14,paddingVertical:13,backgroundColor:'#101C26',borderColor:'#3C4B56',borderWidth:1,borderRadius:10,marginTop:7},chips:{flexDirection:'row',flexWrap:'wrap',gap:8,marginTop:10},chip:{minHeight:48,padding:11,borderWidth:1,borderColor:'#465766',borderRadius:9,justifyContent:'center'},chipOn:{backgroundColor:'#665233',borderColor:'#DCBC7F'},chipText:{fontSize:12,color:'#F7E4BD',fontWeight:'700'},primary:{backgroundColor:'#DCBC7F',padding:15,borderRadius:10,minHeight:48,alignItems:'center',justifyContent:'center',marginTop:18},primaryText:{color:'#15212B',fontSize:13,fontWeight:'800',textAlign:'center'},secondary:{padding:14,borderColor:'#4E6576',borderWidth:1,borderRadius:10,minHeight:48,alignItems:'center',justifyContent:'center',marginTop:15},secondaryText:{color:'#EDF1F3',fontSize:13,fontWeight:'700',textAlign:'center'},disabled:{opacity:.45},warning:{color:'#E5C7A0',fontSize:12,lineHeight:21,marginTop:10},confirm:{flexDirection:'row',alignItems:'center',gap:14,marginTop:18},confirmText:{color:'#BAC4CE',fontSize:12,lineHeight:21,flex:1},error:{padding:14,backgroundColor:'#4B2E2A',color:'#FCE4D9',fontSize:13,lineHeight:22,borderRadius:10,marginTop:16},notice:{padding:14,backgroundColor:'#19372B',color:'#B9D8C7',fontSize:13,lineHeight:22,borderRadius:10,marginTop:16},loading:{flexDirection:'row',gap:12,alignItems:'center',marginVertical:12},secretBox:{marginTop:15,padding:14,borderWidth:1,borderColor:'#665233',borderRadius:10,backgroundColor:'#241F18'},secret:{color:'#F8E8C9',fontSize:15,lineHeight:25,marginTop:18,fontWeight:'700'}});
