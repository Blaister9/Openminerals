# Openminerals · Funcionalidades pendientes de la demo

Revisión del código y del feedback del propietario, 28 de octubre de 2026. Este documento es un plan de trabajo; no declara implementadas las funciones propuestas. Se mantiene React Native/Expo y toda operación, identidad, cotización, lote y documento deberá ser ficticio.

Avance posterior autorizado: el bloque 0.1.2 implementa vistas previas de conversión/venta, comprobantes detallados y consulta paginada del historial. Pasaron pruebas de código, UI web local y lógica PostgreSQL Railway aislada; la activación de la API pública está detenida por una pausa de despliegues y la instalación Android nueva todavía no está validada. Ver [informe 0.1.2](10-comprobantes-y-operaciones-0.1.2.md). Los criterios siguientes siguen sirviendo para aceptar el resultado completo.

## Punto de partida comprobado

El propietario instaló Android 0.1.0 y comunicó conversión, compra de 0,5 g, rechazo por saldo insuficiente y venta. Después confirmó que actualizó a 0.1.1 sin desinstalar, conservó el histórico y ya aparecen valores. No comunicó importes para contrastar pantallas, modelo ni versión Android.

El scrollytelling no superó su aceptación: indicó que sigue sin funcionar o no lo entiende. La revisión de código encuentra conexión entre scroll y transformaciones; no permite atribuir el resultado a su teléfono ni confirmar un fallo de animación específico. La implementación actual tiene cuatro ilustraciones separadas, sin escena continua ni transformación mineral → lingote → bóveda → posición.

La API usa PostgreSQL y tiene pruebas de operaciones, concurrencia y persistencia tras reinicio. Las pruebas móviles cubren cálculo/presentación y recuperación de solicitudes. La prueba nativa automatizada instaló el APK, pero agotó el límite de tiempo sin resultados de UI. Estos controles no sustituyen el recorrido físico completo.

## Prioridades funcionales

| Orden | Función | Estado actual | Criterio para considerarla terminada |
| --- | --- | --- | --- |
| 1 | Operaciones y comprobantes comprensibles | La compra desglosa costes. La conversión no anticipa lo que se recibe; la venta no presenta el neto. El comprobante es una alerta con identificador y el historial muestra etiqueta/fecha. | Conversión, compra y venta presentan cantidad, tasa/precio ficticio, comisión y resultado antes de confirmar. El resultado abre un comprobante persistente con importes y saldos, recuperable desde el historial. Verificar cada importe contra la API. |
| 2 | Cuentas demo, roles y operación de la mina | Identificador local de sesión, sin acceso/recuperación de cuenta ni permisos. El panel del operador solo resume esa sesión. Cada sesión tiene su propio inventario ficticio. | Dos compradores ficticios mantienen saldos separados y operan contra un inventario demo compartido. Un operador autorizado ve y gestiona las operaciones/solicitudes de ambos. El comprador no accede a administración. Probar concurrencia entre ambos y recuperación de cuenta demo sin datos personales reales. |
| 3 | Custodia y trazabilidad de la posición | Solo se registran gramos por metal; no hay lotes, asignaciones, ensayo, custodio ni documentos por posición. | Abrir una posición muestra origen, lote, pureza, asignación y documento de ejemplo marcados DEMO. Gramos totales, disponibles, reservados y asignados concuerdan; comprar/vender actualiza la trazabilidad sin inventar respaldo físico. |
| 4 | Cotización de entrega con ciclo completo simulado | Existe solicitar/cancelar y reserva de gramos. La solicitud se queda en `PENDING_QUOTE`. | Operador prepara propuesta ficticia con costes y condiciones; comprador acepta/rechaza; los estados y reservas cambian de forma consistente. Cancelar libera gramos. Ninguna pantalla afirma que ocurrió un envío real. |
| 5 | Ofertas con contraparte, según el modelo elegido | Publicar solo reserva gramos; no hay precio propio, aceptación por otro comprador ni liquidación. | Si se incluye compraventa entre usuarios, dos cuentas ficticias publican/aceptan una oferta con saldo y metal actualizados de forma atómica e idempotente. Si la demo se centra en venta/recompra de la mina, posponer esta ampliación y explicarlo en la interfaz. |
| 6 | Recorrido visual comprensible y continuo | Cuatro bloques 2.5D con transformaciones vinculadas al scroll. El propietario no percibe el resultado esperado. | Acceso visible desde Inicio, progreso reconocible, escena continua y transiciones reversibles con el gesto. Cierre hacia cotización y posición, sin comprar automáticamente. Verificar en APK y con movimiento reducido; no inferir aprobación del export. |

Fuentes de la revisión: `mobile/App.tsx` (conversión, venta, alerta de comprobante, historial y operador), `mobile/components/MetalStory.tsx`, `api/src/domain.js` (acciones permitidas, ofertas, reservas y entregas), `api/src/server.js` y el diseño maestro. No se añadió ninguna de estas funciones mediante este cambio documental.

En 0.1.1 la pantalla enseñaba veinte movimientos y el motor conservaba cien movimientos recientes. La revisión 0.1.2 consulta los comprobantes persistidos mediante paginación y detalle, recuperables más allá de esos cien movimientos. Sigue siendo un historial de demostración en JSONB; no es un archivo contable de producción. La activación y la aceptación física de esta ampliación se registran por separado.

La prioridad 2 requiere ampliar el modelo de datos: sumar los resúmenes actuales no genera un inventario global coherente, porque cada sesión parte de existencias propias. Debe existir una fuente de inventario demo compartida y pruebas de actualización concurrente. Ese problema justifica evolucionar el backend; no requiere reemplazar Expo ni reestructurar la app entera.

## Próximo bloque recomendado

Cerrar primero el ciclo conversión → compra → comprobante → posición → venta → historial, con importes visibles y pruebas físicas. Acompañarlo con un acceso evidente al relato y su indicador de avance; eso facilita evaluar la experiencia sin presentar una animación discreta como el resultado cinematográfico final.

Después construir cuentas demo/roles y la vista operativa de la mina, seguida de lotes/custodia y cotizaciones de entrega. La secuencia 3D final se mantiene como trabajo visual pendiente, con criterios de aceptación propios. El mercado entre compradores se prioriza cuando esté definido que forma parte de la presentación; la venta/recompra actual no necesita fingir una contraparte.

## Validación que falta, separada de nuevas funciones

- Android: contrastar importes exactos entre Inicio y Billetera; comprobar comisiones/comprobantes, compra/venta, reservas y cancelaciones, reapertura y desconexión/reintento sin duplicar operaciones.
- Usabilidad: completar el recorrido sin instrucciones por chat, leer importes con texto grande y comprobar reducción de movimiento. El feedback actual deja el scrollytelling pendiente de aceptación.
- iPhone: instalación y ejecución físicas pendientes por firma Apple. El archivo de simulador 0.1.0 compiló, pero no se ejecutó y no se instala en iPhone.
- Operación técnica: restauración de copias de seguridad y controles de acceso/antiabuso siguen pendientes; las pruebas PostgreSQL realizadas no los dan por verificados.

Bancos, blockchain, precios ejecutables, fondos reales y custodia física no forman parte de este siguiente bloque. La demo conservará saldos, precios, reservas y documentos ficticios.
