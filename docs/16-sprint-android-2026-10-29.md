# Sprint Android · 29 de octubre de 2026

Continuación de la [PR #4](https://github.com/Blaister9/Openminerals/pull/4), sobre Expo SDK 57 y la API existente. Todo es simulado. No se desarrolló iOS ni se eliminaron registros de la demo.

## Implementación de este sprint

- Diario persistente por lote para compras, ventas, importaciones, intercambios entre compradores, reposiciones y salidas por entrega. Conserva las piezas del lote y la conciliación de posiciones; el replay no duplica filas. Consulta paginada desde **Metales → Lotes y certificados → Ver movimientos del lote**, o **Mina → Lotes**.
- Migración aditiva: las minas anteriores reciben un saldo de apertura identificado, sin reconstruir operaciones inexistentes ni cambiar cuentas, certificados o comprobantes anteriores. El peso original de apertura se distingue del peso activo tras entregas.
- Permisos: comprador ve su actividad, dirección de entrada/salida y referencias propias; operador ve la actividad de su mina sin billeteras privadas. Total y cursor se calculan después de filtrar permisos. [Contrato API](../api/LOT-HISTORY.md).
- Gerencia muestra gramos de compras directas, ventas directas y marketplace por cada metal, derivados de los comprobantes persistidos y los filtros; cada intercambio se cuenta una vez.
- Corrección de navegación Android: reset del desplazamiento nativo después de cambiar identidad, pestaña o sección. Cambiar únicamente el valor animado de la presentación no restablecía el `ScrollView` real.

## Reproducción Android y regresión

[40918534456](https://github.com/Blaister9/Openminerals/actions/runs/40918534456), fuente `bd31c89`, reprodujo el bloqueo con el APK firmado 0.2.0 y OTA Studio `01a185e3-5401-72e9-92d5-febb3ccc0a6a`. Instalación, aplicación OTA y login operador aprobaron. Antes de buscar Entregas, los cuatro accesos de Mina ya estaban recortados por encima del área visible: el nodo Entregas tenía bounds `[706,438,973,165]`, sin área positiva. El rol era operador, Mina estaba seleccionada y no había teclado ni error global. El primer DOWN desplazaba el menú más lejos. No se llegó a abrir `DeliveryPanel` ni a solicitar cotización.

Se añadió un escenario focalizado que conserva la búsqueda original, entra, sale a Cuenta y vuelve a Entregas; al terminar exige que las cuentas sigan sin operaciones financieras. El diagnóstico publica sólo identificadores estáticos, geometría y estados cerrados; no XML, credenciales ni capturas autenticadas. La comprobación del arreglo en Android está pendiente en esta revisión del informe.

## Validación de código

- API completa sobre PostgreSQL local aislado: **126/126 aprobadas, sin omisiones**. Incluye diario durable tras reconexión, migración concurrente, replay por dos pools, dos compradores por una oferta, transferencia que cruza dos asignaciones del mismo lote, importación y rollback ante evidencia inconsistente.
- Runner PostgreSQL obligatorio: **59/59 aprobadas, sin omisiones**, incluyendo la nueva suite en el mismo comando que CI.
- Móvil: **181 aprobadas, una WebGL opcional omitida**, sin fallos; TypeScript y export Android/Hermes de 645 módulos aprobados. Los shaders no cambiaron en este sprint.
- Cliente HTTP del historial: entrada/salida en marketplace, comprador sin acceso al lote, referencias propias y consulta de operador sin billeteras. Parsers rechazan respuestas ajenas, duplicados, cantidades o cursores inválidos.
- Recuperación, perfil y mitigación de dependencias: regresión conservada; auditoría con cero críticas/altas y siete bajas residuales de la herramienta deepmerge ya mitigada. No se cambió el SDK ni se añadió un módulo nativo.

## Estado de aceptación

| Estado | Alcance |
| --- | --- |
| Implementado y probado | Reglas de custodia, marketplace, reservas, entrega, roles y recuperación en API/PostgreSQL; contrato del diario y cliente HTTP; reproducción del fallo Android. Ver la evidencia anterior para las comprobaciones físicas parciales. |
| Implementado pero pendiente de pruebas | Arreglo de navegación en Android, consulta nativa del diario, recorrido comercial completo y aplicación de la siguiente OTA en teléfono. Despliegue de los cambios nuevos aún pendiente de registrar. |
| Todavía no desarrollado | Fondos, metales, custodia o logística reales, documentos jurídicos válidos, integración bancaria, KYC/AML, ledger financiero y blockchain. Fuera del alcance de esta demo; iOS excluido del sprint. |

El [APK 0.2.0 firmado](https://github.com/Blaister9/Openminerals/releases/download/v0.2.0-demo/Openminerals-Demo-0.2.0-android.apk) conserva runtime 0.2.0. Estos cambios JavaScript son compatibles con OTA; no requieren reinstalar ni borrar los datos de la instalación existente. No se declara terminada la aceptación Android.
