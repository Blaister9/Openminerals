# OPENMINERALS · Mobile Demo Foundation

**Estado: prototipo técnico de simulación, no plataforma financiera en producción.**

Repositorio inicial para presentar la plataforma Openminerals a un operador de mina: aplicación nativa iOS/Android con React Native + Expo; API Node.js desplegable en Railway; sesiones de demostración persistentes en PostgreSQL de Railway; documentos maestros del producto. No requiere HTML anterior.

## Contenido

```text
openminerals-foundation/
├── mobile/                # aplicación móvil iOS/Android con 5 secciones
├── api/                   # API Node.js, persistencia demo PostgreSQL, pruebas
├── docs/                  # diseño maestro, arquitectura, modelo y presentación
└── .github/workflows/     # pruebas automáticas propuestas
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
npm install
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

Usa una sesión aleatoria distinta a la de los usuarios de la demo. Verifica compra de 2 g, venta, reservas, idempotencia y resumen de operador. **No verifica que PostgreSQL persista tras un reinicio**, lo cual requiere prueba de integración adicional en Railway.

## App móvil

```bash
cd mobile
npm install
# crear archivo .env (NO .env.example) con EXPO_PUBLIC_API_URL=https://tu-api.up.railway.app
npx expo install --check
npx expo start
```

En un dispositivo real el valor de `EXPO_PUBLIC_API_URL` debe ser una URL pública **HTTPS**. No sirve apuntar el teléfono a `http://localhost:3000` del computador. La app guarda un identificador aleatorio de sesión de prueba en almacenamiento local y el backend almacena el estado correspondiente. Ese identificador **no es autenticación segura**.

Para instalar en Android/iOS y mostrar al cliente, configurar una cuenta de Expo/EAS, seguir `docs/04-despliegue.md` y compilar una versión `preview`. Railway no genera APK/IPA.

## Pruebas y alcance de validación

`api/test` cubre la lógica de dominio e integración HTTP en memoria, pero **no prueba PostgreSQL**, ni compilación de iOS/Android, ni instalación en teléfonos. Esas verificaciones son requisitos del siguiente hito. El repositorio se entrega como **base reproducible**, no como demo desplegado.

## Seguridad

**No habilitar operaciones reales con este repositorio.** Rutas con sesiones demo sin autenticación, precios fijos y almacenamiento JSONB están concebidos solo para una demostración aislada. No reutilizar usuarios, claves, contraseñas ni saldos para un ambiente regulado o comercial.

## Entrega a Codex y sincronización GitHub

El repositorio de destino indicado es `https://github.com/Blaister9/Openminerals.git`. **Esta entrega no afirma que el código esté publicado ni que Railway esté desplegado**: la importación debe ejecutarse desde el equipo autorizado del propietario.

- `AGENTS.md`: especificaciones y criterios verificables que deberá seguir Codex.
- `docs/06-entrega-a-codex.md`: pasos de clonado, rama, importación, Railway y EAS.
- `tools/import_to_github.py`: importador conservador para GitHub desde un ZIP ya descargado; aborta ante archivos distintos en lugar de sobrescribir, y exige `--push` para publicar.

El PDF ejecutivo se incluye en `docs/Diseno_Maestro_Ejecutivo.pdf`; no es necesario añadir por separado otro PDF igual a la raíz. Esta base no tiene compilación móvil verificada, no ha sido probada contra una instancia PostgreSQL de Railway y no contiene un marketplace real multiusuario.
