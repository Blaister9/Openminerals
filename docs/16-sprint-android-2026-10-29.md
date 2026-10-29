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

El escenario focalizado conserva la búsqueda original, entra, sale a Cuenta y vuelve a Entregas; al terminar exige que las cuentas sigan sin operaciones financieras. El diagnóstico publica sólo identificadores estáticos, geometría y estados cerrados; no XML, credenciales ni capturas autenticadas.

**Arreglo comprobado en Android:** [40921013248](https://github.com/Blaister9/Openminerals/actions/runs/40921013248), fuente `19b6207`, **8/8 etapas aprobadas**. Misma secuencia, APK firmado y nueva OTA `01a188b0`; el nodo Entregas ahora tiene bounds `[706,677,973,769]`, área positiva, antes del primer DOWN. Entrar, salir a Cuenta y volver a Entregas aprobaron con rol operador y sin movimientos financieros. La nueva OTA se aplicó y sobrevivió a dos aperturas.

## Validación de código

- API completa sobre PostgreSQL local aislado: **126/126 aprobadas, sin omisiones**. Incluye diario durable tras reconexión, migración concurrente, replay por dos pools, dos compradores por una oferta, transferencia que cruza dos asignaciones del mismo lote, importación y rollback ante evidencia inconsistente.
- Runner PostgreSQL obligatorio: **59/59 aprobadas, sin omisiones**, incluyendo la nueva suite en el mismo comando que CI.
- Móvil: **181 aprobadas, una WebGL opcional omitida**, sin fallos; TypeScript y export Android/Hermes de 645 módulos aprobados. Los shaders no cambiaron en este sprint.
- Cliente HTTP del historial: entrada/salida en marketplace, comprador sin acceso al lote, referencias propias y consulta de operador sin billeteras. Parsers rechazan respuestas ajenas, duplicados, cantidades o cursores inválidos.
- Recuperación, perfil y mitigación de dependencias: regresión conservada; auditoría con cero críticas/altas y siete bajas residuales de la herramienta deepmerge ya mitigada. No se cambió el SDK ni se añadió un módulo nativo.

## Publicación y comprobación HTTPS

Fuente de implementación `19b6207018ec330f3a71cf1801aeba0aa86a0214`; [CI de push](https://github.com/Blaister9/Openminerals/actions/runs/40920588890) y [CI del PR](https://github.com/Blaister9/Openminerals/actions/runs/40920599655) aprobadas. Corrección de desplazamiento en `5c83af7`; regresión ampliada con consulta nativa del diario y conciliación por metal en `5ea0a33`.

Railway `openminerals-demo`, entorno `demo`, API `openminerals-api`: deployment `6d7f7aeb-4b86-4ce8-bd6f-570fda7815cc` SUCCESS el 29 de octubre a las 12:23:53 Bogotá. Se subió un archivo de Git que contiene únicamente `/api` de `19b6207`; no se modificaron variables, PostgreSQL, configuración ni fuente GitHub `main`. La conexión GitHub permanece en `2574f29` hasta integrar la PR. Health HTTPS confirma `postgres-demo` y API `0.2.0`.

El smoke HTTPS específico aprobó **169/169** sobre una mina nueva aislada: transferencia que cruza dos asignaciones, venta, entrega, reposición, privacidad, volúmenes por metal y replay. Tras reiniciar sólo la API, nuevo arranque acreditado el 29 de octubre a las **12:30:39 Bogotá**, verify aprobó **89/89** sin token administrativo. Diario, saldos, certificados, comprobantes y replays se conservaron. Snapshot privado fuera de Git con ACL usuario/SYSTEM; SHA-256 `b054c736b14b2dc7bad01b5d0a56b977427cb5acc6fc9316261ac32e79bc99fc`. No se reinició PostgreSQL.

OTA compatible publicada: update Android `01a188b0-9875-7eaf-bbd6-872e782af8ec`, grupo `170791a8-2cf5-45af-b2b7-ca65dd403e55`, fuente `19b6207`, runtime `0.2.0`, canal `demo`, entorno `preview`. No se regeneró la firma ni se cambió el APK. Aplicación acreditada en el emulador; aplicación de esta revisión en el teléfono del propietario aún no confirmada.

[Recorrido Android completo](https://github.com/Blaister9/Openminerals/actions/runs/40922146693), fuente de pruebas `5ea0a33`, en ejecución. Además del recorrido comercial previo, abre el historial nativo de la compra y verifica en la API los movimientos del lote y gramos negociados por metal. No se atribuye aceptación completa hasta obtener su resultado.

En el navegador **integrado de Codex**, previsualización local con relay HTTPS fijo de QA: se consultaron el nuevo desglose por metal y el historial de un lote anterior. El lote de oro y su asignación de 200 g se conservan; el diario muestra apertura explícita, sin inventar los movimientos previos. Esta consulta fue de lectura, sin cotizar ni modificar solicitudes del propietario. Evidencia local ignorada por Git: `artifacts/browser-review/iab-lot-history-20261029.jpg`. La previsualización web no sustituye la validación Android.

## Estado de aceptación

| Estado | Alcance |
| --- | --- |
| Implementado y probado | Reglas de custodia, marketplace, reservas, entrega, roles y recuperación en API/PostgreSQL; diario y cliente HTTP; navegación de operador y aplicación OTA en Android emulado; persistencia HTTPS tras reinicio. Ver la evidencia anterior para las comprobaciones físicas parciales. |
| Implementado pero pendiente de pruebas | Consulta nativa del diario, recorrido comercial completo y aplicación de esta OTA en teléfono; aceptación visual y rendimiento en GPU física. |
| Todavía no desarrollado | Fondos, metales, custodia o logística reales, documentos jurídicos válidos, integración bancaria, KYC/AML, ledger financiero y blockchain. Fuera del alcance de esta demo; iOS excluido del sprint. |

El [APK 0.2.0 firmado](https://github.com/Blaister9/Openminerals/releases/download/v0.2.0-demo/Openminerals-Demo-0.2.0-android.apk) conserva runtime 0.2.0. Estos cambios JavaScript son compatibles con OTA; no requieren reinstalar ni borrar los datos de la instalación existente. No se declara terminada la aceptación Android.
