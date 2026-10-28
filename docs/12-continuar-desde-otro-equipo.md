# Continuar Openminerals desde otro equipo

Estado al **28 de octubre de 2026**: código 0.1.3 publicado, API demo activa en Railway/PostgreSQL y APK compilado e inspeccionado. El propietario pospuso la descarga por lentitud y **no ha probado cuentas, roles ni SecureStore de 0.1.3 en Android**. No pedir que repita la comprobación del historial anterior; registrar la prueba pendiente cuando pueda realizarla.

## Empezar por la rama correcta

Repositorio oficial: <https://github.com/Blaister9/Openminerals>. **El trabajo actual está en `codex/mobile-overview-scroll-20261028`; `main` conserva una versión anterior.** [PR #1](https://github.com/Blaister9/Openminerals/pull/1) abierto como borrador. No volver a importar el ZIP, sobrescribir el clon ni usar push forzado.

En una carpeta nueva del otro equipo:

```sh
git clone --branch codex/mobile-overview-scroll-20261028 https://github.com/Blaister9/Openminerals.git Openminerals
cd Openminerals
git status
```

Si ya existe un clon, revisar sus cambios antes de actualizarlo. Leer `AGENTS.md`, este documento y [el informe 0.1.3](11-cuentas-e-inventario-compartido.md). Conservar React Native/Expo.

Fuente de API/app 0.1.3: `fb1f590f665fc5e7bb3dcc11217c7481446c7183`. Commits posteriores `b5e17a2`, `d9be6b7` y `919fa9e` añaden inspección/enlaces/evidencia; esta guía no modifica código de la app.

## Ejecutar el cliente sin recrear infraestructura

Usar Node.js **22.13 o posterior**, según los `engines` del repositorio. Los lockfiles están publicados.

```sh
cd mobile
npm ci
```

Crear `mobile/.env` **local y sin versionar** con esta única variable pública:

```dotenv
EXPO_PUBLIC_API_URL=https://openminerals-api-demo.up.railway.app
```

```sh
npm run check
npm test
npx expo install --check
npx expo start
```

El perfil EAS `preview` ya contiene la URL HTTPS correcta. No poner claves, tokens ni contraseñas en `EXPO_PUBLIC_`. Para trabajar en API local **desde la raíz del repositorio**: `cd api`, `npm ci`, `npm test`, `npm start`; si se está en `mobile/`, usar primero `cd ../api`. Sin `DATABASE_URL` ese proceso usa memoria desechable y no demuestra persistencia. No copiar la conexión de Railway al repositorio. La integración PostgreSQL requiere `TEST_DATABASE_URL` y `npm run test:postgres`; CI ya dispone de su propia base temporal.

## Recursos existentes que se deben reutilizar

| Recurso | Identificador/configuración |
| --- | --- |
| API pública | <https://openminerals-api-demo.up.railway.app> |
| Salud | `/health`: `ok:true`, `demoOnly:true`, `mode:postgres-demo` |
| Railway proyecto | `openminerals-demo`, `1442be94-b13f-4067-9fee-ea99caf5715a` |
| Railway entorno | `demo`, `1e835541-fd3a-49dd-8ae3-0315d4118940` |
| Railway API | `openminerals-api`, `00e2d919-2cd1-4293-befd-d8af58df8069` |
| PostgreSQL privado | `4cedb5b6-dbf2-4a3c-8a97-4c11df009e44` |
| Despliegue comprobado | `9d5af81f-ba92-411b-a695-4fff1c7ea780`, fuente GitHub `b5e17a2`, API idéntica a `fb1f590` |
| Railway fuente/build | Rama `codex/mobile-overview-scroll-20261028`, Root Directory `/api`, Dockerfile `/api/Dockerfile`, Watch Paths `/api/**`, Wait for CI activado |
| Variables privadas Railway | `DATABASE_URL` referenciada desde PostgreSQL, `REQUIRE_DATABASE=true`, `NODE_ENV=production`, `DEMO_ADMIN_TOKEN` existente; no publicar valores |
| Expo organización/proyecto | `chipirips-team` / `openminerals-demo` |
| EAS project ID | `c3985e04-43dd-4896-9f8a-09366b6a3579` |
| Android | `com.openminerals.demo.mobile`, versión `0.1.3`, versionCode `4` |
| EAS build Android | `269f285b-f16b-4c82-9c9a-35a3a5082bc5`, perfil `preview` |

