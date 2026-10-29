# Openminerals 0.1.2 · Operaciones y comprobantes

Estado del 28 de octubre de 2026. Todos los importes, saldos y metales son ficticios. Este bloque implementa las prioridades de claridad de operaciones e historial; cuentas/roles, inventario compartido, custodia y blockchain siguen pendientes.

## Cambios implementados

- Conversión: importe entregado, tasa fija ficticia, importe recibido y saldos estimados antes de confirmar. Cálculo entero con redondeo hacia abajo igual que la API.
- Compra: mantiene desglose de gramos/base/comisión/total y añade saldo estimado posterior en la confirmación.
- Venta: gramos, precio, bruto, comisión, neto y saldos/posición estimados. Bloqueo de cantidades inválidas, gramos reservados o inexistentes y límites de saldo; validación definitiva en el servidor.
- Confirmación común mediante modal, con cancelación y protección ante doble pulsación. El cliente conserva la misma clave de una solicitud pendiente al reintentar.
- Comprobante posterior consultable: identificador, fecha, metal/divisas, cantidades, importes y saldos registrados al finalizar esa operación. Recuperar una operación no crea un nuevo movimiento.
- Pestaña **Actividad**: importes legibles, detalle por operación, historial paginado de veinte elementos, cargar más, actualizar y reintentar consultas sin borrar el saldo.

Los comprobantes nuevos tienen `receiptVersion: 2`, `label`, `balancesAfter` y precio por gramo cuando corresponde. Los anteriores conservan sus importes; si no guardaron precio o saldo histórico, la app indica que no fue registrado. No reconstruye un saldo pasado utilizando el saldo actual.

Se corrigió una referencia compartida: cancelar una oferta o solicitud podía cambiar su objeto dentro de un recibo anterior. Los nuevos comprobantes guardan copias independientes. No se reconstruyen datos antiguos que no se hayan conservado.

## API y compatibilidad

Lógica API publicada: `1e64965ab32e5bbc948055be80031dc22f7e7756`; construcción Docker publicada en `e4e1001b20d38b18867c7541fa5b33ac7ab3dc88`. Fuente móvil de la build: `90cce38886d99c8279c3b371f9539538956a0709`, versión 0.1.2, Android `versionCode: 3` y paquete existente `com.openminerals.demo.mobile`.

- `GET /api/demo/history?limit=20&before=<receiptId>` devuelve `{items,nextCursor,total,demoOnly:true}`; `before` se omite en la primera página y `limit` admite 1–50.
- `GET /api/demo/receipts/<id>` devuelve un comprobante de la misma sesión. Un identificador ajeno o inexistente devuelve 404; parámetros de historial inválidos, 400.
- El orden es fecha descendente con desempate por identificador. El cursor no es un desplazamiento numérico, evitando repetir filas cuando se añaden operaciones más recientes.
- Se consulta el mapa persistido de comprobantes, que ya se conservaba sin el recorte de cien movimientos recientes. No se eliminan ni reinician sesiones existentes ni se cambia su identificador local.

Sigue siendo JSONB de demostración por sesión, sin autenticación real, ledger contable ni blockchain. `COMPLETED` significa que el comando se registró; no acredita entrega, transferencia en una red ni custodia física. El panel de mina continúa por sesión y su resumen de movimientos recientes no es un consolidado global.

## Validación ejecutada

