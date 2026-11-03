# Referencias de mercado y cotizaciones DEMO · 2 de noviembre de 2026

**Actualización de activación:** el entorno aislado `market-reference` está desplegado con API y PostgreSQL propios. La clave Metals.Dev ya se configuró como secreto y se validaron internamente cuatro spots e históricos. Sigue pendiente confirmar derechos de visualización móvil (`MARKET_METALS_DISPLAY_ALLOWED`) y archivo. La revisión de [términos de Coinbase](https://www.coinbase.com/legal/market_data), de 7 de agosto de 2026, restringe la visualización a terceros y usos derivados sin consentimiento escrito: `MARKET_USDT_USE_ALLOWED` queda apagado por defecto y no se repite aquella sonda sin permiso. La consulta anterior acredita acceso técnico, no derechos de publicación. [Estado actual, configuración independiente, pruebas y límites](27-activacion-mercado.md). Las observaciones siguientes conservan el historial del primer commit y sus pruebas.

Rama independiente `codex/market-references-20261102`, base `main@ed87d2ea233227437ab5f5cc2eb0900674e1231f`. No incorpora ni fusiona PR #11. Este trabajo prepara código y configuración; no activa precios de metales en la app instalada ni modifica el despliegue comercial. No se generaron APK, OTA, vídeos ni capturas. Android; sin blockchain ni operaciones financieras reales.

## Auditoría de precios existentes

| Uso | Implementación y comportamiento conservado |
| --- | --- |
| Compra/venta directa | `api/src/domain.js`: precios ficticios fijos XAU 145,00; XAG 2,80; XPT 59,00; XPD 52,00 USDT/g. Cantidades en mg y saldos en centésimas. Base redondeada hacia arriba con BigInt; comisión 100 bps compra y 120 bps venta. |
| Portafolio | `mobile/App.tsx`: cantidades propias valoradas con `state.priceCentsPerGram`. Conserva la valoración DEMO; no se reemplaza con una cotización externa. |
| Conversiones de billetera | `demoRates`, tasas enteras a escala 1.000.000, salida redondeada hacia abajo. USD/USDT ficticios 1:1; USD/COP ficticio 4.000. No representan referencias de mercado. |
| Marketplace | Precio fijado por el vendedor en la oferta, reserva y liquidación transaccional existentes. No cambia por consultar referencias. |
| Proveedores previos | No había interfaz externa. Los nuevos adaptadores entregan instantáneas normalizadas al servicio de referencias, sin acceso a saldos o inventario. |

## Proveedores y alcance verificado

| Fuente | Selección y limitación |
| --- | --- |
| [Metals.Dev](https://metals.dev/docs) | Adaptador implementado para XAU/XAG/XPT/XPD. Spot, bid/ask, high/low y variación contra el día de mercado anterior; serie diaria en USD/onza troy, ventanas máximas de 30 días. La declaración de retraso del proveedor se conserva como metadato; no se ha verificado con una clave real. |
| [Metals-API](https://metals-api.com/documentation) | Alternativa evaluada: bid/ask, históricos y más modalidades según plan. Su contrato y símbolos difieren. No se conecta silenciosamente como fallback; requeriría otro adaptador y sus pruebas/credenciales. |
| [Frankfurter v2](https://frankfurter.dev/) | Referencias diarias agregadas USD→EUR y USD→COP, sin clave. Su documentación permite almacenamiento/caché de los agregados. No se usan los endpoints de proveedores individuales, sujetos a otros términos. |
| [Coinbase Exchange, ticker](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-ticker) | Último negocio y bid/ask del mercado USDT-USD, consulta pública sin credencial. Representa ese mercado; no una paridad garantizada ni una tasa universal. Se conserva en memoria, sin archivo histórico propio. |

La [sonda pública ejecutada](evidence/market-references-20261102/public-fx-probe.json) obtuvo respuestas válidas el 2 de noviembre de 2026: USD/EUR 0,89395, USD/COP 3.186,84, y USDT/USD 0,99846 (último negocio de 19:17:04.861 UTC; consulta observada a 19:17:32.702 UTC). Son observaciones fechadas, no precios vigentes indefinidamente. Una consulta no verifica la frecuencia de actualización. Metales reales e históricos remotos **no verificados**, por ausencia de clave configurada.

Los [términos de Metals.Dev](https://metals.dev/policy/terms) condicionan el uso comercial a una suscripción activa y restringen la reventa/API competidora. No resuelven expresamente todos los permisos de archivo y visualización móvil. Confirmar esos derechos y la retención de precios derivados antes de activar `MARKET_METALS_STORAGE_ALLOWED`. No se ha comprado un plan ni aceptado términos nuevos por cuenta del propietario. El [plan gratuito publicado](https://metals.dev/pricing) declara 100 llamadas/mes y reinicio el primer día: el presupuesto inicial limita a 100/mes y 20/día; ajustar al plan realmente contratado, sin prometer cobertura continua gratuita.

## Normalización y estados

Contrato interno: USD por gramo, dirección `currency-per-metal`, proveedor, identificador, `asOf`, unidad y fecha de consulta. Una onza troy equivale a **31,1034768 g**. El precio por onza se muestra por separado. Los adaptadores declaran unidad/dirección; se prueba también la inversión `metal-per-currency`, sin aplicarla indebidamente al contrato de Metals.Dev. Bid, ask y referencia permanecen distintos. Campos opcionales ausentes son `null`; falta de precio principal, fecha, moneda o tasa válida causa rechazo.

Estados: `disabled`, `not-configured`, `unavailable`, `current`, `delayed`, `stale`, `unsupported`. `current` describe la política interna de antigüedad; la interfaz lo rotula «Referencia fechada · frecuencia sin verificar». No equivale a tiempo real. Spot con más de cinco minutos y USDT con más de dos minutos no sirven para crear una cotización comercial. La fecha diaria de FX se conserva con precisión `date`; el umbral de cuatro días admite pausas habituales sin inventar una actualización de fin de semana.

Metals.Dev no aporta un calendario/estado de apertura en el contrato utilizado: `marketState:unknown`, visible como «Estado de apertura/cierre no confirmado». Durante pausas se conserva la última fecha y se marca el retraso; no se fabrican precios nuevos. Un proveedor que informe `closed` no permite crear cotizaciones comerciales. Festivos, horarios y retraso efectivo por metal siguen pendientes de verificación con el proveedor.

Históricos 7d/30d/1y: días naturales UTC completos hasta ayer, observaciones diarias, ventanas de hasta 30 días; un año requiere hasta 13 solicitudes. Fechas sin datos quedan ausentes y el gráfico no une huecos de más de un día. No se convierten cierres diarios en velas intradía: **24h devuelve `unsupported`**. Un fallo de una ventana no se oculta con una serie anual parcial o inventada.

## Backend y persistencia

Llamadas externas solo desde `api/src/market/`. Peticiones HTTPS a hosts fijos, redirecciones rechazadas, timeout de cinco segundos, tamaño de respuesta limitado a 1 MB y máximo dos intentos. Reintento solo para fallo de transporte o 502/503/504; 401/403/429 y datos inválidos no provocan bucles. Mensajes públicos y logs no incluyen URL con clave, cuerpo ni error bruto del proveedor.

Caché normal de cinco minutos para metales, una hora para consulta FX diaria y un minuto para USDT. Coalescencia de solicitudes concurrentes dentro del proceso. Fallos se retienen 30 segundos; se conserva la última respuesta disponible marcada `stale`. No hay temporizador que consulte proveedores en segundo plano. La pantalla se consulta al abrir/cambiar selección o por acción explícita, reutiliza resultados durante un minuto y cancela lecturas al salir/poner la app en segundo plano. Sus temporizadores solo actualizan etiquetas de edad/vencimiento, sin consultar redes.

PostgreSQL añade de forma diferida `reference_market_cache` y `reference_provider_usage`, sin alterar tablas comerciales. Caché histórica contiene los puntos diarios y la procedencia, no transacciones; entradas sin actualizar durante siete días se eliminan al escribir. Un registro anual puede contener hasta 365 observaciones. Metales se persisten solo con la autorización configurada; de lo contrario se retienen temporalmente en memoria. FX agregado puede persistirse; USDT permanece en memoria. Cuotas diaria y mensual se reservan atómicamente en PostgreSQL y cuentan cada intento, incluidos reintentos. El adaptador en memoria es solo local. La limitación HTTP por dirección es por proceso; no se presenta como protección distribuida contra abuso. El presupuesto de proveedor sí es compartido entre réplicas. No se trata este caché como archivo permanente ni ledger.

## Endpoints nuevos

| Método/ruta | Contrato |
| --- | --- |
| `GET /api/demo/market/metals/XAU` | Sobre `{status,data,errorCode,retrievedAt,cacheUntil,demoOnly}`; admite XAG/XPT/XPD. Sin precio ficticio ante falta de clave. |
| `GET /api/demo/market/metals/XAU/history?period=7d` | Periodos `24h`, `7d`, `30d`, `1y`; puntos `{date,value}`, USD/g y granularidad explícita. |
| `GET /api/demo/market/exchange` | Sobres independientes `fiat` y `usdt`; cada tasa incluye base, cotizada, fecha y proveedor. |
| `POST /api/demo/reference-quotes` | Comprador autenticado; `{action:buy|sell,metal,grams}`. Devuelve `{quote,demoOnly}`. No reserva saldo ni metal. |
| `POST /api/demo/reference_trade` | Comprador autenticado; `{quoteId}` y `Idempotency-Key`. Confirma compra/venta exclusivamente DEMO con la cotización guardada. |

Se rechazan campos adicionales de cotización/confirmación, símbolos y periodos inválidos o parámetros repetidos. Un bearer inválido sigue rechazándose; no cae a sesión legacy.

## Cotización comercial simulada

Compra: ask USD/g dividido por bid USD/USDT; venta: bid USD/g dividido por ask USD/USDT. Después se aplican los diferenciales configurados por lado, redondeo conservador del precio a centésimas USDT/g y las comisiones DEMO. La base por cantidad y el redondeo de comisión conservan el motor BigInt existente. Se registra la política y la procedencia, no se cambia `priceCentsPerGram`, `demoRates` o `feesBps` del estado habitual.

Cada cotización tiene UUID, cantidad, lado, precios finales, diferencial/comisión, referencias de metal y USDT, fechas de emisión/vencimiento. Vigencia inicial 90 segundos, acotada además por la antigüedad máxima de sus fuentes. Se guarda en la cuenta propietaria, con un máximo de 20 activas. No se usa con otra cuenta, otra cantidad o dos claves distintas. Un vencimiento pide una cotización nueva y no cambia saldos.

La confirmación bloquea mina→cuenta y valida vigencia dentro de la misma transacción que saldos, inventario, custodia, reservas y comprobante. Un replay de una operación ya confirmada se resuelve antes del vencimiento, incluso si luego se deshabilitan operaciones nuevas. El cliente conserva `quoteId`, identidad y clave idempotente en el mecanismo durable ya existente. Un comprobante incompleto conserva el pendiente. El recibo muestra cotización y fuentes. Se conserva la ventana histórica/idempotente existente de los últimos 100 comprobantes; no se presenta como un ledger financiero permanente.

## Activación pendiente y Railway

Inspección read-only: proyecto `openminerals-demo` (`1442be94-b13f-4067-9fee-ea99caf5715a`), servicio `openminerals-api` (`00e2d919-2cd1-4293-befd-d8af58df8069`), entorno `demo` (`1e835541-fd3a-49dd-8ae3-0315d4118940`). Sigue conectado a `main`, raíz `/api`, PostgreSQL requerido, despliegue `3e03a496-5765-4ac3-a255-3c6f2439413a` observado SUCCESS, sin cambios pendientes. API existente: `https://openminerals-api-demo.up.railway.app`. Solo tiene las variables previas DATABASE_URL, DEMO_ADMIN_TOKEN, NODE_ENV y REQUIRE_DATABASE; no clave de metales. No se le desplegó este sprint ni se escribieron datos de cliente.

Para una activación aislada futura, conservar `DATABASE_URL`/`REQUIRE_DATABASE=true` y configurar del lado del servidor:

```dotenv
MARKET_REFERENCE_ENABLED=true
METALS_DEV_API_KEY=<configurar como secreto en Railway; no en Git/APK>
MARKET_METALS_STORAGE_ALLOWED=false
MARKET_CACHE_SECONDS=300
MARKET_METALS_DAILY_LIMIT=20
MARKET_METALS_MONTHLY_LIMIT=100
MARKET_QUOTE_TTL_SECONDS=90
MARKET_BUY_SPREAD_BPS=100
MARKET_SELL_SPREAD_BPS=100
MARKET_BUY_FEE_BPS=100
MARKET_SELL_FEE_BPS=120
```

Cambiar el permiso de almacenamiento a `true` solo tras confirmar derechos. Sin él no se habilita la emisión de cotizaciones comerciales derivadas que necesitan persistencia. Configurar en el bundle de prueba `EXPO_PUBLIC_MARKET_REFERENCE=1` y su API aislada HTTPS. Ninguna clave de proveedor lleva prefijo `EXPO_PUBLIC_`. Por defecto ambos flags están apagados; no es necesario cambiar identificadores, SDK, permisos ni dependencias nativas. No activar en la demo estable ni publicar OTA/build durante este cierre.

## Validación reproducible y pendientes

```powershell
npm test --prefix api
$env:TEST_DATABASE_URL='postgresql://<instancia-local-o-CI-aislada>'
node api/scripts/run-postgres.mjs
npm run check --prefix mobile
npm test --prefix mobile
node api/scripts/probe-market-reference.mjs
```

Se ejecutó PostgreSQL 17 local dedicado a este sprint, con esquemas de prueba independientes; no se usó PostgreSQL Railway para mutaciones. Suite general API: 102 aprobadas y doce PostgreSQL omitidas en aquella pasada; dos casos API posteriores también aprobaron en el subconjunto final de **13/13**. Suite obligatoria PostgreSQL: **85/85**, cero omisiones. Móvil: **257 aprobadas**, dos GL opcionales omitidas; TypeScript correcto. Las cinco pruebas nuevas móviles se volvieron a ejecutar tras conectar la emisión autenticada de cotizaciones: **5/5**. No sumar los subconjuntos como casos distintos.

Smoke comercial local con `postgres-demo`: conversión, compra de 2 g, replay idempotente, venta, oferta, entrega, persistencia y resumen aprobados; módulo de referencias habilitado, metales sin clave devuelven `not-configured`/`null`. Pruebas nuevas cubren gramos/onza e inversión, bid/ask, fechas ausentes, tasas inválidas, timeout/reintento, caché caducada, límites HTTP/proveedor, vencimientos, pertenencia de cuenta, dos pools concurrentes, reserva de metal y pérdida de respuesta después de commit/reapertura del cliente. [Sonda real de FX y resumen local](evidence/market-references-20261102/validation.json).

Pendientes: clave/plan y permisos de metales, comprobar respuestas reales de los cuatro símbolos e históricos, frecuencia/retraso efectivo, calendario de mercado y aceptación de la pantalla en Android. La UI se comprobó mediante tipos, lógica y cliente HTTP; no mediante emulador o teléfono en este sprint. No se declara tiempo real ni se presenta una captura como prueba. Publicar PR independiente tras pasar CI, mantener la demo estable y PR #11 sin cambios.
