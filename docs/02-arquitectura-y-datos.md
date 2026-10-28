# Openminerals · Arquitectura lógica y dominio

## Arquitectura piloto

```text
  iOS / Android: React Native + Expo (EAS distribuye builds)
                 |
           HTTPS / JSON
                 |
  Railway: API Node.js 22 (servicio público)
                 |
       PostgreSQL en red privada Railway
                 |
   Sesiones demo JSONB + transacciones SQL FOR UPDATE

  GitHub: repositorio privado, CI, revisión de cambios
```

La app no almacena saldos oficiales: consulta el servidor. API con sesiones independientes mediante `X-Demo-Session`. **Este header es un identificador de prueba, NO autenticación.** Nunca utilizar este mecanismo con datos personales o dinero real.

### Servicios después del demo (no implementados)

- Identidad/KYC (documento, biometría según proveedor y jurisdicción, verificación y sanciones).
- Libro mayor de doble entrada e inventario reconciliado; cada orden produce asientos balanceados e inmutables.
- Motor de cotización con vigencia, fuente y dispersión de precios; reglas de redondeo y tarifas.
- Operador de liquidez y tesorería segregada; integración con banco y proveedor VASP/custodio USDT autorizado donde aplique.
- Gestión de lotes físicos, ensayos, custodia, documentación y segregación por cliente.
- Orquestación de entregas (KYC, mínimo físico, manufactura, seguro, flete, impuestos de la jurisdicción y confirmación).
- RBAC/ABAC para mina, operador, custodia, cumplimiento y soporte; bitácora de auditoría y gestión de secretos.
- Observabilidad, alertas, copias de seguridad, protección antiabuso, pruebas de carga y recuperación de desastres.

## Modelo para producción (diseño, NO migración actual)

| Entidad | Función |
|---|---|
| organizations / roles / memberships | Mina, custodio, operador, permisos |
| customers / identity_checks | Identidad, KYC y consentimiento |
| mines / batches / assays | Origen, lotes, pureza, cadena de custodia |
| vault_receipts / allocated_metal | Evidencia de metal bajo custodia y asignación |
| instruments / price_quotes | Metales, referencia, vigencia, spread y tarifas |
| orders / executions | Compra, recompra, cancelación y liquidación |
| ledger_accounts / ledger_entries | Libro contable por moneda y contrapartida |
| positions / reservations | Cantidad asignada, disponible y reservada |
| wallet_accounts / settlement_instructions | Saldos y orquestación de pagos |
| delivery_quotes / delivery_orders | Entrega física y seguimiento |
| audit_events / documents | Auditoría e información firmada |

**Invariantes obligatorias**

- `disponible = total - reservado`, nunca negativo.
- Cada venta disminuye la posición total y cada compra la aumenta solamente después de validación.
- Fondos y metal se actualizan dentro de la misma transacción comercial, con reintentos idempotentes.
- El inventario comercializable nunca excede el inventario válido, no comprometido y reconciliado.
- Nunca presentar `precio de referencia = precio ejecutable` ni prometer recompra ilimitada.
- No mezclar derechos de custodia, titularidad y obligaciones monetarias.

## Modelo demostrativo implementado

Una tabla `demo_sessions` contiene un objeto JSONB por sesión. Aporta atomicidad de **simulación** mediante transacciones y bloqueo de fila. Las cifras representan centésimas de moneda y miligramos para evitar errores básicos de coma flotante. Los cálculos de tarifas y conversiones utilizan enteros y `BigInt`.

**No usar el JSONB de sesiones como libro mayor final.** Es deliberadamente simple para un pitch. Los movimientos se limitan a 100 eventos recientes y el resumen gerencial es ilustrativo.

## API de demostración

`GET /health` · chequeo.

Requieren cabecera `x-demo-session: <identificador aleatorio de al menos 16 caracteres>`:

- `GET /api/demo/state`
- `GET /api/demo/operator/summary`
- `POST /api/demo/deposit` → `{ "currency":"USD", "amount":"100.00" }`
- `POST /api/demo/withdraw` → `{ "currency":"USD", "amount":"50.00" }`
- `POST /api/demo/convert` → `{ "from":"USD", "to":"USDT", "amount":"200.00" }`
- `POST /api/demo/buy` → `{ "metal":"XAU", "grams":"2.000" }`
- `POST /api/demo/sell` → `{ "metal":"XAU", "grams":"0.500" }`
- `POST /api/demo/offer` → `{ "metal":"XAU", "grams":"0.500" }`
- `POST /api/demo/cancel_offer` → `{ "offerId":"offer-3" }`
- `POST /api/demo/delivery` → `{ "metal":"XAU", "grams":"0.500" }`
- `POST /api/demo/cancel_delivery` → `{ "deliveryId":"delivery-4" }`

Todas las peticiones POST de operaciones necesitan una cabecera **`Idempotency-Key: <UUID>`**. La API ignora cualquier campo `requestId` enviado en el JSON y toma el identificador de esa cabecera. Responde con `receipt` y el `state` actualizado.

`POST /api/demo/reset` solo está habilitada con el secreto `DEMO_ADMIN_TOKEN` definido en el servidor y su cabecera `x-demo-admin-token` (nunca incluir ese secreto en una app publicada).

## Seguridad y estado de validación

- Aislar entorno demo de cualquier dato real, no alojar material confidencial.
- API sin autenticación: apta solo para acceso controlado de demostración y datos ficticios. Antes de exposiciones públicas masivas: autenticación de demostración, límites por IP, cuotas, retención y monitoreo.
- Claves API y `DATABASE_URL` solo en variables del servidor; nunca en `EXPO_PUBLIC_*`, Git o app instalada.
- `EXPO_PUBLIC_API_URL` es públicamente visible en el binario, como corresponde a una dirección de servicio.
- PostgreSQL en Railway está previsto; las pruebas automatizadas actuales no incluyen conexión PostgreSQL real ni verificación de copias de seguridad.
