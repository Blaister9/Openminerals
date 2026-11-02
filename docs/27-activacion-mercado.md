# Activación aislada de Mercado · Android DEMO

Continuación de PR #12, base `2a54f672845e9f24c5bf9f998c602ee761851e14`. La CI anterior queda conservada: [104 API, 85 PostgreSQL y 257 móviles aprobadas](https://github.com/Blaister9/Openminerals/actions/runs/41510125815), dos GL opcionales omitidas. No se modifican `main`, PR #11 ni los datos de la demo comercial. No se genera APK, OTA, vídeo o captura durante esta activación.

**Clave disponible y verificada:** el propietario suministró acceso Metals.Dev, configurado únicamente como secreto del servidor aislado. La sonda interna acotada aprobó cuatro spots y cuatro series diarias usando cinco consultas de datos y una lectura de cuota. El proveedor informó plan Free, **6/100 usadas, 94 restantes** a `2026-11-02T23:40:46.740Z`. No se repite la sonda: queda un marcador persistente con el resumen, sin archivo numérico de precios. Los derechos de publicación móvil/archivo y los de USDT siguen pendientes; no se declara aceptación Android ni tiempo real.

## Infraestructura independiente

Proyecto existente `openminerals-demo` (`1442be94-b13f-4067-9fee-ea99caf5715a`), entorno nuevo vacío `market-reference` (`c4c1afd1-2ed7-40e1-8955-f173a6880518`), creado sin duplicar el comercial.

| Recurso | Identidad |
| --- | --- |
| API nueva | `openminerals-market-api` · `373995aa-3925-4e3e-a74b-7ca652bb713e` |
| HTTPS | `https://openminerals-market-api-market-reference.up.railway.app` |
| Fuente | `Blaister9/Openminerals`, rama `codex/market-references-20261102`, raíz `/api`; commit fijado para cada despliegue auditado |
| PostgreSQL 18 nuevo | `Postgres-TXaY` · `a8dec7f4-3921-4ff1-a504-ed08ba7bbd86` |
| Volumen nuevo | `30b694a6-a17e-4657-9f38-755190e33ec0` |
| Base de pruebas | `openminerals_market_reference` |

La API usa la referencia privada `${{Postgres-TXaY.DATABASE_URL}}`, `REQUIRE_DATABASE=true` y un token administrativo DEMO nuevo, sin copiar credenciales comerciales. El primer despliegue de API `f299533e-a889-4512-8466-db9fa0169900` y PostgreSQL `241f748c-e7b5-4c8f-98ed-eb8d421330ae` alcanzaron SUCCESS. `/health` respondió `postgres-demo`. Las referencias se pausaron antes de publicar las guardas de licencia. El estado final se registra al terminar la comprobación del despliegue actualizado.

La demo conserva API `00e2d919-2cd1-4293-befd-d8af58df8069`, entorno `demo` `1e835541-fd3a-49dd-8ae3-0315d4118940`, PostgreSQL `4cedb5b6-dbf2-4a3c-8a97-4c11df009e44`, volumen `1bb1da19-0d3e-41e6-8ebe-17805cf81fc8` y despliegue original `3e03a496-5765-4ac3-a255-3c6f2439413a`. Ninguna mutación de esta activación se dirige a esos identificadores.

## Derechos y configuración pendiente

