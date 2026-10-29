# Android nativo en CI, actualización 0.1.3 → 0.2.0

Este recorrido está preparado; su presencia y las pruebas de sus validadores **no prueban instalación ni aceptación nativa**. Solo una ejecución posterior del workflow con un APK real puede aportar esa evidencia. No se ha iniciado un emulador local ni se usa control de pantalla.

El workflow Android UI verification es exclusivamente manual, en ubuntu-24.04 estándar y repositorio público, con concurrencia de una ejecución. Repara permisos KVM mediante udev y exige aceleración accesible; no continúa con CPU sin aceleración. El renderizador gráfico SwiftShader del emulador es independiente de KVM. No acredita rendimiento en un teléfono.

El huésped usa 4 cores y 4096 MiB en ese mismo runner estándar. La [tabla oficial de GitHub para repositorios públicos](https://docs.github.com/en/actions/how-tos/write-workflows/choose-where-workflows-run/choose-the-runner-for-a-job) asigna 4 CPU y 16 GB a ubuntu-24.04; no se solicita un larger runner. host-resources.json registra los recursos disponibles y el job aborta si no dispone al menos de 4 CPU y 8 GiB de RAM.

## Preparación del propietario

1. Publicar la API 0.2.0 con PostgreSQL. El helper exige health.apiVersion=0.2.0, demoOnly=true y mode=postgres-demo.
2. Provisionar una **mina nueva aislada** con id mine-* y nombre Native QA DEMO <tag>. Dos compradores y un operador de esa misma mina; exactamente dos compradores, XAU 5000 mg disponibles/5000 mg total/0 mg asignados. Usar las políticas iniciales de entrega: jurisdicción DEMO A, servicio 2/preparación 3/transporte 5 USDT, seguro/impuesto ficticio 0 y requisitos iniciales. Compradores sin movimientos, posiciones, ofertas ni solicitudes; saldos iniciales 250 USDT y 600 USD.
3. Configurar únicamente estos seis secretos temporales de GitHub, alias de 3–40 caracteres y claves aleatorias de 16–128 caracteres ASCII alfanuméricos, guion o guion bajo:
   - OPENMINERALS_QA_BUYER_A_ALIAS
   - OPENMINERALS_QA_BUYER_A_PASSWORD
   - OPENMINERALS_QA_BUYER_B_ALIAS
   - OPENMINERALS_QA_BUYER_B_PASSWORD
   - OPENMINERALS_QA_OPERATOR_ALIAS
   - OPENMINERALS_QA_OPERATOR_PASSWORD
4. Introducir como inputs públicos apk_url y apk_sha256 de un APK 0.2.0/versionCode 5 real. Se aceptan únicamente URLs HTTPS públicas de artefactos Expo o releases de Blaister9/Openminerals, sin credenciales, query ni fragmento. Firma, paquete, hash, versión y ABI x86_64 son obligatorios antes de arrancar. El input opcional ota_update_id acepta el UUID completo de una actualización Android ya publicada y verificada, compatible con runtime 0.2.0 y canal demo; dejarlo vacío omite la etapa OTA. El helper exige UUID canónico en minúsculas antes de usar CLI o API.
5. Disparar manualmente desde código revisado. Retirar los seis secretos tras la aceptación. GitHub no proporciona caducidad automática: el propietario realiza esta retirada. Una repetición necesita fixtures nuevos; no se reinicia ni borra una mina ya utilizada.

No introducir DEMO_ADMIN_TOKEN, DATABASE_URL, claves EAS/Railway, claves de recuperación ni credenciales del operador público en este workflow. La provisión administrativa se realiza fuera de GitHub Actions. No guardar archivos de credenciales en Git.

## Qué recorre

El helper rechaza equipos físicos, múltiples dispositivos, otros sistemas operativos y ejecución fuera de GitHub Actions. Se instala el APK 0.1.3 verificado, código 4, certificado SHA-256 3ae9a19077ab3f434b5885981d35e3d29966e406e7438b8f0558c155d47e3e1c. El flujo anterior trades.yaml crea una sesión ilustrativa independiente con tres operaciones: USDT 268,40 y comprobante antiguo de compra con USDT 196,77.

El cuarto run observó launcher tras el fallo al buscar el primer campo de Billetera. Eso no demuestra falta de etiqueta ni prueba todavía si hubo superposición con Home o un crash. Como ensayo diagnóstico A/B, únicamente la siembra del APK antiguo solicita immersive.navigation para com.openminerals.demo.mobile: exige código 4 y policy_control inicial null; elimina la política en finally incluso si el flujo falla y verifica null. Otra guarda impide install-r mientras no estén restauradas las barras normales. legacy-navigation.json registra el resultado y marca explícitamente la hipótesis. El APK 0.2.0 se prueba siempre con navegación normal; no se presenta la adaptación como aceptación de 0.1.3 con sus barras originales.

Después se ejecuta **adb install -r** del APK nuevo, sin desinstalar, borrar almacenamiento ni clearState. Se verifican código 5, wallet anterior, historial 3 y snapshot antiguo. Se recorren las cinco escenas, disponibilidad del renderizador 3D, arrastre, movimiento reducido y salida a Mercado. Las imágenes públicas se limitan a estas fases anónimas anteriores a cualquier credencial.

El registro nativo usa alias/clave nuevos solo en RAM, desactiva explícitamente la importación y no realiza operaciones. Al cerrar sesión recuperaUSDT 268,40. La cuenta pública nueva inicia sin historial/metales y no consume inventario del propietario. **La importación nativa de una sesión a una cuenta sigue siendo una aceptación distinta**; no se presenta este registro como prueba de importación.

Las tres identidades aisladas recorren:

- Comprador A: USD 200→USDT 450; compra 2 g oro→USDT 157,10; consulta certificado; publica 0,5 g a 140 USDT/g.
- Comprador B: abre la oferta y la compra completa por 70 USDT→USDT 180/0,5 g; consulta su certificado.
- Comprador A: recibe 69,16 USDT netos; vende 0,5 g→USDT 297,89; solicita entregar 0,5 g en jurisdicción DEMO A.
- Operador: emite cotización 10 USDT. A lee requisitos y acepta→USDT 287,89. Operador registra preparación, despacho y entrega ficticios, repone 1 g con pureza/ubicación/documento DEMO y consulta gestión/comprobante.
- A consulta su compra histórica con snapshot USDT 157,10, guarda perfil ficticio EUR/jurisdicción B y reabre la app con identidad y wallet conservadas.

Las aserciones nativas se complementan con lecturas API de esas mismas cuentas: posiciones finales A/B 500 mg, lotes origen transferidos, inventario 4500 mg + asignado 1000 mg = activo 5500 mg, peso original 6000 mg y entregado 500 mg, cero reservas, una reposición, una liquidación peer y 461 centésimas de comisiones de trading sin duplicación. El coste de entrega es 1000 centésimas separado. Se comprueba también que la gestión no exponga billeteras. Estas lecturas no sustituyen las aserciones de interfaz.

La conversión de A, su compra/certificado y su oferta son tres subflujos consecutivos con un solo login; el operador divide entrega y reposición/gestión conservando la misma identidad y pantalla. No se repite una orden al cambiar de subflujo. Cada invocación Maestro conserva siete minutos de margen: el timeout usa SIGKILL, sin esperar indefinidamente una JVM que maneje SIGTERM. ADB tiene límites de 180 segundos para instalar, 30 para dumpsys/pull/push y 20 para el resto; los diagnósticos tienen 15 segundos. Los límites globales continúan en 35 minutos para la acción nativa y 45 para el job.

## Evidencia y diagnóstico público

Solo se sube openminerals-native/public, retención un día:

- Metadatos públicos de APKs y certificados, aceleración y versión Maestro.
- progress.json y progress.ndjson se escriben antes de cada etapa/comando y después de su resultado, con nombres fijos, timestamps, programas/operaciones permitidos, deadline y resultado seguro. No contienen argumentos, entorno, alias, claves, salida de procesos ni errores raw. Una cancelación puede dejar RUNNING: no se transforma en aprobación. lastFailure conserva un timeout o error de proceso aunque la limpieza ADB posterior pase.
- JUnit regenerado desde el resultado real de cada etapa/ejecución Maestro; etiquetas fijas y fallos conservados. No contiene detalles XML originales.
- Resumen de etapas y, si falla Maestro, failure-context.json con categoría cerrada y selectores/últimos comandos que coinciden exclusivamente con textos estáticos del YAML. Jamás se copia una línea raw.
- PNGs con nombres permitidos, capturados únicamente antes de autenticación.

Si falla exclusivamente legacy-seed-old-apk, antes de introducir credenciales y tras una instalación limpia del APK 0.1.3, se permite safe-legacy-failure.png. El helper exige que solo hayan terminado las etapas de aislamiento e instalación anterior; rechaza todos los fallos posteriores, incluidos registro, cuentas, recuperación y OTA. La captura real exige GitHub Linux y un serial de emulador.

En esa misma excepción se guarda uiautomator.xml únicamente en private y se publica safe-legacy-ui.json: clase, bounds, enabled y scrollable; solo para EditText se admiten text numérico y contentDescription que coincida con etiquetas literales del flujo o importes/números. Se rechazan comodines, declaraciones XML y valores privados conocidos. El parser usa xml.etree de Python 3 ya disponible en Ubuntu, sin nuevas dependencias npm. Si no puede capturar o filtrar, publica un estado fijo unavailable; nunca XML ni stderr originales. El PNG corresponde a la secuencia anónima anterior y no se habilita para otros fallos.

También se permiten safe-legacy-before-wallet.png y safe-legacy-after-wallet.png, copias de capturas manuales justo antes/después del primer tap, anteriores al cierre de Maestro. Una aserción del encabezado CUENTAS MULTIDIVISA identifica la navegación antes de buscar el campo. safe-legacy-runtime.json publica solo PID vivo como booleano, foreground como booleanos/identificador de paquetes conocidos, clases Java fatales y señales nativas conocidas asociadas exclusivamente al proceso de Openminerals, sin mensajes de excepción, extras de actividades, PIDs ni logcat. El estado posterior a la salida CLI no se equipara automáticamente con lo que ocurrió dentro del flujo.

Consola Maestro, XML original, debug, jerarquías sin filtrar, capturas automáticas de errores y cualquier log sensible permanecen privados en RUNNER_TEMP y no se publican. No se toma una captura de recuperación ni se generan recoveryKeys en este recorrido. Ninguna contraseña/token se pasa como argumento CLI, input del workflow o archivo de snapshot.

Las pruebas locales de android-ci.test.mjs validan URLs, límites, guardia adb, publicación de diagnósticos, YAML y conservación contra una API HTTP en memoria aislada. No arrancan adb, Maestro, un emulador ni Railway.

## OTA posterior opcional

Al proporcionar ota_update_id, el runner ejecuta primero native/ota-before-story.yaml tras preservar los datos anteriores y antes de la presentación: todavía sin cuenta, busca/fetch, realiza dos aperturas en frío, exige el prefijo del ID publicado y conserva USDT268,40. Si no aplica esa actualización se detiene antes de tomar imágenes de las escenas; no se atribuye al estudio nuevo un render anterior. Después de las operaciones de cuentas, native/ota.yaml repite el chequeo con el comprador A, sin operaciones pendientes, y verifica USDT287,89; las lecturas API finales vuelven a comprobar saldos, posiciones, lotes, comisiones, historial y perfil.

Ambos flujos reciben MAESTRO_EXPECTED_OTA_ID completo validado solo mediante el entorno del proceso, nunca interpolado en comandos. La aserción compara sus primeros ocho caracteres con el indicador de la app. No generan operaciones ni cambian identidades. El resumen público indica si se solicitó OTA y su UUID esperado. No se inventa un ID ni se fuerza recarga durante una operación.

Con el input vacío se conservan las etapas iniciales sin ejecutar OTA. La descarga automática al abrir el APK puede aplicar una actualización publicada antes de llegar a esta etapa; la aceptación comprueba el ID visible después de ambas aperturas y los datos conservados, sin afirmar que la descarga comenzó en el botón.

La aceptación de iPhone, un dispositivo Android físico, la importación nativa y los casos adversariales de recuperación no quedan acreditados por este workflow. Conservar esos pendientes hasta ejecutarlos y registrar evidencia.

El run 40814480970 fue cancelado por el agente tras aprobar siembra legacy, actualización sin borrar datos, preservación del snapshot anterior, cinco escenas/movimiento reducido y registro sin importar. El último PASS fue el registro a las 04:02:22Z; se canceló a las 04:05:39Z mientras se ejecutaba el siguiente flujo de A, sin alcanzar su timeout de siete minutos. No acredita aceptación integral ni demuestra un bloqueo de la App. Los checkpoints posteriores permiten observar esa distinción sin esperar al cierre ni publicar datos privados.
