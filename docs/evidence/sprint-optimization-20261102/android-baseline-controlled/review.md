# Baseline Android controlada: 0.3.0 frente a r4

[Run 41466137890](https://github.com/Blaister9/Openminerals/actions/runs/41466137890) aprobado. Un emulador desechable API29/x86_64/SwiftShader, orden ABBA y dos repeticiones por APK y modo. Las ocho trazas completaron los mismos 15 gestos con idénticas coordenadas y hashes de protocolo.

**La regresión del modo ligero se reproduce en ambas pasadas.** Frente a 0.3.0, r4 aumenta la media de los p95 HWUI capturados un 36,8 %, reduce el throughput UI un 38,0 % y aumenta la PSS sostenida un 16,0 %. Son medias de dos resultados por modo, no un percentil combinado ni una prueba de significancia estadística.

| Trial/arm | Modo | p50 / p95 HWUI, ms | Throughput UI, frames/s | PSS pico muestreado / mediana sostenida, KiB | Activity / escena observada, ms | Estado inicial → final |
| --- | --- | --- | --- | --- | --- | --- |
| 0 A | light | 102.0 / 127.8 | 16.75 | 120249 / 113770 | 1831 / 7108.8 | light → light |
| 0 A | 3d | 373.7 / 581.9 | 5.21 | 123314 / 114860 | 1605 / 4811.8 | gl → gl |
| 1 B | light | 151.7 / 175.1 | 10.13 | 134797 / 128912 | 1467 / 5303.5 | light → light |
| 1 B | 3d | 146.0 / 174.2 | 9.88 | 132016 / 127572 | 1359 / 5282.7 | gl → automatic-light |
| 2 B | light | 146.6 / 172.6 | 10.35 | 139695 / 131217 | 1264 / 5249.1 | light → light |
| 2 B | 3d | 142.2 / 178.1 | 9.73 | 132163 / 129656 | 1376 / 5524.2 | gl → automatic-light |
| 3 A | light | 105.1 / 126.4 | 16.27 | 117619 / 110505 | 1240 / 4747.5 | light → light |
| 3 A | 3d | 358.7 / 579.6 | 5.20 | 122353 / 115175 | 1237 / 4640.0 | gl → gl |

A = demo 0.3.0; B = Mina Preview r4. Los p50/p95 exactos provienen de 120 filas HWUI finales: cubren aproximadamente 5,9–8,3 segundos en ligero y 21,5–22,9 segundos en la 3D estable. La métrica es FrameCompleted menos IntendedVsync; incluye el tránsito de la tubería UI y no aísla ejecución CPU. HWUI mide UI, no ExpoGL. Throughput UI tampoco es FPS GPU o de pantalla. Todos los 120 frames capturados por traza superan 16,67 ms; los janky totales son 99,29–100 %.

Las dos trazas r4 iniciadas en 3D cambian de GL equilibrado a ligero automático; la estable conserva GL. Por eso no se acepta una mejora 3D sostenida a partir de sus tiempos UI inferiores. La PSS muestreada tampoco es el pico continuo; las 35–37 muestras por traza incluyen el coste de dumpsys.

RenderThread reporta 1542/1583 ticks en ligero estable y 1809/1823 en r4. Los ticks JS/GL son nulos porque el reconocedor anterior no identifica esos hilos, no porque consuman cero. La detección de presentación buscó solo SurfaceView y devolvió unavailable en las ocho trazas; ExpoGL usa TextureView. Este run no ejecutó el posterior fallback a MainActivity, la detección mqt_v_js, los marcadores de shader ni las capturas PNG.

El lanzamiento Activity y la primera observación UI/escena son métricas distintas. La primera referencia fría tarda más y el polling es una cota observada con sobrecoste; no se declara mejora concluyente de carga. No se midieron datos listos de API, GPU móvil, temperatura ni teléfono físico.

ABBA confirma la regresión ligera bajo este protocolo; no aísla su causa entre retención GL, opacidad/composición de imagen y otro trabajo UI. Los experimentos de shader de escritorio se registran aparte. No se alcanza ni se acredita 60 FPS. UID/versión de la app estable conservados; sin operaciones ni credenciales.
