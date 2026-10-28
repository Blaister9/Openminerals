# Verificación de Openminerals · 28 de octubre de 2026

La API de simulación funciona con PostgreSQL en Railway. La instalación y el recorrido en teléfonos físicos todavía no están verificados. Todas las cifras, operaciones, cotizaciones y reservas son ficticias.

## Código publicado

- Carpeta: `C:\Users\edwin.paz\Projects\Openminerals`.
- Remoto: `https://github.com/Blaister9/Openminerals.git`; rama `main`.
- El remoto estaba vacío al inspeccionarlo y clonarlo. Se incorporó el contenido interno del ZIP en la raíz, incluidos archivos ocultos, y se leyó `AGENTS.md` antes de instalar o ampliar funciones.
- [877ca777b66d40363732f9a6286c4d6f097a28ea](https://github.com/Blaister9/Openminerals/commit/877ca777b66d40363732f9a6286c4d6f097a28ea): importación inicial y lock de API.
- [2e16413f090b6eb81c7a981c4ca21a4ae7a886ce](https://github.com/Blaister9/Openminerals/commit/2e16413f090b6eb81c7a981c4ca21a4ae7a886ce): reintentos persistentes, integración PostgreSQL, CI, configuración EAS y lock móvil.
- [7762585de892673c3cd7fd20729d21056f0cb1ce](https://github.com/Blaister9/Openminerals/commit/7762585de892673c3cd7fd20729d21056f0cb1ce): vinculación real EAS, configuración iOS y limpieza del aviso al rechazar un pendiente.
- Push normales, sin force ni eliminación de ramas. Las credenciales, `.env`, `node_modules` y snapshots de sesiones quedan fuera de Git.

## Railway

Se inspeccionaron los cinco proyectos existentes y sus nombres de servicios antes de crear recursos. Ninguno correspondía a Openminerals. Se creó un proyecto y entorno de demostración independientes.

| Recurso | Valor |
| --- | --- |
| Proyecto | `openminerals-demo` / `1442be94-b13f-4067-9fee-ea99caf5715a` |
| Entorno | `demo` / `1e835541-fd3a-49dd-8ae3-0315d4118940` |
| API | `openminerals-api` / `00e2d919-2cd1-4293-befd-d8af58df8069` |
| PostgreSQL | `Postgres` / `4cedb5b6-dbf2-4a3c-8a97-4c11df009e44`, PostgreSQL 18 con volumen |
| API pública | https://openminerals-api-demo.up.railway.app |
| Salud | https://openminerals-api-demo.up.railway.app/health |
| Despliegue probado | `2fb069ff-099c-48b4-822b-d9bf4e00ea94`, commit `2e16413` |
| Runtime | Node.js `22.23.3` |

La API toma el código desde GitHub `main`, raíz `/api`, arranque `npm start`, healthcheck `/health` y dominio dirigido a `8080`, el `PORT` asignado por la plataforma. El entorno inicial vacío `production` no tiene servicios desplegados. PostgreSQL solo tiene red privada, sin proxy TCP público.

Variables de API: `DATABASE_URL` referencia `${{Postgres.DATABASE_URL}}`, `REQUIRE_DATABASE=true`, `NODE_ENV=production` y `DEMO_ADMIN_TOKEN` aleatorio de 48 bytes generado con RNG criptográfico y transferido a Railway por stdin. El valor del token no se imprimió ni se guardó en Git. No hay datos personales ni fondos reales en la demo.

## Pruebas ejecutadas

| Comprobación | Resultado y alcance |
| --- | --- |
| API local `npm test` | 12 pruebas de dominio/HTTP aprobadas; PostgreSQL se omite explícitamente si falta URL |
| API `npm run smoke` local | Conversión, compra 2 g, replay, venta, oferta, entrega e historial/resumen aprobados en memoria |
| API smoke HTTPS, `REQUIRE_POSTGRES=true` | Aprobado en `postgres-demo` |
| PostgreSQL dentro de Railway por SSH | 5 subpruebas aprobadas; Node reporta 6 al incluir el test contenedor; cero omitidas |
| Persistencia ante reinicio real | `prepare`, `railway restart --service openminerals-api --environment demo --yes`, y `verify` aprobados; se conserva hash del estado y recibo, replay sin duplicar |
| Cliente móvil | 10/10 pruebas aprobadas, incluida respuesta perdida después de commit HTTP y recuperación del cliente con la misma clave |
| TypeScript | `npm run check` aprobado |
| Expo SDK 57 | `npx expo install --check`: dependencias compatibles; Expo Doctor 21/21 |
| Metro/Hermes después de correcciones | Android 592 módulos e iOS 594, exports aprobados; no son instaladores |
| CI | [Workflow ampliado aprobado](https://github.com/Blaister9/Openminerals/actions/runs/40710145714), incluyendo PostgreSQL 18 y pruebas móviles |
| Auditoría API | Cero vulnerabilidades reportadas |
| Auditoría móvil | 8 avisos: 3 altos transitivos y 5 bajos; detalle abajo |
| Android/iPhone físicos | No ejecutados; no se declara aceptación de dispositivos |

PostgreSQL se comprobó con un esquema temporal exclusivo `om_test_<UUID>`, eliminado al concluir: sesiones aisladas; 12 compras concurrentes con la misma clave y un solo movimiento; 12 retiros concurrentes de los cuales solo los dos con saldo pueden completarse; rollback al rechazar una compra; cierre y reapertura del store sin pérdida de estado ni recibos. No se modificaron las sesiones normales de la demo.

El snapshot de persistencia está fuera de Git en `%LOCALAPPDATA%\Openminerals\verification\railway-persistence-20261028.json`. El reinicio está acreditado además por la respuesta de Railway y sus logs de nuevo arranque; el script `verify` por sí solo no demuestra que haya ocurrido un reinicio. La captura local del despliegue activo se guarda en esa misma carpeta como `railway-demo-20261028.png`.

## Compilaciones y dispositivos

EAS: [@chipirips-team/openminerals-demo](https://expo.dev/accounts/chipirips-team/projects/openminerals-demo), ID `c3985e04-43dd-4896-9f8a-09366b6a3579`. Se conserva Expo SDK 57 / React Native 0.86.3. `preview` integra la URL HTTPS de Railway; no incorpora secretos.

| Plataforma | Build solicitado | Estado |
| --- | --- | --- |
| Android APK, `preview` | [265f4e3b-c6a6-4d26-b7b3-8805cd2332e4](https://expo.dev/accounts/chipirips-team/projects/openminerals-demo/builds/265f4e3b-c6a6-4d26-b7b3-8805cd2332e4) | IN_QUEUE en la comprobación del 28 de octubre; todavía sin APK descargable |
| Simulador iOS, `ios-simulator` | [da164363-6526-4880-a0eb-8c0e444f704f](https://expo.dev/accounts/chipirips-team/projects/openminerals-demo/builds/da164363-6526-4880-a0eb-8c0e444f704f) | FINISHED; compilación nativa aprobada; ejecución no probada; no se instala en iPhone |
| iPhone físico, `preview` | No se creó build | EAS rechazó la preparación por falta de certificados/perfil; propietario confirmó no tener Apple Developer activo |

EAS generó la clave Android en su gestor remoto. Los builds registran `2e16413` como SHA de partida y contienen los cambios locales de vinculación de `app.json` y la limpieza del aviso de pendiente, versionados posteriormente en `7762585`. iOS simulador también contiene la configuración de cifrado de ese commit. No se afirma que el SHA de metadatos EAS identifique por sí solo esos cambios locales.

Para Android, abrir el enlace del build **cuando indique Finished**, descargar el APK, autorizar su instalación desde el navegador si Android lo solicita e iniciar Openminerals Demo. Para iOS simulador se requiere un Mac con Xcode/Simulator; no sirve ese archivo para iPhone. La guía completa está en [04-despliegue.md](04-despliegue.md).

Archivo iOS simulador generado: [descargar archivo .tar.gz](https://expo.dev/artifacts/eas/0UbmdUNFLWCt8ZNcUp7oIunu-2EKjEtqV2A63lRyXTk.tar.gz). EAS confirma compilación finalizada; no se ejecutó el simulador en este equipo Windows.

Copia local: `artifacts/openminerals-ios-simulator-da164363.tar.gz`, 14.498.964 bytes, SHA-256 `09E625B2EBF13AD54F03AD750ABE4191C6DDCF3BA5BCD4342775E722EB632C41`. Se comprobó que el archivo contiene `OpenmineralsDemo.app` y que `main.jsbundle` incluye la URL HTTPS de Railway. Esto verifica el destino integrado en el artefacto, no su ejecución. `artifacts/` está ignorado por Git. EAS indica caducidad del artefacto remoto el 11 de noviembre de 2026; la copia local queda disponible.

Para iPhone mediante EAS/distribución interna o TestFlight hace falta firma de Apple Developer. El propietario no tiene membresía activa y no se realizó contratación ni pago. Apple indica 99 USD por año, con precio local según región. Un Mac/Xcode permite pruebas personales gratuitas con perfiles que caducan en siete días. [Membresía Apple](https://developer.apple.com/programs/enroll/) y [Personal Team](https://developer.apple.com/help/account/basics/about-your-developer-account).

Recorrido pendiente en cada teléfono: abrir y cargar datos HTTPS; convertir USD a USDT; comprar 2 g de oro y comprobar descuento/portafolio; vender; publicar/cancelar oferta; solicitar/cancelar cotización de entrega; revisar historial; comprobar saldo insuficiente, pérdida de conexión/reintento y cierre/reapertura. Registrar modelo, versión del sistema, build y resultado. La etiqueta de simulación y el alcance por sesión deben permanecer visibles.

## Errores encontrados y pendientes

1. Railway CLI tenía una sesión vencida: renovada desde la sesión de navegador autorizada por el propietario.
2. Primer build Railway analizó la raíz del monorepo: corregido a `/api`.
3. El dominio se creó inicialmente para `3000` y el servicio escuchaba en `8080`: actualizado el puerto destino; HTTPS y smoke posterior aprobados.
4. Railway rechazó la ruta explícita a `railway.json` por deprecación de Config as Code: los ajustes activos se aplicaron por su API. Se conserva el archivo heredado; no se ha migrado a IaC.
5. El cliente móvil generaba otra clave tras una respuesta perdida y podía duplicar una compra: corregido con persistencia previa, timeout, bloqueo de pendientes y replay, probado por HTTP.
6. El reintento después de un fallo inicial de almacenamiento no recuperaba sesión: corregido y probado. El panel de operador ahora identifica explícitamente su alcance por sesión.
7. La detección automática de Node incluía el runner de PostgreSQL como test: runner renombrado y comando de tests acotado a `test/*.test.js`.
8. Docker Desktop local no llegó a iniciar su motor. La integración real se ejecutó satisfactoriamente en Railway sin abrir PostgreSQL al público.
9. Auditoría móvil: Expo `57.0.31` -> `@expo/cli 57.0.32` -> `zod 3.25.76`. [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5) reporta agotamiento de memoria; los tres avisos altos corresponden a esta cadena. El parche oficial está en Zod 4.6.6; no hay parche estable compatible de la rama 3 comprobado. No se impuso Zod 4 al CLI ni se aplicó el downgrade Expo 51 sugerido por audit. Pendiente solución compatible upstream; no se declara auditoría móvil limpia.
10. El perfil opcional `development` necesita `expo-dev-client`; no se usó. Los perfiles `preview`/`ios-simulator` no lo necesitan.
11. Firma iPhone y ejecución física pendientes. El panel de mina es ilustrativo por sesión; no hay inventario agregado multiusuario, autenticación de producción ni operaciones financieras reales.

## Reproducir comprobaciones

```powershell
Set-Location "$env:USERPROFILE\Projects\Openminerals\api"
npm ci
npm test
$env:REQUIRE_POSTGRES='true'
node scripts/smoke.mjs https://openminerals-api-demo.up.railway.app
Remove-Item Env:REQUIRE_POSTGRES

Set-Location "$env:USERPROFILE\Projects\Openminerals\mobile"
npm ci
npm test
npm run check
npx expo install --check
npx expo-doctor
npx eas-cli@latest build:list --limit 5
```

En una base de pruebas dedicada, definir `TEST_DATABASE_URL` y ejecutar `npm run test:postgres` desde `api/`. No imprimir esa variable ni añadirla a Git. En Railway se estableció en memoria desde `DATABASE_URL` dentro del proceso SSH del servicio; no fue necesario un acceso PostgreSQL público.
