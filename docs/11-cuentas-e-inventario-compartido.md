# Openminerals 0.1.3 · Cuentas demo e inventario compartido

Revisión del 28 de octubre de 2026. Todas las cuentas, divisas, comisiones, posiciones, existencias y solicitudes son ficticias. Este documento describe el alcance implementado y el recorrido que debe verificarse; las evidencias finales de despliegue, compilación e instalación se completan en la tabla de aceptación. No traslada resultados de 0.1.2 a esta revisión.

## Qué cambia

La aplicación conserva React Native, Expo y las vistas de comprador. Añade cuentas recuperables desde otro dispositivo y un panel de operador conectado al inventario compartido de una mina. Una instalación actualizada sigue usando su sesión anterior hasta que el propietario elija crear una cuenta o entrar en una existente.

| Modo | Acceso y alcance |
| --- | --- |
| Sesión anterior sin cuenta | Conserva identificador local, saldos e historial; inventario y resumen ilustrativo por sesión. `x-demo-session` no es una credencial segura |
| Comprador, rol `buyer` | Billetera y posiciones propias; compras, ventas, reservas e historial; el metal disponible se consulta en la mina compartida |
| Operador, rol `operator` | Pestañas Mina/Cuenta; existencias y operaciones de compradores de su mina; ingresos ficticios de metal. No usa una billetera de comprador |

El registro público crea exclusivamente compradores en la mina demo predeterminada. No acepta elegir rol ni mina. El operador se provisiona mediante administración protegida; no hay credenciales fijas ni token administrativo dentro de la app.

## Conservar la sesión anterior

El formulario **Crear cuenta demo** ofrece **Conservar mi sesión anterior** y explica el resultado antes de confirmar. No se vincula una sesión solo por instalar la actualización.

Con la opción activada, el servidor copia sus saldos, posiciones, ofertas, solicitudes e historial a la nueva cuenta. La asignación de sus posiciones se descuenta una sola vez del disponible compartido. La operación es transaccional: si la sesión ya está vinculada, el alias existe o no hay existencias suficientes para asignar todos los metales, se rechaza sin aplicar una importación parcial.

El origen no se borra ni se reemplaza. Queda marcado como `legacyReadOnly` al consultarlo y rechaza nuevas mutaciones, incluidos los resets administrativos. Sigue permitiendo consultar estado, historial y comprobantes. La app muestra **Sesión anterior vinculada** y pide entrar con el alias para operar. Cerrar una cuenta vuelve a la sesión anterior del dispositivo, que puede encontrarse en ese estado de consulta.

Con la opción desactivada, la cuenta empieza con los saldos ficticios iniciales y cero posiciones; la sesión anterior permanece separada. Entrar en una cuenta existente no importa ni fusiona la sesión local. Los comprobantes importados conservan sus datos históricos, sin convertirse en ventas nuevas de la mina compartida ni volver a sumar sus comisiones al panel.

Para conservar una sesión anterior todavía no vinculada, instalar la actualización sobre la app existente y no borrar su almacenamiento. El alias y la clave permiten recuperar una cuenta vinculada en otro dispositivo; no recuperan automáticamente una sesión anónima cuyo identificador local se haya perdido.

## Acceso y recuperación

- Alias ficticio: de 3 a 40 letras minúsculas, números, guiones o guiones bajos. No usar correo ni datos personales.
- Clave exclusiva de demostración: de 10 a 128 caracteres. El prototipo no ofrece recuperación por correo; guardarla por un medio privado.
- La API conserva hash con sal y entrega tokens revocables con vencimiento. La app guarda la identidad/token en SecureStore en Android/iOS. No persiste la clave; el formulario la limpia al salir, cambiar de modo o completar el acceso.
- El fallback de navegador usa almacenamiento local para QA y no equivale al almacén protegido de los teléfonos.
- Un bearer inválido se rechaza. No se degrada a la sesión anterior aunque se envíe también `x-demo-session`.
- Las operaciones pendientes conservan el payload y su clave original, separados por cuenta. Bloquean registro, cambio de identidad y cierre hasta resolverse. Un token expirado permite entrar de nuevo en esa misma cuenta y reintentar el mismo comando.
- Si no se confirma el registro o la persistencia del acceso, la UI muestra **Resolver acceso a cuenta** y bloquea movimientos nuevos. Si falla el borrado local después de revocar la sesión, permite **Reintentar cierre de sesión**. Estos errores no borran saldos ni pendientes para despejar la pantalla.

Las contraseñas iniciales del operador se entregan al propietario en un archivo privado **fuera del repositorio**. No copiar su contenido, tokens ni `DEMO_ADMIN_TOKEN` a Git, capturas, logs, documentación o variables `EXPO_PUBLIC_`. Este documento no contiene esas credenciales ni presupone que ya se haya provisionado un operador en Railway.

