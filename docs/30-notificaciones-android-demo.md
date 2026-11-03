# Notificaciones y alertas Android DEMO

2 de noviembre de 2026 · Rama `codex/android-notifications-20261102`, desde `main@ed87d2e`. Sin despliegues Railway ni cambios en PR #11, #12 o #13. Sin APK, OTA, vídeos o capturas.

## Implementado

- Avisos para cuentas autenticadas: compras, ventas, ofertas aceptadas y estados de entrega. El operador recibe avisos de solicitudes/aceptación/rechazo del comprador. Se crean con los nuevos comprobantes dentro de su misma transacción; replay no duplica avisos. No se inventan notificaciones históricas anteriores a la activación.
- Centro accesible desde Cuenta/Más en la preview, con historial paginado, contador sin leer, lectura individual/todas y preferencias globales, por categoría y push. Conserva datos tras reinicio y entre dispositivos de la misma cuenta.
- Registro Android por instalación, prueba privada en SecureStore, token renovable y sesión revocable. Soporta varios dispositivos; cerrar una sesión revoca sus registros, no los de otras sesiones. Revocación manual requiere reactivación explícita. No devuelve tokens, claves de instalación ni hashes de sesión al consultar el centro.
- Cola push durable: hasta 20 trabajos por pasada, lease, cinco intentos con backoff y vencimiento a las 24 h. Comprueba preferencias/sesión/dispositivo antes de enviar; consulta recibos después de 15 min y desactiva tokens `DeviceNotRegistered`. Un ticket o recibo aceptado por el proveedor no demuestra entrega al teléfono. Un timeout ambiguo puede duplicar el push; el identificador de la bandeja permanece único.
- Push con contenido genérico, sin importes, metal, alias ni saldos en la pantalla bloqueada. El cliente ignora payloads ajenos y no abre URLs arbitrarias. Solicita permiso solo mediante acción explícita; crea canal Android antes del permiso y comprueba cambios al volver a primer plano, sin polling en segundo plano.
- Alertas para XAU/XAG/XPT/XPD: umbral USD/g con seis decimales, subida/bajada, activación, eliminación, rearme y cooldown. Solo admite fuente `demo`, marcada como ficticia. Muestras manuales idempotentes; límite de veinte alertas y mil muestras por cuenta de pruebas. Ningún proveedor de precios se consulta. Referencias reales siguen bloqueadas; conectar una fuente requerirá autorización y trabajo posterior explícito, independiente de PR #12.

## API y almacenamiento

`GET /api/demo/notifications?before=<id>&limit=30&unread=true` consulta solo la cuenta autenticada. `POST` bajo `/api/demo/notifications/`: `preferences`, `read`, `devices`, `devices/revoke`, `devices/release`, `alerts`, `alerts/delete`, `demo-price`. No acepta elegir otra cuenta o mina.

PostgreSQL usa `demo_notification_records`, separado de los DTO de billetera. Un lock de notificaciones serializa modificaciones/claims; la red se ejecuta fuera de las transacciones. El adaptador en memoria sirve para desarrollo. Los registros JSONB y el escaneo de cola son una base DEMO; antes de grandes volúmenes habrá que indexar/separar trabajos e historial. No se cambia ningún ledger ni se amplía conciliación digital/blockchain.

## Configuración aislada pendiente

Backend: `DEMO_NOTIFICATIONS_ENABLED=true` en una API y PostgreSQL de pruebas nuevos. `DEMO_PUSH_SEND_ENABLED=false` hasta configurar y autorizar la prueba push; después habilita un worker de 30 s. `EXPO_ACCESS_TOKEN`, si se usa seguridad reforzada de Expo, es secreto exclusivo del backend. Las banderas quedan apagadas por defecto y no se modificaron variables existentes.

Android: perfil `notifications-preview`, paquete `com.openminerals.demo.notificationspreview`, runtime `notifications-demo-0.3.0-v1`, canal `notifications-demo`. Variables `OPENMINERALS_NOTIFICATIONS_PREVIEW=1`, `EXPO_PUBLIC_NOTIFICATIONS=1`; `EXPO_PUBLIC_API_URL` y `NOTIFICATIONS_API_URL` deben coincidir con una **API HTTPS nueva y aislada**. Se rechazan las URLs conocidas comercial y Mercado, incluso con barra final. La nueva pantalla no se habilita sobre el paquete comercial.

Hace falta un proyecto Expo/Firebase independiente: `EXPO_PUBLIC_NOTIFICATIONS_PROJECT_ID`, configuración Android mediante `NOTIFICATIONS_GOOGLE_SERVICES_FILE` fuera de Git y credenciales FCM v1 en ese proyecto. Se impide reutilizar el project ID estable y compilar la preview sin el suyo. Sin proyecto, OTA queda desactivada. No se añadieron credenciales ni se crearon proyectos externos. Véanse [preparación oficial Expo/FCM](https://docs.expo.dev/push-notifications/push-notifications-setup/) y [tickets, recibos y errores](https://docs.expo.dev/push-notifications/sending-notifications/).

Se añadieron `expo-notifications` y `expo-constants` compatibles con SDK 57. Requieren una futura compilación nativa independiente; **no publicar esto como OTA sobre la demo instalada**. La configuración y canales comerciales se conservan. No se ejecutó ninguna compilación APK.

## Pruebas y aceptación Android pendiente

Comandos: `cd api; npm test`; con `TEST_DATABASE_URL` de una base local aislada, `npm run test:postgres`. Cliente: `cd mobile; npm test; npm run check; npx expo install --check; npx expo-doctor`.

Pruebas nuevas cubren operaciones comerciales, lectura/privacidad, preferencias, cuatro metales, cooldown/idempotencia, token renovado, varias sesiones/dispositivos, revocación, logout, reintentos, vencimiento, errores de proveedor y transporte simulado. PostgreSQL comprueba dos pools, restart de API, avisos/cola/recibos persistentes y rollback completo al fallar el guardado de un aviso. Cliente comprueba permisos sin prompts automáticos, cancelación, cambio de cuenta, configuración independiente y persistencia API con una respuesta comercial perdida.

Regresión local aprobada: PostgreSQL obligatorio **87/87**, cliente **258 PASS** y dos GL opcionales omitidas, TypeScript/dependencias/toolchain y Doctor **21/21**. Exportación JavaScript/Hermes Android de la preview aprobada (2,1 MB); no es APK ni prueba de ejecución nativa. Los subconjuntos nuevos API 8/8 y cliente 6/6 están incluidos en sus suites, no se suman como pruebas independientes adicionales.

**Pendiente real:** desplegar API/DB aisladas, configurar Expo/FCM independiente y, solo cuando se solicite, compilar/instalar la preview. Probar permiso Android 13+, denegación/cambio en ajustes, canal/silencio, apertura por tap en primer plano/segundo plano/app cerrada, renovación de token, reinstalación/cambio de cuenta, recepción en emulador con Google Play services y teléfono físico. No se ha enviado un push real ni verificado entrega o UI nativa; la persistencia y los protocolos se comprobaron en API/cliente con transporte simulado.