| Proveedor | Revisión y configuración |
| --- | --- |
| [Metals.Dev](https://metals.dev/policy/terms) | Los términos permiten publicación web con suscripción activa y restringen reventa/API competidora; no aclaran expresamente móvil, archivo ni todas las modalidades derivadas. La clave ya se configuró y validó; falta confirmar esos derechos. `METALS_DEV_API_KEY` es secreto del servidor. `MARKET_METALS_DISPLAY_ALLOWED=false` y `MARKET_METALS_STORAGE_ALLOWED=false` mientras falte confirmación. No se crea otra cuenta ni se compra un plan. |
| [Coinbase](https://www.coinbase.com/legal/market_data) | Los apartados 2–3 restringen usuarios externos y redistribución/obras derivadas sin consentimiento escrito. El endpoint público no acredita esos derechos. `MARKET_USDT_USE_ALLOWED=false`: no llama al proveedor ni expone su precio; devuelve `permission-required`, sin asumir USDT=USD. Debe confirmarse también el uso derivado antes de habilitar cotizaciones comerciales DEMO. |
| [Frankfurter agregado](https://frankfurter.dev/) | Documenta uso comercial y almacenamiento de tasas agregadas. Se conservan proveedor, fecha diaria y dirección USD→EUR/COP. No se consulta un proveedor individual sujeto a condiciones distintas. |

Las banderas expresan configuración de derechos ya obtenidos, no conceden una licencia. No se contactó a proveedores en nombre del propietario. La sonda Coinbase anterior permanece como evidencia técnica histórica; no demuestra autorización ni una frecuencia actual verificada. No se repite durante esta activación mientras el permiso esté pendiente.

`MARKET_REFERENCE_ENABLED=true` habilita las fuentes permitidas y los estados de indisponibilidad. Presupuestos iniciales de metales: 20/día y 100/mes. Los endpoints públicos no consultan Metals.Dev sin clave y permiso. La sonda técnica interna usa acceso autorizado del propietario para investigación, sin publicar precios ni usar el permiso de visualización como atajo. El adaptador comparte una respuesta histórica que contiene los cuatro metales entre solicitudes concurrentes de la misma ventana; una ventana no gasta cuatro llamadas por seleccionar cuatro símbolos. Caché volátil acotada a 16 ventanas y un día. Las pruebas de regresión usan fixtures sin consumo externo; la sonda real está limitada a seis intentos totales, incluida lectura de cuota, y no se repite automáticamente.

## Android y separación de precios

Perfil EAS `market-reference`, sin ejecutarlo para compilar: `OPENMINERALS_MARKET_PREVIEW=1`, `EXPO_PUBLIC_MARKET_REFERENCE=1`, API HTTPS nueva. Configuración resuelta:

- Nombre `Openminerals Mercado Preview`.
- Paquete `com.openminerals.demo.marketpreview`; esquema `openminerals-market-preview`.
- Runtime `market-reference-0.3.0-v1`, canal `market-reference`.
- `app.json` y perfiles comerciales conservados. Se rechaza activar la pantalla con el paquete comercial o apuntar la preview a la API comercial.

La referencia internacional USD/g y onza troy usa rótulo azul; el precio comercial Openminerals lleva rótulo ámbar y SIMULADO, USDT/g, diferencial incluido y comisión adicional desglosada. El recorrido fijo anterior se identifica como precio SIMULADO sin cotización externa. Una calculadora informativa cruza referencias FX vigentes con fuentes/fechas, sin modificar la billetera. EUR/COP utiliza las referencias USD de Frankfurter; cualquier par con USDT permanece sin resultado si falta permiso o la referencia vence. No sustituye datos ausentes por tasas ficticias.

La exportación JavaScript Android se validó sin APK ni instalación. Esto no acredita ejecución de la pantalla en Android, calidad visual en teléfono ni aceptación de datos reales de metales. El criterio de cierre de cuatro metales reales e históricos continúa pendiente de clave, derechos y comprobación nativa.

## Comprobación reproducible

Los scripts `api/scripts/check-market-deployment.mjs` y `audit-market-reference.mjs` están limitados al entorno aislado. El primero usa una cuenta DEMO de QA nueva, cuya clave queda en archivo privado fuera del repositorio; registra solo endpoints públicos/errores y hashes de estado, sin tokens ni claves. No ejecuta compras con datos ficticios presentados como reales. El segundo usa una transacción PostgreSQL READ ONLY y publica únicamente configuración booleana, nombres de caché y contadores de proveedor.

Se verifican los cinco tipos de endpoint, cuatro símbolos, históricos, FX, rechazo por falta de autorización, cotización desconocida sin cambio de saldo, caché, límite HTTP y persistencia de cuenta/caché tras reiniciar únicamente la API aislada. Compra/venta positiva y expiración nativa con referencias reales permanecen bloqueadas mientras no puedan emitirse cotizaciones autorizadas. Las pruebas controladas ya aprobadas de proveedor caído, datos caducados y cotizaciones vencidas siguen vigentes; no se fuerza un fallo externo gastando cuota o alterando datos comerciales.

La evidencia final del despliegue, endpoints, consumo observado y resultados se añadirá al completar estas comprobaciones. No presentar el criterio de aceptación como logrado mientras falten las referencias reales y la prueba Android.

## Corrección encontrada en la comprobación desplegada

El arnés aprobó los contratos/rechazos sin cambio de saldo, pero no observó 429 con el contador original por `req.socket.remoteAddress`. En Railway ese socket pertenece al proxy y no representa de forma estable al cliente. Se conserva la evidencia fallida y se corrige únicamente el limitador nuevo de referencias: `MARKET_TRUST_RAILWAY_PROXY=true` opta por el `X-Real-IP` válido que documenta [Railway](https://docs.railway.com/networking/public-networking/specs-and-limits), sin confiar en encabezados por defecto en despliegues arbitrarios. También existe un límite global por proceso de 120 peticiones/cinco minutos, independiente de la clave de cliente. La cuota SQL de proveedor sigue siendo global entre réplicas. No se cambia el limitador de autenticación comercial.

Se añade una prueba global entre distintas claves IP y otra de validación/opt-in de encabezados; subconjunto API **17/17 PASS**. La prueba desplegada enviará encabezados falsos sobre un símbolo inválido para comprobar la sobrescritura del edge y el 429, con máximo 24 solicitudes y **cero llamadas a metales**. Una pasada fallida del arnés no se presenta como aceptación; se registra el resultado después de desplegar la corrección.
