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
- Compilación nativa Android 0.1.1: pendiente de solicitar y registrar el resultado. El APK 0.1.0 no incluye estas correcciones.
- No se solicitó un nuevo build iOS físico; sigue bloqueado por firma Apple. El export iOS de esta revisión no sustituye un instalador ni una prueba en iPhone.

## Recorrido al recibir el APK actualizado

1. Instalar como actualización y comprobar versión 0.1.1.
2. Abrir Inicio: contrastar USDT disponible con Billetera. Cero metales debe afectar solo a la fila de metales, no ocultar el dinero simulado.
3. Deslizar Inicio hacia abajo y recorrer origen, refinación, custodia y fraccionamiento. Activar movimiento reducido; los textos deben seguir legibles.
4. En Mercado, seleccionar 0,5 g y comprobar metal 72,50, comisión 0,73 y total 73,23 USDT para oro con la referencia ficticia actual.
5. Probar `0,5` y `0.5`: ambas entradas deben indicar 0,5 gramos. `1050` debe indicar 1050 gramos y bloquear compra cuando no haya saldo.
6. Si se desea repetir la compraventa ficticia, comprobar descuento, portafolio y abono; revisar que el historial anterior no se borró.

No se contrataron servicios de pruebas ni suscripciones adicionales. La comprobación nativa de UI mediante Maestro en EAS no está incluida en el plan Free consultado, y este equipo no dispone de un emulador Android local preparado. Se entregarán las comprobaciones realmente ejecutadas y el APK para validación física.
