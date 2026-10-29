# AGENTS.md — Openminerals Mobile (instrucciones para Codex)

## Misión

Convertir esta **base de demostración** en una aplicación **instalable en Android e iPhone**, con backend de simulación persistente en **Railway/PostgreSQL**, código versionado en `https://github.com/Blaister9/Openminerals.git` y pruebas reproducibles.

El cliente inicial de la presentación es el operador o propietario de una mina. Deben poder demostrarse dos perspectivas: **comprador** y **operador de la mina**. La revisión 0.1.3 incorpora cuentas e inventario compartido por mina; las sesiones anteriores conservan su vista ilustrativa **por sesión**. La presencia del código no acredita despliegue ni aceptación: registrar evidencia de cada revisión y no presentar el panel como backoffice empresarial terminado.

## Límites y estado real

- Proyecto **DEMO**, sin dinero, USDT, metales, reservas, precios o entregas reales.
- La API conserva sesiones anteriores sin cuenta: `x-demo-session` **no** es credencial segura. Las cuentas nuevas tienen alias ficticio, clave demo y token revocable; no verifican identidad ni son autenticación apta para producción financiera. No utilizar con clientes reales ni datos personales sensibles.
- No existe KYC, AML, custodia física, emisión de tokens, blockchain, integración bancaria, precios en tiempo real ni ledger contable de doble entrada.
- La animación actual de lingote es 2.5D aproximada: el **scrollytelling 3D** está especificado pero NO terminado.
- No describir como probado lo que no se haya ejecutado. No inventar enlaces de builds, despliegues o credenciales.
- No comenzar producción financiera ni conectar saldos reales. Requiere análisis legal y de negocio aparte.

## Repositorio y tecnología

- `mobile/`: React Native + Expo, TypeScript (cinco pestañas de comprador; Mina/Cuenta de operador).
- `api/`: Node.js 22+, API HTTP, motor de simulación, PostgreSQL opcional en desarrollo y **obligatorio en Railway**.
- `docs/`: diseño maestro, especificación operativa, guion de presentación y entregable PDF.
- `.github/workflows/ci.yml`: pipeline de validación inicial.
- `tools/`: importación segura de esta base a GitHub; no reemplaza tu juicio de integración.

## Primera tarea: sincronizar el código, sin destruir lo existente

1. Verificar que el repositorio remoto pertenece a la cuenta prevista. **No hacer `--force`, no borrar ramas, no cambiar repositorios ajenos.**
2. Clonar `https://github.com/Blaister9/Openminerals.git` en una carpeta de proyectos local (p. ej. `~/Projects/Openminerals`). Si ya existe, verificar `git remote -v` y que no tenga cambios sin registrar; hacer copia de seguridad si corresponde.
3. Incorporar el **contenido interno** de `openminerals-foundation/` del ZIP a la **raíz** del repositorio, no crear `Openminerals/openminerals-foundation/` accidentalmente. Incluir los archivos ocultos `.github` y `.gitignore`.
4. Si el remoto ya tiene README, código, configuraciones o commits, **comparar y hacer integración en rama**, no sobrescribir a ciegas. Si está vacío, inicializar `main`.
5. `git status`, `git diff --check`, revisar archivos añadidos. No subir `.env`, credenciales privadas, llaves de acceso, bases de datos, archivos de identidad ni `node_modules`. Excepción expresamente autorizada por el propietario: el alias y la clave del operador de demostración en `demo-access/operator-public.json` son acceso público de prueba; no ampliar esta excepción a otras cuentas o secretos.
6. Crear commit descriptivo y hacer push **sin force**. Si hay rama existente, usar rama `codex/*` y PR; si es repositorio vacío, crear `main`. Registrar URL del commit/PR y SHA.

Hay un importador multiplataforma `tools/import_to_github.py` que evita sobrescribir archivos diferentes; úsalo cuando convenga. Si encuentra conflicto, integrar manualmente con seguridad.

## Validación inicial ANTES de ampliar funcionalidades

1. Ejecutar `cd api && npm install && npm test` y después `npm start` + `npm run smoke`. Al preparar dependencias, generar y versionar `package-lock.json` para instalaciones reproducibles.
2. En `mobile/`: `npm install`, `npx expo install --check`, `npm run check`, `npx expo-doctor` (o equivalente vigente). Corregir las incompatibilidades encontradas; luego probar ejecución real.
3. Comprobar que la app inicia en Android e iPhone físicos y se comunica con API HTTPS. `localhost` en el teléfono **no** es el PC.
4. No reescribir el proyecto por preferencias estéticas o de framework sin bloqueo técnico comprobado. Si se actualiza Expo SDK, documentar motivo, cambios y regresiones; el repositorio arranca en SDK 57.

## Railway: configuración de la DEMO

1. Inspeccionar proyectos y entornos Railway existentes del usuario **antes de crear nuevos**. Elegir el proyecto/entorno de demostración autorizado. No tocar producción existente.
2. Servicio API conectado al repositorio; **Root Directory `/api`**, configuración `/api/railway.json` si requiere ruta explícita.
3. Añadir PostgreSQL y configurar API con referencia a la `DATABASE_URL` del servicio de base de datos, `REQUIRE_DATABASE=true`, `NODE_ENV=production`, y `DEMO_ADMIN_TOKEN` fuerte creado en el gestor de secretos de Railway. **Nunca registrar secretos en Git**.
4. Configurar dominio HTTPS solo para la API. `/health` debe retornar `ok:true`, `demoOnly:true` y **`mode:postgres-demo`**. `memory-demo` en Railway es un fallo de despliegue.
5. Ejecutar el smoke de `api/scripts/smoke.mjs` contra la URL publicada. Probar **persistencia tras reiniciar** el servicio; verificar sesión separada y ausencia de duplicaciones concurrentes.
6. Distinguir la vista anterior por sesión del panel autenticado de mina. Verificar dos compradores y un operador sobre la misma mina, permisos 403, concurrencia e inventario `disponible + asignado = total`; las reservas son parte del asignado. No presentarlo como inventario físico auditado ni backoffice de producción.

