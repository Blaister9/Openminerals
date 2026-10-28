# Openminerals · Despliegue de la demo e instalación

Estado comprobado el **28 de octubre de 2026**. Todas las cifras, transacciones, cotizaciones, reservas y entregas son ficticias.

El código ya está publicado en el [repositorio oficial](https://github.com/Blaister9/Openminerals), con el commit inicial [`877ca777b66d40363732f9a6286c4d6f097a28ea`](https://github.com/Blaister9/Openminerals/commit/877ca777b66d40363732f9a6286c4d6f097a28ea). No es necesario crear otro repositorio ni volver a importar el ZIP sobre este clon.

La API está disponible en [openminerals-api-demo.up.railway.app](https://openminerals-api-demo.up.railway.app). Se comprobó `/health` con `ok: true`, `demoOnly: true` y `mode: "postgres-demo"`, y pasó el smoke HTTPS de conversión, compra de 2 g, venta, reservas e idempotencia. También se aprobaron la persistencia tras reiniciar el servicio y las pruebas ampliadas PostgreSQL; [el informe](07-verificacion-2026-10-28.md) registra la evidencia.

## Recursos de Railway

Se revisaron los cinco proyectos existentes antes de crear un proyecto dedicado a la simulación.

| Recurso | Nombre o identificador |
| --- | --- |
| Proyecto | `openminerals-demo` · `1442be94-b13f-4067-9fee-ea99caf5715a` |
| Entorno | `demo` · `1e835541-fd3a-49dd-8ae3-0315d4118940` |
| Servicio API | `00e2d919-2cd1-4293-befd-d8af58df8069` |
| Servicio PostgreSQL | `4cedb5b6-dbf2-4a3c-8a97-4c11df009e44` |
| Dominio API | `https://openminerals-api-demo.up.railway.app` |

[Abrir el proyecto Railway](https://railway.com/project/1442be94-b13f-4067-9fee-ea99caf5715a).

La API utiliza el repositorio oficial y la raíz `/api`. El directorio, el comando `npm start` y la comprobación `/health` se configuraron mediante la API de Railway. El dominio apunta al puerto `8080` asignado por la plataforma; el servidor lee `PORT`. PostgreSQL utiliza la red privada, sin proxy TCP público.

Railway rechazó la opción explícita `railwayConfigFile` con el mensaje **“Config as Code deprecated”** y una indicación de utilizar IaC. Se conserva `api/railway.json` como archivo heredado, pero **no es la fuente activa de configuración de este despliegue**. No se ha implementado una migración a IaC.

Las variables del servicio API son:

| Variable | Valor o procedencia |
| --- | --- |
| `DATABASE_URL` | Referencia a `DATABASE_URL` del PostgreSQL del mismo entorno; por ejemplo `${{Postgres.DATABASE_URL}}` si ese es su nombre |
| `REQUIRE_DATABASE` | `true` |
| `NODE_ENV` | `production` |
| `DEMO_ADMIN_TOKEN` | Secreto aleatorio fuerte, almacenado únicamente en Railway |

No copiar los valores de secretos a Git, al chat ni a capturas. Para nuevas configuraciones, comprobar las referencias en el editor de variables de Railway antes de desplegar.

## Verificar la API

Desde PowerShell, con Node.js 22.13 o posterior:

```powershell
Set-Location "$env:USERPROFILE\Projects\Openminerals\api"
npm ci
npm test
$demoHealth = Invoke-RestMethod 'https://openminerals-api-demo.up.railway.app/health'
$demoHealth
node scripts/smoke.mjs https://openminerals-api-demo.up.railway.app
```

La salud debe indicar `postgres-demo`. Si aparece `memory-demo`, la prueba de Railway falla aunque el servidor responda HTTP 200. El smoke usa una sesión ficticia nueva.

Para aceptar la persistencia, registrar una operación y su sesión de prueba, reiniciar únicamente el servicio API de Openminerals en `demo` y consultar esa misma sesión. Deben conservarse saldos, metales, historial y claves de idempotencia. Además, probar sesiones separadas y solicitudes concurrentes: repetir la misma clave debe producir un solo movimiento. Un smoke exitoso por sí solo no demuestra persistencia tras reinicio.

En desarrollo, `npm start` sin `DATABASE_URL` admite memoria y el estado se pierde al cerrar el proceso. Ese modo local no sustituye la prueba con PostgreSQL de Railway.

## Preparar Expo/EAS

Se conserva React Native con Expo SDK 57. Se comprobaron dependencias, tipos y Expo Doctor, y se generaron bundles JavaScript/Hermes de Android e iOS. Esos exports comprueban el empaquetado; **no son APK/IPA, compilaciones nativas terminadas ni pruebas en teléfonos**.

```powershell
Set-Location "$env:USERPROFILE\Projects\Openminerals\mobile"
npm ci
npx expo install --check
npm run check
npx expo-doctor
```

Para desarrollo local, crear el archivo ignorado `mobile/.env`:

```dotenv
EXPO_PUBLIC_API_URL=https://openminerals-api-demo.up.railway.app
```

Después puede iniciarse Metro con `npx expo start`. La URL pública evita apuntar al `localhost` del teléfono.

El perfil `preview` de `mobile/eas.json` incluye esa URL pública, utiliza el entorno EAS `preview` y solicita un APK Android. `mobile/app.config.js` detiene un build EAS si falta una URL pública HTTPS válida. Las variables `EXPO_PUBLIC_*` quedan integradas en el bundle; no deben contener secretos.

Expo/EAS está autenticado y enlazado a `@chipirips-team/openminerals-demo`, proyecto `c3985e04-43dd-4896-9f8a-09366b6a3579`. Las compilaciones y su resultado final se registran en [el informe de verificación](07-verificacion-2026-10-28.md). Para renovar la sesión sin enviar contraseñas o tokens por chat:

```powershell
npx eas-cli@latest login --device
npx eas-cli@latest whoami
```

El identificador real y el propietario ya están guardados en `mobile/app.json`; reutilizar ese proyecto en futuras compilaciones.

El perfil opcional `development` declara `developmentClient: true`, pero falta `expo-dev-client` entre las dependencias. Antes de utilizarlo, instalar la versión compatible con `npx expo install expo-dev-client` y repetir la validación. El perfil `preview` no necesita ese paquete.

## Android: compilar e instalar

**Última revisión 0.1.2 / versionCode 3:** [APK de comprobantes y operaciones](https://expo.dev/artifacts/eas/qfWvChA9T4G-qhjzFQMCLbcDrDvDz25TDbW3GGodKTQ.apk), EAS finalizado y firma comprobada con el mismo certificado. La API nueva está activa en Railway. Instalar sobre la app existente sin desinstalar. El propietario confirmó actualización, historial conservado y consulta de comprobantes. En «Actividad», abrir una operación anterior y un comprobante nuevo; conversión y venta ahora muestran resultado y comisión antes de confirmar. El recorrido físico completo continúa pendiente; ver [informe 0.1.2](10-comprobantes-y-operaciones-0.1.2.md).

La siguiente ficha conserva la entrega anterior 0.1.1 y la confirmación del propietario:

Build actualizado **0.1.1 / versionCode 2**: [EAS completado](https://expo.dev/accounts/chipirips-team/projects/openminerals-demo/builds/41fb0e8f-ee7c-4439-a5a5-20305647065a) y [descarga directa del APK](https://expo.dev/artifacts/eas/aO-xj5vXxzQE7PiFcZDMaFq6Izjb-l5w9i27deWmgl8.apk). Copia local `artifacts/openminerals-android-0.1.1-41fb0e8f.apk`. Se verificaron la URL API integrada y la firma Android, que coincide con la del APK anterior. Instalar sobre **Openminerals Demo**, sin desinstalar ni borrar almacenamiento, para conservar el identificador de sesión. El propietario confirmó que actualizó así, mantuvo el historial y ve valores. El scroll no superó la aceptación visual; faltan la comparación exacta de saldos y el resto del recorrido físico.

El APK 0.1.0 anterior fue instalado y parcialmente probado por el propietario: conversión, compra de 0,5 g, rechazo por saldo insuficiente y venta. Su enlace se conserva en el informe original. La revisión 0.1.1 añade el resumen con USDT disponible, las comisiones y el recorrido por scroll descritos en [el informe de revisión](08-revision-usabilidad-2026-10-28.md).

Con EAS autenticado, proyecto enlazado y API verificada:

```powershell
npx eas-cli@latest build --platform android --profile preview
```

EAS puede solicitar crear o seleccionar la clave de firma Android. Conservarla en su gestor de credenciales, sin añadirla al repositorio. Esperar el resultado y registrar el enlace real devuelto por EAS.

1. Abrir ese enlace desde Android y descargar el archivo `.apk`.
2. Si Android lo solicita, permitir la instalación desde la aplicación que abrió el APK.
3. Instalar **Openminerals Demo**, abrirla y comprobar que carga la sesión desde la API.
4. Ejecutar el recorrido descrito abajo; registrar dispositivo, versión Android, build, fecha y resultados.

No distribuir un enlace como instalador mientras el build esté pendiente o fallido. [Documentación oficial de distribución interna](https://docs.expo.dev/build/internal-distribution/).

## iPhone y simulador iOS

Para instalar un build interno en un iPhone físico se necesitan los certificados/provisionamiento Apple y el dispositivo registrado en el perfil ad hoc. Con la cuenta Apple Developer autorizada:

El propietario confirmó que no tiene membresía Apple Developer activa. Por tanto, la instalación en iPhone queda bloqueada por firma. Apple indica 99 USD por año de membresía, con precio local según la región; no se contrató ni pagó una membresía. Para pruebas personales existe Xcode Personal Team en un Mac, con perfiles de siete días. [Membresía](https://developer.apple.com/programs/enroll/) y [pruebas personales](https://developer.apple.com/help/account/basics/about-your-developer-account).

```powershell
npx eas-cli@latest device:create
npx eas-cli@latest build --platform ios --profile preview
```

Solo los dispositivos incluidos en el perfil pueden instalar ese build. Registrar el iPhone después de compilar puede exigir actualizar el perfil y generar otra compilación. El inicio de sesión Apple, la firma y los permisos pendientes son bloqueos reales; no equivalen a una app iOS entregada.

TestFlight es otra vía de pruebas, pero requiere configurar una distribución de tienda, App Store Connect y el envío de un build firmado. El perfil `preview` actual es interno. No se ha configurado ni efectuado una publicación en TestFlight. [Guía oficial de envío iOS](https://docs.expo.dev/submit/ios/).

Existe un perfil separado para una compilación de simulador:

```powershell
npx eas-cli@latest build --platform ios --profile ios-simulator
```

Puede generarse sin Apple Developer, pero **no se instala en un iPhone**. Su ejecución requiere un simulador iOS en macOS/Xcode; este equipo Windows no lo proporciona. [Documentación oficial de simuladores](https://docs.expo.dev/build-reference/simulators/).

## Recorrido de aceptación en cada teléfono

Convertir USD a USDT, comprar 2 g de oro, verificar descuento y portafolio, vender una fracción, publicar/cancelar una oferta, solicitar/cancelar una cotización de entrega y revisar el historial. Probar saldo insuficiente, una desconexión/reintento y la reapertura sin duplicar operaciones ni perder el estado.

Mantener visible la etiqueta de simulación. El panel del operador muestra datos **por sesión**: no es inventario global ni un backoffice multiusuario terminado. No introducir datos personales sensibles, fondos reales ni reservas físicas.
