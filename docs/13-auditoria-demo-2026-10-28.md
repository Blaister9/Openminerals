# Auditoría de Openminerals para continuar la demo móvil

Revisión del **28 de octubre de 2026**, sobre `022332683e6f05491abb25a9846af57d32368348`. La base existente funciona y debe conservarse. **La aplicación no tiene aceptación móvil completa**: Android 0.1.3 dispone de APK instalable, pero sus cuentas y almacenamiento nativo siguen pendientes de recorrido; iPhone no tiene instalador 0.1.3 firmado comprobado. Todos los importes, metales, precios, existencias y entregas son SIMULADOS.

## Repositorio publicado

- Clon auditado: `C:\Users\santi\Documents\Openminerals`.
- Remoto y propietario comprobados mediante Git y GitHub CLI: [Blaister9/Openminerals](https://github.com/Blaister9/Openminerals), repositorio público; la sesión GitHub corresponde a `Blaister9`.
- Rama local inicial: `codex/audit-demo-20261028`; al comenzar seguía `origin/codex/mobile-overview-scroll-20261028`. Ambas apuntaban a `0223326` después de `git fetch origin`.
- Los **83 archivos versionados** coincidían con el árbol remoto: móvil, API, documentación, PDF, lockfiles, workflows, Dockerfile, `api/railway.json`, herramientas y acceso público demo. No hay que reimportar el ZIP.
- `git status --porcelain`, archivos sin seguimiento y `git diff --check` no mostraron cambios pendientes al comenzar ni después de las pruebas. Los directorios ignorados contienen dependencias, cachés y artefactos de QA; no son funciones inéditas sin publicar ni deben subirse completos.
- [Commit 0223326](https://github.com/Blaister9/Openminerals/commit/022332683e6f05491abb25a9846af57d32368348) incorporado a la rama de trabajo. [PR #1](https://github.com/Blaister9/Openminerals/pull/1) abierto hacia `main`; **`main` todavía conserva la versión anterior**.
- [CI de ese commit](https://github.com/Blaister9/Openminerals/actions/runs/40775713367) aprobada. El log confirma **14 comprobaciones PostgreSQL, 0 fallos y 0 omisiones**. Es una ejecución existente consultada, separada de las pruebas locales de esta auditoría.

Los cambios de esta auditoría son documentación y una herramienta reproducible de verificación de reinicio. No cambian la aplicación ni el motor de simulación y no fusionan el PR #1.

## Tres estados funcionales

| Estado | Alcance comprobado o pendiente |
| --- | --- |
| **Implementado y probado** | Backend y pruebas del cliente para billeteras COP/EUR/USD/USDT, ingresos/retiros, conversión a tasas fijas, compra/venta de oro/plata/platino/paladio, portafolio, reservas y cancelaciones, historial paginado, comprobantes e idempotencia. Cuentas comprador/operador, importación legacy transaccional y origen en consulta, permisos, privacidad e inventario compartido cuentan con pruebas automatizadas. Tres smokes HTTPS y reinicio real de API aprobaron en PostgreSQL. Las ofertas solo se publican/cancelan; la entrega solo se solicita/cancela. |
| **Implementado pero pendiente de pruebas** | Recorrido completo Android 0.1.3 de registro/login, importación, roles, Mina y stock; SecureStore real, actualización sin pérdida de datos, reapertura y operaciones pendientes ante desconexión. Ejecución nativa iOS completa. El guion `mobile/e2e/accounts.yaml` existe, pero no se ejecutó. La animación 2.5D existe y sigue sin aceptación visual. |
| **Todavía no desarrollado** | Marketplace con catálogo compartido, aceptación y liquidación entre compradores; trazabilidad por lotes, origen, pureza y documentos DEMO; ciclo de custodia y cotización/aceptación/entrega simulado completo; cambio/recuperación de contraseña; backoffice empresarial completo; scrollytelling 3D final. |

El panel Mina ya permite consultar inventario, reservas, operaciones y comprobantes, además de registrar reposiciones ficticias. No debe reconstruirse. Su alcance es una administración de demostración; no acredita inventario físico auditado, custodia o un backoffice terminado.

## Pruebas de esta auditoría

Node local `22.22.3`. Se reinstalaron las dependencias desde ambos lockfiles con `npm ci`; no cambiaron paquetes ni lockfiles.

| Entorno y comprobación | Resultado |
| --- | --- |
| API local `npm test` | **31 aprobadas, 0 fallidas; 2 suites PostgreSQL omitidas** porque falta `TEST_DATABASE_URL` local |
| API local, proceso propio en puerto efímero | `smoke.mjs`, `receipt-smoke.mjs` y `accounts-smoke.mjs` aprobados en `memory-demo`; proceso cerrado al terminar |
| Comprobaciones adicionales de dominio | 12 pares de conversión y cuatro metales: compra, reservas de oferta/entrega, rechazo de venta reservada, cancelación y venta completa aprobados; no equivalen a recorridos de pantallas |
| Móvil `npm test` | **45/45 aprobadas**, sin omisiones |
| Móvil `npm run check` | TypeScript correcto |
| `npx expo install --check` | Dependencias compatibles; se conserva SDK 57 |
| `npx expo-doctor` | **21/21** |
| Export con API HTTPS | Android/Hermes, iOS/Hermes y web correctos; archivos nuevos fuera de Git |
| Railway HTTPS | Tres smokes aprobados en `postgres-demo`: operaciones, 109 comprobantes/paginación e inventario/cuentas |
| Reinicio de la API Railway | Preparación y verificación de sesión legacy y de mina aislada con dos compradores y operador aprobadas; detalle debajo |
| Navegador, emulador y teléfonos | Ningún recorrido nuevo en esta auditoría. No se usó control de pantalla, no se inició emulador y `adb devices -l` no mostró teléfonos conectados |

Los smokes de cuentas crean una mina sintética aislada. Comprobaron dos compradores compitiendo por stock, una compra rechazada por existencias insuficientes, respuestas 403, rechazo de registro público como operador, replay sin duplicar, reposición, conciliación y revocación/logout. El operador no recibe los snapshots privados de billetera ni los comprobantes de ingresos/conversiones del comprador. No se utilizaron la cuenta pública ni el inventario principal para estos ensayos.

### Corrección del diagnóstico de coma decimal

**El supuesto fallo de ingreso/retiro del informe anterior no se reproduce en la fuente actual.** `mobile/App.tsx` normaliza `amount` y `grams` antes de confirmar y enviar la operación. Se ejecutaron las funciones reales `perform` y `confirmOperation`, extraídas/transpiladas con estado aislado: tanto ingreso como retiro con `" 1,25 "` entregaron `amount:"1.25"` a `client.submit`.

La API rechaza directamente `amount:"1,25"` con HTTP 422 y acepta `"1.25"`. Eso describe el contrato decimal canónico de la API y no demuestra un fallo de la pantalla. Queda pendiente pulsar ese recorrido en teléfono; no corresponde aplicar una corrección de código sin un fallo reproducido.

## Railway y persistencia

Se inspeccionaron los proyectos existentes y se trabajó exclusivamente en el entorno **`demo`** de [openminerals-demo](https://railway.com/project/1442be94-b13f-4067-9fee-ea99caf5715a). No se modificó `production` ni se crearon servicios o bases nuevos.

| Recurso | Estado observado |
| --- | --- |
| Proyecto | `1442be94-b13f-4067-9fee-ea99caf5715a` |
| Entorno demo | `1e835541-fd3a-49dd-8ae3-0315d4118940` |
| API `openminerals-api` | `00e2d919-2cd1-4293-befd-d8af58df8069`, deployment `9d5af81f-ba92-411b-a695-4fff1c7ea780`, **SUCCESS** |
| Fuente desplegada | `b5e17a2`, con contenido de `api/` idéntico al commit auditado `0223326` |
| Configuración API | GitHub, rama `codex/mobile-overview-scroll-20261028`, raíz `/api`, Dockerfile `/api/Dockerfile`, vigilancia `/api/**`, espera de CI y healthcheck `/health` |
| PostgreSQL | `4cedb5b6-dbf2-4a3c-8a97-4c11df009e44`, PostgreSQL 18, **SUCCESS**, volumen montado de 5.000 MB, sin dominio público ni proxy TCP |
| Variables comprobadas sin publicar valores | `REQUIRE_DATABASE=true`, `NODE_ENV=production`, conexión PostgreSQL con host privado y token administrativo presente de al menos 32 caracteres |
| [Salud HTTPS](https://openminerals-api-demo.up.railway.app/health) | `ok:true`, `demoOnly:true`, `mode:postgres-demo` |

Railway señala tres despliegues fallidos anteriores; no son el deployment activo. Las revisiones documentales posteriores aparecen `SKIPPED`, coherentes con la vigilancia exclusiva de `/api/**`. No se debe afirmar que `0223326` fue desplegado como imagen nueva: sigue activa la fuente indicada arriba, cuyo código API coincide.

Se prepararon snapshots fuera de Git y después se reinició únicamente `openminerals-api` mediante Railway. El log muestra un nuevo arranque `Openminerals DEMO API 8080 (postgres-demo)` el **28 de octubre a las 23:56:01 UTC / 18:56:01 Bogotá**. La verificación posterior aprobó:

- Misma identidad y tokens válidos de dos compradores y un operador.
- Hashes canónicos de billeteras, posiciones, historial y resumen de mina conservados.
- Inventario aislado de oro: 2.000 mg disponibles + 1.000 mg asignados = 3.000 mg totales; 250 mg reservados dentro de lo asignado.
- Comprobantes originales conservados y replay de ambas compras, oferta y reposición sin duplicaciones.
- Permisos 403, aislamiento de comprobantes y omisión de saldos privados en la vista del operador.
- Sesión legacy conservada, mismo estado/comprobante y compra repetida reconocida como replay.

La importación legacy tiene cobertura local/CI PostgreSQL. Esta prueba remota de reinicio no volvió a importar una sesión en la mina principal. Tampoco prueba restauración de un backup ni reinicio del servidor PostgreSQL.

## Credenciales y dependencias

El escaneo acotado de 83 archivos versionados y 301 objetos de historial alcanzable no encontró patrones inesperados de secretos. No hay `.env`, llaves privadas ni `credentials.json` versionados. No es una auditoría de seguridad exhaustiva.

El [acceso público del operador DEMO](https://github.com/Blaister9/Openminerals/blob/codex/mobile-overview-scroll-20261028/demo-access/operator-public.json) está autorizado por el propietario. Es una cuenta compartida capaz de modificar inventario ficticio; no debe reutilizarse con datos privados. El respaldo AES-256-GCM no incluye su clave; tokens, conexión PostgreSQL y credenciales administrativas no se publicaron ni se añadieron a `EXPO_PUBLIC_`.

Las cuentas usan scrypt y tokens revocables almacenados como hash en backend. El cliente usa SecureStore nativo y no persiste contraseñas; su comprobación en teléfono sigue pendiente. Las sesiones legacy no son autenticación segura; el límite de intentos es local al proceso y no hay recuperación de contraseña.

`npm audit --json`: **API 0 vulnerabilidades; móvil 8 avisos, 3 altos y 5 bajos**. Las causas raíz están en `zod@3.25.76` y `deepmerge@4.3.1`, dentro de las herramientas Expo. `expo` aparece como dependencia directa afectada por esa cadena. No se aplicó `audit fix --force`: npm propone bajar a Expo 51.0.39 y no hay una corrección compatible verificada para SDK 57. Evaluar una actualización soportada en una revisión separada, conservando regresiones y builds.

## Instalación Android e iPhone

**Android disponible:** [APK 0.1.3 en GitHub](https://github.com/Blaister9/Openminerals/releases/download/v0.1.3-demo/Openminerals-Demo-0.1.3-android.apk), paquete `com.openminerals.demo.mobile`, `versionCode:4`. La metadata de GitHub y el SHA-256 del APK local coinciden: `fda0953d11a6035100bef9f9c04d070053edc2ae47c31852803a020d89e6b7c7`, 68.772.781 bytes. [Inspección binaria anterior aprobada](https://github.com/Blaister9/Openminerals/actions/runs/40770949478); no sustituye una prueba de pantallas.

Instalar como actualización **sin desinstalar ni borrar datos**. Confirmar los saldos previos, crear comprador con importación explícita o iniciar cuenta existente, y recorrer USD→USDT, compra de 2 g si hay saldo suficiente, comprobante/portafolio, venta, oferta/cancelación, solicitud/cancelación de entrega e historial. Probar saldo insuficiente, doble envío, desconexión, reapertura y otra instancia. Entrar como operador con el acceso público y contrastar stock/operaciones. Registrar modelo, versión Android, build y resultados. No ejecutar `accounts.yaml` con `clearState:true` sobre un teléfono con datos a conservar.

**iPhone pendiente:** no hay un instalador físico 0.1.3 firmado comprobado. Se necesita sesión Expo autorizada y certificados/provisionamiento Apple para distribución interna o TestFlight. El perfil `preview` ya fija la API HTTPS; `ios-simulator` genera para simulador. El [artefacto iOS 0.1.0 conservado](https://expo.dev/artifacts/eas/0UbmdUNFLWCt8ZNcUp7oIunu-2EKjEtqV2A63lRyXTk.tar.gz) no se instala en iPhone y no fue ejecutado.

La consulta actual `eas build:list` no pudo autenticarse en este equipo; no se inició login ni una compilación. El ID Android EAS `269f285b-f16b-4c82-9c9a-35a3a5082bc5` y su estado de compilación corresponden a evidencia anterior; la disponibilidad del APK sí se contrastó con GitHub y el archivo local. No se regeneraron credenciales de firma Android.

## Próximo objetivo y criterio de cierre

Conservar la base y cerrar primero la aceptación nativa Android 0.1.3; preparar firma/build iPhone cuando estén disponibles las credenciales. Después completar el alcance DEMO solicitado: marketplace entre dos compradores con liquidación atómica e idempotente, lotes/documentos ficticios por posición y ciclo de cotización/custodia/entrega gestionado por la mina. El panel actual debe ampliarse a esos estados, manteniendo privacidad e inventario conciliado.

La demo solo puede declararse terminada cuando sus recorridos principales funcionen en builds instalables con resultados registrados y aceptación nativa; el bloqueo iOS debe quedar explícito si continúa. Export, CI, capturas y presencia de código no bastan. No se conectarán fondos, metales, blockchain ni custodia reales.

## Comandos reproducibles

Desde cada paquete: `npm ci`, `npm test`; en `mobile/`: `npm run check`, `npx expo install --check` y `npx expo-doctor`. Para PostgreSQL de pruebas, definir `TEST_DATABASE_URL` fuera de Git y ejecutar `npm run test:postgres` en `api/`. Los tests usan esquemas aislados.

Desde la raíz, con `REQUIRE_POSTGRES=true` en el entorno, ejecutar los tres smokes contra `https://openminerals-api-demo.up.railway.app`: `node api/scripts/smoke.mjs URL`, `node api/scripts/receipt-smoke.mjs URL` y `node api/scripts/accounts-smoke.mjs URL`. Solo el de cuentas requiere `DEMO_ADMIN_TOKEN` del gestor de secretos en el entorno del proceso; no poner su valor en comandos, logs o archivos del repositorio.

Para repetir la persistencia: `node api/scripts/persistence.mjs prepare URL SNAPSHOT_LEGACY_FUERA_GIT` y `node tools/verify-accounts-persistence.mjs prepare URL SNAPSHOT_CUENTAS_FUERA_GIT`; reiniciar explícitamente la API demo, confirmar su nuevo arranque, y ejecutar ambos con `verify`. El segundo prepare requiere el token administrativo. Los directorios de snapshots deben existir fuera de cualquier checkout Git. Los snapshots de cuentas contienen tokens sintéticos privados: no publicarlos. Los scripts verifican el estado, pero el reinicio debe acreditarse por separado en Railway.