En el nuevo equipo hay que iniciar sesión por los flujos oficiales de GitHub, Railway y Expo si se necesitan operaciones administrativas. Esas sesiones de herramientas no viajan con Git. No hacer `eas init`, no crear otro proyecto Railway y **no regenerar el keystore Android**: usar las credenciales remotas existentes para conservar actualizaciones. Cambiar la rama Railway a `main` únicamente después de una fusión y una fuente comprobadas; este traspaso no fusiona el PR.

## APK y evidencias que sí viajan

- [Entrega Android en GitHub, versión preliminar v0.1.3-demo](https://github.com/Blaister9/Openminerals/releases/tag/v0.1.3-demo): APK y `SHA256SUMS.txt`. Es una alternativa de descarga, no una garantía de velocidad.
- [APK original de Expo](https://expo.dev/artifacts/eas/MG34boaq4KCKSOqvkDsUIj_q8J_rp-xADGup1B9M2hs.apk). La disponibilidad de los artefactos EAS es temporal; no depender solo de ese enlace.
- APK: **68.772.781 bytes**, SHA256 `fda0953d11a6035100bef9f9c04d070053edc2ae47c31852803a020d89e6b7c7`.
- Certificado Android SHA256: `3ae9a19077ab3f434b5885981d35e3d29966e406e7438b8f0558c155d47e3e1c`.
- [CI de la revisión aprobada](https://github.com/Blaister9/Openminerals/actions/runs/40770956257) y [firma/versión/rutas del APK aprobadas](https://github.com/Blaister9/Openminerals/actions/runs/40770949478).

La versión preliminar GitHub `v0.1.3-demo` está publicada y su tag apunta a `1ec833d943ed895cf76b73b0063c316238b7ec4f`. Se descargó el APK desde su enlace público de GitHub y se comprobó el archivo completo: tamaño y SHA256 idénticos a los indicados arriba. No incluye credenciales ni datos privados de las pruebas.

Instalar como actualización, sin desinstalar ni borrar datos. `artifacts/`, snapshots y helpers de QA del PC original están ignorados por Git: no forman parte de un clon nuevo. El informe versionado y las ejecuciones públicas contienen el resumen de evidencia; no subir los fixtures privados para trasladarlos.

## Acceso del operador: traslado privado

El operador de la mina principal ya está creado. El archivo con su alias y clave existe **solo en el equipo original**, en:

```text
%LOCALAPPDATA%\Openminerals\access\operador-mina-demo-20261028.json
```

Antes de dejar ese equipo, conservarlo mediante un gestor de contraseñas o un medio privado cifrado. **No añadirlo a Git, al release, a un issue ni al chat.** Clonar el repositorio no recupera esas credenciales. PostgreSQL conserva un hash y no permite recuperar la clave original en claro.

Si ese archivo ya no está disponible, la administración autenticada en Railway puede provisionar **otro operador** mediante `POST /api/demo/admin/accounts`, con `role:operator` y la mina `openminerals-demo-v1`. Usar el `DEMO_ADMIN_TOKEN` existente únicamente dentro del entorno autorizado y guardar la nueva clave de forma privada. No reiniciar la mina, la base de datos ni los compradores para recuperar acceso. La API no implementa recuperación de contraseña de las cuentas.

## Punto de continuación y límites

Ya aprobados: 31 pruebas API locales; 14 comprobaciones PostgreSQL sin omisiones; 45 pruebas móviles, TypeScript, compatibilidad Expo y Doctor 21/21; exports Hermes Android/iOS; tres smokes HTTPS; reinicio con persistencia, permisos e idempotencia; UI web de dos compradores y operador contra API local y Railway. No repetir toda esa batería por un traslado documental.

Pendiente concreto: prueba física de **registro/login, vinculación, roles y persistencia nativa de SecureStore** en el APK 0.1.3. El usuario no la confirmó y pidió dejar preparado el proyecto para continuar desde otro lugar. No contabilizar la aceptación de historial de 0.1.2 como aprobación de cuentas nuevas. `mobile/e2e/accounts.yaml` está preparado pero **no ejecutado**; contiene `clearState:true` y es exclusivamente para un emulador desechable, nunca para el teléfono del propietario con datos que quiere conservar. El emulador anterior falló antes de ejecutar escenarios.

Scrollytelling sigue sin aceptación y fue pospuesto. iPhone continúa bloqueado por falta de firma/provisionamiento Apple; no hay instalador iOS 0.1.3 para teléfono. El export iOS no equivale a una instalación.

La prioridad funcional acordada fue cuentas demo y mina con inventario compartido. La fase posterior de custodia/trazabilidad/blockchain **no está implementada**. Todas las operaciones, saldos, precios, existencias, reservas y cuentas son ficticios; no conectar datos, dinero, metales ni redes financieras reales.
