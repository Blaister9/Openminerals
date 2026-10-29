import {requireSafe} from './ci-safety.mjs';
const scroll=(element,direction='DOWN')=>({scrollUntilVisible:{element,direction,centerElement:false,timeout:30000}});
const tap=text=>({tapOn:text}),wait=text=>({extendedWaitUntil:{visible:text,timeout:45000}});
const field=(text,value)=>[scroll({text}),{tapOn:{text,point:'95%,50%'}},{eraseText:100},{inputText:value},'hideKeyboard'];
export function qualityFlow(name){
  let commands;
  if(name==='login')commands=[{runFlow:{file:'login.yaml'}},wait('^Comprador ·.*')];
  else if(name==='insufficient')commands=[tap('^Mercado$'),scroll({id:'market-metal-XAU'}),{tapOn:{id:'market-metal-XAU'}},...field('Cantidad de metal en gramos','2'),scroll({text:'Tu saldo USDT no alcanza.*'}),{assertVisible:'Tu saldo USDT no alcanza.*'},scroll({text:'^Confirmar compra simulada$'}),{assertVisible:{text:'^Confirmar compra simulada$',enabled:false}}];
  else if(name==='prepare')commands=[tap('^Billetera$'),scroll({id:'transfer-currency-USD'}),{tapOn:{id:'transfer-currency-USD'}},...field('Cantidad para ingresar o retirar','0.01'),scroll({text:'^Simular retiro$'}),tap('^Simular retiro$'),wait('^Confirmar demo$')];
  else if(name==='offline')commands=[tap('^Confirmar demo$'),wait('^Reintentar operación pendiente$'),{assertNotVisible:'^Comprobante$'}];
  else if(name==='resolve')commands=['stopApp','launchApp',wait('^Comprador ·.*'),wait('^Reintentar operación pendiente$'),tap('^Reintentar operación pendiente$'),wait('^Comprobante$'),tap('Cerrar comprobante'),{assertNotVisible:'^Reintentar operación pendiente$'},tap('^Billetera$'),scroll({id:'transfer-currency-USD'}),{tapOn:{id:'transfer-currency-USD'}},...field('Cantidad para ingresar o retirar','0.01'),scroll({text:'^Simular ingreso$'}),tap('^Simular ingreso$'),tap('^Confirmar demo$'),wait('^Comprobante$'),tap('Cerrar comprobante')];
  else throw new Error('Unknown private network-quality flow.');
  return JSON.stringify({appId:'com.openminerals.demo.mobile',name:'Native quality '+name})+'\n---\n'+JSON.stringify(commands,null,2)+'\n';
}
export function verifyQualityResult(state,before){
  requireSafe(['COP','EUR','USD','USDT'].every(code=>state.walletMinor[code]===before.walletMinor[code]),'Native quality did not restore the initial wallets.');
  const receipts=Object.values(state.receipts);requireSafe(receipts.length===2&&state.movements.length===2,'Native offline retry duplicated or lost a movement.');
  for(const action of ['withdraw','deposit'])requireSafe(receipts.filter(receipt=>receipt.action===action&&receipt.currency==='USD'&&receipt.amountMinor===1).length===1,'Native quality receipt differs.');
  requireSafe(Object.values(state.holdingsMg).every(value=>value===0)&&state.offers.length===0&&state.custodyRequests.length===0,'Native quality consumed metal.');
}
export async function waitQualityResult(read,before,publishChecks=()=>{}){
  for(let attempt=1;attempt<=5;attempt++){
    const state=await read();
    await publishChecks({attempt,walletsRestored:['COP','EUR','USD','USDT'].every(code=>state.walletMinor[code]===before.walletMinor[code]),movements:state.movements.length,receipts:Object.keys(state.receipts).length,holdingsZero:Object.values(state.holdingsMg).every(value=>value===0)});
    try{verifyQualityResult(state,before);return state;}catch(error){if(attempt===5)throw error;}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
}
export async function runNetworkQuality({runStage,maestro,request,users,adb,publishChecks}){
  const before=await request('/api/demo/state',users.a.token),flow=name=>maestro('quality-'+name,'a',{source:qualityFlow(name)});
  await runStage('native-quality-buyer-login',()=>flow('login'));
  await runStage('native-insufficient-balance-blocks-purchase',async()=>{await flow('insufficient');const state=await request('/api/demo/state',users.a.token);requireSafe(Object.keys(state.receipts).length===0,'Insufficient purchase created a receipt.');});
  await runStage('native-prepare-one-cent-withdrawal',()=>flow('prepare'));
  await runStage('native-offline-preserves-pending-without-debit',async()=>{
    try{
      adb('shell','svc','wifi','disable');adb('shell','svc','data','disable');
      await flow('offline');const state=await request('/api/demo/state',users.a.token);requireSafe(state.walletMinor.USD===before.walletMinor.USD&&Object.keys(state.receipts).length===0,'Offline request reached the API or changed the wallet.');
    }finally{adb('shell','svc','wifi','enable');adb('shell','svc','data','enable');}
  });
  await runStage('native-pending-survives-cold-open-retry-once',()=>flow('resolve'));
  await runStage('api-verifies-no-duplicate-after-offline-retry',()=>waitQualityResult(()=>request('/api/demo/state',users.a.token),before,publishChecks));
  await runStage('api-verifies-quality-buyer-permission',()=>request('/api/demo/mine/summary',users.a.token,undefined,403));
}
