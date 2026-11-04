import React,{useEffect,useRef,useState} from 'react';
import {Linking,Modal,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import {Buffer} from 'buffer';
import type {createAccountClient,PublicAccount} from '../lib/account-client';
import {connectMetaMask} from '../lib/metamask-native';
import {createTestnetController} from '../lib/testnet-controller';
import {addressEqual,grossUnits,requireSepolia,safeExplorer,validateLinkChallenge,type TestnetState,type WalletProvider} from '../lib/testnet';
type Props={api:string;account:PublicAccount;client:ReturnType<typeof createAccountClient>;visible:boolean;disabled:boolean;onClose:()=>void};
export function TestnetWallet({api,account,client,visible,disabled,onClose}:Props){
 const [state,setState]=useState<TestnetState|null>(null),[problem,setProblem]=useState(''),[busy,setBusy]=useState(false),[connected,setConnected]=useState(''),[target,setTarget]=useState(''),[lotId,setLotId]=useState(''),[grams,setGrams]=useState('0.100'),[hash,setHash]=useState(''),[pending,setPending]=useState<Awaited<ReturnType<ReturnType<typeof createTestnetController>['read']>>>(null);
 const wallet=useRef<Awaited<ReturnType<typeof connectMetaMask>>|null>(null),generation=useRef(0),running=useRef(false),alive=useRef(true);
 const listenerCleanup=useRef(()=>{});
 const requireAccount=()=>{if(!alive.current||client.getAccount()?.id!==account.id)throw new Error('La cuenta cambió.');};
 const controller=useRef(createTestnetController({api,accountId:account.id,storage:AsyncStorage,uuid:Crypto.randomUUID,prepare:(body,id)=>{requireAccount();return client.testnetPrepare(body,id);},submitted:(id,value)=>{requireAccount();return client.testnetSubmit(id,value);}})).current;
 async function refresh(){const current=generation.current,next=await client.getTestnetState();if(!alive.current||current!==generation.current)return;setState(next);if(!lotId&&next.backing?.lots[0])setLotId(next.backing.lots[0].lotId);setPending(await controller.refresh(next.operations));}
 async function run(work:()=>Promise<unknown>){if(disabled||running.current)return;running.current=true;setBusy(true);setProblem('');try{requireAccount();await work();requireAccount();await refresh();}catch(error){if(alive.current)setProblem(error instanceof Error?error.message:'No se pudo completar la solicitud de testnet.');}finally{if(alive.current){try{setPending(await controller.read());}catch{setProblem('El intento guardado no es válido. No se reenvió ninguna transacción.');}running.current=false;setBusy(false);}}}
 useEffect(()=>{if(visible&&!disabled)void run(async()=>{});},[visible,disabled]);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;listenerCleanup.current();const current=wallet.current;wallet.current=null;if(current)void current.disconnect().catch(()=>{});};},[]);
 async function connect(){const current=await connectMetaMask();if(!alive.current){await current.disconnect();return;}wallet.current=current;setConnected(current.address);
  listenerCleanup.current();const accountChanged=(accounts:unknown)=>{if(alive.current)setConnected(Array.isArray(accounts)&&typeof accounts[0]==='string'?accounts[0]:'');},chainChanged=()=>{if(alive.current)setConnected('');};
  current.provider.on('accountsChanged',accountChanged);current.provider.on('chainChanged',chainChanged);
  listenerCleanup.current=()=>{current.provider.removeListener('accountsChanged',accountChanged);current.provider.removeListener('chainChanged',chainChanged);};
 }
 async function verify(){const current=wallet.current;if(!current)throw new Error('Conecta MetaMask.');await requireSepolia(current.provider as unknown as WalletProvider);
  const challenge=await client.testnetChallenge(connected);validateLinkChallenge(challenge,api,connected,account.id);
  const signature=await current.provider.request({method:'personal_sign',params:['0x'+Buffer.from(challenge.message,'utf8').toString('hex'),connected]});requireAccount();if(typeof signature!=='string')throw new Error('Firma inválida.');await client.testnetVerify(challenge.challengeId,signature);
 }
 const verified=!!state?.wallet&&addressEqual(connected,state.wallet.address),blocked=disabled||busy;
 const button=(label:string,work:()=>Promise<unknown>,needsWallet=false)=><Pressable accessibilityRole="button" disabled={blocked||(needsWallet&&!verified)} style={[styles.button,(blocked||(needsWallet&&!verified))&&{opacity:0.4}]} onPress={()=>void run(work)}><Text style={styles.link}>{label}</Text></Pressable>;
 const prepare=(kind:string)=>controller.prepare({kind,...(['register','issue','transfer','cancel'].includes(kind)?{lotId}:{}),...(['participant','issue','transfer'].includes(kind)?{toAccountId:target}:{}),...(['issue','transfer','cancel'].includes(kind)?{units:grossUnits(grams)}:{})});
 function explorer(url:string|null){const safe=safeExplorer(url);if(safe)void Linking.openURL(safe);}
 if(!visible)return null;
 return <Modal visible animationType="none" onRequestClose={onClose}><SafeAreaView style={styles.screen}><View style={styles.row}><Text style={styles.title}>MetaMask · TESTNET DEMO</Text><Pressable onPress={onClose} accessibilityRole="button"><Text style={styles.link}>Cerrar</Text></Pressable></View><ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
  <Text style={styles.warning}>Base Sepolia exclusivamente. Sin USDT, metales físicos ni propiedad legal reales. Una unidad = un miligramo de masa bruta; la pureza se identifica por separado.</Text>
  {!!problem&&<Text accessibilityRole="alert" style={styles.warning}>{problem}</Text>}
  {button('Conectar billetera MetaMask',connect)}<Text selectable style={styles.text}>Conectada: {connected||'ninguna'}</Text><Text selectable style={styles.text}>Vinculada: {state?.wallet?.address||'pendiente de firma'}</Text>
  {button('Verificar dirección mediante firma',verify)}
  {wallet.current&&button('Desconectar MetaMask',async()=>{await wallet.current?.disconnect();wallet.current=null;setConnected('');})}
  {button('Actualizar estado',async()=>{})}{button('Conciliar confirmaciones',()=>client.testnetReconcile())}
  {state&&<><Text style={styles.text}>Red: {state.chainId} · {state.reconciliation.status} · bloque {state.reconciliation.indexedBlock??'pendiente'} · mínimo {state.reconciliation.confirmations} confirmaciones.</Text>
   {state.reconciliation.problems.map(value=><Text key={value} style={styles.warning}>{value}</Text>)}
   {state.contract&&<Pressable onPress={()=>explorer(state.contractExplorer)}><Text selectable style={styles.link}>Contrato DEMO: {state.contract}</Text></Pressable>}
   {account.role==='operator'&&!state.backing&&button('Reservar este pool aislado para DEMO testnet',()=>client.testnetFreeze())}
   {(state.backing?.lots??[]).map(lot=><Pressable key={lot.lotId} accessibilityRole="button" onPress={()=>setLotId(lot.lotId)} style={styles.card}><Text style={styles.text}>{lotId===lot.lotId?'✓ ':''}{lot.metal} · {lot.capGrossMg} mg brutos elegibles · pureza {lot.purityBps/100}% DEMO</Text><Text selectable style={styles.small}>Lote {lot.lotId}</Text></Pressable>)}
   <Text style={styles.title}>Titular de destino verificado</Text>{state.participants.map(person=><Pressable key={person.accountId} onPress={()=>setTarget(person.accountId)} style={styles.card}><Text style={styles.text}>{target===person.accountId?'✓ ':''}{person.alias} · {person.enabled?'habilitado':'por habilitar'}</Text><Text selectable style={styles.small}>{person.address}</Text></Pressable>)}
   <TextInput accessibilityLabel="Gramos brutos DEMO para tokens" editable={!blocked} value={grams} onChangeText={setGrams} keyboardType="decimal-pad" style={styles.input}/>
   {!pending&&<>{account.role==='operator'&&<>{!state.contract&&button('Preparar despliegue ERC-1155 DEMO',()=>prepare('deploy'),true)}{state.contract&&<>{button('Preparar habilitación del titular',()=>prepare('participant'),true)}{button('Preparar registro del lote',()=>prepare('register'),true)}{button('Preparar emisión DEMO',()=>prepare('issue'),true)}</>}</>}{state.contract&&<>{button('Preparar transferencia DEMO',()=>prepare('transfer'),true)}{button('Preparar cancelación de unidades DEMO',()=>prepare('cancel'),true)}</>}</>}
   {pending&&<View style={styles.card}><Text style={styles.text}>Intento: {pending.operation?.kind??'preparando'} · {pending.phase}</Text><Text selectable style={styles.small}>{pending.operation?.id??pending.requestId}</Text>
    {pending.phase==='PREPARING'&&button('Recuperar preparación con su misma identidad',()=>controller.prepare(pending.body))}
    {pending.phase==='AWAITING_SIGNATURE'&&button('Revisar y firmar en MetaMask',async()=>{if(!wallet.current)throw new Error('Conecta MetaMask.');await controller.send(wallet.current.provider as unknown as WalletProvider,connected);},true)}
    <Text style={styles.small}>Si se perdió la respuesta, concilia antes de volver a firmar. El backend comprueba que el hash coincida con este intento.</Text>
    <TextInput accessibilityLabel="Hash de transacción Base Sepolia para recuperar" value={hash} onChangeText={setHash} style={styles.input} autoCapitalize="none"/>{button('Registrar o reintentar el mismo hash',()=>controller.recoverHash(hash||undefined))}</View>}
   <Text style={styles.title}>Unidades recibidas DEMO</Text>{state.balances.map(balance=><View style={styles.card} key={balance.tokenId}><Text style={styles.text}>{balance.units} mg brutos DEMO</Text><Text selectable style={styles.small}>Serie {balance.tokenId}</Text></View>)}
   <Text style={styles.title}>Operaciones de testnet</Text>{state.operations.map(op=><View style={styles.card} key={op.id}><Text style={styles.text}>{op.kind} · {op.status} · {op.units??'—'} unidades DEMO</Text><Pressable onPress={()=>explorer(op.explorer)}><Text selectable style={styles.link}>{op.hash??'Pendiente de firma o envío'}</Text></Pressable></View>)}
   <Text style={styles.title}>Movimientos ERC-1155 confirmados</Text>{state.events.map((event,index)=><Pressable key={event.transactionHash+index} style={styles.card} onPress={()=>explorer(event.explorer)}><Text style={styles.text}>{event.units} unidades DEMO</Text><Text selectable style={styles.small}>{event.from} → {event.to}</Text><Text selectable style={styles.small}>{event.transactionHash}</Text></Pressable>)}
  </>}
 </ScrollView></SafeAreaView></Modal>;
}
const styles=StyleSheet.create({screen:{flex:1,backgroundColor:'#090F15'},body:{padding:18,gap:12,paddingBottom:40},row:{padding:18,flexDirection:'row',justifyContent:'space-between',gap:8},title:{color:'#E9D4A4',fontSize:18,fontWeight:'700'},text:{color:'#DBE3E9'},small:{color:'#9AADB9',fontSize:12},link:{color:'#D8B676',fontWeight:'600'},warning:{color:'#EDBB90',lineHeight:19},button:{paddingVertical:13},input:{color:'#FFF',backgroundColor:'#162431',borderRadius:8,padding:12},card:{backgroundColor:'#12212D',padding:14,borderRadius:10,gap:7}});
