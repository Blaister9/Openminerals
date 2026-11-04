// Expo replaces EXPO_PUBLIC_API_URL in the JavaScript bundle at build time.
// Refuse an installable EAS build that cannot reach the HTTPS demo backend.
module.exports = ({config}) => {
  const api = process.env.EXPO_PUBLIC_API_URL?.trim();
  const isEasBuild = process.env.EAS_BUILD === 'true' || Boolean(process.env.EAS_BUILD_PROFILE);
  if (isEasBuild) {
    if (!api) throw new Error('Configura EXPO_PUBLIC_API_URL en el entorno preview de EAS antes de compilar.');
    let url;
    try { url = new URL(api); }
    catch { throw new Error('EXPO_PUBLIC_API_URL debe ser una URL HTTPS válida.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      throw new Error('EXPO_PUBLIC_API_URL debe apuntar a la API pública HTTPS, sin credenciales, consulta ni fragmento.');
    }
  }
  const preview=process.env.OPENMINERALS_TESTNET_PREVIEW==='1';
  if(process.env.EXPO_PUBLIC_TESTNET==='1'&&!preview)throw new Error('MetaMask requires the independent testnet preview.');
  if(!preview)return {...config, extra: {...config.extra, demoOnly: true}};
  if(process.env.EXPO_PUBLIC_TESTNET!=='1')throw new Error('Testnet preview flag is required.');
  let url;try{url=new URL(api);}catch{}
  if(!url||api!==process.env.TESTNET_API_URL||url.protocol!=='https:'||url.pathname!=='/'||url.username||url.password||url.search||url.hash||['openminerals-api-demo.up.railway.app','openminerals-market-api-market-reference.up.railway.app','localhost','127.0.0.1','[::1]'].includes(url.hostname))throw new Error('Use a NEW isolated HTTPS testnet API.');
  const project=process.env.EXPO_PUBLIC_TESTNET_PROJECT_ID;
  if(project&&(!/^[a-f0-9-]{36}$/.test(project)||project===config.extra?.eas?.projectId))throw new Error('Use a separate Expo testnet project.');
  if(isEasBuild&&!project)throw new Error('Configure the independent testnet Expo project before building.');
  const extra={...config.extra,demoOnly:true,baseSepoliaOnly:true};delete extra.eas;if(project)extra.eas={projectId:project};
  return {...config,name:'Openminerals Testnet DEMO',slug:'openminerals-testnet-demo',scheme:'openminerals-testnet-demo',runtimeVersion:'base-sepolia-demo-0.3.0-v1',
    android:{...config.android,package:'com.openminerals.demo.testnetpreview',versionCode:1},updates:project?{...config.updates,url:'https://u.expo.dev/'+project}:{...config.updates,enabled:false},extra};
};
