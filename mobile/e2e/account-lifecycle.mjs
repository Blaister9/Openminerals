import {randomBytes} from 'node:crypto';
import {requireSafe} from './ci-safety.mjs';
export const walletCurrencies=['COP','EUR','USD','USDT'];
const rates={COP:{EUR:230,USD:250,USDT:250},EUR:{COP:4347826087,USD:1086957,USDT:1086957},USD:{COP:4000000000,EUR:920000,USDT:1000000},USDT:{COP:4000000000,EUR:920000,USD:1000000}};
export function expectedImportedWallet(){
  const wallet={COP:145000000,EUR:75000,USD:60000,USDT:25000};
  for(const from of walletCurrencies)for(const to of walletCurrencies.filter(value=>value!==from)){
    const amount=from==='COP'?1000000:100;wallet[from]-=amount;wallet[to]+=Number(BigInt(amount)*BigInt(rates[from][to])/1000000n);
  }
  return wallet;
}
const scroll=(element,direction='DOWN')=>({scrollUntilVisible:{element,direction,centerElement:false,timeout:30000}});
const wait=text=>({extendedWaitUntil:{visible:text,timeout:30000}});
const tap=text=>({tapOn:text});
const field=(text,value,direction='DOWN')=>[scroll({text},direction),{tapOn:{text,point:'95%,50%'}},{eraseText:100},{inputText:value},'hideKeyboard'];
const confirm=()=>[tap('^Confirmar demo$'),wait('^Comprobante$'),tap('Cerrar comprobante')];
const openAccount=()=>[{runFlow:{when:{visible:'^Actividad$'},commands:[tap('^Actividad$')]}},{tapOn:{text:'^Cuenta$',index:0}},wait('^Cuenta demo$')];
const openSettings=()=>[...openAccount(),scroll({text:'^Perfil y recuperación$'},'UP'),tap('^Perfil y recuperación$'),wait('^Perfil de demostración$')];
export function accountFlow(name,currency){
  let commands;
  if(name==='wallet'){
    requireSafe(walletCurrencies.includes(currency),'Unsupported native currency.');
    commands=[tap('^Billetera$'),scroll({id:'transfer-currency-'+currency}),{tapOn:{id:'transfer-currency-'+currency}},...field('Cantidad para ingresar o retirar','1,25'),scroll({text:'^Simular ingreso$'}),tap('^Simular ingreso$'),...confirm(),scroll({text:'^Simular retiro$'}),tap('^Simular retiro$'),...confirm()];
    for(const to of walletCurrencies.filter(value=>value!==currency)){
      commands.push(scroll({id:'convert-from-'+currency},'UP'),{tapOn:{id:'convert-from-'+currency}});
      if(currency==='COP'&&to==='EUR')commands.push({assertVisible:'^Sesión sin cuenta$'},{takeScreenshot:'safe-wallet-cop-before-eur'});
      commands.push({tapOn:{id:'convert-to-'+to}},...field('Cantidad de dinero para convertir',currency==='COP'?'10000':'1'),scroll({text:'^Convertir en demo$'}),tap('^Convertir en demo$'),...confirm());
    }
  }else if(name==='import')commands=[...openAccount(),tap('^Crear comprador$'),...field('Alias de cuenta demo','${MAESTRO_LOGIN_ALIAS}'),...field('Clave de cuenta demo','${MAESTRO_LOGIN_PASSWORD}'),scroll({text:'Conservar mi sesión anterior'}),{tapOn:{text:'Conservar mi sesión anterior',checked:true}},{tapOn:{text:'Conservar mi sesión anterior',checked:false}},{assertVisible:{text:'Conservar mi sesión anterior',checked:true}},scroll({text:'^Crear y vincular mi sesión$'}),tap('^Crear y vincular mi sesión$'),wait({id:'home-cinematic-scroll'}),{runFlow:{file:'story-clean.yaml'}},tap('^Actividad$'),wait('^Comprador ·.*')];
  else if(name==='setup')commands=[...openSettings(),...field('Nombre visible ficticio','Cuenta importada DEMO'),scroll({text:'^EUR$'}),tap('^EUR$'),scroll({text:'^Jurisdicción DEMO B$'}),tap('^Jurisdicción DEMO B$'),scroll({text:'^Guardar perfil ficticio$'}),tap('^Guardar perfil ficticio$'),scroll({text:'Perfil ficticio guardado.*'},'UP'),wait('Perfil ficticio guardado.*'),...field('Clave actual para activar recuperación','${MAESTRO_LOGIN_PASSWORD}'),scroll({text:'Confirmar reemplazo de la clave de recuperación'}),tap('Confirmar reemplazo de la clave de recuperación'),scroll({text:'^Generar y mostrar clave una vez$'}),tap('^Generar y mostrar clave una vez$'),wait('^Ya guardé mi clave; ocultar$')];
  else if(name==='hide-and-logout')commands=[tap('^Ya guardé mi clave; ocultar$'),tap('^Cerrar$'),...openAccount(),scroll({text:'^Cerrar sesión$'},'UP'),tap('^Cerrar sesión$'),wait({id:'home-cinematic-scroll'}),{runFlow:{file:'story-clean.yaml'}},tap('^Actividad$'),wait('^Sesión anterior · solo consulta$'),tap('^Billetera$'),scroll({text:'^Simular ingreso$'}),{assertVisible:{text:'^Simular ingreso$',enabled:false}}];
  else if(name==='recover-start')commands=[...openAccount(),scroll({text:'^Recuperar comprador con clave privada$'}),tap('^Recuperar comprador con clave privada$'),wait('^Recuperar cuenta demo$'),...field('Alias para recuperar cuenta demo','${MAESTRO_LOGIN_ALIAS}'),...field('Clave privada de recuperación demo','AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'),scroll({text:'^Validar recuperación demo$'}),tap('^Validar recuperación demo$'),scroll({text:'No se pudo validar la recuperación.*'},'UP'),wait('No se pudo validar la recuperación.*'),...field('Clave privada de recuperación demo','${MAESTRO_RECOVERY_KEY}'),scroll({text:'^Validar recuperación demo$'}),tap('^Validar recuperación demo$'),scroll({text:'Nueva clave para .*'},'UP'),wait('Nueva clave para .*')];
  else if(name==='recover-complete')commands=[...field('Nueva clave de cuenta demo','${MAESTRO_NEXT_PASSWORD}'),...field('Repetir nueva clave demo','${MAESTRO_NEXT_PASSWORD}X'),scroll({text:'Confirmar cambio de clave y revocación de accesos'}),tap('Confirmar cambio de clave y revocación de accesos'),scroll({text:'^Cambiar clave y revocar accesos$'}),{assertVisible:{text:'^Cambiar clave y revocar accesos$',enabled:false}},...field('Repetir nueva clave demo','${MAESTRO_NEXT_PASSWORD}','UP'),scroll({text:'^Cambiar clave y revocar accesos$'}),tap('^Cambiar clave y revocar accesos$'),scroll({text:'^Cuenta recuperada$'},'UP'),wait('^Cuenta recuperada$'),scroll({id:'recovery-completed-key'})];
  else if(name==='reenter')commands=[scroll({text:'Confirmar guardado privado de la nueva clave de recuperación'}),tap('Confirmar guardado privado de la nueva clave de recuperación'),scroll({text:'^Ocultar clave y volver a entrar$'}),tap('^Ocultar clave y volver a entrar$'),wait('^Cuenta demo$'),...field('Clave de cuenta demo','${MAESTRO_NEXT_PASSWORD}'),scroll({text:'^Entrar en mi cuenta$'}),tap('^Entrar en mi cuenta$'),wait({id:'home-cinematic-scroll'}),{runFlow:{file:'story-clean.yaml'}},tap('^Actividad$'),wait('^Comprador ·.*'),'stopApp','launchApp',wait('^Actividad$'),tap('^Actividad$'),wait('^Comprador ·.*'),tap('^Billetera$'),scroll({text:'^USDT 251,58$'}),{assertVisible:'^USDT 251,58$'},...openSettings(),scroll({text:'Nombre visible ficticio'}),{assertVisible:'^Cuenta importada DEMO$'},tap('^Cerrar$')];
  else throw new Error('Unknown account lifecycle flow.');
  return JSON.stringify({appId:'com.openminerals.demo.mobile',name:'Private demo account '+name})+'\n---\n'+JSON.stringify(commands,null,2)+'\n';
}
export function verifyImportedState(state){
  const expected=expectedImportedWallet();requireSafe(walletCurrencies.every(code=>state.walletMinor[code]===expected[code]),'Imported native wallets differ.');
  requireSafe(Object.values(state.holdingsMg).length===4&&Object.values(state.holdingsMg).every(value=>value===0)&&state.offers.length===0&&state.custodyRequests.length===0,'Account lifecycle must not consume mine metal.');
  const receipts=Object.values(state.receipts);requireSafe(receipts.length===20&&state.movements.length===20,'Native wallet matrix or import is incomplete.');
  for(const currency of walletCurrencies)for(const action of ['deposit','withdraw'])requireSafe(receipts.filter(item=>item.action===action&&item.currency===currency&&item.amountMinor===125).length===1,'Native decimal transfer did not execute exactly once.');
  requireSafe(new Set(receipts.filter(item=>item.action==='convert').map(item=>item.from+'-'+item.to)).size===12,'Native conversion matrix is incomplete.');
}
export async function runAccountLifecycle({runStage,maestro,request,users,mask,sessions,captureSecret}){
  const original={alias:'native_'+randomBytes(9).toString('hex'),password:randomBytes(24).toString('base64url')},next=randomBytes(24).toString('base64url');
  users.register=original;mask(original.alias);mask(original.password);mask(next);
  const flow=(name,extraEnv={})=>maestro('account-'+name,'register',{source:accountFlow(name),extraEnv});
  for(const currency of walletCurrencies)await runStage('native-wallet-'+currency.toLowerCase()+'-matrix',()=>maestro('wallet-'+currency.toLowerCase(),null,{source:accountFlow('wallet',currency)}));
  let token,saved,key;
  await runStage('native-explicit-wallet-import',async()=>{
    await flow('import');const auth=await request('/api/demo/accounts/login',null,original);token=auth.token;mask(token);sessions.push(token);
    requireSafe(auth.account.role==='buyer'&&auth.account.mineId!==users.a.me.mine.id,'Public import mine/role mismatch.');
    saved=await request('/api/demo/state',token);verifyImportedState(saved);
  });
  await runStage('native-profile-and-private-recovery-setup',async()=>{await flow('setup');key=await captureSecret('recovery-generated-key');mask(key);});
  await runStage('native-imported-origin-readonly',()=>flow('hide-and-logout'));
  await runStage('native-recovery-rejects-wrong-key',()=>flow('recover-start',{MAESTRO_RECOVERY_KEY:key}));
  await runStage('native-password-confirmation-and-reset',async()=>{await flow('recover-complete',{MAESTRO_NEXT_PASSWORD:next});const rotated=await captureSecret('recovery-completed-key');mask(rotated);requireSafe(rotated!==key,'Recovery key did not rotate.');});
  await runStage('native-recovery-revokes-old-access',async()=>{await request('/api/demo/state',token,undefined,401);await request('/api/demo/accounts/login',null,original,401);});
  await runStage('native-recovered-session-profile-cold-open',()=>flow('reenter',{MAESTRO_NEXT_PASSWORD:next}));
  await runStage('api-confirms-imported-data-after-recovery',async()=>{
    const auth=await request('/api/demo/accounts/login',null,{alias:original.alias,password:next});mask(auth.token);sessions.push(auth.token);
    const after=await request('/api/demo/state',auth.token);verifyImportedState(after);for(const key of ['walletMinor','holdingsMg','receipts','movements','offers','custodyRequests'])requireSafe(JSON.stringify(after[key])===JSON.stringify(saved[key]),'Recovery changed imported financial data.');
    const profile=await request('/api/demo/accounts/profile',auth.token);requireSafe(profile.profile.displayName==='Cuenta importada DEMO'&&profile.profile.preferredCurrency==='EUR'&&profile.profile.jurisdiction==='DEMO_REGIONAL','Recovered profile changed.');
    await request('/api/demo/accounts/recovery/start',null,{alias:original.alias,recoveryKey:key},401);
  });
}
