# Comparación Android de la mina experimental

**Revisión actual: r5, 2 de noviembre de 2026.** El código espera versión/runtime 0.4.0, código Android **5**, paquete `com.openminerals.demo.minepreview` y canal `mine-realism`. La fuente de la app es `a43345e9dee49cebd077b7520c79b7fc2b49be03`; la construcción y resultados actuales se registran en [el informe de optimización](25-optimizacion-mina-r5.md). Las evidencias r4 y anteriores que siguen abajo son históricas y no se atribuyen a r5. El registro del candidato se actualiza solo al disponer de los bytes de la nueva APK y comprobar su firma; cambiar una expectativa del arnés no acredita una construcción.

**Preferencia posterior del propietario:** ninguna grabación automática por prompt, commit o PR. Los tres workflows nativos quedan manuales. El de vídeo exige además `record_video=true` (por defecto `false`) y solo se ejecuta tras una petición explícita de vídeo para esa ejecución. El perfil de métricas no graba vídeo y las capturas nuevas requieren `capture_stills=true`. Las instrucciones de ejecución automática conservadas más abajo describen runs históricos, no la política vigente. El control adicional de grabación preparado tras r5 se canceló sin ejecutarse.

El workflow nuevo `.github/workflows/android-mine-preview.yml` compara dos APK en un mismo emulador desechable de GitHub: la entrega `0.3.0` y la aplicación independiente `com.openminerals.demo.minepreview`, versión/runtime `0.4.0`, código Android `4` para la revisión R4, canal `mine-realism`. Las revisiones R1/R2/R3 usaron códigos `1`/`2`/`3` y conservan su evidencia por separado. La expectativa de código del harness no acredita que el APK nuevo ya esté compilado o probado. No modifica los workflows, el paquete, los datos o el canal de la entrega estable. Todo el recorrido y sus operaciones son DEMO.

## Preparación y ejecución

La entrega utilizada como referencia tiene fuente `eae7f6ad57f5a667c2bf40775a4cb30f1c0dd8b6` y APK SHA-256 `d99e8af9617f56d7862a849ebd057025cb9d6adc164b97496a5532f7b29ad29e`. Una copia del APK en otra release pública de este repositorio debe conservar exactamente ese hash. El harness no permite sustituirlo mediante parámetros.

Después de compilar el perfil EAS `mine-realism`, descargar el APK y verificar de forma independiente su SHA-256 y el SHA-256 del certificado de firma. El certificado del nuevo paquete puede ser distinto al de la entrega estable; se exige fijarlo expresamente. Los metadatos EAS deben vincular el APK con su fuente: el SHA del workflow no acredita por sí solo la fuente del binario.

Crear `docs/evidence/sprint-realism-20261101/candidate-build.json` con los valores públicos comprobados:

```json
{
  "apkUrl": "URL_HTTPS_PUBLICA_DEL_APK_EXPERIMENTAL",
  "apkSha256": "SHA256_REAL_DE_64_CARACTERES_MINUSCULOS",
  "certificateSha256": "SHA256_REAL_DEL_CERTIFICADO_EXPERIMENTAL",
  "baselineApkUrl": "URL_HTTPS_DE_LA_COPIA_EXACTA_DEL_APK_030",
  "baselineApkSha256": "d99e8af9617f56d7862a849ebd057025cb9d6adc164b97496a5532f7b29ad29e"
}
```

Es un ejemplo de estructura; sus marcadores no son enlaces o hashes válidos. Solo se admiten artefactos EAS canónicos y assets de releases de `Blaister9/Openminerals`, por HTTPS y sin credenciales ni parámetros. La PR del sprint, desde la rama `codex/android-mine-realism-20261101` en el mismo repositorio, ejecuta automáticamente la comparación contra este registro. No utiliza `pull_request_target` ni secretos. Una PR de un fork o de otra rama no ejecuta este job.

Cuando el workflow exista en la rama predeterminada también admite ejecución manual:

```powershell
gh workflow run android-mine-preview.yml --ref codex/android-mine-realism-20261101 `
  -f record_video=true `
  -f apk_url=URL_HTTPS_PUBLICA_COMPROBADA `
  -f apk_sha256=SHA256_REAL_DEL_APK `
  -f apk_certificate_sha256=SHA256_REAL_DEL_CERTIFICADO
```

