# OPENMINERALS · Demo móvil con Railway

**Estado: prototipo técnico de simulación, no plataforma financiera en producción.**

Repositorio inicial para presentar la plataforma Openminerals a un operador de mina: aplicación nativa iOS/Android con React Native + Expo; API Node.js desplegable en Railway; sesiones de demostración persistentes en PostgreSQL de Railway; documentos maestros del producto. No requiere HTML anterior.

## Estado verificado · 28 de octubre de 2026

- Clon local: `C:\Users\edwin.paz\Projects\Openminerals`; remoto oficial `https://github.com/Blaister9/Openminerals.git`. La entrega inicial está en `main`; la revisión móvil está publicada en la rama `codex/mobile-overview-scroll-20261028`, [PR #1](https://github.com/Blaister9/Openminerals/pull/1), pendiente de revisión.
- Commits publicados: [importación 877ca77](https://github.com/Blaister9/Openminerals/commit/877ca777b66d40363732f9a6286c4d6f097a28ea), [fiabilidad/pruebas 2e16413](https://github.com/Blaister9/Openminerals/commit/2e16413f090b6eb81c7a981c4ca21a4ae7a886ce) y [vinculación EAS 7762585](https://github.com/Blaister9/Openminerals/commit/7762585de892673c3cd7fd20729d21056f0cb1ce).
- [API HTTPS](https://openminerals-api-demo.up.railway.app/health): `ok:true`, `demoOnly:true`, `mode:postgres-demo`. Proyecto Railway `openminerals-demo`, entorno `demo`; PostgreSQL privado.
- API: 12 pruebas de dominio/HTTP, cinco comprobaciones de integración PostgreSQL y smoke remoto aprobados. Persistencia tras reiniciar el servicio y repetición del mismo comprobante verificadas.
- Móvil: 17 pruebas del cliente, reintentos, resumen y cantidades; TypeScript y exports Android/iOS aprobados. Se conserva Expo SDK 57 y React Native, sin dependencias nuevas para el recorrido.
- **Android actualizado 0.1.1:** [descargar APK](https://expo.dev/artifacts/eas/aO-xj5vXxzQE7PiFcZDMaFq6Izjb-l5w9i27deWmgl8.apk), fuente [608120d](https://github.com/Blaister9/Openminerals/commit/608120d9c8a73aee58100db9d91aef5a7baad02e), compilación EAS finalizada. Muestra USDT y metales por separado, desglosa comisiones y añade cuatro escenas 2.5D ligadas al scroll. Firma verificada y coincidente con 0.1.0; instalar como actualización sin desinstalar. La conservación de la sesión y el recorrido nuevo aún requieren confirmación en el teléfono.
- El propietario confirmó instalación y uso parcial de Android **0.1.0**: conversión, compra de 0,5 g, rechazo por saldo insuficiente y venta. Se conserva el [APK anterior](https://expo.dev/artifacts/eas/Ic5ZX_B-ZrIwRQIXekpWrYE1T9nJ0DYIJRPwJsGFais.apk). El [archivo para simulador iOS 0.1.0](https://expo.dev/artifacts/eas/0UbmdUNFLWCt8ZNcUp7oIunu-2EKjEtqV2A63lRyXTk.tar.gz) compiló, pero no se ejecutó y no se instala en iPhone. iPhone sigue bloqueado por firma Apple. Artefactos descargados en `artifacts/` (ignorado por Git); detalles en [informe original](docs/07-verificacion-2026-10-28.md) y [revisión de usabilidad](docs/08-revision-usabilidad-2026-10-28.md).
- [CI de la revisión aprobado](https://github.com/Blaister9/Openminerals/actions/runs/40736057377): API/PostgreSQL, pruebas móviles, tipos y dependencias. La prueba nativa del APK se registra por separado en el informe de revisión.

La app persiste operaciones pendientes antes de enviarlas y conserva su clave al reintentar después de un timeout o de cerrar/reabrir el cliente. El panel de operador sigue siendo **por sesión**, no un inventario global de la mina.

## Contenido

```text
Openminerals/
├── mobile/                # aplicación móvil iOS/Android con 5 secciones
├── api/                   # API Node.js, persistencia demo PostgreSQL, pruebas
├── docs/                  # diseño maestro, arquitectura, modelo y presentación
└── .github/workflows/     # validación automática con PostgreSQL y móvil
```

### Qué funciona en el código de demostración

- Cuatro billeteras independientes: COP, EUR, USD y USDT.
- Movimientos ficticios de ingreso, retiro y conversión a tasa fija.
- Compras y ventas ficticias con saldo USDT y metal expresado en miligramos.
- Cuatro metales: oro, plata, platino y paladio.
- Portafolio con cantidades, valoración, saldos disponibles y reservas.
- Publicación/cancelación de ofertas (sin emparejamiento real de compradores).
- Solicitud/cancelación de **cotización** de entrega física (sin envíos reales).
- Historial simulado, panel ilustrativo del operador de la mina.
- Idempotencia por operación y transacciones por sesión en PostgreSQL.

**No existe** KYC, autenticación real, integración bancaria, blockchain, contratos de custodia, inventario auditado, precio en tiempo real, certificados de título, envío físico, registro contable de doble entrada ni motor de órdenes de producción. La animación de lingote es una aproximación visual; el scrollytelling 3D cinematográfico queda en el diseño maestro, no está implementado todavía.

## Prueba local de la API

Node.js 22.13 o posterior.

```bash
cd api
npm ci
npm test
npm start
```

Si `DATABASE_URL` no está definido, se ejecuta en modo memoria **solo para pruebas** y los datos se pierden al reiniciar el proceso. En Railway configurar **`REQUIRE_DATABASE=true`**.

```bash
curl http://localhost:3000/health
curl -H 'x-demo-session: invitado-openminerals-0001' http://localhost:3000/api/demo/state
curl -X POST http://localhost:3000/api/demo/convert \
  -H 'Content-Type: application/json' \
  -H 'x-demo-session: invitado-openminerals-0001' \
  -H 'Idempotency-Key: demo-convert-0000001' \
  -d '{"from":"USD","to":"USDT","amount":"200.00"}'
curl -X POST http://localhost:3000/api/demo/buy \
  -H 'Content-Type: application/json' \
  -H 'x-demo-session: invitado-openminerals-0001' \
  -H 'Idempotency-Key: demo-buy-000000001' \
  -d '{"metal":"XAU","grams":"2.000"}'
```

## Prueba integral de aceptación de la API

Con la API ejecutándose en `http://localhost:3000`:

```bash
cd api
npm run smoke
```

Contra un servicio publicado en Railway:

```bash
node api/scripts/smoke.mjs https://tu-api.up.railway.app
```

Usa una sesión aleatoria distinta a la de los usuarios de la demo. Verifica compra de 2 g, venta, reservas, idempotencia y resumen de operador. Definir `REQUIRE_POSTGRES=true` exige el modo PostgreSQL. El smoke no prueba por sí solo un reinicio: `api/scripts/persistence.mjs` compara el estado antes y después, y ya se ejecutó contra Railway. Ver comandos y evidencia en el informe.

## App móvil

```bash
cd mobile
npm ci
# crear archivo .env (NO .env.example) con EXPO_PUBLIC_API_URL=https://openminerals-api-demo.up.railway.app
npx expo install --check
npm test
npm run check
npx expo start
```

En un dispositivo real el valor de `EXPO_PUBLIC_API_URL` debe ser una URL pública **HTTPS**. No sirve apuntar el teléfono a `http://localhost:3000` del computador. La app guarda un identificador aleatorio de sesión de prueba en almacenamiento local y el backend almacena el estado correspondiente. Ese identificador **no es autenticación segura**.

Expo/EAS está enlazado a [@chipirips-team/openminerals-demo](https://expo.dev/accounts/chipirips-team/projects/openminerals-demo). El perfil `preview` solicita APK Android y utiliza la API HTTPS real; `ios-simulator` produce un build para simulador de macOS, que no se instala en iPhone. Seguir [la guía de instalación](docs/04-despliegue.md). Railway no genera APK/IPA.

## Pruebas y alcance de validación

`api/test` cubre dominio, HTTP en memoria y PostgreSQL con aislamiento, concurrencia, rollback y persistencia al reconectar. `npm run test:postgres` exige `TEST_DATABASE_URL`; si falta, falla expresamente. Los tests utilizan un esquema temporal propio y no borran sesiones existentes. CI ejecuta PostgreSQL 18 y las pruebas móviles con instalaciones reproducibles.

La validación Android física es parcial y fue comunicada por el propietario; la revisión 0.1.1, el recorrido completo y la ejecución iPhone siguen pendientes. Los resultados de compilación, los enlaces reales y los bloqueos se registran por separado en los informes. La auditoría móvil conserva tres avisos altos transitivos de Zod y cinco bajos en las herramientas Expo, detallados en el informe; no se aplicó un downgrade de SDK ni un override incompatible. La auditoría de la API no reportó vulnerabilidades.

## Seguridad

**No habilitar operaciones reales con este repositorio.** Rutas con sesiones demo sin autenticación, precios fijos y almacenamiento JSONB están concebidos solo para una demostración aislada. No reutilizar usuarios, claves, contraseñas ni saldos para un ambiente regulado o comercial.

## Entrega a Codex y sincronización GitHub

El repositorio oficial está publicado y la API Railway está desplegada. El remoto estaba vacío al importar; no se sobrescribió trabajo anterior ni se utilizó `push --force`.

- `AGENTS.md`: especificaciones y criterios verificables que deberá seguir Codex.
- `docs/06-entrega-a-codex.md`: pasos de clonado, rama, importación, Railway y EAS.
- `tools/import_to_github.py`: importador conservador para GitHub desde un ZIP ya descargado; aborta ante archivos distintos en lugar de sobrescribir, y exige `--push` para publicar.

El PDF ejecutivo se conserva en `docs/Diseno_Maestro_Ejecutivo.pdf`. La demo no contiene un marketplace real multiusuario ni representa metales, reservas, cotizaciones o fondos reales.
