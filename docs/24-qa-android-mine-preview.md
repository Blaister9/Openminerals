# Comparación Android de la mina experimental

El workflow nuevo `.github/workflows/android-mine-preview.yml` compara dos APK en un mismo emulador desechable de GitHub: la entrega `0.3.0` y la aplicación independiente `com.openminerals.demo.minepreview`, versión/runtime `0.4.0`, código Android `3` para la revisión R3, canal `mine-realism`. Las revisiones R1/R2 usaron códigos `1`/`2` y conservan su evidencia fallida por separado. No modifica los workflows, el paquete, los datos o el canal de la entrega estable. Todo el recorrido y sus operaciones son DEMO.

## Preparación y ejecución

La entrega utilizada como referencia tiene fuente `eae7f6ad57f5a667c2bf40775a4cb30f1c0dd8b6` y APK SHA-256 `d99e8af9617f56d7862a849ebd057025cb9d6adc164b97496a5532f7b29ad29e`. Una copia del APK en otra release pública de este repositorio debe conservar exactamente ese hash. El harness no permite sustituirlo mediante parámetros.

Después de compilar el perfil EAS `mine-realism`, descargar el APK y verificar de forma independiente su SHA-256 y el SHA-256 del certificado de firma. El certificado del nuevo paquete puede ser distinto al de la entrega estable; se exige fijarlo expresamente. Los metadatos EAS deben vincular el APK con su fuente: el SHA del workflow no acredita por sí solo la fuente del binario.

Crear `docs/evidence/sprint-realism-20261101/candidate-build.json` con los valores públicos comprobados:

```json
{
  "apkUrl": "URL_HTTPS_PUBLICA_DEL_APK_EXPERIMENTAL",
  "apkSha256": "SHA256_REAL_DE_64_CARACTERES_MINUSCULOS",
  "certificateSha256": "SHA256_REAL_DEL_CERTIFICADO_EXPERIMENTAL",
  "baselineApkUrl": "URL_HTTPS_DE_LA_COPIA_EXACTA_DEL_APK_030",
  "baselineApkSha256": "d99e8af9617f56d7862a849ebd057025cb9d6adc164b97496a5532f7b29ad29e"
}
```

Es un ejemplo de estructura; sus marcadores no son enlaces o hashes válidos. Solo se admiten artefactos EAS canónicos y assets de releases de `Blaister9/Openminerals`, por HTTPS y sin credenciales ni parámetros. La PR del sprint, desde la rama `codex/android-mine-realism-20261101` en el mismo repositorio, ejecuta automáticamente la comparación contra este registro. No utiliza `pull_request_target` ni secretos. Una PR de un fork o de otra rama no ejecuta este job.

Cuando el workflow exista en la rama predeterminada también admite ejecución manual:

```powershell
gh workflow run android-mine-preview.yml --ref codex/android-mine-realism-20261101 `
  -f apk_url=URL_HTTPS_PUBLICA_COMPROBADA `
  -f apk_sha256=SHA256_REAL_DEL_APK `
  -f apk_certificate_sha256=SHA256_REAL_DEL_CERTIFICADO
