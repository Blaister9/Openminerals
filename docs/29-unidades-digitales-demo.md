# Base de unidades digitales DEMO

2 de noviembre de 2026 · Rama `codex/demo-digital-units-20261102`, desde `main@ed87d2e`. Solo backend y pruebas; sin cambios Android, despliegues, blockchain o activos reales. PR #11 y PR #12 permanecen independientes, con sus permisos intactos.

## Modelo e integración implementados

Antes ya existían lotes con metal/pureza/peso/documentos DEMO, asignaciones a cuentas, certificados de asignación y reservas por lote. Las posiciones cuadran con las asignaciones; los certificados conservan el peso emitido original y el peso aún asignado. Faltaban una denominación digital explícita, un registro reconstruible de su suministro y una interfaz de salida independiente de blockchain.

Ahora `mine.digitalUnits` registra series identificadas por mina/lote/metal/pureza y **una unidad por miligramo de masa bruta del lote**. No representa miligramos de metal fino: la pureza se mantiene separada. Cada saldo identifica cuenta titular estable, asignación y certificado; el alias no es la identidad digital. No hay dirección blockchain ni afirmación de propiedad real.

La elegibilidad es exclusivamente simulada: lote `REGISTERED_DEMO` validado por custodia, con documentos DEMO y peso no entregado. Incluye aperturas explícitas/compatibilidad de lotes anteriores e ingresos registrados; no certifica ensayo ni respaldo físico. Producción/verificación pendientes carecen de lote y no permiten emitir. La serie fija metal, pureza y hash documental; no permite modificarlos silenciosamente.

| Operación existente | Movimiento digital automático |
| --- | --- |
| Compra/importación autenticada | `ISSUE`, por la asignación y certificado efectivamente creados. |
| Venta a la mina | `CANCEL`: reduce suministro vigente y devuelve capacidad al inventario DEMO. |
| Oferta o solicitud de entrega | `RESERVE`, por titular y lote exactos. |
| Cancelación/rechazo de oferta/entrega | `RELEASE`, sin cancelar las unidades de la posición. |
| Compra en marketplace | `RELEASE` de la oferta y `TRANSFER` de los mismos lotes/asignaciones de origen al comprador. No emite suministro adicional. |
| Entrega final `DELIVERED_DEMO` | `RELEASE` y `CANCEL`; disminuyen posición y respaldo disponible del lote. Preparación/despacho no cancelan anticipadamente. |
| Activación sobre posiciones anteriores | `OPENING_ISSUE` fechado en la apertura actual, sin reescribir saldos, recibos ni inventar una emisión histórica. |

No hay rutas públicas de emisión o transferencia arbitraria. Los movimientos digitales solo acompañan comandos comerciales ya autorizados. La sesión legacy sigue ilustrativa hasta una importación explícita; no se convierte en un segundo titular sobre el mismo respaldo.

## Conciliación y auditoría

La transacción existente bloquea mina → cuentas y confirma conjuntamente billeteras DEMO, inventario, posiciones, certificados, reservas y registro digital. Se valida el registro anterior antes del comando y el resultado antes del commit; las diferencias no se reparan silenciosamente. El replay idempotente conserva eventos y hashes.

- Por lote: unidades vigentes = asignaciones activas ≤ peso original − peso entregado.
- Por titular/metal: unidades vigentes = posición; las reservas digitales corresponden a las reservas de custodia y nunca superan la posición.
- Por mina/metal: unidades vigentes + unidades sin emitir = metal elegible; unidades sin emitir = inventario disponible. Emisión histórica menos cancelación = suministro vigente; vender/recomprar no duplica respaldo.
- Los eventos `ISSUE`, `OPENING_ISSUE`, `TRANSFER`, `RESERVE`, `RELEASE`, `CANCEL` contienen secuencia, fecha, actor, operación e identidad de lote/unidades; se reconstruyen saldos/reservas y se verifica una cadena SHA-256 con serialización determinista.

El encadenado detecta alteraciones/inconsistencias del registro; no es firma externa ni evita que un administrador con control total reescriba toda la base. Historial persistente en JSONB por mina, sin truncado: adecuado para esta base DEMO; antes de escalar hacen falta tablas/eventos indexados y controles de retención/auditoría externos. La conciliación se ejecuta al acceder u operar bajo bloqueo, no mediante un barrido periódico independiente.

## Activación local y API

`DEMO_DIGITAL_UNITS_ENABLED=false` por defecto. Habilitar solo en desarrollo/base de pruebas aislada. Una mina que ya tiene registro sigue conciliándolo aunque otro proceso arranque con la bandera apagada, para impedir deriva. No se modifica ninguna variable o base Railway en esta entrega.

- `GET /api/demo/digital-units?after=0&limit=50`: cuenta autenticada, solo saldos/reservas/eventos propios; operador puede consultar su mina.
- `GET /api/demo/mine/digital-units`: operador, conciliación de la mina, inventario y hash de cabecera.
- `GET /api/demo/mine/digital-units/intents`: operador, intenciones paginadas para el adaptador futuro, siempre `NOT_SUBMITTED` y `unconfigured-testnet`.

`limit` 1–100; `after` es secuencia exclusiva. Compradores ajenos no reciben el historial de otros titulares. Nuevas rutas no admiten selección de mina/titular mediante parámetros. El comercio anterior funciona con la función desactivada.

## Pruebas y límite testnet

Pruebas nuevas: diez casos en memoria/HTTP y ocho PostgreSQL, incluidos dos pools, cuatro metales, purezas distintas, transferencia parcial entre lotes, reemisión tras venta, liberaciones/rechazos, producción sin respaldo, importación concurrente, apertura aditiva, reinicio, manipulación e interrupción SQL tras preparar emisión. Comandos: `cd api; npm test`; con `TEST_DATABASE_URL` de una base **local de pruebas**, `npm run test:postgres`. El runner obligatorio incluye la nueva suite; nunca usar la base compartida para estas pruebas.

Resultado local: **101 API PASS**, doce omisiones PostgreSQL en la pasada general; runner PostgreSQL **88 PASS**, cero omisiones, en un clúster PostgreSQL 17 local nuevo. Tras los últimos ajustes, subconjuntos nuevos 10/10 y 8/8 aprobados; no se suman otra vez al total. Smoke HTTP `postgres-demo` aprobado sobre ese clúster local. No acredita ejecución Android ni despliegue Railway.

`api/src/blockchain-port.js` define intenciones versionadas, cantidades enteras como texto, identificador/hash estable de evento y un puerto `submitIntent/getReceipt` con estados de confirmación/reorganización. Su implementación desconectada rechaza toda petición con `BLOCKCHAIN_NOT_CONNECTED`: no envía red ni fabrica recibos.

Para conectar una testnet falta elegir red y estándar de contrato, implementar y probar contratos DEMO, vincular cuentas con billeteras de prueba verificadas, gestionar claves de prueba, worker/outbox con acuses durables y deduplicación externa, confirmaciones/reorganizaciones y conciliación entre cadena y registro. El registro transaccional ya conserva las intenciones fuente, pero no hay worker ni estado de envío/acuse implementado. También debe definirse cómo las reservas bloquean transferencias en cadena. Nada de esto está desplegado ni probado en testnet; tampoco hay UI Android para unidades digitales todavía.
