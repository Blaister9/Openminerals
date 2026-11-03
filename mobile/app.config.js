// Expo replaces EXPO_PUBLIC_API_URL in the JavaScript bundle at build time.
// Keep the existing EAS HTTPS protection for every profile.
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
  if(process.env.EXPO_PUBLIC_MARKET_REFERENCE==='1'&&process.env.OPENMINERALS_MARKET_PREVIEW!=='1')throw new Error('Market screen requires the separate market preview app.');
  if(process.env.OPENMINERALS_MARKET_PREVIEW!=='1')return {...config, extra: {...config.extra, demoOnly: true}};
  if(process.env.EXPO_PUBLIC_MARKET_REFERENCE!=='1')throw new Error('Market preview requires its reference screen flag.');
  if(api!=='https://openminerals-market-api-market-reference.up.railway.app')throw new Error('Market preview must use its isolated HTTPS API.');
  return {...config,name:'Openminerals Mercado Preview',scheme:'openminerals-market-preview',runtimeVersion:'market-reference-0.3.0-v1',
    android:{...config.android,package:'com.openminerals.demo.marketpreview',versionCode:1},
    extra:{...config.extra,demoOnly:true,marketPreview:true,marketApi:api}};
};
