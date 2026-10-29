# Implementación de la demo Android integral

Encargo del propietario del 28 de octubre de 2026. Punto de partida: [auditoría sobre 0223326](13-auditoria-demo-2026-10-28.md). Los PR #2 y #1 se integraron, en ese orden, con merge y CI aprobada; base `f34dc30`. Rama de implementación: `codex/android-complete-20261028`. El alcance actual es exclusivamente Android; no se desarrollan funciones ni builds iOS.

Todas las operaciones, lotes, ubicaciones, documentos, certificados, impuestos y entregas son SIMULADOS. No hay transferencias bancarias, USDT real, custodia física acreditada ni envío real.

## Orden y criterios de aceptación

| Fase | Criterio verificable | Estado de implementación |
| --- | --- | --- |
| 1 Custodia | Cuatro metales, lotes identificados, pureza/peso/ubicación/estado/documentos DEMO; asignaciones conciliadas con posiciones; compra/venta/importación/stock sin sobreasignación; certificado verificable y permisos | Implementada y probada localmente; pendiente Railway y APK |
| 2 Marketplace | Precio explícito, catálogo compartido, reserva, compra por otra cuenta, liquidación atómica con comisión, cancelación y comprobantes sin duplicación | Implementada y probada localmente; pendiente Railway y APK |
| 3 Entrega | Requisitos y cotización desglosada; jurisdicción y costes configurables de demo; aprobación, preparación, despacho y entrega simulados; reservas conservadas y transiciones autorizadas | Implementada y probada localmente; pendiente Railway y APK |
| 4 Mina | Inventario y lotes, compradores sin saldos privados, ventas/comisiones/obligaciones/entregas, filtros e historial; permisos y ajustes auditables | Pendiente |
| 5 Cuentas | Perfil ficticio; recuperación mediante secretos y tokens de un uso, vencimiento e intentos limitados; revocación y aislamiento | Pendiente |
| 6 Presentación | Lingote 3D interactivo y relato de compra/custodia/mercado; fluidez, omisión y movimiento reducido; operaciones siempre accesibles | Pendiente |
| 7 Android | Integración Railway/PostgreSQL, pruebas incrementales y de recorridos, dependencias corregidas, APK firmado y prueba de instalación/actualización | Pendiente |

Cada fase debe separar código y pruebas automáticas de los recorridos ejecutados en una compilación instalable. Una pantalla, un export o un APK compilado no acreditan aceptación completa.

## Conservación de datos

Las nuevas estructuras se añaden a las existentes. La sesión anterior, los tokens vigentes, las billeteras y sus comprobantes no se reinician. La migración a lotes debe comprobar primero que posiciones más disponible coinciden con la oferta total; ante una inconsistencia se revierte la transacción completa y se informa del bloqueo.

La asignación por lote se deriva de los gramos de posición existentes. No es un ensayo ni una certificación de metal físico. La pureza es metadato ficticio; las cantidades de la simulación se concilian en miligramos de posición y no se revalorizan retroactivamente por pureza.

Las mutaciones de cuentas se serializan bajo el bloqueo de la mina y se confirman en una sola transacción PostgreSQL. La liquidación entre compradores debe conservar USDT más comisión y gramos totales; una misma clave idempotente debe recuperar el comprobante original.

## Evidencia de pruebas y entrega

Fase 1: 58 pruebas API aprobadas con PostgreSQL 17 local aislado y 53 pruebas móviles; 20 comprobaciones del runner PostgreSQL aprobadas sin omisiones. TypeScript y tres smokes anteriores en memoria aprobados. Cobertura nueva: migración simultánea e inconsistente/rollback, capacidad de lotes con compradores concurrentes, permisos por mina y cuenta, metadatos de stock idempotentes, certificados parcialmente liberados y conservación de sesiones importadas. La UI de custodia está integrada en Metales para el comprador y Mina para el operador; no tiene aceptación Android todavía.

Fase 1 publicada en `1f048a7`; [CI aprobada](https://github.com/Blaister9/Openminerals/actions/runs/40794407889). Fase 2: 70 pruebas API y 26 comprobaciones del runner PostgreSQL aprobadas sin omisiones; 63 pruebas móviles y TypeScript aprobados. Se comprobaron dos compradores compitiendo por una oferta, carrera de cancelación/compra, saldo insuficiente, cruce de mina/rol, replay y transferencia de los lotes originales. Una prueba del cliente con API real simuló una respuesta perdida tras liquidar y recuperó el mismo comprobante después de reconstruir el cliente.

Las nuevas ofertas requieren precio explícito en USDT simulado por gramo. El comprador paga el bruto y el vendedor recibe el bruto menos la comisión de venta definida por la mina (120 puntos básicos en la configuración inicial). La liquidación es completa, sin órdenes parciales. Las ofertas anteriores sin precio se pueden consultar y cancelar, pero no liquidar; para venderlas debe publicarse otra oferta con precio. No hay pagos reales.

Fase 2 publicada en `8330ce7`; [CI aprobada](https://github.com/Blaister9/Openminerals/actions/runs/40795118801). Fase 3: 86 pruebas API y 34 comprobaciones PostgreSQL aprobadas sin omisiones; 76 pruebas móviles y TypeScript aprobados. Se probaron cotizaciones obsoletas/vencidas, saldo insuficiente, permisos, cancelación, rechazo, transiciones y salida final conciliada; una respuesta de cotización perdida se recuperó con el mismo comando desde un cliente reconstruido. La revisión encontró una posible colisión de comprobantes derivados: se corrigió con rechazo y rollback, cubierto en memoria y PostgreSQL.

Las cotizaciones separan servicio, preparación, transporte, seguro e impuesto DEMO; sus tres jurisdicciones son escenarios ficticios configurables, no reglas tributarias reales. Se puede cancelar/rechazar antes de aceptar. Después del pago simulado solo se permite avanzar por los estados autorizados; no se implementa devolución posterior a la aceptación. El peso original del lote permanece y la cantidad entregada se diferencia del suministro activo.

Respaldo previo al despliegue: Railway rechazó backups nativos por limitación del plan. Se creó un `pg_dump` lógico privado fuera de Git: 54.703 bytes, SHA-256 `83fcbac162f3f3dc88d86322ed25fb84104064656c0ba91e90a19b01aff2ad57`. Formato y conteos comprobados: 14 cuentas, 20 sesiones de autenticación, 5 minas y 37 sesiones anteriores. ACL restringida al usuario y SYSTEM. No se ha probado una restauración; no se cambiaron el plan ni los datos de Railway para producir el respaldo.

Se completará incrementalmente con commits, CI, pruebas HTTPS, migración/reinicio, hash y firma del APK y recorridos Android ejecutados. La última auditoría sigue siendo evidencia del punto de partida, sin atribuir sus resultados a funciones nuevas.

Acceso de compilación: el propietario inició sesión Expo por la terminal oficial. `eas whoami` confirma acceso de propietario a `chipirips-team`; `eas project:info` confirma el proyecto existente `c3985e04-43dd-4896-9f8a-09366b6a3579`. No se solicitaron contraseñas ni tokens en el chat. Se usará la firma Android remota existente para conservar la posibilidad de actualización.