Los tres parámetros manuales deben proporcionarse juntos. La referencia estable continúa leyendo su URL del registro y comprobando el hash fijado. No ejecutar el harness local contra un AVD existente o teléfono: exige GitHub Actions/Linux, un único emulador, la propiedad QEMU, Android API 29 y ausencia inicial de ambos paquetes.

El registro admite `validationScope`, con tres valores cerrados: `comparison` por defecto, `regression` y `commerce`. El workflow ejecuta una matriz independiente `comparison`/`commerce` mediante `MINE_PREVIEW_QA_SCOPE`, validado con la misma lista cerrada. Cada job instala los mismos APK en su propio emulador desechable y comprueba fuente embebida, identidad y preservación de la entrega estable. `comparison` termina después de perfiles visuales, modos, reanudación y preservación; no realiza comercio ni autenticación. `commerce` ejecuta operaciones y cuentas sin requisitos GL, benchmarks o vídeos. La matriz no cancela un caso si el otro falla y publica artifacts separados. Las colas se agrupan por alcance en cada job: una corrección comercial puede ejecutarse mientras termina una comparación anterior, manteniendo un caso activo por alcance. [Concurrencia por job de GitHub](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency). Los campos `benchmarksIncluded`, `glJourneyAssertionsIncluded` y `functionalChecksIncluded` evitan atribuir pruebas de un caso al otro.

La concurrencia se serializa por alcance entre ejecuciones, sin cancelar casos activos; un caso comercial nuevo puede avanzar mientras termina una comparación visual anterior.

`independentCiScopes` permite seleccionar explícitamente uno o ambos jobs con una lista única de `comparison`/`commerce`; si falta, se ejecutan ambos. El helper devuelve una copia y rechaza valores, duplicados o listas inválidas. Una repetición dedicada al grabador puede seleccionar solo comparación y referenciar un PASS comercial anterior del mismo SHA-256 de APK. Esa referencia no crea otro resultado comercial ni acredita un binario diferente.

