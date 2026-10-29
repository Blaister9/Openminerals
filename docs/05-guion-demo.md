# Openminerals · Guion de presentación al operador de mina

**Duración orientativa:** demostración guiada, no vídeo final.

| Escena | Acción en app | Mensaje gerencial |
|---|---|---|
| 1 | Inicio; lingote con movimiento; cuatro pasos | El metal se conecta con una historia de origen, trazabilidad y custodia. Los documentos reales serán un requisito de integración. |
| 2 | Billetera; saldos COP/EUR/USD/USDT | La experiencia permite una cuenta multidivisa como interfaz; en producción cada activo depende de proveedores y régimen jurídico. |
| 3 | Convertir USD 200.00 a USDT | El cliente se prepara para comprar; es una conversión interna ficticia. |
| 4 | Mercado: oro 2.000 gramos; confirmar | El sistema valida saldo e inventario, descuenta USDT y acredita gramos. |
| 5 | Mis metales; observar 2.000 g y valoración | El cliente sigue su posición y los movimientos desde el celular. |
| 6 | Simular venta de 0.500 g o publicar oferta | Distinguir recompra directa de oferta sin comprador. Mostrar comisión y reserva. |
| 7 | Solicitar cotización de entrega física sobre gramos restantes | Ilustrar petición sin prometer despacho, impuesto ni disponibilidad real. |
| 8 | Más → Vista del operador | Mostrar inventario ficticio, comisiones demostrativas y solicitudes. |

### Mensaje final al cliente

> «Esto demuestra la experiencia de usuario y la lógica operativa básica. Para monetizar metal real, necesitamos definir contratos, titularidad, custodia, validación de inventario, socios de liquidación y el marco de cumplimiento en cada jurisdicción».

### Lo que no se debe afirmar

- Que los lingotes están auditados o asignados a una bóveda real.
- Que Openminerals posee fondos de clientes o licencias regulatorias.
- Que existe blockchain, tokens redimibles, rendimientos, recompra ilimitada o cotizaciones de bolsa en tiempo real.
- Que pedir entrega física equivale a ordenar un envío y pagar impuestos fijados.

## Aceptación en el teléfono: pendiente de ejecutar

Registrar modelo, versión del sistema, ID del build, fecha y resultado. Este recorrido no se ha ejecutado en un teléfono físico. Los importes siguientes son referencias ficticias del motor actual, comprobadas el 28 de octubre de 2026; no son precios reales.

Para una sesión nueva, USD comienza en 600,00 y USDT en 250,00. Si la sesión ya tiene movimientos, comprobar las variaciones en lugar de borrar sus datos.

| Paso | Acción | Resultado esperado para una sesión nueva |
| --- | --- | --- |
| 1 | Abrir Openminerals Demo con conexión | Carga sin error; etiqueta DEMO visible; saldos procedentes de la API HTTPS |
| 2 | Billetera: convertir USD 200,00 a USDT | USD 400,00; USDT 450,00 |
| 3 | Mercado: comprar oro 2.000 g | Cargo USDT 292,90, incluida comisión 2,90; saldo USDT 157,10; oro 2,000 g |
| 4 | Mis metales: vender oro 0.500 g | Abono USDT 71,63 después de comisión 0,87; saldo USDT 228,73; oro 1,500 g |
| 5 | Publicar oferta de oro 0.500 g | Reservado 0,500 g; disponible 1,000 g; no existe comprador real |
| 6 | Solicitar cotización de entrega de 0.500 g | Reservado total 1,000 g; disponible 0,500 g; sin envío real |
| 7 | Cancelar oferta y solicitud de entrega | Disponible otra vez 1,500 g; el saldo USDT no cambia |
| 8 | Intentar comprar oro 9.000 g | En 0.1.1, aviso de saldo insuficiente y botón deshabilitado; sin cambios en saldos ni metales. La API conserva su rechazo de solicitudes sin saldo |
| 9 | Más: historial y panel operador | Comprobantes consistentes; panel identificado como datos de esta sesión |
| 10 | Cerrar la app y abrirla de nuevo | Misma sesión, saldos, posiciones e historial |
| 11 | Desconectar la red e intentar una operación | Timeout/error; operación pendiente identificada; otras operaciones bloqueadas |
| 12 | Reconectar y reintentar el pendiente | Se usa la misma clave; un solo movimiento y comprobante. Verificar de nuevo el historial |

Las cantidades de entrada usan punto decimal, como `2.000` gramos y `200.00` dólares; la presentación puede usar coma según la configuración regional. No compartir identificadores de sesión de otras personas ni utilizar el token administrativo para este recorrido.
