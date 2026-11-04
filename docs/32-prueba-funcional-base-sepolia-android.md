# Prueba funcional MetaMask / Base Sepolia desde Android

3 de noviembre de 2026, America/Bogota. Continuación autorizada de [PR #15](https://github.com/Blaister9/Openminerals/pull/15), fuente desplegada `6bb78da022b6935ab05149565dc698b26fcf2ac7`. Repositorio local `C:\Users\santi\Documents\Openminerals`, remoto `https://github.com/Blaister9/Openminerals.git`, rama `codex/metamask-base-sepolia-20261102`. No se modifica la demo comercial ni se fusiona otra PR. Solo se añaden comprobación reproducible, CI y evidencia escrita; sin módulos de producto, APK, OTA, vídeos o capturas nuevos.

**Recorrido público pendiente.** El propietario indicó «ahora no puedo» ante la preparación de MetaMask en su teléfono. Se completaron los pasos independientes. No hay todavía direcciones vinculadas, ETH de faucet recibido, contrato público ni hashes de transacciones Base Sepolia. Las cuentas EVM de las pruebas locales son efímeras; sus claves no se guardan ni se publican. No se sustituyó la firma en MetaMask por un firmante servidor.

## Entorno Railway independiente

Se inspeccionaron los proyectos existentes antes de crear recursos. Todos los cambios de infraestructura de esta revisión apuntan exclusivamente al nuevo proyecto:

| Recurso | Valor |
| --- | --- |
| Proyecto | [openminerals-testnet-demo](https://railway.com/project/fb032a9c-5770-40bf-bd03-ff450b34b223?environmentId=d750ac32-e469-4b4a-bf94-447d75b3852b) · `fb032a9c-5770-40bf-bd03-ff450b34b223` |
| Entorno | `base-sepolia` · `d750ac32-e469-4b4a-bf94-447d75b3852b` |
| API | `testnet-api` · `9ed9885a-1aac-4bc6-800a-c6c421992ea2` |
| PostgreSQL | `Postgres` · `e13a0591-a765-4a8e-babb-851696dffced` · imagen Railway PostgreSQL 18, volumen propio |
| Base | `openminerals_testnet_demo`, creada expresamente; conexión por red privada, sin proxy TCP público |
| Origen HTTPS | [testnet-api-base-sepolia.up.railway.app](https://testnet-api-base-sepolia.up.railway.app/health) |
| Fuente API | `Blaister9/Openminerals`, rama de PR #15, root `/api`, Dockerfile existente |
| Despliegue verificado | `10e5d9f6-926f-42d6-a47a-e34b1ab11f0d`, `SUCCESS`, commit `6bb78da` |

Variables: `DATABASE_URL=${{Postgres.DATABASE_URL}}`, `REQUIRE_DATABASE=true`, `NODE_ENV=production`, `DEMO_BASE_SEPOLIA_ENABLED=true`, `TESTNET_ORIGIN=https://testnet-api-base-sepolia.up.railway.app`, `TESTNET_CONFIRMATIONS=3`, `PORT=3000`. `DEMO_ADMIN_TOKEN` aleatorio y sellado en Railway, distinto del comercial. Referencias a PostgreSQL resuelven la base nueva. El entorno `production` creado automáticamente en este proyecto nuevo permanece vacío. El contexto CLI local queda enlazado al proyecto y entorno nuevos; usar siempre IDs explícitos al administrar otros entornos.

Railway rechazó configurar expresamente `railwayConfigFile` por su deprecación actual. Se configuraron root, Dockerfile, healthcheck y arranque directamente en el servicio nuevo; el despliegue detectó las propiedades del archivo existente y compiló correctamente. No se migró ni modificó la infraestructura comercial. El primer intento automático, previo a configurar el servicio nuevo, falló; el despliegue aceptado es el identificado arriba. Watch pattern final `/api/**`.

Salud HTTPS observada: `{"ok":true,"mode":"postgres-demo","demoOnly":true,"apiVersion":"0.2.0"}`. Se crearon una mina nueva y dos cuentas privadas de aplicación (operador/comprador), **todavía sin billeteras EVM**. El pool reservado contiene exclusivamente 1.000 mg brutos XAU DEMO; los demás metales comienzan vacíos.

- Mina: `mine-2da1a49e-c1fd-4f2a-877c-4cfcda2d77ef`.
- Lote: `lot-968624531a7677085c3c89f1cf4b2885`.
- Raíz Merkle: `0x3d57f20a1b2bf9450977967bd6c7aa27d17de131f017a2ca65d21780c6962246`.
- Repetición de freeze: misma raíz, sin otro respaldo; comprador recibe 403 al reservar; compra comercial del pool recibe 409.
- Tras reiniciar la API se conservaron cuentas, raíz y capacidad. PostgreSQL contiene los registros `chain:pool` y `backing:<mineId>`; todavía no hay `chain:state` ni operaciones on-chain.

El acceso de estas cuentas y copia del secreto administrativo están cifrados con Windows DPAPI para este usuario en `%LOCALAPPDATA%\OpenmineralsTestnet\functional-20261103.dpapi`, fuera del repositorio. No hay claves EVM en ese archivo. No publicar su contenido ni la sesión usada para consultarlo. El [operador público comercial](../demo-access/operator-public.json) sigue siendo el acceso autorizado de la demo estable y no corresponde a esta prueba.

## Compatibilidad con PR #13

Se ejecutó la implementación exacta `61211eeaa044d15ebab63eea18c23bb1f8114836` de [PR #13](https://github.com/Blaister9/Openminerals/pull/13), cargada en memoria con sus dependencias comunes de custodia actuales, sin fusionarla. La comprobación genera posiciones de apertura de 800 unidades por cada metal, obtiene sus intenciones y compara cantidades/metadatos con emisiones de un contrato ERC-1155 sobre EVM **local**. Se probaron XAU, XAG, XPT y XPD, con pesos enteros no redondos y purezas distintas.

| Campo o regla | Resultado |
| --- | --- |
| Unidad y base | Ambas: `mg`, `gross-lot-mass`; 800 unidades siguen siendo 800 mg brutos. |
| Pureza | `purityBps` separada; no se aplica otro descuento de pureza al emitir. |
| Capacidad | Peso no entregado del lote; comprobada contra `eligibleMg` de PR #13. |
| Cantidad transportada | Texto entero `quantity` de PR #13 equivale a `units` de PR #15, sin pasar por decimales. |
| Serie/token ID | PR #13 usa `demo-series-…` y SHA-256; PR #15 usa `sourceKey` Keccak-256 convertido a token ID. No son intercambiables. |
| Hash documental | SHA-256 en PR #13 frente a Keccak-256 en PR #15. Requieren mapeo y verificación expresos. |
| Titular | Cuenta/asignación/certificado en PR #13; cuenta vinculada por firma a dirección EVM en PR #15. |
| Reservas | PR #13 admite reservas comerciales; PR #15 exige un pool sin posiciones/reservas y bloquea su uso comercial. |
| Envío de intenciones | **Sin puente automático**: `unconfigured-testnet` / `NOT_SUBMITTED` de PR #13 no se envía por PR #15. |

Resultado: **compatibilidad de denominación y cantidades aprobada; no integración de los registros**. Esta prueba aislada valida el ERC-1155 de PR #15; no acredita tokenización de posiciones/certificados comerciales de PR #13. No trasladar sus posiciones al pool ni habilitar ambas vías sobre el mismo metal simulado.

Comprobación reproducible desde la raíz, después de instalar las dependencias fijadas de `api` y `contracts`:

```powershell
git fetch --no-tags origin 61211eeaa044d15ebab63eea18c23bb1f8114836
node contracts/scripts/check-pr13-compatibility.mjs
```

## Pruebas ejecutadas y evidencia

| Superficie | Resultado real de esta revisión |
| --- | --- |
| API, `node --test api/test/testnet.test.js` | 4/4 PASS: firma/nonce/dominio/sesión, permisos y validación de transacción. |
| Contratos, `node scripts/compile.mjs --check` | Bytecode fijado coincide, 11.331 bytes. |
| Contratos/EVM local y PostgreSQL 17 local nuevo | 23/23 PASS, cero omisiones: dos conexiones, reservas concurrentes, emisión, transferencia, cancelación, replay, sobreemisión, respaldo Merkle, permisos, reinicio, reorg y RPC incorrecto/caído. |
| Compatibilidad exacta PR #13 | PASS, cuatro metales, 800 unidades por metal; cero transacciones públicas. |
| Cliente, `npm run check` | TypeScript PASS. |
| Cliente, `node --experimental-strip-types --test test/testnet.test.mjs` | 5/5 PASS; firma ambigua, recuperación de hash, cantidades, origen/proyecto independiente y reto verificado. |
| API Railway/PostgreSQL 18 | Salud, pool, replay de freeze, 403 comprador, 409 comercial y persistencia tras reiniciar API PASS. Sin conciliación de transacciones públicas todavía. |
| RPC público oficial | `https://sepolia.base.org` respondió chain ID **84532** y bloque **54197001**. Solo lectura; no envío. |
| Android | Sin dispositivo conectado en ADB ni ejecución MetaMask en esta revisión. |
| Contrato/faucet/transacciones/APK | Pendientes. No se generan enlaces ni hashes ficticios. |

Para repetir las 23 pruebas con una **base local de prueba nueva**, nunca contra la base remota del recorrido:

```powershell
cd contracts
$env:TEST_DATABASE_URL='postgresql://postgres@127.0.0.1:55486/openminerals_testnet_demo'
$env:REQUIRE_TESTNET_POSTGRES='true'
node scripts/compile.mjs --check
npm test
```

La URL anterior corresponde al clúster local creado para esta ejecución, no a un servicio estándar que deba existir en otro equipo. El proceso se detiene al cerrar la revisión; para iniciarlo en este equipo: `pg_ctl -D artifacts/testnet-functional-20261103/postgres -l artifacts/testnet-functional-20261103/postgres.log -o "-p 55486 -h 127.0.0.1" -w start` desde la raíz. Escucha solo en loopback, datos descartables de prueba.

Evidencia legible por máquina: [checkpoint sin secretos](evidence/base-sepolia-preflight-20261103.json). Logs locales en `artifacts/testnet-functional-20261103/`, ignorados por Git. La CI de PR #15 incorpora ahora la comparación fijada de PR #13; su resultado se consulta en la PR, sin confundirlo con la aceptación Android.

## Próximo paso dependiente del teléfono

Cuando el propietario pueda: crear en MetaMask Android una billetera nueva exclusiva de prueba, añadir una segunda cuenta y proporcionar solo sus dos direcciones públicas. Conservar claves y frase en el teléfono. La [documentación oficial de Base](https://docs.base.org/get-started/get-funds) enumera faucets gratuitos de Base Sepolia; CDP, thirdweb y Alchemy figuran entre las opciones verificadas. No se ha solicitado ETH a ningún faucet sin dirección destinataria.

Después: proyecto Expo independiente y build para ejecutar la conexión nativa, firmas de vinculación, despliegue con la primera dirección, tres confirmaciones configuradas, habilitación del segundo titular, registro del lote, emisión y transferencia; verificar recibos, bloque canónico, suministro y saldos contra PostgreSQL. La APK destinada a la entrega final queda condicionada al recorrido funcional, como pidió el propietario. La preparación nativa puede requerir una APK de ensayo antes de poder demostrar el deeplink: eso no constituye aceptación ni la APK final. No emitir una actualización en el canal comercial `demo`.

Contrato desplegado: **ninguno**. Hashes Base Sepolia: **ninguno**. APK Android testnet: **ninguna**. La prueba completa sigue pendiente; no se declara terminado el objetivo.