El alcance `regression` conserva el caso enfocado de modos, GL inicial/reanudación y funciones sin benchmarks, y referencia la comparación [41377075737](https://github.com/Blaister9/Openminerals/actions/runs/41377075737), cuyo resultado general fue fallido tras completar los perfiles comparativos. No sustituye ese resultado ni atribuye nuevas métricas.

Para activar movimiento reducido se abre Inicio y sus opciones directamente: no se exige volver a preparar 3D antes de ofrecer esa alternativa. La reanudación sigue exigiendo GL antes de HOME y antes del primer gesto al volver; después de los gestos solo admite degradación ligera con el motivo exacto de coste de render. Una escena ligera genérica no satisface esas pruebas GL. Los fallos previos a credenciales incluyen un snapshot acotado de IDs conocidos, estado pendiente/GL/ligero y señales de motivos manuales/automáticos, sin XML completo ni inferir una causa cuando no está demostrada.

R3 distingue además los motivos internos estáticos `context-timeout`, `create`, `draw`, `boundary` y `unavailable`, así como el estado de reintento. Un fallo interno o un reintento pendiente nunca satisfacen el fallback autorizado por coste, aunque la descripción contenga ambos textos. Se leen advertencias ReactNativeJS con el prefijo fijo `[Openminerals 3D]`; solo se publican contadores de los cuatro códigos que se registran, no líneas completas ni errores nativos. Una advertencia de timeout puede preceder un reintento exitoso: el estado actual de la escena, no el historial de advertencias, decide si existe un fallo presente. Estos diagnósticos identifican el punto observado de fallo y no prueban su causa; las nuevas medidas de montaje/reintento de R3 requieren ejecución real del nuevo APK.

## Protocolo y evidencia

Antes de instalar se comprueban hashes, firmas, identificadores, versiones/códigos, runtime nativo, canal, librerías para teléfono/emulador, HTTPS embebido y protecciones de recuperación de Expo Updates. La aplicación experimental se instala junto a la estable; se compara el UID y la versión de la estable después de instalar y al finalizar. No hay desinstalación ni borrado de datos.

La aplicación estable conserva sus aserciones Maestro existentes de los siete capítulos: solo cambia la cabecera `appId` en copias temporales. El candidato utiliza una adaptación explícita del mismo recorrido: exige primero GL listo antes de cualquier gesto y captura esa imagen inicial; después admite GL o la degradación automática únicamente cuando el propio nodo ligero incluye la frase exacta «Vista ligera activada por coste de render.». Un fallo de shader/GL, el modo manual ligero o una vista simplificada genérica no satisfacen esa alternativa. Las siete capturas conservan su orden y nombres; cada capítulo registra el modo y la calidad observados inmediatamente después de su captura. El informe diferencia capítulos con GL de capítulos con degradación automática y no acepta sus píxeles por accesibilidad.

Las capturas se publican inmediatamente al completarse, con manifiesto de hashes y alcance parcial, sin esperar al vídeo o a fases posteriores. Al terminar movimiento reducido se exige también su octava captura; la imagen inicial GL del candidato es evidencia adicional. Los accesos a Mercado, Metales y Billetera y la reanudación tras HOME con el mismo proceso se verifican por separado.

La grabación comienza después de comprobar un frame listo. Cada APK recibe exactamente 15 gestos: tres avances, cuatro retrocesos y ocho avances finales. Cada desplazamiento dura 1.800 ms, seguido de 250 ms de pausa. Las coordenadas proceden del mismo tamaño efectivo de pantalla. El protocolo y la secuencia compilada se identifican mediante SHA-256. Las comprobaciones de capítulos, menús, capturas y carga inicial quedan fuera de esa carga de entrada.

El caso `comparison` instala primero la entrega estable y conserva su UID/versión, pero difiere su apertura. Después instala y verifica la fuente embebida del candidato, ejecuta sus siete capítulos, perfiles ligero/grabado/sin grabar, movimiento reducido y reanudación. Detiene el candidato y abre la entrega estable para verificar su fuente y ejecutar exactamente sus comprobaciones y perfiles anteriores. `comparison-order.json` registra el orden candidato/estable y su limitación: no está contrabalanceado; calentamiento del emulador, cachés y carga del host pueden afectar el segundo caso. La finalización se determina con las fases de `summary-run.json`, no con el orden planificado. Un fallo se propaga conservando la evidencia previa; no permite omitir ni acreditar fases posteriores. Los alcances `commerce` y `regression` conservan su orden anterior.

Cada APK ejecuta una pasada ligera sin grabar y pasadas 3D grabada y sin grabar, con la misma secuencia de entrada. Se miden tiempo de inicio de proceso con `am start -W`, PSS antes/después y contadores/percentiles HWUI de `dumpsys gfxinfo`. El arranque frío exige observar la desaparición del PID tras `force-stop` y un PID nuevo y único al iniciar; se rechazan estados WARM/HOT y avisos de reutilización del intent. Los datos de lanzamiento quedan conservados aunque se rechace su clasificación. Un tiempo pequeño, por sí solo, no identifica un arranque reutilizado. Esta medición no representa el tiempo hasta que la app queda visualmente lista.

En el caso comparativo se exige disponibilidad de FFprobe y FFmpeg antes de arrancar el emulador. El MP4 debe cubrir al menos el 85 % del tiempo real de los gestos tanto en duración del contenedor como en separación entre el primer y último timestamp de presentación decodificado. El informe conserva los últimos timestamps, muestras PNG del final y una captura Android posterior al trace. No exige duración por paquete, que puede faltar en vídeo de tasa variable. Un clip truncado conserva sus bytes como `*-anonymous-scroll-incomplete.mp4`, su informe inválido y las métricas disponibles; no se presenta como recorrido completo. Los timestamps y la accesibilidad no prueban por sí solos que los píxeles hayan llegado al portafolio: las muestras requieren revisión visual.

Al terminar la entrada se envía SIGINT únicamente al PID propio observado. La salida remota debe comprobarse mediante `pidof` con código 1 y salida/error vacíos; un timeout o error de transporte nunca equivale a ausencia. Se esperan conjuntamente la salida remota y el cierre del proceso ADB del host hasta 30 segundos. El informe registra latencia, errores de sondeo, prueba de salida y solicitud eventual de terminación forzada del host, que invalida el vídeo. Esta espera queda fuera de la duración de los gestos; no se repara ni remultiplexa un MP4 incompleto. Los problemas previos de contenedor y el intervalo observado de ocho segundos no prueban por sí solos su causa.

El reporte identifica calidad adaptativa, fallback automático y disponibilidad de contadores UI. Registra por separado si la comprobación final de capítulo y la comprobación posterior de fuente embebida terminaron. Los gestos incluyen el coste de ADB; no son una medición directa de latencia táctil. Los diagnósticos de Maestro anteriores a credenciales publican únicamente la fase, el flow y selectores estáticos permitidos del comando fallido; no incluyen mensajes completos, jerarquías ni valores de entrada.

El caso comercial, sin grabaciones ni capturas, opera únicamente sobre la nueva sesión anónima de la aplicación experimental: verifica 250 USDT iniciales, convierte 200 USD a 450 USDT, rechaza una compra sin saldo suficiente, compra 2 g y vende 0,5 g, comprobando 157,10 y 228,73 USDT respectivamente. Un nuevo inicio de proceso conserva el saldo final. No se publican screenshots, vídeos, XML de UI ni logs sin filtrar de ese tramo comercial.

El caso comercial comprueba además el portafolio de 1,5 g, publica una oferta legacy de 0,5 g y solicita cotización de entrega de otros 0,5 g. Los comprobantes deben mostrar 1 g reservado y 0,5 g disponible, sin cambiar los 228,73 USDT. Una reserva adicional de 1 g queda bloqueada. Cancelar ambas solicitudes libera los 1,5 g originales; el historial contiene exactamente siete operaciones. La compra histórica se consulta dos veces y conserva su saldo de 157,10 USDT frente al saldo actual de 228,73. Esto prueba lecturas sin duplicación, no repetición nativa de la misma clave idempotente; esa prueba sigue identificada como no ejecutada en Android y cubierta por las pruebas API/dominio.

El tramo privado posterior registra un comprador con alias y clave ficticios generados en memoria. Desactiva explícitamente «Conservar mi sesión anterior» y comprueba el rol, el alias exacto y los 250 USDT iniciales de una cuenta sin importación. Un inicio nuevo del proceso debe recuperar ese mismo comprador mediante el token guardado en SecureStore, sin volver a introducir la clave. Al cerrar sesión deben reaparecer los 228,73 USDT de la sesión anterior propia. El comprador nuevo no compra, vende, transfiere ni recibe ingresos; su registro no asigna los metales de la sesión anterior a inventario compartido.

Después se comprueba el acceso público expresamente autorizado en `demo-access/operator-public.json`. Una consulta de login detecta rechazos HTTP 401/403 y revoca su token de comprobación mediante logout antes de iniciar el login nativo. El operador entra en Mina, conserva Cuenta y permite consultar Panel gerencial; se comprueba la ausencia de la billetera de comprador y se cierra su sesión. No se usan rutas de stock, producción, recepción, cambios de gestión ni otras operaciones de inventario. Un acceso público rechazado hace fallar la fase con una causa estática; el harness no modifica la cuenta ni el backend para habilitarlo.

Las credenciales nuevas solo se pasan en memoria al entorno de Maestro y se enmascaran en GitHub Actions. Los flows privados utilizan marcadores de entorno; su directorio temporal y sus salidas se eliminan al terminar cada fase, también si falla. Esta adaptación tiene una lista de fases autorizadas separada: no permite credenciales dentro de los flows anónimos. Los resultados públicos de autenticación contienen indicadores booleanos y nombres de fases. Ante un fallo de una fase autorizada se permite además una proyección cerrada con categoría, tipo e índice del comando; excluye selectores, textos, alias, valores introducidos, errores completos y jerarquías. El registro conserva un comprador DEMO nuevo en la API; no se borran cuentas ni se reinicia información para repetir las pruebas.

Los campos editables de los flows nuevos utilizan `eraseText: 100` y el comando escalar `hideKeyboard`, igual que los helpers existentes probados con Maestro. Un fallo de las cuatro fases legacy permitidas puede publicar únicamente categoría de parser/ejecución, tipo/índice del comando y selectores estáticos del flow; se excluyen texto introducido, mensajes completos, jerarquías y capturas. Esta excepción de metadatos termina antes de crear o introducir credenciales. El fallo comercial de [41384249997](https://github.com/Blaister9/Openminerals/actions/runs/41384249997/job/125081454743) se conserva por separado: la duración breve y los mappings nulos anteriores sugieren un error de definición, pero su artifact público no demuestra la causa exacta.

El intento comercial [41385054878](https://github.com/Blaister9/Openminerals/actions/runs/41385054878/job/125087999390) sí completó la conversión a 450 USDT y el bloqueo de la compra excesiva, según los comandos estáticos registrados. Falló al buscar hacia abajo el campo de gramos que había quedado encima del botón; el segundo cambio de cantidad ahora busca hacia arriba. No se atribuyen compra, venta o autenticación a ese intento incompleto. Ante un fallo posterior de autenticación se permite publicar solo una categoría cerrada y el tipo/índice del primer comando fallido; nunca selectores, alias, claves, mensajes completos ni valores de entrada. Las salidas privadas siguen eliminándose al terminar cada fase.

El caso comercial R4 [41388807925 / 125095475432](https://github.com/Blaister9/Openminerals/actions/runs/41388807925/job/125095475432) aprobó sus 15 fases nativas, sin fallos, con código Android 4. El arnés fue `fa308d0`; la fuente APK es `ce9b79b`, SHA-256 `adfbf909f0cf0c924c7b8938a1a773c5c96b84f14f86ae0e8c0bf53b7e1b1bf5`. La comparación de ese mismo run falló antes de instalar la candidata; la repetición `41391258031` selecciona solo comparación sobre exactamente ese APK. Se verificaron operaciones legacy, reservas/liberación, historial, reinicio, comprador/SecureStore, acceso de lectura del operador y preservación de UID/versión de la entrega estable. Su evidencia está separada en `docs/evidence/sprint-realism-20261101/android-r4-commerce/`. No acredita benchmarks, recorrido GL, teléfono físico ni las operaciones autenticadas pendientes descritas en los límites.

Los artifacts `android-mine-preview-<run_id>-comparison` y `android-mine-preview-<run_id>-commerce` contienen únicamente el directorio `public/` de cada caso. El primero aporta MP4 anónimos, capturas, métricas, protocolo y reanudación; el segundo aporta resultados booleanos de comercio/cuentas. Ambos incluyen verificación de APK, preservación y JUnit resumido. Ante un fallo anterior al límite privado y después de verificar la instalación anónima, puede incluirse una captura anónima y señales booleanas de errores JS/GL; nunca texto completo de logs. La causa pública se limita a mensajes estáticos permitidos. Los archivos privados de Maestro no se suben. La retención del artifact es de siete días; copiar la evidencia requerida al informe de la PR.

## Alcance y límites

Esta ejecución usa API 29, x86_64 y SwiftShader sobre el runner estándar de Ubuntu con KVM. HWUI no mide los FPS de la superficie ExpoGL; el número de frames codificados del vídeo tampoco equivale a FPS de la aplicación. PSS no representa el máximo de memoria. Los resultados no aceptan rendimiento de 60 FPS, temperatura, GPU móvil ni experiencia en teléfono físico.

El acceso nativo de comprador, su conservación tras reiniciar el proceso y la navegación de lectura del operador se reportan como fases independientes. No acreditan comercio autenticado completo: compraventa autenticada, marketplace entre compradores, custodia por lotes/certificados y ciclo completo de entrega son funciones exclusivas de cuentas y requieren fixtures privadas aisladas con existencias. La oferta y cotización legacy no representan liquidación entre compradores ni custodia física. Esos recorridos autenticados siguen pendientes con el nuevo APK; los contratos sin cambios se cubren por las pruebas API/dominio y se reportan aparte. Tampoco se reinicia, despliega o altera la configuración de Railway/PostgreSQL.

La existencia del workflow o la aprobación de sus pruebas unitarias no acredita una ejecución Android. Registrar el enlace real del run, las fases completadas, sus fallos y el vínculo fuente/binario después de ejecutarlo.

Validación local del nuevo harness, sin utilizar dispositivos:

```powershell
cd mobile
node --test test/mine-preview-native.test.mjs
```

## R5: perfil controlado y aceptación autenticada

`android-mine-profile.yml` compara la referencia congelada 0.3.0 con r4 si el manifiesto conserva r4; al fijar una APK r5 compara r4 con esos bytes. Cada par corre en orden ABBA, dos repeticiones por APK y modo, con las mismas coordenadas/15 gestos. Los dos APK preview comparten identificador: solo se reinstala ese paquete dentro del emulador desechable, sin credenciales, conservando UID/versión de la app estable. Nunca ejecutar esta limpieza en teléfono o un AVD personal.

Los p50/p95 exactos proceden de la cola acotada de `gfxinfo framestats`: FrameCompleted menos IntendedVsync es latencia de la tubería HWUI, no FPS de ExpoGL. Se añaden segmentos de reloj cuando las columnas existen y son válidas: trabajo UI, espera de RenderThread, envío y tramo posterior a SwapBuffers. Incluyen esperas y planificación; no son CPU puro ni GPU aislada. El baseline `41466137890` usó el parser anterior, por lo que sus segmentos ausentes no se reconstruyen ni inventan.

Un proceso independiente toma PSS aproximadamente cada segundo durante la misma traza. Pico significa máximo muestreado; sostenido usa la mediana y p95 de la última mitad de muestras. El muestreo tiene coste y es idéntico dentro de cada par. La presentación SurfaceFlinger se obtiene únicamente de una superficie exacta o una única ventana MainActivity; el segundo caso incluye UI más TextureView y nunca se etiqueta FPS de GL/GPU. Ambigüedad o falta de acceso devuelven no disponible. Los deltas CPU reconocen nombres reales de hilos y omiten los no identificados.

Las capturas inicial/final están fuera del intervalo de gestos y del reset/lectura de métricas; son anónimas, con hashes y requieren revisión visual. Se proyectan únicamente contadores de dos marcas estáticas del shader, leídas para el PID propio después de la traza. Cero marcas no identifica una capacidad ausente: r4 no tiene esa instrumentación. Estados inicial/final equivalentes no prueban calidad constante durante toda la traza. El vídeo completo sigue perteneciendo al caso independiente `android-mine-preview.yml`.

`android-mine-preview-commerce.yml` usa solo seis secretos **nuevos** `OPENMINERALS_MINE_R5_QA_*`, dos compradores y un operador de una mina llamada `Native QA DEMO r5-native-...`, con 5 g DEMO explícitos por metal, sin operaciones previas. No utiliza los secretos de QA anteriores ni el operador público para operaciones. Ejecuta 26 fases: pendiente offline de un centavo, reapertura y reintento sin duplicar; compra/venta autenticadas; oferta y liquidación entre compradores; certificados/procedencia; cotización, aceptación y tres estados de entrega; producción/verificación/recepción; panel Mina, perfil y persistencia. Producir/verificar no crea disponibilidad; solo la recepción DEMO aumenta el inventario.

Los comandos comerciales nacen en la UI; el observador HTTP admite lecturas y login/logout. Verifica wallets, lotes, fees, historial y conservación de inventario antes y después de reabrir. El reintento offline antes de llegar al servidor no acredita pérdida de respuesta después de un commit; ese caso permanece identificado como no probado nativamente. Tampoco se atribuye reinicio del servicio PostgreSQL a la reapertura de la app.

Maestro conserva sus salidas/capturas automáticas en directorios privados eliminados por fase y al finalizar. El artifact público contiene solo proyecciones cerradas, fases y resultados; nunca UI autenticada, alias, claves, tokens o dumps. Para repetir el caso comercial se deben provisionar fixtures nuevas y actualizar únicamente esos seis secretos: el preflight rechaza cuentas usadas y no borra/reset datos.

Pruebas locales de estos arneses, sin acreditar ejecución Android:

```powershell
node --test mobile/test/mine-profile.test.mjs mobile/test/mine-preview-commerce.test.mjs
```
