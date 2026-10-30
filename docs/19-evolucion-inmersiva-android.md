# Evolución inmersiva Android · 29 de octubre de 2026

Continuación de main `8123003`, rama `codex/immersive-custody-20261029`. Android exclusivamente. El recorrido comercial existente se conserva; dinero, metales, custodia y entregas siguen siendo **SIMULADOS**.

## Inventario y trazabilidad

La producción pasa por **PRODUCED_DEMO → VERIFYING_DEMO → RECEIVED_DEMO**. Los dos primeros estados no crean disponibilidad. Solo la recepción confirmada crea un lote y un ingreso de stock, dentro de la transacción e idempotencia existentes. No se acreditan producción, ensayo ni recepción físicos.

Las magnitudes se leen de los registros persistentes:
- Producido sin verificar y en verificación: cantidades pendientes en etapas distintas.
- Recibido acumulado: peso original de los lotes, incluido el saldo inicial ficticio conservado.
- Recibido acumulado = suministro activo + salidas por entrega.
- Suministro activo = disponible para venta + asignado a compradores.
- Reservado ≤ asignado. Comprometido para entrega ≤ reservado: aceptada, preparación o despacho DEMO.
- Reservas y compromisos son subconjuntos; no se añaden otra vez al total.
- El intercambio entre compradores transfiere las asignaciones de los mismos lotes. No crea producción, stock ni suministro adicional.
- La venta directa solo utiliza gramos libres. Una mina vacía continúa vacía durante producción y verificación.

Las reservas ahora tienen piezas por lote. Vender gramos libres no consume el lote comprometido para una oferta o entrega. El historial registra reserva y finalización, además de entrada, compra, importación, venta, transferencia y salida. Las reservas preexistentes reciben un saldo inicial explícito, sin inventar fechas históricas.

La recepción directa anterior permanece disponible como compatibilidad de una recepción DEMO ya verificada. Está separada del flujo de nueva producción. Los datos previos no se borran ni se reinician. El panel distingue los saldos iniciales de la producción recién registrada.

## Custodia pública y operación interna

Las vistas de comprador de lotes y certificados usan una lista explícita de campos. La ubicación es siempre una bóveda virtual sin ubicación física y los documentos son referencias sintéticas. El texto libre histórico de ubicación/documentos permanece en la vista autorizada del operador; no se copia al comprador.

Las entregas también separan la operación interna de la consulta pública: motivos, textos internos, nombres configurables y requisitos operativos se conservan para el operador. El comprador recibe estados, fechas, importes, referencias y textos DEMO fijos; sus importes y su aceptación de costes permanecen intactos. La proyección se aplica a estado, comprobantes, historial y consulta de entregas, incluidos los registros anteriores.

El APK no incluye direcciones, coordenadas, planos o sistemas físicos. La bóveda se dibuja mediante geometría ficticia creada para esta interfaz. El cliente ya no solicita ubicación ni documentos libres al reponer: utiliza un registro sintético automático. Los datos del panel se consultan en memoria; el almacenamiento persistente de una operación pendiente conserva solo su comando y clave para reintentar.

Las rutas de recepción y operación exigen operador y mina desde el backend. El operador público autorizado continúa siendo exclusivo de la demo: no introducir datos reales en él ni interpretar esa cuenta compartida como control de acceso de producción.

Un lote físico futuro sería una existencia identificada y verificada fuera de esta demo. Una fracción registrada aquí es una cantidad entera de miligramos asignada dentro del simulador. Un derecho contractual futuro dependería de instrumentos y procesos externos aún no implementados. El identificador de lote no es un token ni un contrato blockchain. Véase la [planificación documental anterior](15-custodia-documental-y-web3-colombia.md).

## Inicio continuo y experiencia táctil

Referencia conceptual consultada: [Scrollytelling.ai](https://scrollytelling.ai/). Se utiliza la continuidad ligada al desplazamiento; el código, geometría y shaders son propios. No se incorporó una página web ni WebView.

Un único escenario nativo permanece en pantalla. El desplazamiento controla directamente una función continua de cámara, profundidad, refinamiento y material: origen → extracción → refinación → lingote → custodia → fraccionamiento → portafolio. Volver al mismo desplazamiento restaura la misma pose. Los textos hacen transiciones dentro del escenario; no son siete tarjetas verticales.

Se puede avanzar/retroceder con el dedo, elegir un capítulo, arrastrar horizontalmente el objeto, omitir y abrir operaciones. La navegación inferior permanece en Inicio. Monedas y posiciones se exploran horizontalmente; las posiciones permiten selección directa y desplazamiento con ajuste. Las confirmaciones financieras se conservan.

Se comprobó primero el paquete instalado: ExpoGL y Animated están disponibles; Reanimated, Worklets, Gesture Handler, Skia y Haptics no forman parte del APK 0.2.0. Se utilizan Animated con driver nativo y el renderer existente, evitando nuevos módulos, permisos o SDK. No se necesita una compilación nativa adicional para estos cambios.

El dibujo GL es bajo demanda, limitado a 30 fps y 1024 píxeles de lado. El modo ligero desactiva GL; también hay lectura accesible para lector de pantalla o texto ampliado, y se respeta movimiento reducido. Un coste de envío de render sostenidamente alto puede activar vista ligera. Este detector mide trabajo de CPU al enviar el render, no FPS de GPU.

## Evidencia y publicación

La verificación local incluye inventario vacío, transiciones inválidas, dos conexiones PostgreSQL, replay concurrente, venta con reservas en dos lotes, transferencia sin inflar suministro, permisos y canarios de privacidad. El cliente prueba pérdida de respuesta de recepción y reapertura con la misma clave.

Resultados locales antes de la publicación: API **164/164** con PostgreSQL 17, sin omisiones; runner PostgreSQL obligatorio **77/77**; móvil **204 aprobadas y una GL opcional de escritorio omitida**; TypeScript, compatibilidad Expo y Doctor **21/21**. Smoke local aprobado. Las pruebas de inventario y permisos se ejecutan también en CI.

La PR registra los resultados definitivos de CI, API/PostgreSQL y cliente. La medición nativa prepara arranque de proceso, PSS antes/después y estadísticas de frames UI de Android, junto con vídeo anónimo del recorrido antes de escribir credenciales. Las estadísticas UI no equivalen a FPS de GPU y dos muestras PSS no son una medición de memoria máxima.

**Pendiente al preparar esta revisión:** ejecución nativa de la nueva interfaz, cifras de rendimiento y aceptación física. La revisión del navegador integrado no acredita Android. No se declara optimización completa ni aceptación de teléfonos de gama media/alta sin medirlos.

Los eventos de reservas son opt-in mediante `includeReservations=1`, manteniendo los clientes instalados que desconocen esos tipos. Producción y reservas se guardan como extensiones versionadas del JSON existente, bajo el bloqueo transaccional de mina. No hay una migración SQL nueva ni se alteran cuentas o saldos para presentar la demo.