## Cuentas e inventario compartido de demostración

1. Mantener las sesiones anteriores hasta que el usuario elija crear o abrir una cuenta. El registro público solo crea `buyer`; rechazar parámetros que intenten elegir un rol o una mina desde ese formulario.
2. La importación es una elección explícita: copia saldos, posiciones e historial de la sesión anterior, asigna sus metales una sola vez al inventario compartido y congela el origen para mutaciones, sin borrarlo. Si falla, no aplicar una importación parcial ni reiniciar datos. Una sesión ya vinculada sigue consultable y pide iniciar sesión para operar.
3. Provisionar `operator` únicamente por las rutas administrativas protegidas. El propietario autorizó publicar el alias y la clave de la cuenta de operador demo en [el archivo de acceso público](demo-access/operator-public.json); usarlo como cuenta compartida para operaciones ficticias. Las claves de compradores y otros operadores siguen siendo privadas. No publicar tokens de sesión, `DEMO_ADMIN_TOKEN`, `DATABASE_URL`, credenciales de GitHub/Railway/EAS ni claves del respaldo cifrado; tampoco incrustarlos en app o variables `EXPO_PUBLIC_`. El operador inicia en Mina; no mostrarle una billetera ficticia de comprador.
4. El backend aplica el rol y la mina en cada operación. Los compradores consultan solo su estado e historial. El operador consulta movimientos de inventario de su mina; no recibe saldos privados de billeteras ni conversiones/ingresos personales. Un bearer inválido nunca debe caer a `x-demo-session`.
5. Persistir el token con SecureStore en Android/iOS y no persistir la clave. El fallback de almacenamiento web sirve solo para QA. Conservar la misma identidad y clave idempotente de una operación pendiente: bloquear registro, cambio y cierre hasta resolverla; permitir reingreso de la misma cuenta si el token expiró.
6. Compras y ventas modifican existencias compartidas de forma transaccional. El ingreso de metal del operador es ficticio, idempotente y trazable con comprobante; no representa lote, recepción física, ensayo, título de propiedad ni custodia. Registrar permisos, importación, concurrencia, reinicio y aislamiento en [el informe de cuentas](docs/11-cuentas-e-inventario-compartido.md).

## Compilaciones y entrega a teléfonos

1. App apuntando a la API HTTPS: `EXPO_PUBLIC_API_URL=https://...`. Al compilar con EAS, establecerla en el entorno de build correcto; no almacenar secretos en `EXPO_PUBLIC_`.
2. Generar **APK de demostración Android**; instalarlo y ejecutar recorrido completo en un teléfono.
3. Generar **build iOS de prueba** vía EAS/TestFlight o distribución interna autorizada. Requiere certificados/provisionamiento y, normalmente, cuenta Apple Developer. Si se trabaja en Windows, EAS Build permite compilar iOS en la nube; el simulador iOS local requiere macOS/Xcode.
4. Verificar cambio USD→USDT, compra de 2 g de oro, descuento de USDT, portafolio, venta, oferta, entrega, historial, recarga de app, saldos insuficientes y repetición de solicitud. Registrar evidencia y fallos.
5. Implementar mejoras visuales **después** de validar la cadena de datos. Scrollytelling/3D no debe bloquear compra y estado de billetera; ofrecer modo con movimiento reducido.

## Criterios verificables de cierre

- GitHub accesible y con commit/PR de importación; workflow ejecutado con resultado.
- API Railway accesible con PostgreSQL (no memoria), pruebas locales/integración y persistencia tras reinicio verificadas.
- App Android instalada y recorrido completo sin fallos críticos.
- App iOS instalada y recorrido verificado **o** bloqueo de certificados documentado expresamente.
- Comprobantes/historial consistentes; no se compran gramos sin USDT suficiente ni se duplican movimientos.
- Para cuentas/roles: origen importado conservado en consulta, acceso desde una segunda instancia, permisos comprador/operador y conservación de inventario compartido verificados. Documentar por separado lo probado en navegador, API, emulador y teléfono.
- Descripción visible y permanente de datos **SIMULADOS**; no confundir el panel de mina con métricas reales.
- `README.md` actualizado con comandos reproducibles, URLs públicas no sensibles, SHA de commit, fecha de pruebas y pendientes concretos.

## Entrega del agente al propietario

Al finalizar, informar: ruta local del clon, remoto y rama, SHA de commit/URL PR, proyecto/servicio/entorno de Railway, dominio de API, pruebas ejecutadas y resultados, enlaces reales de builds Android/iOS, pasos de instalación, enlace al acceso público demo autorizado y cualquier otra credencial que deba configurar el usuario **sin exponerla**, problemas abiertos y próximo bloqueo real.

Trabajar hasta obtener una demo instalable; no declarar terminada una fase solo porque el código existe o una captura luce bien.
