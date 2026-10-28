# Revisión móvil 0.1.1 · 28 de octubre de 2026

## Evidencia del propietario en Android

El propietario informó que instaló y abrió el APK 0.1.0 en un teléfono Android. Comunicó una conversión de USD a USDT, una compra de 1050 g rechazada por saldo insuficiente, una compra de 0,5 g que apareció en Mis metales con valoración de 72,50 USDT y su venta posterior, que dejó cero gramos. No indicó modelo, versión Android, identificador de sesión ni comprobantes; no se inventan esos datos.

La conversión relatada fue de 20 USD; no se da por verificada la conversión de 200 USD ni la compra de 2 g del guion original. Tampoco se declararon probados en el teléfono la reapertura, las ofertas, las entregas o el reintento tras desconexión. Se trata de validación física parcial comunicada por el propietario, no de una ejecución automatizada del agente.

## Problemas identificados y correcciones

- Inicio mostraba solo el valor del metal, por lo que podía quedar en cero aun con saldo USDT. Ahora muestra USDT disponible, valoración de metales y su suma; aclara que COP, EUR y USD no se incluyen en esa suma.
- `1050` se interpretaba correctamente como 1050 gramos, pero la pantalla no lo hacía suficientemente claro. Ahora muestra la cantidad interpretada, ofrece botones 0,1/0,5/1/2 g y admite coma o punto decimal. No adivina un decimal omitido ni acepta formatos ambiguos con separadores de miles.
- La valoración de 0,5 g de oro es 72,50 USDT, mientras la compra cuesta 73,23 USDT con comisión. Ahora se desglosan metal, comisión y total. El redondeo reproduce por separado base y comisión de la API.
- La compra se deshabilita cuando la cantidad es inválida o supera el saldo o inventario ficticio. La API sigue siendo la autoridad y conserva la validación de saldo y la idempotencia.
- El recorrido anterior se manejaba con botones. Ahora hay cuatro escenas ligadas al desplazamiento vertical, con ilustración 2.5D y movimiento reducido. No se presenta como un motor 3D ni como la secuencia cinematográfica final.

## Alcance técnico

Se conserva Expo SDK 57, React Native 0.86.3 y el backend existente. No se añadieron dependencias ni se modificaron saldos o sesiones del propietario. Android mantiene `com.openminerals.demo.mobile`; la revisión tiene versión 0.1.1 y `versionCode: 2` para instalarse como actualización con la firma de EAS existente.

Instalar la actualización sobre la app existente, sin desinstalar ni borrar almacenamiento. Comprobar después que permanecen el saldo y el historial; esa conservación aún requiere confirmación en el teléfono.

## Validación de esta revisión

