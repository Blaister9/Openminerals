# Cierre técnico de permisos de Mercado · PR #12

Fecha: 2 de noviembre de 2026, America/Bogota. Alcance: cerrar la integración existente; sin ampliar proveedores ni funcionalidades. [Resultados técnicos y configuración del entorno aislado](27-activacion-mercado.md). Las consultas siguientes están preparadas, **no enviadas**. No hay respuesta individual ni autorización escrita de ninguno de los dos proveedores.

## Respuestas disponibles en las condiciones publicadas

| Proveedor | Información comprobada | Permiso pendiente |
| --- | --- | --- |
| Metals.Dev | Sus [términos](https://metals.dev/policy/terms), modificados el 7 de julio de 2023, permiten publicar precios en sitios web manteniendo una suscripción activa; restringen reventa y API competidora. | El texto no aclara expresamente Android nativo, caché, archivo histórico, distribución mediante nuestro backend ni precios derivados DEMO. No se interpreta esa falta de detalle como autorización, prohibición definitiva o exigencia automática de un plan de pago. |
| Coinbase | Los [Market Data Terms of Use](https://www.coinbase.com/legal/market_data), actualizados el 7 de agosto de 2026, apartados 2–3, limitan la licencia ordinaria a uso personal/investigación de la organización y exigen consentimiento expreso escrito para distribución o visualización externa y obras derivadas. | Mostrar USDT/USD a usuarios externos y usarlo en conversiones/precios DEMO. El acceso público al ticker no concede ese consentimiento; debe confirmarse el alcance de los usos derivados, caché y conservación en comprobantes. |

## Consulta preparada para Metals.Dev

Canal oficial: [formulario Contact Support](https://metals.dev/support), enlazado desde sus [FAQs](https://metals.dev/faq). No adjuntar la API key.

**Asunto:** Openminerals Android DEMO — confirmation of display, caching and historical-data rights

Contexto para el mensaje: Openminerals es una aplicación Android de demostración. Mostraría referencias XAU/XAG/XPT/XPD a potenciales clientes externos a nuestra organización. Compras, ventas, custodia y saldos son exclusivamente simulados; no hay pagos, entrega de metales ni transacciones financieras reales. Un backend privado en Railway consulta la API y entrega datos normalizados a la app; la clave nunca se incluye en Android. Cuenta actual: Free, 100 solicitudes mensuales. No revendemos un servicio de datos.

Solicitamos confirmación escrita de lo siguiente:

1. ¿El plan Free permite mostrar esos cuatro metales en una aplicación Android nativa y en presentaciones comerciales de la DEMO a terceros? ¿Qué plan o acuerdo cubre distribución más amplia? ¿Cambia el permiso entre una preview restringida y una app publicada?
2. ¿Se permite servir los datos a Android mediante nuestros endpoints propios, sin revenderlos ni ofrecer una API competidora? ¿Qué límites de audiencia, territorios, volumen, atribución, enlaces, avisos de retraso y uso de marca corresponden?
3. ¿Se permite caché de spots durante cinco minutos e históricos durante 24 horas en memoria, y caché PostgreSQL persistente? Actualmente la limpieza SQL se ejecuta al escribir y elimina entradas sin actualizar durante siete días: no garantiza borrado al cumplirse ese plazo. ¿Qué retención máxima y eliminación al terminar la suscripción exigen?
4. ¿Se permiten gráficos diarios de 7 días, 30 días y un año, con hasta 365 observaciones por serie, sin interpolar huecos? ¿Podemos conservar históricos y referencias numéricas en cotizaciones/comprobantes DEMO sin borrado automático? Indiquen derechos de descarga, archivo, exposición al usuario y obligaciones de borrado, incluidos respaldos.
5. ¿Se permiten conversiones onza troy→gramo y de divisa, y precios comerciales DEMO derivados de bid/ask con diferencial y comisión explícitos? ¿La autorización puede cubrir su conservación junto a fuente y fecha en el historial simulado?
6. ¿Qué campos, frecuencia efectiva, retraso respecto a la fuente, calendario y tratamiento de fines de semana están garantizados por el plan? Confirmen el plan/acuerdo, coste y condiciones aplicables al conjunto de usos anterior.

Las duraciones y usos descritos reflejan el código preparado, no derechos adquiridos. Si la respuesta exige una retención menor u otras restricciones, habrá que adaptar el módulo antes de activar las banderas correspondientes.

## Solicitud preparada para Coinbase

La [guía oficial de Data Marketplace](https://help.coinbase.com/en/data-marketplace/getting-started/coinbase-data-marketplace) indica contactar a **marketdata@coinbase.com** con nombre, empresa, correo profesional y descripción del interés, para tramitar contrato y licencia. Este canal permite consultar el caso; no confirma que el producto Data Marketplace/SFTP cubra nuestro ticker HTTP.

**Asunto:** Written permission request — USDT-USD display and derived DEMO quotations in Android

Completar antes de enviar: **[titular/empresa]**, **[nombre del responsable]**, **[correo profesional]**, **[países y audiencia previstos]**, **[usuarios/solicitudes estimados]**.

Solicitar autorización escrita o derivación al equipo de licencias para:

- Mostrar último precio, bid, ask, fuente y fecha de `GET https://api.exchange.coinbase.com/products/USDT-USD/ticker` en Android a terceros. Explicar que solo es una referencia; nunca se asume USDT=USD.
- Consultar desde Railway, con caché volátil de 60 segundos y sin clave privada en la app. Aclarar que las referencias usadas en cotizaciones y comprobantes DEMO sí se conservarían en PostgreSQL sin borrado automático.
- Realizar conversiones informativas y calcular precios DEMO de metales en USDT con diferencial/comisiones separados, sin fondos reales, negociación real, blockchain ni benchmark financiero destinado a liquidación real. Pedir confirmación expresa sobre obras derivadas y las restricciones de valoración del apartado 3.
- Conocer contrato/producto apropiado para ese ticker, costes, límites, atribución, redistribución backend→Android, retención, respaldos, obligaciones de borrado y terminación. Solicitar que cualquier autorización identifique exactamente endpoint y usos cubiertos.

No se ha solicitado ni recibido esa autorización. La respuesta debe cubrir el caso Android/derivado; contratar otro conjunto de datos no lo autoriza por sí mismo.

## Configuración preparada, sin activar permisos

Único destino permitido: Railway `openminerals-demo / market-reference / openminerals-market-api`, PostgreSQL independiente `openminerals_market_reference`. La clave `METALS_DEV_API_KEY` ya está configurada como secreto del backend. No hace falta enviarla de nuevo ni incluirla en Git, documentación o variables `EXPO_PUBLIC_`.

| Variable | Estado conservado | Condición previa a un cambio futuro |
| --- | --- | --- |
| `MARKET_REFERENCE_ENABLED` | `true` | Mantiene fuentes permitidas y estados de indisponibilidad; no anula las guardas. |
| `MARKET_METALS_DISPLAY_ALLOWED` | `false` | Confirmación de Android, distribución mediante backend y caché volátil de spots/históricos. |
| `MARKET_METALS_STORAGE_ALLOWED` | `false` | Derechos de caché SQL, históricos y conservación de referencias/precios derivados en cotizaciones y comprobantes DEMO. |
| `MARKET_USDT_USE_ALLOWED` | `false` | Consentimiento Coinbase que cubra visualización externa, uso derivado y conservación descritos arriba. |

Solo después de obtener derechos compatibles se podrá poner en `true` la guarda correspondiente en ese servicio aislado. Las tres guardas permanecen en `false` durante este cierre. La emisión de cotizaciones comerciales referenciadas requiere además fuentes autorizadas y vigentes; no basta con habilitar visualización. No se sustituye una fuente bloqueada por precios ficticios o paridad USDT/USD.

Se conservan caché spot 300 s, presupuestos Metals.Dev 20/día y 100/mes, y vigencia de cotización DEMO de hasta 90 s acotada por la edad de sus fuentes. No se amplían límites ni se contacta al proveedor para volver a medir. Perfil Android preparado `market-reference`, paquete `com.openminerals.demo.marketpreview`, con API HTTPS aislada; [configuración completa](27-activacion-mercado.md#android-y-separación-de-precios). No activar mediante los perfiles comerciales. No se publica APK u OTA en este cierre.

## Revisión acotada de la PR

Se revisaron los 50 archivos del diff y el historial de parches de PR #12 en `9c0d4a97f4df69fea65f7492a9ae83e590c1ddda`, contra `main@ed87d2e`. Comparación exacta con cinco valores secretos privados conocidos: cero coincidencias; cero encabezados de clave privada y cero rutas temporales, secretos o binarios entre los archivos añadidos/modificados. No se detectaron secretos en el contenido revisado; esto no es una garantía sobre credenciales desconocidas fuera de ese alcance.

Los cambios en motor/almacén, clientes, comprobantes y runner PostgreSQL soportan cotizaciones DEMO y sus pruebas; README/documentos describen el módulo. Las dos líneas de AGENTS conservan la preferencia permanente del propietario sobre grabaciones/capturas. No se detectó desarrollo ajeno que retirar. Archivos locales sin seguimiento ajenos a la PR se dejan fuera, sin borrarlos.

Lecturas de Railway confirman el entorno de referencias separado y las tres guardas en `false`; demo comercial con los mismos servicios, base, volumen y despliegue. No se cambia infraestructura ni PR #11. Se preservan las pruebas aprobadas registradas en el informe anterior: no se repiten manualmente por este cambio documental. Cero peticiones nuevas a Metals.Dev; no se grabaron vídeos ni se generaron capturas o APK.

## Decisiones del propietario

1. Completar audiencia/territorios y titular; enviar las consultas preparadas a Metals.Dev y Coinbase.
2. Elegir plan Metals.Dev solo cuando la respuesta confirme el alcance y coste necesarios; la API key ya no es un bloqueo técnico.
3. Solicitar licencia Coinbase para este uso o decidir posteriormente una fuente alternativa con derechos compatibles. No se implementa otra fuente durante este cierre.
4. Mantener el módulo preparado y protegido hasta recibir confirmaciones escritas. La aceptación con referencias reales en Android sigue pendiente; este cierre técnico no la declara obtenida.
