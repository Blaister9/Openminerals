# Realismo geológico · Android

**Estado: candidata publicada; comparación Android en ejecución.** La fuente está congelada y la suite local aprobada. El informe separa las verificaciones realizadas de los recorridos nativos y mediciones físicas pendientes.

## Fuente y alcance

La base funcional es el [checkpoint de Inicio del informe 21](21-inicio-inmersivo-pantalla-completa.md), UI `a9ae62e`, con continuidad comercial registrada hasta `3e31bdd`. Proviene de la [PR #7](https://github.com/Blaister9/Openminerals/pull/7); `main` contiene `ad78797`. La nueva rama `codex/geological-realism-android-20261030` está apilada sobre ese trabajo, sin mezclar automáticamente sus cambios en main.

| Registro del candidato geológico | Estado |
| --- | --- |
| Fuente de aplicación congelada | [`c2eaaae`](https://github.com/Blaister9/Openminerals/commit/c2eaaaebc482229e360a1e8385d241595780d2d7). `18e8f8b` añade únicamente pruebas de adaptación, sin cambiar los archivos de aplicación. |
| PR del nuevo sprint | [PR #8](https://github.com/Blaister9/Openminerals/pull/8), base `codex/immersive-custody-20261029` (PR #7). |
| OTA Android | `01a18e27-57a7-7069-aa2d-c0e7ca0d118b`, grupo `19551e14-0fc2-4abb-b0b3-de3e713d1720`, **30/10/2026 13:51:45 Bogotá** (18:51:45 UTC), runtime `0.2.0`, canal `demo`. Prefijo `01a18e27`. |
| Contenido publicado | Hermes de 1.657.560 bytes, SHA-256 `0c4e6d1cd4a8622ee59f6051bb77cf2ecee7b8b6dbcc167febe53f6b792615b6`. La copia exportada por EAS coincide exactamente con el hash del manifiesto público; incluye Railway HTTPS y excluye los orígenes locales de QA. La descarga directa del CDN respondió 403; no se eludió esa protección ni se presenta esa descarga como realizada. |

El alcance permanece en Android, React Native/Expo, con la composición de Inicio conservada como base. No se añaden dependencias, motores gráficos, WebViews ni módulos nativos. Esta revisión no cambia API, PostgreSQL, inventario o permisos. Dinero, precios, metales, custodia y entregas siguen siendo ficticios; no desarrolla iOS, blockchain ni transacciones reales.

## Recorrido y composición conservada

Los siete momentos son **Mina → Extracción → Procesamiento → Refinación → Formación del lingote → Custodia virtual → Fraccionamiento digital**. El último conserva el cierre hacia el portafolio y los accesos a Metales, Mercado y Billetera. Operar permite salir hacia Mercado desde el inicio.

Se mantiene un escenario continuo que avanza y retrocede con el dedo. El túnel cede protagonismo a la muestra extraída, que pasa al procesamiento y la formación del lingote. Las transformaciones dependen del desplazamiento, sin una reproducción autónoma que impida volver al mismo punto. La selección del metal modifica su representación y acompaña la selección existente; no crea existencias ni envía órdenes.

Inicio conserva toda el área disponible sobre la navegación inferior, sin devolver cabeceras de cuenta, avisos de vinculación, contador permanente o tarjetas financieras debajo del relato. El menú mantiene las opciones visuales y los capítulos. Continúan el acceso contextual a la cuenta y los bloqueos de sesiones vinculadas, acceso vencido y operaciones pendientes. El login normal y la entrada del operador a Mina no se convierten en un recorrido financiero nuevo.

La mina es una geometría ficticia. No representa una instalación, ubicación, plano de explotación o procedimiento industrial verificado. La secuencia común explica el concepto de transformación; no afirma que los cuatro metales compartan un proceso de extracción o refinación idéntico.

## Arquitectura de dibujo

El renderer compartido en `mobile/lib/scene-renderer.ts` sirve tanto al componente ExpoGL como a la comprobación de rasterización fuera de Android. Utiliza **un contexto GL y dos pasadas lógicas**: fondo geológico y espécimen en primer plano. La segunda dibuja el suelo y el objeto. La composición entre ambas es intencional; no es un modelo físico de una mina real.

Los buffers se preparan por contexto. El progreso, la cámara y el material se actualizan sin reconstruir la malla en cada cuadro. Las superficies rocosas incorporan variación de volumen, normales, oclusión aproximada, vetas, fragmentos y luminarias sintéticas. La extracción utiliza una muestra con más subdivisiones que el lingote anterior, para mejorar su silueta y el relieve sin introducir otro motor.

| Geometría de la escena cinematográfica | Triángulos |
| --- | ---: |
| Mina y sus elementos | 5.926 |
| Espécimen subdividido | 1.600 |
| Suelo del espécimen | 2 |
| Máximo cuando ambas pasadas coinciden | **7.528** |

Estas cantidades no son una medida de FPS ni del coste total por píxel. Se suben **613.128 bytes de atributos**, en cinco buffers, cuatro shaders y dos programas. El máximo de tres draws ocurre durante el solape; el suelo de opacidad cero se omite. El lingote base no cinematográfico conserva sus 400 triángulos. El suelo se ajusta al volumen mineral para evitar que corte la muestra durante su transformación.

## Metales, relieve y grabados

`mobile/lib/metal-materials.ts` define los cuatro materiales: **Au/Oro, Ag/Plata, Pt/Platino y Pd/Paladio**. El shader recibe reflectancia, rugosidad y tipo de grabado. Los bordes, las reflexiones, el microcepillado y la incisión del símbolo aportan volumen; la marca **DEMO** permanece integrada en el objeto. La frecuencia y amplitud del cepillado se redujeron para evitar franjas especulares dominantes.

El oro mantiene un aspecto amarillo; plata, platino y paladio utilizan materiales blancos neutros, apoyados por nombre y símbolo para identificarlos. No se convierte el platino en azul ni el paladio en violeta para separarlos. Las referencias de aspecto son de la Royal Society of Chemistry: [oro](https://periodic-table.rsc.org/element/79/gold), [plata](https://periodic-table.rsc.org/element/47/silver), [platino](https://periodic-table.rsc.org/element/78/platinum) y [paladio](https://periodic-table.rsc.org/element/46/palladium).

Los valores RGB lineales y de rugosidad son presets visuales DEMO, no constantes ópticas medidas ni ensayos de pureza. El acabado depende también de fabricación e iluminación: no debe utilizarse una captura para identificar químicamente un metal. No se añaden sellos de terceros, certificaciones o pesos físicos al grabado.

## Modo ligero, accesibilidad y ciclo de vida

El modo ligero y el movimiento reducido mantienen una alternativa con Views nativas: tres capas fijas de arcos y roca, seguidas de una barra identificada por su símbolo y DEMO. Sus opacidades siguen el desplazamiento en ambos sentidos. No incorpora cámara autónoma, parallax continuo ni un bucle de animación en reposo. Los cantos y contornos de los metales blancos también son neutros.

Se conservan las etiquetas accesibles de las siete etapas, los controles de lectura y la preferencia del sistema de movimiento reducido. La app permanece configurada en vertical. Texto ampliado y TalkBack físico siguen pendientes; cambio de metal y paso a segundo plano requieren los resultados Android de la fuente final. Una captura no acredita esos recorridos.

La preparación gráfica mantiene disposición y recreación del contexto, manejo de error y ausencia de dibujo cuando está desactivado. El presupuesto inicial del scheduler pasa a 60, con tolerancia inferior a un milisegundo para timestamps de vsync redondeados; el límite de 30 conserva su guarda anterior. El modo adaptativo puede reducir resolución y presupuesto, y recurrir al modo ligero. Su detector de coste de envío de dibujo no mide directamente FPS de GPU.

## Objetivo y comparación antes/después

El objetivo es una mina de mayor profundidad y detalle con **60 FPS como objetivo físico por verificar**, preservando las operaciones y la alternativa ligera. No basta que el scheduler permita 60 ni que una rasterización de escritorio termine correctamente.

La línea base nativa aprobó **7/7 etapas** en [41106807655](https://github.com/Blaister9/Openminerals/actions/runs/41106807655), arnés `8616a58`, sobre la **OTA anterior `01a18d53`, UI `a9ae62e`**. Los tres perfiles verificaron el final, quince gestos y el mismo hash de traza. HOME conservó proceso, etapa y GL listo, con avance/reversa posteriores. Es evidencia del Inicio anterior, no de la candidata geológica.

La comparación mantiene entrada, viewport, configuración de host, modo y condición de grabación. La ventana medida excluye preparación, menús y aserciones: tres avances, cuatro retrocesos y ocho avances, cada swipe solicitado de 1800 ms más 250 ms de asentamiento. SHA-256 de especificación `1a48933715ea7e75cfb38bbd45807fd8350da58c3513d6d7666c4f170c85ac9a`; traza compilada 1080 × 1920 `0e30040ccbf227ed1328ee314a4968da933464450aaca3ce8021981db201c8b3`.

El 3D nuevo es adaptativo: puede reducir el presupuesto a 30 y la escala del visor al 75% sin activar las Views ligeras. Esta revisión no registra telemetría del nivel intermedio o dimensiones del buffer GL. `automaticLight=false` sólo descarta el fallback a Views. La comparación evalúa experiencia con la misma entrada, sin aislar coste GPU a resolución fija. Arranque de Activity, interacción completa, estadísticas UI, muestras PSS y rasterización GL se distinguen; el promedio de cuadros de un MP4 no equivale a FPS de la app.

| Verificación | Resultado y alcance |
| --- | --- |
| Suite local con todos los GL de software activos | **282/282 aprobadas, cero omitidas**, con concurrencia de dos procesos; fuente `c2eaaae`. Incluye el renderer compuesto real, 13 progresiones distintas, dos retornos exactos, cuatro materiales y liberación de recursos. |
| CI actual | [41112124443](https://github.com/Blaister9/Openminerals/actions/runs/41112124443), `18e8f8b`: **284 aprobadas y cinco GL opcionales omitidas**, cero fallos, 289 casos totales; tipos, dependencias, toolchain y Expo Doctor **21/21** aprobados. API: 91 casos memoria + 79 PostgreSQL distintos, con base CI desechable. El job PostgreSQL marca 80 porque incluye además un caso memoria ya contado. |
| Adaptación y sesiones obsoletas | `18e8f8b`: **7/7 pruebas adicionales** de los cierres reales del componente extraídos por AST. Comprueban límites, picos aislados, ready después de draw, cambio de metal, callbacks obsoletos y limpieza; usan reloj y draw simulados, sin medir GPU ni lifecycle nativo completo. |
| Línea base Android anterior | **7/7**, run `41106807655`, OTA anterior `01a18d53`. |
| Android del candidato y comparación con la misma traza | [41110591606](https://github.com/Blaister9/Openminerals/actions/runs/41110591606) en curso, fuente/arnés `c2eaaae`, OTA `01a18e27`; **PENDIENTE-NATIVO-GEO**. Añade una etapa de cuatro materiales a las siete anteriores. |
| Métricas antes/después y evidencia visual anónima | **PENDIENTE-NATIVO-GEO**. |
| Regresión comercial sobre el candidato | [41111642553](https://github.com/Blaister9/Openminerals/actions/runs/41111642553), alcance XAU, fuente `c2eaaae`, OTA `01a18e27`, en cola/ejecución; **PENDIENTE-NATIVO-GEO**. Conserva las 23 etapas y añade materiales (24). Utiliza un fixture nuevo, sin reiniciar el anterior ni la mina compartida. |

La validación física en **Samsung Galaxy S23 Ultra** queda pendiente. La conexión USB fue pospuesta por el propietario; no se exige ni se vuelve a solicitar para continuar esta preparación. Rendimiento físico y aceptación visual del nuevo realismo permanecen por comprobar.

## Distribución Android

Esta ampliación de JavaScript, geometría y shaders conserva el [APK firmado Android 0.2.0/código 5](https://github.com/Blaister9/Openminerals/releases/download/v0.2.0-demo/Openminerals-Demo-0.2.0-android.apk), la firma, el canal `demo` y el runtime `0.2.0`. La OTA geológica publicada se identifica por **`01a18e27`**; su aplicación nativa sigue bajo comprobación en las ejecuciones anteriores. No requiere descargar otro APK si 0.2.0 ya está instalado.

El procedimiento de actualización conserva datos: resolver los pendientes, buscar actualización desde Actividad o Cuenta, esperar la descarga y cerrar/reabrir cuando no haya operaciones pendientes. El prefijo anterior `01a18d53` identifica la base, no demuestra la recepción de esta mina geológica. No desinstalar, borrar datos o crear otra cuenta para probar una actualización.

## Incidencias detectadas durante la preparación

La primera composición de roca resultaba demasiado cúbica y oscura; se reemplazaron los bloques por protuberancias ancladas y se ajustaron exposición, estratos y fisuras. La muestra extraída pasó de un fundido translúcido a crecimiento geométrico sólido. La inversión horizontal después de un arrastre largo tenía una zona muerta por el clamp de cámara combinado con desplazamiento acumulado: se separaron giro y peek incremental, con dos regresiones verificadas. Se omitió además un pase de suelo invisible y se corrigió un buffer sin registrar ante un fallo de atributo.

Una ejecución local con todos los renders Chrome en paralelo activó el límite existente de diez segundos al arrancar el parser Python de recuperación. Ese test aprobó aislado y la suite completa aprobó 282/282 con concurrencia dos. El parser, su timeout y los módulos financieros no se modificaron.