```

Los tres parámetros manuales deben proporcionarse juntos. La referencia estable continúa leyendo su URL del registro y comprobando el hash fijado. No ejecutar el harness local contra un AVD existente o teléfono: exige GitHub Actions/Linux, un único emulador, la propiedad QEMU, Android API 29 y ausencia inicial de ambos paquetes.

El registro admite `validationScope`, con dos valores cerrados: `comparison` por defecto y `regression`. El segundo ejecuta un caso nuevo y desechable para completar modos, navegación, reanudación, comercio legacy, autenticación y preservación sin repetir benchmarks o vídeos ya medidos. Instala ambos APK y comprueba fuente embebida/identidad; exige una primera escena GL real del candidato y registra su estado antes de continuar. Su resumen declara `benchmarksIncluded:false` y referencia la comparación [41377075737](https://github.com/Blaister9/Openminerals/actions/runs/41377075737), cuyo resultado general fue fallido tras completar los perfiles comparativos. El caso de regresión no sustituye ese resultado ni atribuye nuevas métricas.

Para activar movimiento reducido se abre Inicio y sus opciones directamente: no se exige volver a preparar 3D antes de ofrecer esa alternativa. La reanudación sigue exigiendo GL antes de HOME y antes del primer gesto al volver; después de los gestos solo admite degradación ligera con el motivo exacto de coste de render. Una escena ligera genérica no satisface esas pruebas GL. Los fallos previos a credenciales incluyen un snapshot acotado de IDs conocidos, estado pendiente/GL/ligero y señales de motivos manuales/automáticos, sin XML completo ni inferir una causa cuando no está demostrada.

R3 distingue además los motivos internos estáticos `context-timeout`, `create`, `draw`, `boundary` y `unavailable`, así como el estado de reintento. Un fallo interno o un reintento pendiente nunca satisfacen el fallback autorizado por coste, aunque la descripción contenga ambos textos. Se leen advertencias ReactNativeJS con el prefijo fijo `[Openminerals 3D]`; solo se publican contadores de los cuatro códigos que se registran, no líneas completas ni errores nativos. Una advertencia de timeout puede preceder un reintento exitoso: el estado actual de la escena, no el historial de advertencias, decide si existe un fallo presente. Estos diagnósticos identifican el punto observado de fallo y no prueban su causa; las nuevas medidas de montaje/reintento de R3 requieren ejecución real del nuevo APK.

## Protocolo y evidencia

Antes de instalar se comprueban hashes, firmas, identificadores, versiones/códigos, runtime nativo, canal, librerías para teléfono/emulador, HTTPS embebido y protecciones de recuperación de Expo Updates. La aplicación experimental se instala junto a la estable; se compara el UID y la versión de la estable después de instalar y al finalizar. No hay desinstalación ni borrado de datos.

La aplicación estable conserva sus aserciones Maestro existentes de los siete capítulos: solo cambia la cabecera `appId` en copias temporales. El candidato utiliza una adaptación explícita del mismo recorrido: exige primero GL listo antes de cualquier gesto y captura esa imagen inicial; después admite GL o la degradación automática únicamente cuando el propio nodo ligero incluye la frase exacta «Vista ligera activada por coste de render.». Un fallo de shader/GL, el modo manual ligero o una vista simplificada genérica no satisfacen esa alternativa. Las siete capturas conservan su orden y nombres; cada capítulo registra el modo y la calidad observados inmediatamente después de su captura. El informe diferencia capítulos con GL de capítulos con degradación automática y no acepta sus píxeles por accesibilidad.

Las capturas se publican inmediatamente al completarse, con manifiesto de hashes y alcance parcial, sin esperar al vídeo o a fases posteriores. Al terminar movimiento reducido se exige también su octava captura; la imagen inicial GL del candidato es evidencia adicional. Los accesos a Mercado, Metales y Billetera y la reanudación tras HOME con el mismo proceso se verifican por separado.

La grabación comienza después de comprobar un frame listo. Cada APK recibe exactamente 15 gestos: tres avances, cuatro retrocesos y ocho avances finales. Cada desplazamiento dura 1.800 ms, seguido de 250 ms de pausa. Las coordenadas proceden del mismo tamaño efectivo de pantalla. El protocolo y la secuencia compilada se identifican mediante SHA-256. Las comprobaciones de capítulos, menús, capturas y carga inicial quedan fuera de esa carga de entrada.

Cada APK ejecuta una pasada ligera sin grabar y pasadas 3D grabada y sin grabar, con la misma secuencia de entrada. Se miden tiempo de inicio de proceso con `am start -W`, PSS antes/después y contadores/percentiles HWUI de `dumpsys gfxinfo`. El arranque frío exige observar la desaparición del PID tras `force-stop` y un PID nuevo y único al iniciar; se rechazan estados WARM/HOT y avisos de reutilización del intent. Los datos de lanzamiento quedan conservados aunque se rechace su clasificación. Un tiempo pequeño, por sí solo, no identifica un arranque reutilizado. Esta medición no representa el tiempo hasta que la app queda visualmente lista.

Antes de arrancar el emulador se exige disponibilidad de FFprobe y FFmpeg. El MP4 debe cubrir al menos el 85 % del tiempo real de los gestos tanto en duración del contenedor como en separación entre el primer y último timestamp de presentación decodificado. El informe conserva los últimos timestamps, muestras PNG del final y una captura Android posterior al trace. No exige duración por paquete, que puede faltar en vídeo de tasa variable. Un clip truncado conserva sus bytes como `*-anonymous-scroll-incomplete.mp4`, su informe inválido y las métricas disponibles; no se presenta como recorrido completo. Los timestamps y la accesibilidad no prueban por sí solos que los píxeles hayan llegado al portafolio: las muestras requieren revisión visual.

El reporte identifica calidad adaptativa, fallback automático y disponibilidad de contadores UI. Registra por separado si la comprobación final de capítulo y la comprobación posterior de fuente embebida terminaron. Los gestos incluyen el coste de ADB; no son una medición directa de latencia táctil. Los diagnósticos de Maestro anteriores a credenciales publican únicamente la fase, el flow y selectores estáticos permitidos del comando fallido; no incluyen mensajes completos, jerarquías ni valores de entrada.

Después de terminar todas las grabaciones y capturas, solo la aplicación experimental opera sobre su nueva sesión anónima: verifica 250 USDT iniciales, convierte 200 USD a 450 USDT, rechaza una compra sin saldo suficiente, compra 2 g y vende 0,5 g, comprobando 157,10 y 228,73 USDT respectivamente. Un nuevo inicio de proceso conserva el saldo final. No se publican screenshots, vídeos, XML de UI ni logs sin filtrar de ese tramo comercial.

El tramo privado posterior registra un comprador con alias y clave ficticios generados en memoria. Desactiva explícitamente «Conservar mi sesión anterior» y comprueba el rol, el alias exacto y los 250 USDT iniciales de una cuenta sin importación. Un inicio nuevo del proceso debe recuperar ese mismo comprador mediante el token guardado en SecureStore, sin volver a introducir la clave. Al cerrar sesión deben reaparecer los 228,73 USDT de la sesión anterior propia. El comprador nuevo no compra, vende, transfiere ni recibe ingresos; su registro no asigna los metales de la sesión anterior a inventario compartido.

Después se comprueba el acceso público expresamente autorizado en `demo-access/operator-public.json`. Una consulta de login detecta rechazos HTTP 401/403 y revoca su token de comprobación mediante logout antes de iniciar el login nativo. El operador entra en Mina, conserva Cuenta y permite consultar Panel gerencial; se comprueba la ausencia de la billetera de comprador y se cierra su sesión. No se usan rutas de stock, producción, recepción, cambios de gestión ni otras operaciones de inventario. Un acceso público rechazado hace fallar la fase con una causa estática; el harness no modifica la cuenta ni el backend para habilitarlo.

Las credenciales nuevas solo se pasan en memoria al entorno de Maestro y se enmascaran en GitHub Actions. Los flows privados utilizan marcadores de entorno; su directorio temporal y sus salidas se eliminan al terminar cada fase, también si falla. Esta adaptación tiene una lista de fases autorizadas separada: no permite credenciales dentro de los flows anónimos. Los resultados públicos de autenticación contienen únicamente indicadores booleanos y nombres de fases. El registro conserva un comprador DEMO nuevo en la API; no se borran cuentas ni se reinicia información para repetir las pruebas.

El artifact `android-mine-preview-<run_id>` contiene únicamente el directorio `public/`: MP4 anónimos antes/después, capturas permitidas, métricas JSON, protocolo, verificación de APK, preservación, reanudación y JUnit resumido. Ante un fallo previo al comercio y después de verificar la instalación anónima, puede incluir una captura anónima y señales booleanas de errores JS/GL; nunca texto completo de logs. La causa pública se limita a mensajes estáticos permitidos. Los archivos privados de Maestro no se suben. La retención del artifact es de siete días; copiar la evidencia requerida al informe de la PR.

## Alcance y límites

Esta ejecución usa API 29, x86_64 y SwiftShader sobre el runner estándar de Ubuntu con KVM. HWUI no mide los FPS de la superficie ExpoGL; el número de frames codificados del vídeo tampoco equivale a FPS de la aplicación. PSS no representa el máximo de memoria. Los resultados no aceptan rendimiento de 60 FPS, temperatura, GPU móvil ni experiencia en teléfono físico.

El acceso nativo de comprador, su conservación tras reiniciar el proceso y la navegación de lectura del operador se reportan como fases independientes. No acreditan comercio autenticado completo: compraventa autenticada, marketplace entre compradores, matriz de permisos, certificados y entregas requieren fixtures privadas aisladas y siguen pendientes de aceptación con el nuevo APK. Las pruebas de fuentes/API se reportan por separado. Tampoco se reinicia, despliega o altera la configuración de Railway/PostgreSQL.

La existencia del workflow o la aprobación de sus pruebas unitarias no acredita una ejecución Android. Registrar el enlace real del run, las fases completadas, sus fallos y el vínculo fuente/binario después de ejecutarlo.

Validación local del nuevo harness, sin utilizar dispositivos:

```powershell
cd mobile
node --test test/mine-preview-native.test.mjs
```
