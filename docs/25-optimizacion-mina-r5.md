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

El bitmap ligero se volvió a generar desde el renderer actual: 360×640, 310.167 bytes, sin descarga externa. Para contrastar el coste UI se excluye de composición la superficie retenida cuando está pausada y se acota la capa alfa del lingote ligero manteniendo las mismas coordenadas de centro y sombra. El contexto permanece retenido para reanudar sin destruir una presentación pendiente. La eficacia y memoria de estos cambios necesitan el comparativo nativo; no se atribuyen a la causa de r4 solo por estar implementados.

## Estado de ejecución

El perfil nativo controlado 0.3.0/r4 está en ejecución: [41466137890](https://github.com/Blaister9/Openminerals/actions/runs/41466137890), fuente del arnés `0c613cf`. Utiliza orden ABBA, dos repeticiones por APK/modo, la misma traza y un muestreador independiente para PSS/presentación. Los resultados todavía no se atribuyen a la app. Pico de PSS significa máximo **muestreado**, no máximo continuo. HWUI, presentación opcional, deltas CPU y disponibilidad observada se reportan con sus propios alcances.

APK r5, evidencia comparativa nativa y aceptación comercial autenticada: pendientes de construcción/ejecución. No fusionar en `main` ni declarar 60 FPS. La aceptación física continúa pendiente por decisión del propietario.