## Mina compartida

Cada mina conserva existencias disponibles y total registrado por metal. Las cantidades se almacenan en miligramos enteros; los importes, en unidades monetarias menores. Compras y ventas modifican el disponible de la misma mina de forma transaccional junto con las posiciones del comprador. El comprador puede actualizar el disponible visible en Mercado; la validación definitiva se hace al confirmar en el servidor.

El panel de operador muestra:

- Disponible, asignado a compradores, reservado dentro de esas posiciones y total registrado para oro, plata, platino y paladio.
- Conciliación `disponible + asignado = total registrado` y `reservado <= asignado` por metal. El reservado no se suma otra vez al total.
- Número de cuentas compradoras, compras/ventas de la mina y comisiones ficticias de esas operaciones.
- Últimas veinte compras, ventas, reservas y cancelaciones; hasta cien ofertas abiertas y cien solicitudes pendientes, con el total de cada grupo.
- Últimos veinte ingresos ficticios de metal, con cantidad, motivo, operador, fecha y comprobante consultable.

El operador puede inspeccionar comprobantes de operaciones de inventario de compradores de su misma mina. La respuesta omite saldos privados de billetera y no incluye ingresos, retiros ni conversiones personales. Las operaciones importadas de la etapa anterior no aparecen como actividad nueva de esta mina. El servidor aplica permisos y alcance de mina; ocultar pestañas no es la barrera de acceso.

**Ingreso ficticio de metal** solicita metal, gramos y motivo de 3 a 160 caracteres, muestra confirmación y utiliza una clave idempotente persistida antes del envío. Aumenta disponible y total en la misma cantidad. Su comprobante conserva los valores posteriores de ese momento; un replay recupera el mismo ingreso. No representa recepción física, ensayo, lote, certificado de propiedad, reserva auditada ni contrato de custodia.

## Contratos principales de API

Las rutas siguen bajo `/api/demo`. Todas las respuestas de demostración correspondientes mantienen `demoOnly:true`.

| Ruta | Acceso y propósito |
| --- | --- |
| `POST /accounts/register` | Registro público de comprador: `alias`, `password`, `importLegacy`; `x-demo-session` solo cuando se elige importar |
| `POST /accounts/login` | Alias/clave; devuelve token, vencimiento, cuenta y mina |
| `GET /accounts/me` | Bearer; consulta identidad autorizada y mina |
| `POST /accounts/logout` | Bearer; revoca ese acceso |
| `GET /state`, `/history`, `/receipts/<id>` | Estado e historial propios del comprador o sesión anterior; no permiten acceder a otra cuenta por conocer su identificador |
| `POST /buy`, `/sell` y demás comandos de comprador | Bearer de comprador o sesión anterior no vinculada; `Idempotency-Key` obligatorio |
| `GET /mine/summary` | Solo operador; resumen agregado de su mina |
| `POST /mine/stock` | Solo operador; `metal`, `grams`, `reason` y `Idempotency-Key`; devuelve comprobante y resumen de mina, sin billetera |
| `GET /mine/receipts/<accountId>/<receiptId>` | Solo operador, comprador de su misma mina y operación de inventario permitida; vista sin saldos privados |
| `POST /admin/mines`, `/admin/accounts` | Aprovisionamiento protegido por `x-demo-admin-token`; fuera del formulario público |

Un comprador obtiene 403 al intentar operar el panel de mina y un operador obtiene 403 al usar comandos de billetera/compraventa. Los comprobantes de otra mina o fuera del alcance permitido no están disponibles. El registro público rechaza campos adicionales como `role` o `mineId`.

PostgreSQL conserva las tablas anteriores de sesiones y añade las de minas, cuentas y tokens. La activación debe ser aditiva; no borrar esquemas ni reiniciar sesiones para habilitar las cuentas. En Railway sigue siendo obligatorio `REQUIRE_DATABASE=true` y `/health` con `mode:postgres-demo`. Una prueba en memoria local no acredita persistencia de Railway.

## Recorrido de aceptación

Cuando se entregue un APK 0.1.3 verificado, instalarlo como actualización de Openminerals Demo y realizar este recorrido con identidades sintéticas. No usar la sesión del propietario para pruebas que borren datos.

