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

Fuente API publicada: `1e64965ab32e5bbc948055be80031dc22f7e7756`. Fuente móvil de la build: `90cce38886d99c8279c3b371f9539538956a0709`, versión 0.1.2, Android `versionCode: 3` y paquete existente `com.openminerals.demo.mobile`.

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
| Móvil | 28/28 pruebas aprobadas; incluye doce pares de divisas, ventas/redondeo y datos de comprobantes antiguos |
| Tipos y dependencias | TypeScript, `expo install --check` y Expo Doctor 21/21 aprobados |
| Export Android / iOS | Metro/Hermes aprobados: 597 / 599 módulos, con URL HTTPS Railway |
| UI en navegador, API local aislada | Conversión, cancelar confirmación, compra/venta, bloqueo por saldo/posición, comprobante histórico, recarga y paginación 20 → 21 comprobados |
| UI web con API Railway anterior | Conversión ficticia aislada de USD 0,01 aprobada; recibo antiguo muestra importes y avisa de snapshots ausentes. Historial HTTP 405 presenta un aviso de actualización pendiente sin borrar la sesión |
| UI Android 0.1.2 | Pendiente; no se deduce de la prueba web ni de compilar |
| iOS físico | Sigue pendiente por firma Apple; no se generó instalador físico nuevo |

En la sesión de UI local: USDT 250,00 iniciales; conversión de USD 20,00 → USDT 270,00; compra de oro 0,5 g por 73,23 → USDT 196,77; venta de 0,5 g con bruto 72,50, comisión 0,87 y neto 71,63 → USDT 268,40. Al abrir después el comprobante de compra, conservó USDT 196,77 y 0,5 g históricos. Se crearon dieciocho ingresos ficticios de USD 0,01 para verificar las dos páginas del historial; no se operó con la sesión del propietario.

La prueba web usa dependencias de desarrollo compatibles instaladas con Expo: `react-dom`, `react-native-web` y `@expo/metro-runtime`, siguiendo [la documentación oficial](https://docs.expo.dev/workflow/web/). No se sustituyó React Native/Expo. La auditoría conserva los ocho avisos transitivos ya conocidos: tres altos y cinco bajos en herramientas; no se hizo un override incompatible. Evidencias locales ignoradas por Git: `artifacts/qa-0.1.2-*-web-local.png` y los textos de snapshot/paginación. El backend de esa prueba fue **memory-demo local**, no el despliegue Railway nuevo.

Se preparó `mobile/e2e/trades.yaml` para conversión/compra/venta, comprobantes, cancelación y reapertura en un emulador desechable; sus diez capturas son previstas, no resultados obtenidos. No ejecutarlo sobre el teléfono del propietario: el flujo limpia el almacenamiento del emulador. El workflow nativo pasa a ejecución manual, exige el APK explícito y comprueba el endpoint de historial antes de arrancar Android; evita repetir automáticamente el intento lento sobre la versión anterior. Se prepara API 29, compatible con el mínimo 24 declarado por React Native, y un límite de veinte minutos para el paso de emulador. Esta configuración nueva tampoco se da por ejecutada; el resultado cancelado de la revisión anterior permanece documentado. Para lanzar `workflow_dispatch` en GitHub, el archivo debe estar disponible en la rama predeterminada tras su revisión.

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

El despliegue de la API nueva fue rechazado con `Deploys have been paused temporarily`; el panel muestra **Limited Access** y una incidencia de despliegues. [Incidencia oficial](https://status.railway.com/incident/Z1JDWW1W), identificada el 28 de octubre a las 17:49 UTC. La API anterior sigue respondiendo en `postgres-demo`; `/api/demo/history` todavía devuelve 405. Por tanto, los endpoints nuevos no se declaran publicados ni probados en ese servicio.

Se preparó una compra ficticia con la API anterior y se guardó un snapshot fuera de Git en `%LOCALAPPDATA%/Openminerals/verification/railway-pre-receipts-20261028.json` para verificar compatibilidad después del despliegue. Esa comprobación posterior continúa pendiente; no se reinició el servicio durante la pausa.

Build Android solicitada en [EAS 812187c7](https://expo.dev/accounts/chipirips-team/projects/openminerals-demo/builds/812187c7-8dad-412c-8267-03b989df72c1), desde la fuente limpia indicada arriba. Estado inicial: en cola. No se publica un enlace de instalación como actualización funcional completa mientras la build y la activación del backend estén pendientes.

Cuando Railway permita desplegar: subir el código API versionado al servicio existente del entorno `demo`, comprobar salud PostgreSQL, ejecutar `receipt-smoke.mjs` y el guion original en sesiones nuevas, verificar el snapshot anterior y completar instalación/recorrido Android. No contratar otro plan ni conectar una red blockchain para intentar resolver una pausa de despliegue.
