# Optimización de Mina Preview 0.4.0-r5 · Android DEMO

Sprint del 2 de noviembre de 2026. Base: [PR #11](https://github.com/Blaister9/Openminerals/pull/11), r4 fuente `ce9b79b5abbe0389e5f2661dda0d7abc6b53bc14`. La aplicación comercial 0.3.0, su paquete, canal y datos se conservan. Este documento registra ejecución y límites; no acredita aceptación por la presencia del código. Por elección del propietario, este sprint continúa en emulador y deja la aceptación física pendiente. iOS queda fuera del alcance.

## Diagnóstico antes de cambiar el renderizado

La comparación anterior r4 midió p95 HWUI ligero de 133 ms frente a 85 ms de 0.3.0, con mayor PSS. Los perfiles que comenzaron en 3D terminaron en ligero automático en r4; no demuestran velocidad 3D a calidad equivalente. Los 85 ms tampoco son rendimiento óptimo. [Evidencia nativa original](evidence/sprint-realism-20261101/android-r4-comparison/provenance.json).

Antes de modificar los shaders se ejecutaron dos experimentos completos y uno dirigido en Chrome/ANGLE/SwiftShader: 360×640, las mismas once poses, dos rondas de calentamiento y seis medidas por pose/condición. Se alternó el orden entre condiciones. Cada dibujo espera `finish` y lee RGBA completo; la transferencia está incluida. Los percentiles representan envío, finalización de software y lectura, **no FPS Android ni tiempo GPU aislado**. La construcción de programas y primer dibujo se guardan por separado, como muestras únicas sin control de caché fría.

| Ablación diagnóstica | Media r4 | Media sin ese coste | Interpretación limitada a software |
| --- | ---: | ---: | --- |
| Túnel: cuatro → una luz | 16,06 ms | 12,41 ms | −23 %; conservar geometría y estudiar transporte de luz |
| Túnel: sin iluminación directa | 16,06 ms | 9,46 ms | −41 %; ablación visual, no solución final |
| Túnel: sin sombras analíticas | 16,06 ms | 14,29 ms | −11 % |
| Túnel: sin detalle procedural | 16,06 ms | 13,75 ms | −14 % |
| Túnel: menos polígonos | 16,06 ms | 15,44 ms | −4 %; no justifica degradar relieve |
| Lingote: sin dos consultas del gradiente SDF | 11,81 ms | 8,21 ms | −30 %; conservar sello y resolver gradiente en una evaluación |
| Lingote: sin estampado | 11,81 ms | 6,30 ms | −47 %; ablación, no propuesta visual |

Reducir el espécimen, retirar partículas y omitir el cálculo de roca tras la formación no produjo una mejora consistente. Las ablations eliminan características deliberadamente para identificar coste: sus imágenes no son el resultado que se propone entregar.

[Medición inicial](evidence/sprint-optimization-20261102/diagnostic/report.json), [repetición](evidence/sprint-optimization-20261102/diagnostic-repeat/report.json), [aislamiento del sello](evidence/sprint-optimization-20261102/diagnostic-engraving/report.json) y [manifiesto de originales](evidence/sprint-optimization-20261102/diagnostic-manifest.json). Los originales conservan fuentes, hashes, muestras individuales y PNG. El renderer de referencia extraído de `ed87d2e` coincide en los dos módulos utilizados con el APK comercial congelado `eae7f6a`; ambos se compararon con `git diff`.

Inventario observado en código y llamadas GL instrumentadas: cinco buffers estáticos, dos programas, 613.128 bytes de atributos, hasta 7.528 triángulos y tres llamadas de dibujo por fotograma. No hay texturas GL, mapas de sombras, descargas pesadas ni reconstrucción de malla por desplazamiento. La imagen ligera tiene 360×640. Las cuatro luces, sombras de dos oclusores y 48 partículas son procedurales. La adaptación usa dibujos bajo demanda y pausa RAF fuera del recorrido y en segundo plano. Se conserva la barrera de finalización nativa para evitar acumulación de comandos; su tiempo incluye espera de cola/GPU, no es tiempo exclusivo de JavaScript.

La retención de `TextureView` bajo la cobertura ligera difiere de 0.3.0 y es un candidato para el coste UI/memoria, **todavía sin causalidad nativa demostrada**. El aumento de atributos (aproximadamente 0,56 MiB) no explica por sí solo los aproximadamente 13 MiB extra de PSS. No se atribuye esa diferencia a una fuga sin medición.

## Validación inicial y aislamiento comercial

Ejecutado antes de ampliar: `npm install` en API/móvil sin cambios de lockfile; API 91 casos aprobados y once PostgreSQL omitidos por falta de `TEST_DATABASE_URL` local; smoke local completo aprobado en `memory-demo`; comprobación Expo de dependencias y TypeScript correctos; Doctor 21/21; suite móvil inicial 348 aprobados y seis GL opcionales omitidos. PostgreSQL debe verificarse aparte en CI y API publicada; el smoke en memoria no lo acredita.

Railway inspeccionado mediante herramientas: proyecto `openminerals-demo` (`1442be94-b13f-4067-9fee-ea99caf5715a`), entorno `demo` (`1e835541-fd3a-49dd-8ae3-0315d4118940`), API `00e2d919-2cd1-4293-befd-d8af58df8069` y PostgreSQL existentes, ambos SUCCESS y sin cambios pendientes. API HTTPS: `https://openminerals-api-demo.up.railway.app`; `REQUIRE_DATABASE=true`. No se cambió configuración, despliegue ni servicio de base de datos.

Se creó de forma aditiva la mina `mine-ff642322-f3f8-4220-b7ff-7eb9021725cb`, etiqueta `Native QA DEMO r5-native-20261102`, con existencias DEMO explícitas de 5 g por metal y dos compradores más un operador. Ninguna cuenta pública ni inventario del cliente se usa para estos recorridos. Las seis credenciales están fuera del repositorio y en secretos nuevos `OPENMINERALS_MINE_R5_QA_*`; los secretos de QA previos no se cambiaron. Los datos nuevos se conservarán tras las pruebas, sin reset.

## Cambios seleccionados y comparación de software

R5 conserva la malla, relieve, normales, cámara, cuatro focos, dos oclusores, polvo y materiales. Calcula la iluminación amplia de superficies dieléctricas rugosas en los vértices existentes; vetas, cuarzo y carcasas mantienen GGX por fragmento. La iluminación resulta ligeramente más suave: la diferencia media máxima observada es 0,66 niveles RGB sobre 255, con p95 por canal de tres niveles, sin cambios de silueta. No se añadieron buffers ni texturas GL. La prueba de sombras contrasta ahora ambas etapas del shader: 288 sondas BRDF finitas/no negativas y doce poses de receptores aprobadas, sin píxeles aclarados al activar sombras.

El sello conserva su campo de distancia, símbolos y relieve. Si está disponible `OES_standard_derivatives`, deriva su gradiente de una sola evaluación y mantiene dos consultas baratas para el borde. Sin la capacidad utiliza el shader original; el visor de metal fuera del recorrido no cambia. En 36 vistas de cuatro metales, incluidas vistas rasantes, las siluetas coinciden exactamente; máxima diferencia media RGB 0,085/255 y hasta 242 píxeles con diferencia mayor de 16. Se revisaron los PNG. Los intentos analítico y de recorte espacial no mejoraron consistentemente y se descartaron del código.

| Comparación r4 → R5, p50 / p95, ms | Repetición A | Repetición B |
| --- | --- | --- |
| Todas las poses | 13,0 / 23,1 → 9,5 / 16,4 | 12,9 / 23,9 → 9,4 / 17,0 |
| Mina | 14,4 / 23,6 → 9,8 / 16,4 | 14,7 / 24,5 → 10,1 / 17,2 |
| Lingote | 12,7 / 13,9 → 9,5 / 10,6 | 12,5 / 13,8 → 9,3 / 11,4 |

Mismo procedimiento de software, 360×640 y once poses; 66 muestras por condición. Construcción/primera finalización A: 70,3/125,0 → 63,3/128,3 ms; B: 64,2/111,0 → 57,6/107,3 ms. Son muestras únicas, no carga Android ni garantía de mejora de arranque. Recursos idénticos: hasta tres draws, 7.528 triángulos y 613.128 bytes de atributos. [Originales, fuentes, PNG y hashes seleccionados](evidence/sprint-optimization-20261102/software-provenance.json). No son FPS Android y no eliminan por sí solos la regresión nativa.

Se comprobó también la resolución de software nativa prevista: a 216×384, p50/p95 completo 5,3/9,8 → 3,9/7,1 ms. A 576×1024: 30,4/54,7 → 22,4/38,4 ms. En ambos casos permanecen los mismos recursos. El software de escritorio a 1024 sigue siendo costoso. Construcción/primera finalización a 384: 52,9/88,3 → 60,7/104,9 ms; no hay mejora universal de carga inicial. [Originales y hashes por resolución](evidence/sprint-optimization-20261102/software-resolution-provenance.json).

El bitmap ligero se volvió a generar desde el renderer actual: 360×640, 310.167 bytes, sin descarga externa. Para contrastar el coste UI se excluye de composición la superficie retenida cuando está pausada y se acota la capa alfa del lingote ligero manteniendo las mismas coordenadas de centro y sombra. El contexto permanece retenido para reanudar sin destruir una presentación pendiente. La eficacia y memoria de estos cambios necesitan el comparativo nativo; no se atribuyen a la causa de r4 solo por estar implementados.

## Reproducción

Desde la raíz, con dependencias móviles instaladas y Chrome en la ruta indicada:

```powershell
$env:OPENMINERALS_WEBGL_BROWSER='C:\Program Files\Google\Chrome\Application\chrome.exe'
$env:OPENMINERALS_GEOLOGY_COST_CONDITIONS='r4-full,candidate'
$env:OPENMINERALS_GEOLOGY_COST_CANDIDATE='all'
node mobile/scripts/benchmark-geology-cost.mjs
```

El script extrae r4 de su SHA congelado y compara el código actual; crea un directorio nuevo en `artifacts/` y nunca reemplaza evidencia. Para otras resoluciones establecer juntos `OPENMINERALS_GEOLOGY_COST_WIDTH` y `OPENMINERALS_GEOLOGY_COST_HEIGHT`. La comparación de software excluye UI, desplazamiento Android, cola ExpoGL nativa y memoria de proceso.

Los workflows `android-mine-profile.yml`, `android-mine-preview.yml` y `android-mine-preview-commerce.yml` operan exclusivamente en emuladores desechables de GitHub. El primero compara APK firmadas con la misma traza; el segundo conserva siete capítulos, modos, vídeo y reanudación; el tercero usa las seis credenciales privadas R5. Para repetir comercio se deben provisionar cuentas/mina nuevas y actualizar esos secretos: los fixtures usados fallan el preflight, no se reinician. Los observadores leen la API; las operaciones comerciales nacen en la UI.

## Estado de ejecución

El perfil nativo controlado 0.3.0/r4 **aprobó ocho trazas**: [41466137890](https://github.com/Blaister9/Openminerals/actions/runs/41466137890), arnés `0c613cf`, API29/x86_64/SwiftShader, orden ABBA y dos repeticiones por APK/modo. La regresión ligera se reproduce 2/2: p95 HWUI 127,8/126,4 → 175,1/172,6 ms; throughput UI 16,75/16,27 → 10,13/10,35 frames/s; mediana PSS sostenida 113.770/110.505 → 128.912/131.217 KiB. Los picos muestreados son 120.249/117.619 → 134.797/139.695 KiB. RenderThread usa aproximadamente un 16 % más de ticks en r4. Son medias/comparaciones de dos resultados, sin afirmación de significancia estadística.

Ambas trazas r4 iniciadas en 3D terminan en ligero automático; 0.3.0 conserva GL. No acreditan una mejora 3D sostenida. Los percentiles exactos provienen de las 120 filas HWUI finales (aproximadamente 6–8 s en ligero), no de todas las presentaciones. Todos los frames capturados superan 16,67 ms. Throughput UI no equivale a FPS de la app/GPU. Pico de PSS significa máximo **muestreado**, no máximo continuo. El profiler anterior no identificó los hilos JS/GL y buscó solo SurfaceView: sus campos nulos significan no medidos. El profiler r5 reconoce `mqt_v_js` y puede medir presentación de una única ventana MainActivity (UI más TextureView compuesto), siempre diferenciada de FPS de ExpoGL. [Resultados completos, límites y originales verificados](evidence/sprint-optimization-20261102/android-baseline-controlled/review.md).

[APK r5 publicada](https://github.com/Blaister9/Openminerals/releases/download/android-mine-preview-0.4.0-r5-20261102/Openminerals-Mina-Preview-0.4.0-r5-android.apk): [EAS `41aae522-abab-44f6-b8c4-e89b99dc1aa8`](https://expo.dev/accounts/chipirips-team/projects/openminerals-demo/builds/41aae522-abab-44f6-b8c4-e89b99dc1aa8) **FINISHED**, fuente `a43345e9dee49cebd077b7520c79b7fc2b49be03`, versión 0.4.0/código 5. Se verificaron firma preview, runtime/canal, ABI para teléfono/emulador, API HTTPS, ausencia de debuggable y protecciones Updates. Bytes: 77.360.408; SHA-256 `7a3608be4a29996bb7d1713706669fd5acab12d73286f3931c1b45226145f4ec`. El digest de GitHub coincide con los bytes descargados e inspeccionados de EAS. [Registro público](evidence/sprint-optimization-20261102/r5-build.json). Se conservó el [registro original r4](evidence/sprint-optimization-20261102/r4-reference-build.json) antes de fijar el candidato nuevo.

EAS estuvo en cola desde las 10:09 hasta las 10:51 de Bogotá y terminó a las 10:58. Se preparó una contingencia de compilación sin firma, pero no se ejecutó ni se recuperó material de firma; el APK publicado proviene de EAS y su firma remota existente. El SHA de fuente se publicó sin activar QA antes de disponer del binario.

### Resultados reales de la APK r5

El [perfil controlado r4/r5](https://github.com/Blaister9/Openminerals/actions/runs/41477328703), arnés `df8d985`, aprobó ocho trazas ABBA sobre el mismo emulador API29/x86_64/SwiftShader. En ligero, las medias de los dos resultados por versión son:

| Métrica, alcance indicado | r4 | r5 |
| --- | ---: | ---: |
| p50 HWUI, cola final capturada | 98,30 ms | 66,71 ms |
| p95 HWUI, cola final capturada | 128,27 ms | 88,75 ms |
| Presentación de ventana UI + TextureView | 17,96 FPS | 24,07 FPS |
| Mediana PSS sostenida | 129.421 KiB | 129.889 KiB |
| Media de los máximos PSS muestreados | 137.741 KiB | 135.276 KiB |

El p95 ligero mejora un 30,8 % y la PSS sostenida cambia +0,36 %, con variación entre las dos pasadas. Son medias de resultados, no percentiles combinados ni intervalos de confianza. Los FPS corresponden al intervalo entre primera/última presentación disponible de la ventana (aproximadamente 29 s), no a FPS de ExpoGL ni a toda la traza. Los intervalos de presentación superiores a 25 ms siguen siendo aproximadamente 77–78 % en r5. **88,75 ms y 24,07 FPS de ventana no son rendimiento óptimo ni acreditan 60 FPS.** El histórico 0.3.0 procede de otro run y no demuestra eliminación de su regresión en este mismo host.

Picos PSS por pasada: r4 133.508/141.974 KiB; r5 138.624/131.927 KiB. El máximo r5 observado es 138.624 KiB, no el máximo continuo. Medianas sostenidas por pasada: r4 126.690/132.152 y r5 133.164/126.614 KiB, tomando la última mitad de muestras de cada traza.

Los p95 de segmentos HWUI ligero son UI 16,45→10,79 ms, cola RenderThread 44,03→30,55 y envío 37,26→25,83; post-Swap permanece aproximadamente 18,6→18,9 ms. Son segmentos de reloj con esperas, no CPU puro/GPU aislada. Se confirmó el shader derivativo en los cuatro procesos r5. **Las dos trazas r5 iniciadas en GL terminan en ligero automático**, igual que r4: no se acepta 3D sostenida. Los PNG finales sí muestran Portafolio/CTA en este caso sin grabación. [Originales, análisis y revisión](evidence/sprint-optimization-20261102/android-r5-controlled/review.md).

La [comparación visual/vídeo](https://github.com/Blaister9/Openminerals/actions/runs/41477328613/job/125386426563) **falló**: el MP4 conserva 6,976 s para una traza de 34,821 s y solo 13,29 % de cobertura PTS. Los seis frames decodificados y la captura posterior permanecen en Origen/Extracción; no acreditan Portafolio ni retroceso. El cierre del grabador fue limpio y no hubo indicadores fatales JS/GL observados; eso no aísla la causa. Las siete capturas de capítulos existen, pero solo 1–3 están en GL y 4–7 usan ligero automático, por lo que no equivalen a las siete GL históricas de r4. [Fallo y originales conservados](evidence/sprint-optimization-20261102/android-r5-comparison/visual-review.json). No se presenta el clip como un recorrido completo.

El [comercio legacy](https://github.com/Blaister9/Openminerals/actions/runs/41477328613/job/125386426683) aprobó **15/15 fases** sobre los mismos bytes: operaciones, reservas, historial, reinicio, comprador/SecureStore y operador en lectura; UID/versión estable conservados. [Evidencia](evidence/sprint-optimization-20261102/android-r5-legacy-commerce/provenance.json).

El [recorrido autenticado aislado](https://github.com/Blaister9/Openminerals/actions/runs/41477329133/job/125386235544) aprobó **26/26 fases**, cero fallos y limpieza correcta. Ejecutó compra/venta, marketplace A→B, certificados/procedencia, entrega completa, producción/verificación/recepción, panel Mina, perfil, reaperturas y recuperación del pendiente offline. Los observadores comprobaron balances, lotes, fees, historial e inventario antes/después de reabrir. Se usó exclusivamente la nueva mina QA; la app estable no se instaló, abrió ni borró en ese job. [Procedencia y originales públicos](evidence/sprint-optimization-20261102/android-r5-authenticated/provenance.json). No acredita teléfono, reinicio del servicio ni pérdida de respuesta después de commit.

Validación de código `df8d985`: [CI aprobada](https://github.com/Blaister9/Openminerals/actions/runs/41477328766), 91 casos API aprobados y once PostgreSQL omitidos en la pasada general; la pasada obligatoria PostgreSQL aprobó 80/80 sin omisiones. Móvil CI 376 aprobados + ocho GL opcionales omitidos; Doctor 21/21. La suite local posterior ejecutó **384/384 con GL**, sin omisiones. Las cifras de cada pasada no se suman como casos distintos porque comparten pruebas.

### Política de grabación y aceptación pendiente

Por instrucción posterior del propietario, **no se graban vídeos por cada prompt, commit o PR**. Los workflows nativos pasan a ejecución manual; el de vídeo exige además `record_video=true`, desactivado por defecto. El perfil ordinario no graba vídeo y sus capturas adicionales quedan desactivadas por defecto. El nuevo experimento de grabación preparado tras el fallo se canceló **antes de ejecutarlo**; su borrador quedó fuera de las rutas activas. Se conserva la evidencia ya obtenida.

Rendimiento ligero y funciones mejoraron/verificaron con los alcances anteriores; **la aceptación de 3D sostenida sigue abierta**. No fusionar en `main` ni declarar 60 FPS. La aceptación física continúa pendiente por decisión del propietario.

### Revisión de cierre de r5 · 2 de noviembre de 2026

**La política audiovisual está publicada** en `7122dc3edd3fb074d888bbd385e9777da45fafcf`, confirmado en el remoto e incluido en PR #11. Los tres workflows nativos solo admiten ejecución manual; el de vídeo exige además `record_video=true` en sus dos jobs, con valor predeterminado `false`. El perfil no graba vídeo y `capture_stills` también es `false` por defecto. La [CI de esa revisión aprobó](https://github.com/Blaister9/Openminerals/actions/runs/41485001130). No se lanzó otro workflow nativo, compilación, medición extensa, vídeo ni captura para esta revisión de cierre.

Se revisaron nuevamente los resultados comerciales publicados, la identidad de la APK y los **17 hashes** del manifiesto autenticado: coinciden. Las **26/26 fases autenticadas**, cero fallos y limpieza correcta siguen siendo la evidencia válida; las **15/15 fases legacy** también están aprobadas. No se repitieron operaciones ni se reutilizaron los fixtures consumidos. La persistencia acreditada es la reapertura de la app y SecureStore, con conciliación API; no un reinicio de PostgreSQL. El pendiente offline se recuperó antes del commit del servidor, sin acreditar pérdida de respuesta posterior a commit. Teléfono físico pendiente.

#### Por qué se activa el modo ligero

La causa inmediata identificada es la **protección de coste de dibujo**, no la ruta de excepción del renderizador. En las dos pasadas 3D r5 y las dos r4 del perfil sin grabación se observa `gl-ready`/`balanced` al inicio y `automatic-light` al final, sin indicadores de fallo interno, reintento, elección manual de ligero o movimiento reducido en esos estados. El cambio también ocurre sin `screenrecord`, por lo que grabar no es una condición necesaria para reproducirlo. [Muestras r5 1](evidence/sprint-optimization-20261102/android-r5-controlled/trial-1-3d.json), [r5 2](evidence/sprint-optimization-20261102/android-r5-controlled/trial-2-3d.json) y [revisión de las cuatro trazas](evidence/sprint-optimization-20261102/android-r5-controlled/review.md).

La cadena en el código de la APK es reproducible:

1. [`scene-performance.ts`](../mobile/lib/scene-performance.ts) identifica SwiftShader como software. La escena empieza equilibrada, con cadencia máxima de 30 dibujos/s y dimensión larga máxima de 384 píxeles físicos.
2. [`GoldBar3D.tsx`](../mobile/components/GoldBar3D.tsx) mide con `performance.now()` el tiempo de pared de cada `draw`. En equilibrado, necesita 24 muestras válidas y activa el límite si el elemento de índice 21 del conjunto ordenado supera **40 ms** (aproximación al p90; no exige que las 24 muestras sean lentas). En alta usa doce muestras y 20 ms para bajar primero a equilibrado. Los umbrales son idénticos en r4 y r5.
3. Al exceder el límite equilibrado, `onLimited` activa `limited` en [`MetalStory.tsx`](../mobile/components/MetalStory.tsx), que solicita la vista ligera con el texto «Vista ligera activada por coste de render». Las excepciones `create`/`draw`/`boundary`, el watchdog de contexto y la ausencia de GL siguen rutas separadas.

**Qué mide ese coste y qué no sabemos:** [`scene-renderer.ts`](../mobile/lib/scene-renderer.ts) termina el dibujo nativo con `finish`, `endFrameEXP` y `flushEXP`. La dependencia fijada `expo-gl@57.0.2` en `mobile/package-lock.json` implementa `flushEXP` como una operación bloqueante en cola (`common/EXWebGLMethodsDraw.cpp`, `common/EXGLNativeContext.cpp`). La medida incluye trabajo de envío y espera por finalización/cola nativa; no es CPU JavaScript pura ni tiempo GPU aislado. La ventana real de costes que disparó el límite no se exportó en el experimento, por lo que no se dispone de su valor p90 exacto. El p95 **HWUI de 88,75 ms no es la métrica de esta protección** y corresponde al tramo final ligero capturado.

El entorno medido usa SwiftShader en emulador. No se ha separado cuánto corresponde a software gráfico, planificación del emulador, cola nativa, driver o composición; tampoco se ha probado que el problema exista solo en emulador. La implementación Android de ExpoGL ejecuta `eglSwapBuffers` después de procesar la cola y, si falla, puede registrar `Cannot swap buffers!` sin lanzar una excepción JavaScript (`android/src/main/java/expo/modules/gl/GLContext.java`). Su `isContextLost` nativo retorna `false` (`common/EXWebGLMethods.cpp`). Por ello, no observar un error JS ni ver `gl-ready` demuestra presentación sana de cada frame. Los resultados existentes no contienen tiempos/contadores nativos de swap o del hilo GL para resolver esa parte; no se atribuye un fallo de driver sin evidencia.

La opacidad cero de la superficie retenida se aplica cuando `enabled` ya es falso, después de solicitar ligero en esta transición; no explica por sí sola la decisión inicial desde GL activo. No hay una corrección concreta demostrada que justifique revertir ese cambio, elevar umbrales, eliminar la barrera nativa o forzar 3D. **Se conserva la APK publicada, el fallback funcional y todas las protecciones gráficas.**

#### Regresión y decisión final

Se añadieron dos pruebas sobre las funciones reales extraídas de `GoldBar3D`: una espera nativa simulada activa el límite equilibrado solo al completar la ventana sin informar una excepción; una excepción de dibujo usa `fail('draw')` y no `onLimited`. Son pruebas sintéticas de las rutas de control, no mediciones nuevas de Android. El subconjunto pertinente aprobó **22/22**, sin omisiones:

```powershell
node --experimental-strip-types --test mobile/test/scene-performance.test.mjs mobile/test/gold-bar-adaptation.test.mjs
```

Los resultados de rendimiento, memoria y arranque anteriores se conservan, sin extrapolarlos a 3D sostenida ni a teléfono. Esta revisión solo añade pruebas y documentación: **el código de ejecución, la APK, la API y la demo comercial estable no cambian**. La comparación con `a43345e` no muestra cambios en componentes, librerías, recursos ni configuración de ejecución; API, `App.tsx` y `app.json` tampoco difieren de `main@ed87d2e`, y los perfiles comerciales de EAS se conservan. No se requiere otra versión, build u OTA. PR #11 permanece abierta en borrador, sin fusionar a `main`: comercio nativo emulado aprobado, aceptación gráfica sostenida y teléfono pendientes. El fallo audiovisual histórico se conserva como limitación de aquella evidencia; no se repite una grabación sin una solicitud expresa del propietario para esa ejecución.
