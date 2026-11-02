# Realismo minero Android · sprint del 1 de noviembre de 2026

**En desarrollo. Todo es DEMO.** La candidata de este sprint se instala como aplicación Android independiente para conservar la entrega comercial. No hay aceptación física ni rendimiento a 60 FPS acreditados. El informe se ampliará con la fuente final, regresión, métricas y evidencia comparativa nueva.

## Entrega conservada

La base es `main@ed87d2ea233227437ab5f5cc2eb0900674e1231f`. El APK Android 0.3.0/código 6 procede de `eae7f6ad57f5a667c2bf40775a4cb30f1c0dd8b6`: las diferencias posteriores son del arnés de aceptación. [CI de fuentes](https://github.com/Blaister9/Openminerals/actions/runs/41218118564) y [aceptación en emulador](https://github.com/Blaister9/Openminerals/actions/runs/41218121238) aprobaron; esta última incluye comercio, actualización de comprador/operador y cuentas/billeteras. Los artefactos descargables del run ya no estaban disponibles al auditarlo. Esto no acredita aceptación en teléfono.

El [APK 0.3.0 existente](https://expo.dev/artifacts/eas/zzjf0770cQWD12A6J-ly7cuCyZfpwrKet8sKRaWJDZQ.apk), [build EAS `ea0349a4`](https://expo.dev/accounts/chipirips-team/projects/openminerals-demo/builds/ea0349a4-7b55-4808-a332-be290d1a9b9e), conserva paquete `com.openminerals.demo.mobile`, runtime `0.3.0`, canal `demo` y SHA-256 `d99e8af9617f56d7862a849ebd057025cb9d6adc164b97496a5532f7b29ad29e`. No existe una release GitHub 0.3.0 al comenzar este sprint. La [release publicada con APK](https://github.com/Blaister9/Openminerals/releases/tag/v0.2.0-demo) sigue siendo 0.2.0, SHA-256 `c35719bf44fdc5a1237249be7e80d6d3102e57ee58f0cd0d9b5af3c66f32d83f`; la RC posterior remite al mismo binario. No se reemplazan sus archivos ni tags. [Manifest de preservación](evidence/sprint-realism-20261101/stable-release.json).

La [PR geológica #8](https://github.com/Blaister9/Openminerals/pull/8), cabeza `80da7c8`, ya conserva una implementación y evidencia histórica del 30 de octubre. Estaba en borrador por regresión ligera y aceptación estética/física pendientes. Sus resultados no se atribuyen al nuevo sprint; se revisará su integración en la rama nueva.

## Candidata Android aislada

Rama: `codex/android-mine-realism-20261101`. `mobile/app.json` conserva el registro estable; `mobile/app.config.js` resuelve siempre la candidata, también en desarrollo local. Identidad: **Openminerals Mina Preview**, paquete `com.openminerals.demo.minepreview`, versión/runtime `0.4.0`, código 1, esquema `openminerals-mine-preview`, canal `mine-realism`. El perfil EAS `mine-realism` utiliza entorno `preview`, APK interno y la misma API DEMO HTTPS.

Se mantienen proyecto EAS, ExpoGL, dependencias y configuración de recuperación embebida. El runtime distinto impide que la candidata se aplique a los APK estables; el canal propio y su cabecera separan además las solicitudes. La configuración rechaza perfiles EAS antiguos, compilación sin el opt-in `OPENMINERALS_MINE_PREVIEW=1` y plataforma iOS. Los perfiles anteriores permanecen como procedencia; para reconstruir la entrega estable se usa su commit congelado.

La instalación paralela conserva la app comercial y sus datos en su propio almacenamiento. La preview comienza con una sesión local nueva; no importa automáticamente SecureStore, saldos ni pendientes de la instalación estable. Una cuenta DEMO existente puede abrirse explícitamente en la preview y sigue viendo su mismo estado de backend. Para QA comercial se utilizarán cuentas/minas aisladas; ninguna medición visual necesita modificar la mina presentada.

Cuando la revisión visual esté lista, el comando previsto, desde `mobile`, es `npx eas-cli build --platform android --profile mine-realism`. El opt-in ya está definido en ese perfil. No publicar esta rama con `eas update --channel demo`. Este documento no atribuye un enlace o ID a una compilación aún no ejecutada.

## Validación y pendientes

Las pruebas nuevas de configuración ejecutan el resolvedor real para comprobar identidad local/build equivalente, canal/runtime distintos, preservación de `app.json`, rechazo de perfiles antiguos/opt-in ausente/iOS y URL API HTTPS sin secretos. El 1/11 aprobaron **15/15 pruebas dirigidas**: cuatro nuevas de preview y once existentes de entrega, mediante `node --experimental-strip-types --test test/mine-preview-config.test.mjs test/android-release.test.mjs` desde `mobile`. `npx expo config --type public --json` resolvió la identidad aislada y `git diff --check` aprobó. Estas pruebas no ejecutan Android ni acreditan una compilación nueva.

Falta incorporar aquí los resultados de la suite completa, renderizado, métricas comparables, capturas/vídeos Android y APK nueva. La app y API siguen exclusivamente en modo DEMO; no hay cambios de contratos, PostgreSQL, saldos, permisos u operaciones financieras reales autorizados por este sprint.
