# Recorrido de presentación Android

Todo el recorrido usa cuentas, USDT, metales, documentos y entregas **simulados**. No introducir identidad, direcciones ni documentos personales. Esta guía no acredita por sí misma una prueba en teléfono; registrar la ejecución y su resultado.

## Preparar el teléfono

1. Conservar la instalación y sus datos. Si aún no está instalado, usar el [APK firmado 0.2.0](https://github.com/Blaister9/Openminerals/releases/download/v0.2.0-demo/Openminerals-Demo-0.2.0-android.apk) como actualización, sin desinstalar.
2. Abrir **Actividad → Actualizaciones de la demo** como comprador, o **Cuenta** como operador. Buscar actualización cuando no exista una operación pendiente; cerrar completamente y volver a abrir. La revisión de este sprint muestra **Actualización aplicada · 01a188b0**.
3. Tener dos cuentas compradoras de prueba para demostrar el intercambio. El registro admite alias ficticio y clave exclusiva de la demo. Crear cuentas nuevas sin importar la sesión anterior si se quieren reproducir los saldos del ejemplo; las cuentas existentes conservan sus propios valores.
4. Abrir la cuenta de mina con el [acceso público autorizado del operador](../demo-access/operator-public.json). Revisar **Mina → Inventario**. Si no hay oro disponible, registrar un lote nuevo ficticio con peso, pureza, ubicación DEMO, documento ilustrativo y motivo; es una reposición trazable, no un ajuste de los gramos ya asignados.

El inventario y el historial pueden contener pruebas anteriores. No borrarlos ni reiniciarlos para igualar el ejemplo. Los importes siguientes corresponden a dos compradores nuevos y a las tarifas iniciales de simulación; revisar siempre la confirmación de la aplicación.

## Comprador A: billetera, compra y custodia

1. Convertir **200 USD → USDT**. Con los saldos iniciales de la demo, quedan 400 USD y 450 USDT.
2. En Mercado, comprar **2 g de oro**. A la referencia ficticia de 145 USDT/g: metal 290, comisión 2,90, total 292,90; saldo USDT 157,10.
3. Consultar el comprobante y después **Metales → Lotes y certificados**. Abrir el certificado: lote, pureza, cantidad emitida/asignada y fecha. El certificado es DEMO, sin valor legal ni acreditación física.
4. Abrir **Ver movimientos del lote**: debe existir la compra por 2 g con su referencia. Una apertura de un lote anterior conserva el estado previo; no debe interpretarse como una compra histórica reconstruida.

## Intercambio entre compradores

1. Con A, publicar una oferta de **0,5 g a 140 USDT/g**. Esos gramos quedan reservados; no se pueden comprometer otra vez para vender o entregar.
2. Cambiar a B, abrir **Mercado → Marketplace** y comprar la oferta completa. Revisar importe 70 USDT y confirmación.
3. B queda con 180 USDT y 0,5 g. Su certificado y diario muestran la asignación y entrada de marketplace.
4. Volver a A. Se acredita el neto 69,16 USDT (comisión ficticia 0,84); saldo 226,26 USDT y 1,5 g. Su oferta está vendida y su diario muestra salida por marketplace. Cada cuenta conserva su propio comprobante.
5. Vender directamente **0,5 g** desde A: base 72,50, comisión 0,87, neto 71,63. Quedan 297,89 USDT y 1 g.

## Solicitud, cotización y entrega simulada

1. A solicita **0,5 g** en **Metales → Entregas DEMO**, jurisdicción ficticia A. Se reservan los gramos; todavía no se cobran costes.
2. Cambiar al operador y abrir **Mina → Entregas DEMO**. Revisar la solicitud y emitir su cotización. Con la política inicial: servicio 2, preparación 3 y transporte 5 USDT; seguro e impuesto DEMO 0. Total 10 USDT. Si se cambió la política, usar su desglose actual.
3. Volver a A, leer cada requisito ficticio y aceptar. Debe descontarse el total una sola vez; en el ejemplo quedan 287,89 USDT. La solicitud pasa a aceptada y mantiene los gramos reservados.
4. Como operador, registrar un motivo y avanzar sucesivamente a preparación, despacho DEMO y entrega DEMO. Cada acción requiere confirmación y deja evidencia.
5. A conserva **0,5 g** y B **0,5 g**. La salida final retira los otros 0,5 g de la posición de A y del suministro activo; el peso original del lote y sus certificados se conservan. El diario del lote registra la salida.

Después de aceptar costes, la demo no ofrece cancelación ni reembolso de esa entrega. Antes de aceptar se puede cancelar/rechazar y liberar la reserva. Ningún estado crea un transporte real.

## Operador: inventario y gerencia

- Verificar disponible/asignado y las reservas dentro de lo asignado. En el escenario aislado de CI, que empieza con 5 g y registra después una reposición de 1 g: original 6 g, entregado 0,5 g, activo 5,5 g, disponible 4,5 g y asignado 1 g. Una mina con datos anteriores tendrá otros totales.
- En **Panel gerencial**, filtrar por el comprador A y oro. El ejemplo tiene compra directa 2 g, venta directa 0,5 g e intercambio 0,5 g, contado una sola vez. Las comisiones de negociación del ejemplo suman 4,61 USDT; los costes de entrega 10 USDT se muestran separados.
- Consultar el historial, comprobantes autorizados y los lotes de la mina. El operador no debe recibir saldos de billeteras privadas ni conversiones/ingresos personales.
- Consultar perfil y guardar preferencias ficticias. Para un comprador, la recuperación se habilita con su contraseña y una clave privada que debe conservar fuera de la app; nunca incluirla en capturas o informes. El operador público no permite recuperación por autoservicio.

## Cierre de la prueba física

Cerrar y reabrir la app. Confirmar cuenta, saldos, posiciones, oferta vendida, entrega y comprobantes conservados. Si aparece una operación pendiente, reintentar la misma antes de cambiar de cuenta; no repetirla como una operación nueva.

Al cerrar una cuenta, revisar el rótulo de identidad. La sesión legacy guardada en el dispositivo conserva su historial y puede reaparecer; la cuenta cerrada debe desaparecer de la vista. El modo sin cuenta es una compatibilidad exclusiva de la demo.

Registrar: fecha, modelo/Android, revisión aplicada, pasos aprobados y cualquier error literal sin credenciales. Comprobar también arrastre del lingote, las cinco escenas, omisión y movimiento reducido. La ejecución emulada y los tests de API no sustituyen esta aceptación física ni sus medidas de rendimiento.

[Evidencia técnica y pendientes del sprint](16-sprint-android-2026-10-29.md).
