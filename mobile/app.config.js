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
  const preview=process.env.OPENMINERALS_NOTIFICATIONS_PREVIEW==='1';
  if(process.env.EXPO_PUBLIC_NOTIFICATIONS==='1'&&!preview)throw new Error('Notifications require the independent preview app.');
  if(!preview)return {...config, extra: {...config.extra, demoOnly: true}};
  if(process.env.EXPO_PUBLIC_NOTIFICATIONS!=='1')throw new Error('Notifications preview screen flag is required.');
  const isolated=process.env.NOTIFICATIONS_API_URL?.trim();
  let previewUrl;try{previewUrl=new URL(api);}catch{}
  if(!api||api!==isolated||previewUrl?.protocol!=='https:'||previewUrl.username||previewUrl.password||previewUrl.search||previewUrl.hash||['localhost','127.0.0.1','openminerals-api-demo.up.railway.app','openminerals-market-api-market-reference.up.railway.app'].includes(previewUrl.hostname))throw new Error('Configure an isolated notifications HTTPS API; existing demos are forbidden.');
  const projectId=process.env.EXPO_PUBLIC_NOTIFICATIONS_PROJECT_ID;
  if(projectId&&(!/^[a-f0-9-]{36}$/.test(projectId)||projectId===config.extra?.eas?.projectId))throw new Error('Use a separate Expo project for notifications.');
  if(isEasBuild&&!projectId)throw new Error('Configure the separate Expo/Firebase project before an Android build.');
  const extra={...config.extra,demoOnly:true,notificationsPreview:true,notificationsProjectId:projectId};delete extra.eas;
  if(projectId)extra.eas={projectId};
  return {...config,name:'Openminerals Alertas Preview',slug:'openminerals-alerts-preview',scheme:'openminerals-alerts-preview',runtimeVersion:'notifications-demo-0.3.0-v1',
    updates:projectId?{...config.updates,url:'https://u.expo.dev/'+projectId}:{...config.updates,enabled:false},
    android:{...config.android,package:'com.openminerals.demo.notificationspreview',versionCode:1,...(process.env.NOTIFICATIONS_GOOGLE_SERVICES_FILE?{googleServicesFile:process.env.NOTIFICATIONS_GOOGLE_SERVICES_FILE}:{})},
    plugins:[...(config.plugins??[]),'expo-notifications'],extra};
};
