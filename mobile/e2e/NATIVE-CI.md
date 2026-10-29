# Android nativo en CI, actualización 0.1.3 → 0.2.0

Este recorrido está preparado; su presencia y las pruebas de sus validadores **no prueban instalación ni aceptación nativa**. Solo una ejecución posterior del workflow con un APK real puede aportar esa evidencia. No se ha iniciado un emulador local ni se usa control de pantalla.

El workflow Android UI verification es exclusivamente manual, en ubuntu-24.04 estándar y repositorio público, con concurrencia de una ejecución. Repara permisos KVM mediante udev y exige aceleración accesible; no continúa con CPU sin aceleración. El renderizador gráfico SwiftShader del emulador es independiente de KVM. No acredita rendimiento en un teléfono.

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
4. Introducir como inputs públicos apk_url y apk_sha256 de un APK 0.2.0/versionCode 5 real. Se aceptan únicamente URLs HTTPS públicas de artefactos Expo o releases de Blaister9/Openminerals, sin credenciales, query ni fragmento. Firma, paquete, hash, versión y ABI x86_64 son obligatorios antes de arrancar.
5. Disparar manualmente desde código revisado. Retirar los seis secretos tras la aceptación. GitHub no proporciona caducidad automática: el propietario realiza esta retirada. Una repetición necesita fixtures nuevos; no se reinicia ni borra una mina ya utilizada.

No introducir DEMO_ADMIN_TOKEN, DATABASE_URL, claves EAS/Railway, claves de recuperación ni credenciales del operador público en este workflow. La provisión administrativa se realiza fuera de GitHub Actions. No guardar archivos de credenciales en Git.

## Qué recorre

El helper rechaza equipos físicos, múltiples dispositivos, otros sistemas operativos y ejecución fuera de GitHub Actions. Se instala el APK 0.1.3 verificado, código 4, certificado SHA-256 3ae9a19077ab3f434b5885981d35e3d29966e406e7438b8f0558c155d47e3e1c. El flujo anterior trades.yaml crea una sesión ilustrativa independiente con tres operaciones: USDT 268,40 y comprobante antiguo de compra con USDT 196,77.

Después se ejecuta **adb install -r** del APK nuevo, sin desinstalar, borrar almacenamiento ni clearState. Se verifican código 5, wallet anterior, historial 3 y snapshot antiguo. Se recorren las cinco escenas, disponibilidad del renderizador 3D, arrastre, movimiento reducido y salida a Mercado. Las imágenes públicas se limitan a estas fases anónimas anteriores a cualquier credencial.

El registro nativo usa alias/clave nuevos solo en RAM, desactiva explícitamente la importación y no realiza operaciones. Al cerrar sesión recuperaUSDT 268,40. La cuenta pública nueva inicia sin historial/metales y no consume inventario del propietario. **La importación nativa de una sesión a una cuenta sigue siendo una aceptación distinta**; no se presenta este registro como prueba de importación.

Las tres identidades aisladas recorren:

- Comprador A: USD 200→USDT 450; compra 2 g oro→USDT 157,10; consulta certificado; publica 0,5 g a 140 USDT/g.
- Comprador B: abre la oferta y la compra completa por 70 USDT→USDT 180/0,5 g; consulta su certificado.
- Comprador A: recibe 69,16 USDT netos; vende 0,5 g→USDT 297,89; solicita entregar 0,5 g en jurisdicción DEMO A.
- Operador: emite cotización 10 USDT. A lee requisitos y acepta→USDT 287,89. Operador registra preparación, despacho y entrega ficticios, repone 1 g con pureza/ubicación/documento DEMO y consulta gestión/comprobante.
- A consulta su compra histórica con snapshot USDT 157,10, guarda perfil ficticio EUR/jurisdicción B y reabre la app con identidad y wallet conservadas.

Las aserciones nativas se complementan con lecturas API de esas mismas cuentas: posiciones finales A/B 500 mg, lotes origen transferidos, inventario 4500 mg + asignado 1000 mg = activo 5500 mg, peso original 6000 mg y entregado 500 mg, cero reservas, una reposición, una liquidación peer y 461 centésimas de comisiones de trading sin duplicación. El coste de entrega es 1000 centésimas separado. Se comprueba también que la gestión no exponga billeteras. Estas lecturas no sustituyen las aserciones de interfaz.

## Evidencia y diagnóstico público

Solo se sube openminerals-native/public, retención un día:

- Metadatos públicos de APKs y certificados, aceleración y versión Maestro.
- JUnit regenerado desde el resultado real de cada etapa/ejecución Maestro; etiquetas fijas y fallos conservados. No contiene detalles XML originales.
- Resumen de etapas y, si falla Maestro, failure-context.json con categoría cerrada y selectores/últimos comandos que coinciden exclusivamente con textos estáticos del YAML. Jamás se copia una línea raw.
- PNGs con nombres permitidos, capturados únicamente antes de autenticación.

Consola Maestro, XML original, debug, jerarquías, capturas automáticas de errores y cualquier log sensible permanecen privados en RUNNER_TEMP y no se publican. No se toma una captura de recuperación ni se generan recoveryKeys en este recorrido. Ninguna contraseña/token se pasa como argumento CLI, input del workflow o archivo de snapshot.

Las pruebas locales de android-ci.test.mjs validan URLs, límites, guardia adb, publicación de diagnósticos, YAML y conservación contra una API HTTP en memoria aislada. No arrancan adb, Maestro, un emulador ni Railway.

## OTA posterior opcional

native/ota.yaml queda fuera del runner inicial. Tras publicar y verificar una actualización compatible real, puede añadirse como última etapa en el mismo emulador desechable y sin operaciones pendientes. MAESTRO_EXPECTED_OTA_ID recibe el ID completo publicado; la aserción compara sus primeros ocho caracteres con el indicador de la app. Busca/fetch, realiza dos aperturas en frío y conserva wallet. No se inventa un ID ni se fuerza recarga durante una operación.

La aceptación de iPhone, un dispositivo Android físico, la importación nativa y los casos adversariales de recuperación no quedan acreditados por este workflow. Conservar esos pendientes hasta ejecutarlos y registrar evidencia.
