# Historial de lotes DEMO

`GET /api/demo/custody/lots/:lotId/history?limit=20&before=lot-move-…`
requiere bearer de comprador u operador. El operador consulta su mina; un
comprador necesita una asignación actual o anterior del lote. Una consulta ajena
devuelve 404. `limit` admite 1–50; campos desconocidos, repetidos o cursores fuera
del historial autorizado devuelven 400.

Respuesta: `demoOnly`, `mine:{id,name}`, `view`, `lot:{id,metal}`, `items`,
`total`, `nextCursor`, `disclaimer`, `historyStartedAt` y
`earlierHistoryUnavailable`. Cada fila tiene `id`, `at`, `kind`, `mg` y, cuando
corresponde, `account`, `counterparty`, `direction` y `referenceId`.

| kind | Significado |
| --- | --- |
| OPENING_BALANCE | Peso **original** del lote en el saldo de apertura; no es su peso activo después de entregas. Sólo operador. |
| ALLOCATION_OPENING | Cantidad asignada a la cuenta al habilitar el diario. No representa una compra reconstruida. |
| LOT_REGISTERED | Reposición que registra un lote nuevo. |
| BUY / IMPORT | Asignación por compra directa o importación explícita. |
| SELL | Liberación por venta directa a la mina. |
| MARKET_TRANSFER | Transferencia de derechos simulados entre compradores, conservando los lotes de origen. |
| DELIVERY | Salida final simulada: reduce posición y suministro activo; conserva peso original y certificado. |

El comprador ve sólo sus movimientos y, si corresponde, el registro genérico
del lote. Su `account` siempre es propia, no recibe `counterparty`, y una
transferencia indica `direction: IN|OUT`. Sus referencias son sus propios
comprobantes. El operador ve vendedor → comprador en `account`/`counterparty`;
no se publican billeteras, snapshots privados ni secretos. El total y el cursor
se calculan **después** de aplicar los permisos.

El diario se añade a `custody.history` dentro del JSONB existente, bajo el mismo
bloqueo de mina y transacción que saldos, posiciones y certificados. Los replays
no agregan filas. Las piezas de una transferencia se agrupan por lote después
de completar ambos lados; cada snapshot representa un estado coherente.
Se verifica la conciliación del diario con lotes y posiciones antes de guardar.

Una mina existente sin diario recibe un saldo de apertura explícito. Sus lotes,
cuentas, asignaciones y recibos anteriores se conservan; no se fabrican fechas
ni movimientos históricos. `earlierHistoryUnavailable: true` distingue esa
limitación. El orden corresponde al registro descendente; insertar movimientos
nuevos no repite páginas anteriores.

Gerencia también añade `kpis.metalVolumesMg`: para cada `XAU`, `XAG`, `XPT` y
`XPD`, contiene `{directBuy,directSell,marketplace}` en miligramos. Se deriva del
historial persistido con sus filtros; marketplace cuenta una vez cada `tradeId`.
Son volúmenes de operaciones, separados del inventario y posiciones actuales.

Pruebas nuevas: `node --test test/lot-history.test.js` y, con
`TEST_DATABASE_URL` de pruebas, `node --test test/lot-history-postgres.test.js`.
El runner `npm run test:postgres` incluye la suite nueva. No ejecutarlas sobre
datos de usuarios; crean y retiran únicamente sus esquemas temporales.