| Comprobación | Resultado |
| --- | --- |
| API local | 18 pruebas dominio/HTTP aprobadas; PostgreSQL se omite expresamente sin URL local |
| API CI | PostgreSQL 18 con seis subpruebas, incluida conservación de 106 comprobantes tras reconectar, aprobado |
| PostgreSQL Railway por SSH | Seis subpruebas aprobadas con fuentes API versionadas, en directorio y esquema temporales; sin modificar archivos del servicio ni reiniciarlo. No equivale a activar los endpoints HTTP nuevos |
| Smoke local | Guion original y `receipt-smoke.mjs` aprobados; el nuevo comprueba 109 recibos, snapshots, replay, cursor e aislamiento |
| Smokes HTTPS Railway | Ambos guiones aprobados exigiendo `postgres-demo`: 109 recibos, importes, snapshots, paginación, aislamiento, conversión, compra, venta y reservas |
| Compatibilidad y reinicio API | Estado/recibo de una sesión preparada con la API anterior conservados tras desplegar. Recibo v2, estado e historial conservados tras reinicio explícito de Railway y replay sin duplicar |
| Móvil | 28/28 pruebas aprobadas; incluye doce pares de divisas, ventas/redondeo y datos de comprobantes antiguos |
| Tipos y dependencias | TypeScript, `expo install --check` y Expo Doctor 21/21 aprobados |
| Export Android / iOS | Metro/Hermes aprobados: 597 / 599 módulos, con URL HTTPS Railway |
| UI en navegador, API local aislada | Conversión, cancelar confirmación, compra/venta, bloqueo por saldo/posición, comprobante histórico, recarga y paginación 20 → 21 comprobados |
| UI web con API Railway anterior | Conversión ficticia aislada de USD 0,01 aprobada; recibo antiguo muestra importes y avisa de snapshots ausentes. Historial HTTP 405 presenta un aviso de actualización pendiente sin borrar la sesión |
| UI web con API Railway nueva | Conversión USD 20, compra/venta de 0,5 g, recibos nuevos y consulta del recibo anterior comprobados con el backend desplegado |
| Inspección APK | [Run 40757332825](https://github.com/Blaister9/Openminerals/actions/runs/40757332825) aprobado: firma v2, mismo certificado, paquete, versión 0.1.2/3, minSDK 24, rutas de comprobantes y URL HTTPS |
| Android 0.1.2 del propietario | Confirmó actualización, historial conservado y comprobantes consultables. No comunicó importes exactos ni confirmó el recorrido completo de compra/venta en esta revisión |
| Maestro Android 0.1.2 | Falló la instalación del driver por caída del sistema Android emulado, antes de ejecutar escenarios; no se considera aprobado |
| iOS físico | Sigue pendiente por firma Apple; no se generó instalador físico nuevo |

En la sesión de UI local: USDT 250,00 iniciales; conversión de USD 20,00 → USDT 270,00; compra de oro 0,5 g por 73,23 → USDT 196,77; venta de 0,5 g con bruto 72,50, comisión 0,87 y neto 71,63 → USDT 268,40. Al abrir después el comprobante de compra, conservó USDT 196,77 y 0,5 g históricos. Se crearon dieciocho ingresos ficticios de USD 0,01 para verificar las dos páginas del historial; no se operó con la sesión del propietario.

La prueba web usa dependencias de desarrollo compatibles instaladas con Expo: `react-dom`, `react-native-web` y `@expo/metro-runtime`, siguiendo [la documentación oficial](https://docs.expo.dev/workflow/web/). No se sustituyó React Native/Expo. La auditoría conserva los ocho avisos transitivos ya conocidos: tres altos y cinco bajos en herramientas; no se hizo un override incompatible. Evidencias locales ignoradas por Git: `artifacts/qa-0.1.2-*-web-local.png` y los textos de snapshot/paginación. El backend de esa prueba fue **memory-demo local**, no el despliegue Railway nuevo.

Se preparó `mobile/e2e/trades.yaml` para conversión/compra/venta, comprobantes, cancelación y reapertura en un emulador desechable; sus diez capturas son previstas, no resultados obtenidos. No ejecutarlo sobre el teléfono del propietario: el flujo limpia el almacenamiento del emulador. El workflow admite ejecución manual con APK explícito y, en esta rama, un intento al publicar la URL del nuevo APK en `mobile/e2e/apk-0.1.2-url.txt`; los cambios de documentación o de otros tests no lo repiten. Comprueba el endpoint de historial antes de arrancar Android. Se prepara API 29, compatible con el mínimo 24 declarado por React Native, y un límite de veinte minutos para el paso de emulador. Esta configuración nueva tampoco se da por ejecutada; el resultado cancelado de la revisión anterior permanece documentado. Para lanzar `workflow_dispatch` en GitHub, el archivo debe estar disponible en la rama predeterminada tras su revisión.

Para reproducir la comprobación local en PowerShell, exportar desde `mobile/`:

```powershell
$env:EXPO_PUBLIC_API_URL='http://127.0.0.1:8085'
npx expo export --platform web --output-dir ../artifacts/web-0.1.2
```

En otra terminal local, desde la raíz del repositorio:

```powershell
$env:PORT='3007'
Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
$env:REQUIRE_DATABASE='false'
node api/src/server.js
```

Y en una tercera terminal desde la raíz:

```powershell
$env:OPENMINERALS_PREVIEW_API='http://127.0.0.1:3007'
node tools/preview-demo.mjs artifacts/web-0.1.2
```

Abrir `http://127.0.0.1:8085`. Estas variables solo corresponden a terminales locales de prueba. No modificar las variables del servicio Railway para probar memoria. Los exports nativos y el perfil EAS utilizan la URL HTTPS de Railway.

Evidencia de la ejecución PostgreSQL por SSH: `artifacts/railway-receipts-pg-20261028.log`. Se verificaron hashes de las fuentes del commit API antes de ejecutarlas en `/tmp`; la suite creó y eliminó su propio esquema. Se usó la conexión privada ya configurada sin copiar ni mostrar su valor. Esto prueba la lógica con PostgreSQL real, conservando pendiente la activación HTTP de la nueva API.

## Activación en Railway y APK

Tras activar la API nueva, se repitió conversión/compra/venta en la sesión aislada de QA de Railway que ya tenía la conversión legacy de USD 0,01. Su saldo pasó de USDT 250,01 a 270,01, después a 196,78 al comprar 0,5 g y a 268,41 al venderlos. El historial mostró las cuatro operaciones, incluida la anterior al despliegue. El comprobante de compra conservó 196,78 y 0,5 g aun después de vender. Capturas locales: `artifacts/qa-0.1.2-*-web-railway.png` y texto `qa-0.1.2-historical-buy-railway.txt`. No son capturas del teléfono ni del emulador.

La recarga posterior de la interfaz web mantuvo USDT 268,41 y cero oro, consultados de Railway; evidencia `artifacts/qa-0.1.2-reload-web-railway.txt`. El propietario confirmó por separado: «ya logré actualizar el app», «sí se conserva historial y puedo consultar comprobantes» (ortografía normalizada). Esa es evidencia física parcial comunicada por él, sin modelo Android, importes ni capturas aportados; no se extiende a operaciones que no describió.

El primer despliegue de la API nueva fue rechazado con `Deploys have been paused temporarily`; el panel mostró **Limited Access**. [Incidencia oficial](https://status.railway.com/incident/Z1JDWW1W), identificada el 28 de octubre a las 17:49 UTC. Durante esa pausa la API anterior siguió respondiendo en `postgres-demo` y `/api/demo/history` devolvía 405.

Railway marcó la incidencia resuelta a las 19:17 UTC. Los intentos posteriores `5712524c-edae-4772-93e5-c0ba1e45ecd7` y `498771b7-40d2-4b54-9b5a-0f7b395e393b` fallaron antes de instalar o arrancar: Railpack 0.43.0 devolvió `frontend grpc server closed unexpectedly`. Ambos reconocieron Node 22.23.3 y el paquete API. Logs locales: `artifacts/railway-receipts-build-5712524c.log` y `artifacts/railway-receipts-build-498771b7.log`.

Este fallo repetido justificó añadir `api/Dockerfile` como construcción alternativa, [admitida por Railway](https://docs.railway.com/builds/dockerfiles), conservando la lógica API. Usa Node oficial 22.23.3 Alpine fijado por digest verificado, `npm ci`, lockfile, usuario sin privilegios y exclusión de `.env`. Se alinea el valor heredado de `api/railway.json`; la configuración explícita de ese archivo continúa sin ser la fuente activa. Docker se validó en la construcción y ejecución de Railway, no mediante un Docker local en este equipo.

**Activación aprobada:** deployment `b623b0b8-4bf8-4763-a15c-dc64b85cd26b`, estado `SUCCESS`, imagen Docker construida desde fuentes Git limpias de `e4e1001`. API pública `https://openminerals-api-demo.up.railway.app`; `/health` devuelve `ok:true`, `mode:postgres-demo`, `demoOnly:true`, y el historial nuevo responde 200. Se conserva la conexión del servicio al repositorio oficial. Esta revisión se publicó desde el archivo de fuentes versionadas mediante CLI; el PR sigue pendiente de integración en `main`.

Evidencias: `artifacts/railway-receipts-build-b623b0b8.log`, `artifacts/railway-receipts-deployment-b623b0b8.json`, `artifacts/railway-receipts-https-smoke-20261028.log` y `artifacts/railway-original-https-smoke-20261028.log`.

Se preparó una compra ficticia con la API anterior y se guardó un snapshot fuera de Git en `%LOCALAPPDATA%/Openminerals/verification/railway-pre-receipts-20261028.json`. Su verificación después del despliegue pasó: estado y comprobante idénticos, replay sin duplicar. No se reinició el servicio durante la pausa.

Después se guardó un recibo v2 nuevo en `railway-receipts-v2-20261028.json`, en esa misma carpeta, y se ejecutó `railway restart` únicamente sobre el servicio API de `demo`. El log registra arranque inicial a las 19:34:06 UTC y nuevo arranque de Node a las 19:36:16 UTC (`artifacts/railway-receipts-restart-20261028.log`). La verificación posterior confirmó estado, comprobante y snapshots idénticos, replay y consulta paginada sin duplicar ni perder la operación. Se probaron sesiones sintéticas distintas a la del propietario.

Build Android [EAS 812187c7](https://expo.dev/accounts/chipirips-team/projects/openminerals-demo/builds/812187c7-8dad-412c-8267-03b989df72c1), desde la fuente limpia indicada arriba: **FINISHED**, sin error, terminada a las 19:42:47 UTC. [APK 0.1.2](https://expo.dev/artifacts/eas/qfWvChA9T4G-qhjzFQMCLbcDrDvDz25TDbW3GGodKTQ.apk); copia local `artifacts/openminerals-android-0.1.2-812187c7.apk`, 68.548.005 bytes, SHA-256 `9801CAAF75AA5FC3603CC65EA6EB7FE6654E9301748BFA02C7CEF7437BC0CD90`. El bundle contiene Railway HTTPS, vistas previas, comprobantes, historial y cursores. La inspección de firma/versión del APK y la ejecución nativa se registran por separado; compilar no valida las pantallas en Android.

La inspección posterior de `apksigner` confirmó firma v2 válida y el mismo certificado SHA-256 público `3ae9a19077ab3f434b5885981d35e3d29966e406e7438b8f0558c155d47e3e1c`. El hash de CI coincide con la copia local. Evidencias descargadas en `artifacts/apk-inspection-run-40757332825/extracted/`. Se entregó para instalar como actualización; el propietario confirmó actualización, historial y consulta de comprobantes con el alcance parcial registrado arriba.

El [intento nativo 40757332725](https://github.com/Blaister9/Openminerals/actions/runs/40757332725), job `123059641860`, terminó **FAILURE** a las 20:06:44 UTC. Pasó preflight de historial/salud PostgreSQL y firma; el APK instaló con `Success` a las 20:05:40. Maestro falló al instalar su controlador: `Failure calling service package: Broken pipe (32)` en `installMaestroDriverApp`. Logcat registra `DeadSystemException` en servicios Android. El fallo ocurrió antes de ejecutar escenarios; no se atribuye a una aserción fallida de Openminerals ni se presenta como prueba UI aprobada.

Diagnósticos descargados en `artifacts/android-ui-run-40757332725/`: ZIP `artifact-12846863249.zip`, log completo `monitor-job-123059641860.log` y carpeta `extracted/`. Hay consola de Maestro y logcat, pero no JUnit ni capturas de escenarios; la captura final está negra y no acredita UI funcional. No se hicieron reintentos adicionales. La actualización y consulta de comprobantes en el Android del propietario están confirmadas; el recorrido completo físico sigue pendiente. No se contrató otro plan ni se conectó una red blockchain para resolver la pausa de despliegue.
