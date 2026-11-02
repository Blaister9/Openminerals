# Perfil Android controlado: r4 frente a r5

[Run 41477328703](https://github.com/Blaister9/Openminerals/actions/runs/41477328703) aprobado, arnés df8d985. Ocho trazas completas y 16 capturas anónimas, mismo emulador API29/x86_64/SwiftShader, orden ABBA y dos pasadas por APK/modo. Los 15 gestos, coordenadas y hashes son idénticos. Las fuentes binarias son ce9b79b5abbe0389e5f2661dda0d7abc6b53bc14 y a43345e9dee49cebd077b7520c79b7fc2b49be03; el SHA del arnés no sustituye esos vínculos.

**R5 mejora el modo ligero en ambas repeticiones, pero no acredita 3D sostenida ni 60 FPS.** La media de los p95 HWUI capturados baja 30.8%; los FPS observados de ventana suben 34.0%. La PSS sostenida media cambia 0.36%, con variabilidad entre las dos pasadas. Son medias de resultados por traza, no percentiles combinados ni significancia estadística.

| Trial/APK | Modo | p50/p95 HWUI, ms | Ventana FPS / p95 intervalo ms / lentos | PSS pico muestreado / mediana sostenida, KiB | Activity / escena observada, ms | Modo inicial → final |
| --- | --- | --- | --- | --- | --- | --- |
| 0 r4 | light | 99.8 / 125.8 | 17.50 / 92.6 / 86.8% | 133508 / 126690 | 1490 / 5205.6 | light → light |
| 0 r4 | 3d | 95.1 / 121.1 | 17.87 / 81.7 / 86.0% | 128500 / 126574 | 1324 / 4431.1 | gl → automatic-light |
| 1 r5 | light | 70.5 / 89.8 | 25.11 / 60.6 / 77.5% | 138624 / 133164 | 1071 / 4387.2 | light → light |
| 1 r5 | 3d | 64.5 / 91.5 | 22.05 / 61.3 / 77.4% | 132621 / 128596 | 996 / 4325.6 | gl → automatic-light |
| 2 r5 | light | 62.9 / 87.7 | 23.02 / 65.8 / 78.1% | 131927 / 126614 | 1231 / 4517.9 | light → light |
| 2 r5 | 3d | 63.9 / 85.7 | 20.65 / 70.0 / 79.6% | 131714 / 130442 | 1243 / 4843.2 | gl → automatic-light |
| 3 r4 | light | 96.8 / 130.8 | 18.41 / 82.3 / 88.9% | 141974 / 132152 | 1137 / 4485.2 | light → light |
| 3 r4 | 3d | 92.5 / 113.4 | 17.74 / 83.0 / 85.0% | 137086 / 132179 | 928 / 4011.2 | gl → automatic-light |

Los FPS de ventana describen la presentación de MainActivity, UI y TextureView compuestas. Nunca equivalen a FPS de ExpoGL o ejecución GPU. Se calculan entre el primer y último timestamp válidos (~29 s), mientras la traza completa dura ~33 s; excluyen sus bordes sin presentación. Los intervalos lentos superan ~25 ms (1,5 periodos de refresco). Incluso r5 conserva aproximadamente 77–80% de intervalos lentos y ~98–99% de frames UI totales clasificados como janky. La meta 60 FPS continúa abierta.

HWUI usa 120 filas finales: son FrameCompleted−IntendedVsync e incluyen la tubería UI, esperas y planificación. Los segmentos ligeros muestran menor cola RenderThread y menor tramo de envío, pero no aíslan tiempo CPU o GPU:

| Segmento de reloj HWUI | Media p95 r4, ms | Media p95 r5, ms | Cambio |
| --- | --- | --- | --- |
| uiWork | 16.45 | 10.79 | -34.4% |
| renderThreadQueue | 44.03 | 30.55 | -30.6% |
| renderSubmission | 37.26 | 25.83 | -30.7% |
| postSwap | 18.61 | 18.85 | 1.3% |

JS reporta 102/120 ticks en ligero r4 y 142/144 en r5; RenderThread 1663/1727 frente a 1614/1627. Son ticks CPU, sin convertirlos a milisegundos ni atribuirlos a una función. El aumento JS acompaña más actualizaciones presentadas; este contraste no demuestra su causa. El hilo GL no fue identificado: null significa unavailable, no coste cero.

Las cuatro trazas iniciadas en 3D, incluidas ambas r5, empiezan con GL equilibrado y terminan en ligero automático. Por tanto los tiempos capturados no aceptan una escena 3D sostenida a calidad fija. Las cuatro instancias r5 registran exactamente un marcador engraving-derivatives y cero engraving-finite-difference; r4 no tenía instrumentación y sus ceros no identifican su shader.

PSS tiene 34 muestras por traza, aproximadamente una por segundo. El máximo observado no es el pico continuo; el sostenido usa la mitad final. Las muestras r5 no muestran un gran salto sostenido frente a r4, pero dos repeticiones no establecen equivalencia estadística. Activity y primera escena observada son mediciones distintas; esta última incluye polling y se toma antes de preparar el modo seleccionado, sin verificar API lista.

El histórico 0.3.0/r4 del run 41466137890 usa otro runner, capacidades de medición y cargas previas. Su p95 ligero r4 medio 174 ms pasa a 128 ms en este run sin cambiar el APK r4. No se atribuye esa diferencia a una causa aislada ni se usa el histórico para declarar eliminada la regresión frente a 0.3.0. El resultado de 85 ms anterior tampoco es un objetivo aceptado automáticamente.

Se inspeccionaron las 16 capturas originales: los orígenes GL conservan galería, relieve y vetas; los ocho finales llegan a Portafolio y muestran su CTA en ligero. El lingote cruza detrás del título final en ambos APK; texto y CTA siguen legibles. Véase visual-review.json. No hay video en este perfil; el caso comparativo con grabación es independiente. No se introdujeron credenciales ni operaciones y se conservó UID/versión de la app estable. No equivale a aceptación en teléfono físico.
