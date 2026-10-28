# Openminerals · Continuidad del trabajo con Codex

Actualizado el **28 de octubre de 2026**. El proyecto sigue siendo una simulación: saldos, operaciones, metales, cotizaciones y entregas ficticios.

## Código sincronizado

El repositorio oficial es [Blaister9/Openminerals](https://github.com/Blaister9/Openminerals). Se comprobó que estaba vacío antes de importar; no se sustituyó trabajo anterior. Su clon local está en:

```text
C:\Users\edwin.paz\Projects\Openminerals
```

El contenido interno de `openminerals-foundation/` del ZIP se incorporó directamente a la raíz, incluidos los archivos ocultos. El commit inicial publicado en `main`, mediante push normal, es [`877ca777b66d40363732f9a6286c4d6f097a28ea`](https://github.com/Blaister9/Openminerals/commit/877ca777b66d40363732f9a6286c4d6f097a28ea).

Los cambios posteriores y sus pruebas están en el README, el informe de validación y el historial de Git. Para continuar:

```powershell
Set-Location "$env:USERPROFILE\Projects\Openminerals"
git remote -v
git status --short
git fetch origin
git log -5 --oneline
```

Leer `AGENTS.md` antes de modificar archivos. Conservar cambios locales del propietario; no ejecutar un reset destructivo ni `push --force`. Cuando el árbol esté limpio, `git pull --ff-only` permite actualizar la rama sin reescribir historial. Si hay divergencia o conflictos, integrarlos en una rama `codex/*` y revisar el diff.

No volver a ejecutar el importador sobre el clon como actualización rutinaria: la integración ya ocurrió. `tools/import_to_github.py` se conserva para importaciones deliberadas y aborta ante archivos distintos. El PDF maestro está en `docs/Diseno_Maestro_Ejecutivo.pdf`; no requiere otra copia en la raíz.

## Infraestructura identificada

Se revisaron cinco proyectos Railway existentes y se creó un proyecto separado para la demo. No desplegar cambios de Openminerals en los otros proyectos.

| Recurso | Identificador |
| --- | --- |
| Proyecto `openminerals-demo` | `1442be94-b13f-4067-9fee-ea99caf5715a` |
| Entorno `demo` | `1e835541-fd3a-49dd-8ae3-0315d4118940` |
| API | `00e2d919-2cd1-4293-befd-d8af58df8069` |
| PostgreSQL | `4cedb5b6-dbf2-4a3c-8a97-4c11df009e44` |

La API está en [https://openminerals-api-demo.up.railway.app](https://openminerals-api-demo.up.railway.app). Se verificó `/health` con `ok: true`, `demoOnly: true`, `mode: "postgres-demo"`, y pasó el smoke HTTPS. También pasaron la integración PostgreSQL por SSH y la persistencia después de reiniciar el servicio. La evidencia y los límites constan en [el informe de validación](07-verificacion-2026-10-28.md).

La API utiliza `/api` como raíz, `npm start` y `/health`, configurados mediante la API de Railway. El dominio apunta al puerto de plataforma `8080`; el servidor lee `PORT`. PostgreSQL permanece en red privada, sin proxy TCP público. La API usa una referencia a su `DATABASE_URL`, `REQUIRE_DATABASE=true`, `NODE_ENV=production` y `DEMO_ADMIN_TOKEN` secreto.

Railway rechazó `railwayConfigFile` por **“Config as Code deprecated”**. Se conserva `api/railway.json` como archivo heredado, pero la configuración activa está en Railway. No se ha migrado a IaC; no afirmar lo contrario por la presencia de un archivo de configuración.

## Pruebas reproducibles y límites

```powershell
Set-Location "$env:USERPROFILE\Projects\Openminerals\api"
npm ci
npm test
node scripts/smoke.mjs https://openminerals-api-demo.up.railway.app

Set-Location "$env:USERPROFILE\Projects\Openminerals\mobile"
npm ci
npx expo install --check
npm run check
npx expo-doctor
```

En esta preparación se ejecutaron las 12 pruebas iniciales de dominio/HTTP en memoria, los controles de compatibilidad, TypeScript y Expo Doctor, y los exports Android/iOS. Esos resultados no demuestran por sí solos PostgreSQL, compilación nativa ni instalación en dispositivos. La cobertura y resultados añadidos después se detallan en el informe de validación.

Para aceptar Railway, `/health` debe responder `ok: true`, `demoOnly: true` y `mode: "postgres-demo"`. Hay que comprobar el recorrido de operaciones, el aislamiento de sesiones, los reintentos concurrentes y la persistencia tras reiniciar la API. Una prueba PostgreSQL omitida por falta de conexión no debe registrarse como aprobada.

## Compilación e instalación pendientes

La app mantiene React Native/Expo SDK 57. `mobile/eas.json` prepara un APK con el perfil `preview`, entorno `preview` y la URL API pública. `mobile/app.config.js` exige una API HTTPS válida en builds EAS. El perfil `ios-simulator` está separado y no produce una app instalable en iPhone.

Expo/EAS ya está autenticado y enlazado a `@chipirips-team/openminerals-demo`, ID `c3985e04-43dd-4896-9f8a-09366b6a3579`. Se solicitaron builds Android `preview` e iOS `ios-simulator`; consultar su resultado y enlaces reales en [el informe](07-verificacion-2026-10-28.md). Los exports en `mobile/dist/` son bundles de código, no instaladores. El build para iPhone físico se detuvo por falta de firma y el propietario confirmó que no dispone de membresía Apple Developer. Comandos para futuras compilaciones:

```powershell
Set-Location "$env:USERPROFILE\Projects\Openminerals\mobile"
npx eas-cli@latest login --device
npx eas-cli@latest whoami
npx eas-cli@latest build --platform android --profile preview
npx eas-cli@latest build --platform ios --profile preview
```

Android requiere firma y un APK completado. iPhone interno requiere la cuenta/provisión Apple autorizada y el dispositivo registrado. La distribución por TestFlight necesita una configuración y un envío separados; aún no se ha efectuado. El perfil `development` requiere instalar primero `expo-dev-client`, que todavía no está entre las dependencias.

Los pasos de instalación y las fuentes oficiales están en [`04-despliegue.md`](04-despliegue.md). Registrar enlace real, estado, plataforma y commit de cada build. Probar en teléfonos físicos conversión, compra de 2 g, saldos, venta, oferta, entrega, historial y reapertura; documentar bloqueos de firma o acceso que impidan completarlo.

El cierre requiere evidencia. No presentar el panel por sesión como inventario global, una exportación como compilación nativa ni una API en memoria como despliegue PostgreSQL funcional.