1. Antes de crear la cuenta, comprobar saldos e historial de la instalación anterior. Crear un comprador con **Conservar mi sesión anterior** y comprobar los mismos importes, posiciones y comprobantes.
2. Abrir la misma cuenta en una segunda instancia o dispositivo; comprobar que recupera su estado. Volver a consultar el origen sin cuenta y comprobar que sigue visible, con mutaciones bloqueadas.
3. Crear otro comprador sin importación y comprobar que su billetera está separada. Operar ambos sobre el mismo metal; verificar que consumen existencias comunes y no se vende más metal disponible durante solicitudes concurrentes.
4. Entrar con el operador provisionado de forma privada. Verificar Mina/Cuenta, conciliación, ambas identidades compradoras, compras/ventas y solicitudes. Abrir un comprobante permitido y confirmar que no se exponen saldos privados.
5. Registrar un ingreso ficticio de 1 g con motivo de prueba; comprobar que disponible y total aumentan 1 g y que su comprobante se conserva. Repetir la misma solicitud con la misma clave y verificar que no duplica el ingreso.
6. Probar permisos por HTTP además de la navegación: comprador contra mina, operador contra compraventa, bearer inválido con header anterior, comprobante de otra cuenta/mina e intento de elegir rol en el registro.
7. Simular pérdida de respuesta, relanzamiento y token vencido con pendiente; entrar con la misma cuenta y recuperar exactamente un comprobante. Comprobar que no permite cambiar o cerrar la cuenta hasta resolverlo.
8. Recargar y reiniciar el servicio demo de forma controlada; comprobar estado de cuenta, origen vinculado, existencias compartidas, comprobantes e idempotencia. Registrar por separado la prueba de teléfono, navegador, API y PostgreSQL.

Comandos reproducibles desde cada carpeta, con Node 22.13 o posterior:

```bash
cd api
npm ci
npm test
npm run test:postgres
```

`npm run test:postgres` requiere `TEST_DATABASE_URL` de una base autorizada para pruebas y crea un esquema temporal propio. No sustituir esa URL por una conexión ajena ni publicar su valor. Los smokes anteriores siguen comprobando compatibilidad de sesiones; no bastan por sí solos para aceptar cuentas y mina.

```bash
cd mobile
npm ci
npm test
npm run check
npx expo install --check
npx expo-doctor
```

Para construir o ejecutar la app, `EXPO_PUBLIC_API_URL` debe apuntar al backend correcto. En teléfonos usar HTTPS público; no `localhost` del computador. No incluir secretos en esa variable pública.

## Evidencia de la revisión 0.1.3

Esta tabla debe completarse con resultados observados y enlaces reales antes de entregar la revisión como verificada. **Pendiente** significa que este archivo no aporta aún esa evidencia; no implica una prueba aprobada ni sustituye los registros del responsable de la ejecución.

| Elemento | Resultado/evidencia |
| --- | --- |
| Commit final y PR de la revisión | Pendiente de registrar |
| Pruebas API de dominio/HTTP y contratos de roles | Pendiente de consolidar con comando, resultado y log |
| PostgreSQL: concurrencia, importación, rollback y reconexión | Pendiente de consolidar con resultado y log |
| Pruebas móviles y TypeScript de la fuente final | Pendiente de consolidar con resultado y log |
| Dependencias Expo y exports Android/iOS | Pendiente de consolidar |
| UI local con compradores y operador | Pendiente de registrar recorrido, entorno y capturas |
| Activación 0.1.3 en Railway | Pendiente; el dominio existente es `https://openminerals-api-demo.up.railway.app`, y su funcionamiento anterior no acredita la revisión nueva |
| Prueba HTTPS y persistencia tras reinicio | Pendiente de registrar para cuentas/mina de esta revisión |
| Aprovisionamiento de operador | Pendiente de confirmar; credenciales solo en archivo privado fuera de Git |
| APK Android 0.1.3 | Pendiente de enlace EAS/APK, fuente, firma, versión y hash |
| Instalación y recorrido Android 0.1.3 | Pendiente de prueba nativa y confirmación del propietario |
| Instalador/recorrido iPhone | Sin evidencia nueva en este informe; el bloqueo de firma Apple sigue documentado en la revisión anterior |

El último APK entregado y sus resultados pertenecen a [0.1.2](10-comprobantes-y-operaciones-0.1.2.md). No usar ese enlace para afirmar que cuentas y mina ya están instaladas en el teléfono.

## Límites que permanecen

No se implementan custodia física, asignación de lotes, auditoría de reservas, emisión o transferencia de tokens, contratos blockchain, claves de cartera, KYC, pagos, cotizaciones de mercado, ledger contable de doble entrada, emparejamiento de ofertas ni envíos reales. `COMPLETED` solo indica un comando registrado en la simulación.

Las cuentas no verifican identidad personal ni constituyen un sistema de acceso de producción; la limitación de intentos es local al proceso. El registro público y el inventario finito requieren gestión adicional para una demo pública de gran escala. El scrollytelling continúa pendiente de aceptación y no se amplía en esta revisión.
