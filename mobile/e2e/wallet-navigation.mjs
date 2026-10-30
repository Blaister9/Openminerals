// Only the compatible OTA introduces this rail. The old APK preservation flow
// intentionally runs without this helper, before applying the new JavaScript.
const open={runFlow:{file:'wallet-usdt.yaml'}};
export function horizontalWalletNavigation(text){
 const parts=text.replaceAll('\r\n','\n').split('\n---\n');
 if(parts.length===2&&parts[1].trim().startsWith('[')){
  const commands=JSON.parse(parts[1]);
  return parts[0]+'\n---\n'+JSON.stringify(commands.flatMap(command=>command?.tapOn==='^Billetera$'?[command,open]:[command]),null,2)+'\n';
 }
 return text.replace(/^- tapOn: \^Billetera\$$/gm,'- tapOn: ^Billetera$\n- runFlow:\n    file: wallet-usdt.yaml');
}
