// app.json remains the frozen 0.3.0 delivery record. This branch always resolves
// to a separate Android application, including local Expo start/export commands.
const stable = require('./app.json').expo;

module.exports = ({config = stable} = {}) => {
  const profile = process.env.EAS_BUILD_PROFILE;
  const building = process.env.EAS_BUILD === 'true';
  if (profile && profile !== 'mine-realism') {
    throw new Error('This experimental source cannot build the stable demo. Use EAS profile mine-realism; build the delivered demo from its frozen commit.');
  }
  if (building && profile !== 'mine-realism') {
    throw new Error('Experimental Android builds require EAS_BUILD_PROFILE=mine-realism.');
  }
  if ((building || profile === 'mine-realism') && process.env.OPENMINERALS_MINE_PREVIEW !== '1') {
    throw new Error('The isolated mine preview requires OPENMINERALS_MINE_PREVIEW=1.');
  }
  if (process.env.EAS_BUILD_PLATFORM && process.env.EAS_BUILD_PLATFORM !== 'android') {
    throw new Error('This sprint builds Android only.');
  }
  // Keep the delivered build's HTTPS guard: Expo embeds this public URL in JS.
  if (building || profile) {
    const api = process.env.EXPO_PUBLIC_API_URL?.trim();
    if (!api) throw new Error('Configura EXPO_PUBLIC_API_URL en el entorno preview de EAS antes de compilar.');
    let url;
    try { url = new URL(api); }
    catch { throw new Error('EXPO_PUBLIC_API_URL debe ser una URL HTTPS válida.'); }
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash ||
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
      throw new Error('EXPO_PUBLIC_API_URL debe apuntar a la API pública HTTPS, sin credenciales, consulta ni fragmento.');
    }
  }
  return {
    ...config,
    name: 'Openminerals Mina Preview',
    scheme: 'openminerals-mine-preview',
    platforms: ['android'],
    version: '0.4.0',
    runtimeVersion: '0.4.0',
    android: {...config.android, package: 'com.openminerals.demo.minepreview', versionCode: 5},
    updates: {
      ...config.updates,
      enabled: true,
      useEmbeddedUpdate: true,
      disableAntiBrickingMeasures: false,
      fallbackToCacheTimeout: 0,
      requestHeaders: {...config.updates?.requestHeaders, 'expo-channel-name': 'mine-realism'},
    },
    extra: {...config.extra, demoOnly: true, minePreview: true, minePreviewRevision: 'r5'},
  };
};