- 17/17 pruebas móviles aprobadas: las diez de recuperación y siete de presentación/cantidades.
- TypeScript aprobado.
- Metro/Hermes Android: 594 módulos; iOS: 596 módulos, exports aprobados.
- Las pruebas comparan el coste y redondeo con el motor API, y comprueban USDT disponible con cero metal, coma decimal, 1050 g y formatos inválidos.
- La comprobación visual del scroll y del resumen actualizado en el teléfono sigue pendiente.
- Compilación nativa Android 0.1.1 / versión de compilación 2: EAS `FINISHED`, sin error. [Build 41fb0e8f](https://expo.dev/accounts/chipirips-team/projects/openminerals-demo/builds/41fb0e8f-ee7c-4439-a5a5-20305647065a), fuente `608120d9c8a73aee58100db9d91aef5a7baad02e`. El APK 0.1.0 no incluye estas correcciones.
- No se solicitó un nuevo build iOS físico; sigue bloqueado por firma Apple. El export iOS de esta revisión no sustituye un instalador ni una prueba en iPhone.

## Recorrido al recibir el APK actualizado

1. Instalar como actualización y comprobar versión 0.1.1.
2. Abrir Inicio: contrastar USDT disponible con Billetera. Cero metales debe afectar solo a la fila de metales, no ocultar el dinero simulado.
3. Deslizar Inicio hacia abajo y recorrer origen, refinación, custodia y fraccionamiento. Activar movimiento reducido; los textos deben seguir legibles.
4. En Mercado, seleccionar 0,5 g y comprobar metal 72,50, comisión 0,73 y total 73,23 USDT para oro con la referencia ficticia actual.
5. Probar `0,5` y `0.5`: ambas entradas deben indicar 0,5 gramos. `1050` debe indicar 1050 gramos y bloquear compra cuando no haya saldo.
6. Si se desea repetir la compraventa ficticia, comprobar descuento, portafolio y abono; revisar que el historial anterior no se borró.

No se contrataron servicios de pruebas ni suscripciones adicionales. Este equipo no dispone de un emulador Android local preparado; se intentó la comprobación nativa mediante Maestro CLI en un runner estándar de GitHub Actions. El resultado se registra abajo y se entrega el APK para validación física.

## APK 0.1.1 generado

[Descargar actualización Android](https://expo.dev/artifacts/eas/aO-xj5vXxzQE7PiFcZDMaFq6Izjb-l5w9i27deWmgl8.apk). Copia local: `artifacts/openminerals-android-0.1.1-41fb0e8f.apk`, 68.522.537 bytes, SHA-256 `0512BF8414BD30D8F0E674A348ADAAC4B0E928A54B226F9CBED9D1C333253E36`. Se comprobó dentro del bundle la URL HTTPS de Railway, el relato y la etiqueta de USDT disponible. `apksigner verify` aprobó ambos APK y confirmó el mismo certificado SHA-256 público: `3ae9a19077ab3f434b5885981d35e3d29966e406e7438b8f0558c155d47e3e1c`. Esto verifica la firma compatible, pero no sustituye probar la actualización y la conservación del historial. No se borraron los artefactos 0.1.0.

Cambios publicados en [PR #1](https://github.com/Blaister9/Openminerals/pull/1), rama `codex/mobile-overview-scroll-20261028`. La validación de código pasó con 17 pruebas móviles, TypeScript, dependencias Expo y pruebas API/PostgreSQL. El resultado del nuevo emulador se registra por separado y no se infiere de esos controles.

## Prueba nativa en GitHub Actions

Se preparó un job de runner estándar para el repositorio público, con Maestro CLI open source fijado a versión y hash, sin servicios Cloud adicionales. El flujo usa únicamente una sesión ficticia nueva del emulador: resumen inicial, cuatro escenas, reducción de movimiento, conversión de 20 USD, compra/venta de 0,5 g y reapertura. Los artefactos de diagnóstico tienen retención de un día; las copias descargadas se conservarán localmente.

El primer intento [40733749112](https://github.com/Blaister9/Openminerals/actions/runs/40733749112) no llegó a iniciar un job: GitHub rechazó el contexto `runner.temp` en variables de nivel job. Se corrigió en `4c13140`, inicializando la ruta durante el primer paso del runner. El error era de la configuración de CI y no se registra como una prueba de la app ejecutada.

Los siguientes intentos tampoco ejecutaron la app:

- [40734370350](https://github.com/Blaister9/Openminerals/actions/runs/40734370350): el parser de salida de `apksigner` esperaba otro prefijo. La verificación criptográfica de ambos APK sí pasó. Se corrigió el parser y se fijó el certificado público de referencia en `2c62ab5`.
- [40734937660](https://github.com/Blaister9/Openminerals/actions/runs/40734937660): el commit seleccionado de la acción de emulador no incluía sus módulos distribuidos. Se fijó el release empaquetado v2.38.0 por SHA en `b6c8bf0`.
- [40735474446](https://github.com/Blaister9/Openminerals/actions/runs/40735474446): el runner no exponía `/dev/kvm`. Se añadió detección y el modo de emulación por software documentado por la acción en `e07d959`, con `emulator-boot-timeout: 600` y un límite total de job de veinticinco minutos.

El intento [40736047181](https://github.com/Blaister9/Openminerals/actions/runs/40736047181) pasó descarga, firma y preparación de Maestro. El emulador informó `Boot completed in 759602 ms` y empezó `mobile/e2e/run.sh`, que alcanzó la API. Estado del recorrido nativo: pendiente de comprobar sus resultados. No se afirma todavía que el scroll haya pasado la prueba en emulador ni en el teléfono del propietario.
