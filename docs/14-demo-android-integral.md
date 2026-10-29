# Implementación de la demo Android integral

Encargo del propietario del 28 de octubre de 2026. Punto de partida: [auditoría sobre 0223326](13-auditoria-demo-2026-10-28.md). Los PR #2 y #1 se integraron, en ese orden, con merge y CI aprobada; base `f34dc30`. Rama de implementación: `codex/android-complete-20261028`. El alcance actual es exclusivamente Android; no se desarrollan funciones ni builds iOS.

Todas las operaciones, lotes, ubicaciones, documentos, certificados, impuestos y entregas son SIMULADOS. No hay transferencias bancarias, USDT real, custodia física acreditada ni envío real.

## Orden y criterios de aceptación

| Fase | Criterio verificable | Estado de implementación |
| --- | --- | --- |
| 1 Custodia | Cuatro metales, lotes identificados, pureza/peso/ubicación/estado/documentos DEMO; asignaciones conciliadas con posiciones; compra/venta/importación/stock sin sobreasignación; certificado verificable y permisos | Implementada y probada localmente; pendiente Railway y APK |
| 2 Marketplace | Precio explícito, catálogo compartido, reserva, compra por otra cuenta, liquidación atómica con comisión, cancelación y comprobantes sin duplicación | Implementada y probada localmente; pendiente Railway y APK |
| 3 Entrega | Requisitos y cotización desglosada; jurisdicción y costes configurables de demo; aprobación, preparación, despacho y entrega simulados; reservas conservadas y transiciones autorizadas | Implementada y probada localmente; pendiente Railway y APK |
| 4 Mina | Inventario y lotes, compradores sin saldos privados, ventas/comisiones/obligaciones/entregas, filtros e historial; permisos y ajustes auditables | Implementada y probada localmente; pendiente Railway y APK |
| 5 Cuentas | Perfil ficticio; recuperación mediante secretos y tokens de un uso, vencimiento e intentos limitados; revocación y aislamiento | Implementada y probada localmente; pendiente Railway y APK |
| 6 Presentación | Lingote 3D interactivo y relato de compra/custodia/mercado; fluidez, omisión y movimiento reducido; operaciones siempre accesibles | Implementada; geometría/WebGL software/export aprobados; pendiente GPU y gestos Android |
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

