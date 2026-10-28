# Openminerals · Montaje en GitHub, Railway y dispositivos

**Todavía no se ha desplegado en tu cuenta.** Estas instrucciones permiten hacerlo con permisos del propietario, sin compartir claves privadas en el chat.

## 1. GitHub

1. Crea un **repositorio privado** `openminerals` en tu organización o cuenta GitHub.
2. Descomprime este paquete en el repositorio y súbelo. No subas archivos `.env`, credenciales, datos bancarios ni KYC.
3. Confirma que `.github/workflows/ci.yml` corre correctamente.
4. Protege `main` y revisa cambios mediante pull requests antes de promoción.

## 2. Railway

1. Crea un proyecto `openminerals-demo` y un entorno `demo` separado de cualquier producción.
2. Añade un servicio **PostgreSQL**, privado. Activa backups según el plan y política de la organización.
3. Añade un servicio API desde GitHub y selecciona el repositorio anterior.
4. En **Root Directory** establece **`/api`**. Si Railway solicita ruta de configuración, usar `/api/railway.json`.
5. En variables API agrega:
   - `DATABASE_URL` = referencia al `DATABASE_URL` del servicio PostgreSQL (por ejemplo `${{Postgres.DATABASE_URL}}` si el servicio se llama `Postgres`).
   - `REQUIRE_DATABASE=true`.
   - `DEMO_ADMIN_TOKEN` = secreto generado aleatoriamente de más de 32 caracteres; conservarlo únicamente en Railway.
   - `NODE_ENV=production`.
6. Railway detecta Node desde `api/package.json`, ejecuta `npm start` y comprueba `/health`.
7. Activa un dominio público HTTPS para **solo la API**. Comprueba que `/health` responde `"mode":"postgres-demo"`.
8. No abras acceso público directo a PostgreSQL. No conectes fondos reales.

GitHub → Railway puede iniciar despliegues automáticos desde la rama configurada. Para un flujo más riguroso, usar entorno `staging`, aprobación manual y promoción a `demo`.

## 3. Expo iOS/Android

1. En `mobile/`, instala dependencias con `npm install`.
2. Crea `.env` a partir de `.env.example` con `EXPO_PUBLIC_API_URL=https://<tu-dominio-api-railway>` (sin slash final).
3. Comprueba compatibilidad: `npx expo install --check` (o `npx expo install --fix` si es necesario) y `npm run check`.
4. `npx expo start` para desarrollo local; el teléfono requiere acceso a la API pública HTTPS.
5. Crea un proyecto Expo EAS; `npx eas-cli@latest build:configure`.
6. Configura `EXPO_PUBLIC_API_URL` también para el **entorno de build `preview`** de EAS. Las variables EXPO_PUBLIC se integran en el binario.
7. Compila Android: `npx eas-cli@latest build --platform android --profile preview`.
8. Para iPhone: cuenta Apple Developer y compilación interna con dispositivos registrados, o TestFlight según convenga: `npx eas-cli@latest build --platform ios --profile preview`.
9. Abre la app instalada, realiza el guion de `05-guion-demo.md`, fuerza el cierre, reabre y verifica el historial.

**Nota:** el `bundleIdentifier`/`package` de demostración son valores provisionales. Los identificadores definitivos deben acordarse antes de registrarlos en App Store y Play Store.

## 4. Buenas prácticas para presentar al cliente

- Ofrecer dos dispositivos de prueba (Android y iPhone) y un guion guiado.
- No exponer claves, saldos de empleados ni PII real.
- Utilizar datos ficticios, etiquetados como simulación en pantalla y video.
- Mostrar gestión de mina, no solamente pantallas de comprador.
- Documentar qué partes son demo y qué falta para operación comercial.
