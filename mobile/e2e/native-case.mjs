import {requireSafe} from './ci-safety.mjs';
const cases={XAU:{name:'Oro',reference:14500,peer:14000},XAG:{name:'Plata',reference:280,peer:270},XPT:{name:'Platino',reference:5900,peer:5700},XPD:{name:'Paladio',reference:5200,peer:5000}};
const fee=(amount,bps)=>Math.ceil(amount*bps/10000);
export const nativeMoney=minor=>(minor/100).toLocaleString('es-CO',{minimumFractionDigits:2,maximumFractionDigits:2});
export function nativeCase(code='XAU'){
  requireSafe(typeof code==='string'&&Object.hasOwn(cases,code),'Unsupported native metal case.');
  const item=cases[code],buyBase=item.reference*2,buyFee=fee(buyBase,100),peerBase=item.peer/2,peerFee=fee(peerBase,120),sellBase=item.reference/2,sellFee=fee(sellBase,120);
  const afterBuy=45000-buyBase-buyFee,afterSell=afterBuy+peerBase-peerFee+sellBase-sellFee;
  return {code,...item,afterBuy,afterSell,finalA:afterSell-1000,finalB:25000-peerBase,peerBase,fees:buyFee+peerFee+sellFee};
}
const select=(id,direction='UP')=>`- scrollUntilVisible:\n    element:\n      id: ${id}\n    direction: ${direction}\n    centerElement: true\n    timeout: 30000\n- tapOn:\n    id: ${id}\n`;
// Only reviewed financial/profile flow templates are transformed. Legacy and
// anonymous OTA/story assertions keep their original balances and identity.
export function nativeFlow(name,text,code='XAU'){
  const allowed=['buyer-a-buy','buyer-a-offer','buyer-b','request-delivery','quote','accept','operator','operator-stock','profile','ota'];
  if(!allowed.includes(name))return text;
  const item=nativeCase(code);let result=text.replaceAll('\r\n','\n');
  const money={'157,10':item.afterBuy,'297,89':item.afterSell,'287,89':item.finalA,'180,00':item.finalB,'70,00':item.peerBase,'140,00':item.peer};
  result=result.replace(/157,10|297,89|287,89|180,00|70,00|140,00/g,value=>nativeMoney(money[value]));
  if(name==='buyer-a-offer')result=result.replace('inputText: "140"','inputText: "'+(item.peer/100).toFixed(2)+'"');
  result=result.replaceAll('Oro',item.name).replaceAll('oro',item.name.toLowerCase());
  if(name==='buyer-a-buy')result=result.replace('- tapOn: ^Mercado$\n','- tapOn: ^Mercado$\n'+select('market-metal-'+code,'DOWN'));
  if(name==='buyer-a-offer')result=result.replace('- tapOn: ^Posiciones$\n','- tapOn: ^Posiciones$\n'+select('portfolio-metal-'+code,'DOWN'));
  if(name==='request-delivery'){
    result=result.replace('- tapOn: ^Metales$\n','- tapOn: ^Metales$\n'+select('portfolio-metal-'+code,'DOWN'));
    result=result.replace('- tapOn: ^Entregas DEMO$\n','- tapOn: ^Entregas DEMO$\n'+select('delivery-metal-'+code,'DOWN'));
  }
  if(name==='operator-stock')result=result.replace('- tapOn: ^Inventario$\n','- tapOn: ^Inventario$\n'+select('stock-metal-'+code,'DOWN'));
  return result;
}
