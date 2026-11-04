const {getDefaultConfig}=require('expo/metro-config');
const path=require('path');const config=getDefaultConfig(__dirname);
const inherited=config.resolver.resolveRequest;
if(process.env.OPENMINERALS_TESTNET_PREVIEW!=='1'){
 config.resolver.resolveRequest=(context,name,platform)=>name.endsWith('/TestnetWallet')?{type:'sourceFile',filePath:path.resolve(__dirname,'lib/disabled-testnet.js')}:inherited?inherited(context,name,platform):context.resolveRequest(context,name,platform);
}
// Only the isolated testnet bundle needs Node-compatible JS shims.
if(process.env.OPENMINERALS_TESTNET_PREVIEW==='1'){
 const empty=path.resolve(__dirname,'lib/empty-module.js');
 config.resolver.extraNodeModules={...(config.resolver.extraNodeModules??{}),stream:require.resolve('readable-stream'),buffer:require.resolve('buffer')};
 const fallback=config.resolver.resolveRequest;
 config.resolver.resolveRequest=(context,name,platform)=>name==='ws'?{type:'sourceFile',filePath:path.resolve(__dirname,'lib/native-websocket.js')}:fallback?fallback(context,name,platform):context.resolveRequest(context,name,platform);
 for(const name of ['crypto','http','https','net','tls','zlib','os','dns','assert','url','path','fs'])config.resolver.extraNodeModules[name]=empty;
}
module.exports=config;