Fase 3 publicada en `916c5a6`, regresión adicional en `1869c93` y smoke integral en `e7cd61a`; [CI aprobada](https://github.com/Blaister9/Openminerals/actions/runs/40797326022). El smoke integral de fases 1–3 pasó 525 comprobaciones; prepare/verify tras reiniciar una API local sobre PostgreSQL aprobaron 513/162. Son aserciones del smoke, separadas del número de pruebas unitarias/integración.

Fase 4: API 97/97, runner PostgreSQL 40/40 y móvil 85/85 aprobados. Historial paginado sobre más de 20 eventos, filtros combinados, inserciones entre páginas, dos operadores con la misma clave y aislamiento por mina comprobados. Las métricas corresponden al historial filtrado; inventario y obligaciones muestran la situación actual de la mina. La comisión de una liquidación marketplace se cuenta una sola vez. Las correcciones permitidas son reposiciones y políticas auditadas; no hay modificación libre de billeteras, borrado de historial ni edición de lotes asignados.

Fase 4 publicada en `460714a`; [CI aprobada](https://github.com/Blaister9/Openminerals/actions/runs/40798230216). Fase 5: API 113/113, runner PostgreSQL 52/52 y móvil 97/97 aprobados. Se probaron consumo concurrente único, contadores tras reinicio, expiración, revocación de dos instancias, carrera login/restablecimiento y respuesta perdida. La operación financiera pendiente conserva su cuenta y clave idempotente durante recuperación y reingreso.

El perfil admite únicamente nombre ficticio, moneda preferida y escenario de entrega; no cambia alias, mina, rol ni saldos. El comprador habilita recuperación desde Cuenta usando su contraseña actual y guarda una clave privada de 256 bits fuera de la app. Solo hashes quedan en la base; los tokens temporales duran diez minutos y se usan una vez. Los límites de cinco intentos por quince minutos persisten en PostgreSQL. Restablecer revoca todas las sesiones y rota la clave de recuperación, sin alterar posiciones ni historial. Sin contraseña y sin clave de recuperación no existe recuperación automática por correo o identidad real. El operador compartido tiene perfil, pero sus credenciales permanecen administradas para evitar un bloqueo por autoservicio público. Ninguna contraseña ni clave de recuperación se persiste en el cliente.

Fase 5 publicada en `e611ea0`; verificación integral ampliada en `63aa992`. Prepare aprobó 930 aserciones y verify 195 después de reiniciar una API local sobre PostgreSQL. El snapshot privado v3 incluye perfiles e historial gerencial completo, y excluye contraseñas, token administrativo y claves/tokens temporales de recuperación; ver [contrato reproducible](../api/INTEGRAL-SMOKE.md).

Fase 6 conserva Expo SDK 57 y React Native 0.86.3. Añade `expo-gl ~57.0.2` para una malla volumétrica biselada y `react-native-safe-area-context ~5.7.0` para márgenes Android/modales. Un solo visor acompaña cinco etapas con cámara/luces por scroll y arrastre horizontal; no hay animación continua en reposo. Movimiento reducido, omisión, error/fallback, reintento y segundo plano tienen rutas separadas que no bloquean la billetera. Los modales y la navegación separan posiciones, certificados, entregas y marketplace. Iconos Android derivados de un vector propio están versionados.

Validación de fase 6: TypeScript, compatibilidad Expo y Doctor 21/21 aprobados; batería móvil 110 aprobadas y una prueba WebGL opcional omitida en esa ejecución. La suite 3D ejecutada por separado con navegador headless aprobó 8/8: volumen/manifold/normales/matrices, scheduler y seis renders distintos en un único contexto WebGL de software. Export Android/Hermes aprobado (632 módulos). Eso no acredita GPU Android, gestos, segundo plano ni aceptación visual del propietario; deben comprobarse con el APK.

Se completará incrementalmente con commits, CI, pruebas HTTPS, migración/reinicio, hash y firma del APK y recorridos Android ejecutados. La última auditoría sigue siendo evidencia del punto de partida, sin atribuir sus resultados a funciones nuevas.

Acceso de compilación: el propietario inició sesión Expo por la terminal oficial. `eas whoami` confirma acceso de propietario a `chipirips-team`; `eas project:info` confirma el proyecto existente `c3985e04-43dd-4896-9f8a-09366b6a3579`. No se solicitaron contraseñas ni tokens en el chat. Se usará la firma Android remota existente para conservar la posibilidad de actualización.

## Actualizaciones Android sin reinstalación

El propietario pidió recibir cambios sin descargar un APK cada vez. La revisión 0.2.0 incorpora `expo-updates` compatible con SDK 57 y EAS Update del proyecto existente, canal `demo`, entorno `preview` y compatibilidad derivada de `app.json.version` (`0.2.0`). La consulta se hace al arrancar, sin esperar la red; la aplicación usa el bundle incluido o el último compatible guardado y aplica una descarga al siguiente arranque. No se fuerza un reinicio durante una operación. Más/Cuenta permite buscar cambios y muestra si la versión viene del APK o de una actualización.

La instalación 0.1.3 no incorpora este mecanismo: necesita una actualización al nuevo APK conservando datos. Después pueden publicarse cambios compatibles de JavaScript, estilos y recursos sin reinstalar. Instalar módulos nativos, cambiar permisos, SDK o configuración nativa requiere incrementar la versión y el código Android y crear otro APK con la firma existente. Mantener `0.2.0` únicamente para updates compatibles con esta base nativa.

Expo ofrece un plan gratuito con actualizaciones para 1.000 instalaciones activas mensuales, sujeto a cuotas; no se cambió el plan ni se contrató un servicio. Publicar en Google Play es opcional y requiere una cuenta de desarrollador, registro único de US$25 y verificaciones/pruebas. Fuentes oficiales consultadas: [tarifas Expo](https://expo.dev/pricing), [compatibilidad de updates](https://docs.expo.dev/eas-update/runtime-versions/), [configuración SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/updates/) y [registro Google Play](https://support.google.com/googleplay/android-developer/answer/6112435). La configuración no acredita todavía descarga/aplicación OTA: se registrará el grupo publicado y la prueba con el APK real.

Se creó el canal `demo` enlazado a la rama EAS `demo`. La URL pública de la API también está en el entorno EAS `preview`, porque los updates SDK 57 deben compilarse con `--environment preview`; no heredan automáticamente `build.preview.env`. No se guardaron credenciales en variables públicas. Publicar únicamente después de las pruebas y desde la fuente revisada:

```bash
cd mobile
npx eas-cli update --channel demo --platform android --environment preview --message "Descripción del cambio compatible" --non-interactive
```

Fase 7, comprobación previa al build: API completa y runner PostgreSQL local ejecutados de nuevo; runner 52/52 y auditoría API sin avisos. Instalación móvil limpia reproducible, 126/126 pruebas con WebGL de software activado, TypeScript, compatibilidad Expo y Doctor 21/21 aprobados. Export Android/Hermes de 642 módulos y prebuild Android temporal correctos, incluido paquete/versión/código, configuración de actualizaciones y modo oscuro. No se ejecutó iOS. El export y prebuild todavía no acreditan instalación.

Dependencias: SDK 57 preservado, `expo-updates ~57.0.26` y `expo-system-ui ~57.0.4` compatibles. Override acotado de Zod 4.6.7 para Expo CLI; no se aplicó el downgrade a Expo 51 sugerido por `npm audit fix --force`. Auditoría móvil: 0 críticas, altas o moderadas; siete bajas asociadas a la cadena de deepmerge 4.3.1. El parche de postinstall verifica versión y SHA originales/parchados de las tres entradas; 15 pruebas de explotación/regresión más 40 comprobaciones adversariales independientes cubren el merge por defecto. El aviso upstream permanece visible y no se cambió artificialmente la versión. No usar instalaciones que omitan scripts; cambios upstream requieren revisar la mitigación.
