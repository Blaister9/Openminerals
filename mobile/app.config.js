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
  return {...config, extra: {...config.extra, demoOnly: true}};
};
