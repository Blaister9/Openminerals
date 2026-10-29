# Candidata Android · 29 de octubre de 2026

La candidata permite completar el recorrido comercial y operativo de la demo en Android emulado. Las seis ejecuciones definitivas aprobaron **95 etapas**, que incluyen acciones nativas y comprobaciones API. La aceptación de esta revisión en teléfono físico sigue pendiente. Todo es **SIMULADO**.

Continuación de `main` `0f07113`, publicada mediante [PR #5](https://github.com/Blaister9/Openminerals/pull/5). Fuente móvil: `c2d674bd83b1f7b942a16396ecee88ab4b8c9a03`; controlador final de pruebas: `1c4b2b56aaf28e1356bcd038be96c07e8f21e356`. No se reconstruyeron los módulos comerciales ni se cambiaron SDK, permisos, módulos nativos, firma o esquema SQL. El registro de integración, CI y verificaciones posteriores al despliegue se adjunta al PR.

## Resultado por estado

| Estado | Evidencia y alcance |
| --- | --- |
| **Implementado y probado** | COP/EUR/USD/USDT: ingresos, retiros y 12 conversiones. Oro/plata/platino/paladio: compra, venta, oferta, aceptación desde otro comprador, comprobantes, custodia y certificados DEMO, cotización y ciclo de entrega, reposición, inventario, comisiones y permisos de Mina. Importación explícita, origen en consulta, perfil, recuperación, revocación, apertura en frío y reintento después de desconexión sin duplicación. API/PostgreSQL y Android emulado indicados abajo. Siete escenas, arrastre, omisión, movimiento reducido y actualización conservando datos comprobados en emulador. |
| **Implementado, pendiente de pruebas** | Recorrido completo de esta revisión en teléfono físico; fluidez, temperatura y preferencias del sistema en Android de gama media y alta. No había dispositivo conectado por ADB. La revisión visual en navegador integrado se registra por separado. |
| **Todavía no desarrollado** | Dinero, bancos, custodia y transporte reales, KYC/AML, identidad verificada, blockchain, documentos jurídicos, inventario auditado y backoffice empresarial de producción. Fuera de esta demo. iOS excluido del sprint. |

## Versión instalable y actualización

- [APK firmado Android 0.2.0](https://github.com/Blaister9/Openminerals/releases/download/v0.2.0-demo/Openminerals-Demo-0.2.0-android.apk), código 5, paquete `com.openminerals.demo.mobile`, Android mínimo API 24. Instalar como actualización, sin desinstalar ni borrar datos.
- SHA-256 APK: `c35719bf44fdc5a1237249be7e80d6d3102e57ee58f0cd0d9b5af3c66f32d83f`.
- Certificado: `3ae9a19077ab3f434b5885981d35e3d29966e406e7438b8f0558c155d47e3e1c`, igual al de 0.1.3.
- OTA **`01a18988-e68e-7456-8977-81b269628010`**, grupo `fabb49e1-62f6-4a60-a3fd-a2dd64015ce5`, publicada el 29 de octubre de 2026 a las 21:20 UTC. Canal `demo`, entorno `preview`, runtime `0.2.0`.
- No hace falta otro APK para estos cambios. En Actividad o Cuenta, buscar actualización sin operaciones pendientes; cerrar completamente y volver a abrir. Verificar **Actualización aplicada · 01a18988**. Se conserva embedded/anti-bricking; no se fuerza recarga durante una operación.

## Evidencia reproducible

| Ejecución definitiva | Resultado | Cobertura |
| --- | --- | --- |
| [Oro · 40957109951](https://github.com/Blaister9/Openminerals/actions/runs/40957109951/job/123739943157) | 21/21 | Recorrido comercial, siete escenas, movimiento reducido y actualización 0.1.3 → 0.2.0 con datos conservados. |
| [Plata · 40957109951](https://github.com/Blaister9/Openminerals/actions/runs/40957109951/job/123739943108) | 16/16 | Dos compradores y operador, intercambio, custodia, entrega, comisiones e inventario. |
| [Platino · 40957109951](https://github.com/Blaister9/Openminerals/actions/runs/40957109951/job/123739942714) | 16/16 | Mismo recorrido sobre su propio metal y mina aislada. |
| [Paladio · 40957109951](https://github.com/Blaister9/Openminerals/actions/runs/40957109951/job/123739943017) | 16/16 | Mismo recorrido sobre su propio metal y mina aislada. |
| [Cuentas · 40963811481](https://github.com/Blaister9/Openminerals/actions/runs/40963811481) | 16/16 | Cuatro billeteras y 12 conversiones, importación, perfil, recuperación y aislamiento. |
| [Desconexión · 40962399056](https://github.com/Blaister9/Openminerals/actions/runs/40962399056) | 10/10 | Saldo insuficiente, pendiente sin débito con red cortada, apertura en frío, reintento único y permisos 403. |

Los seis casos usaron la OTA `01a18988`. El resultado global de `40957109951` fue fallido por su caso de cuentas; sus cuatro trabajos de metales están aprobados. La repetición definitiva de cuentas está enlazada por separado. No se presenta aquella matriz completa como aprobada.

Los artefactos contienen `summary.json`, `report.xml`, `apk-verification.json` y capturas anónimas permitidas. El [resumen público versionado](evidence/android-candidate-20261029.json) conserva etapas, fuentes y hashes sin credenciales. La retención de artefactos de Actions es limitada.

Validación local del 29 de octubre:

- API con PostgreSQL 17: **150/150**, sin omisiones; runner PostgreSQL obligatorio **71/71**. Concurrencia entre conexiones independientes, saldos insuficientes, repetición, aislamiento y persistencia. Cada suite elimina solo su esquema temporal.
- Móvil: **199 aprobadas y una prueba opcional de GL de escritorio omitida**. TypeScript, compatibilidad Expo y Doctor **21/21** aprobados. La omisión local no sustituye la prueba del visor Android.
- Auditoría npm: API sin avisos; móvil con **siete bajos**, ninguno moderado, alto o crítico. `check:toolchain` verifica las tres entradas de `deepmerge`; la mitigación no elimina el aviso upstream.
- [CI del controlador final](https://github.com/Blaister9/Openminerals/actions/runs/40962407910) aprobado. El PR registra también CI de entrega e integración.

## Fallos corregidos y acabado visual

La presentación comunica Mina → Lingote → Custodia → Compra fraccionada → Portafolio → Marketplace → Entrega física. Inicio, Mercado, Billetera, Metales y Mina comparten tipografía institucional, jerarquía y colores; la composición del portafolio procede de las posiciones existentes.

Se corrigió el retorno del scroll al campo de importe al seleccionar divisas: la app normaliza el foco al desplazar, seleccionar, confirmar y cerrar el acceso. El visor espera a medir su posición y cabecera antes de activarse. Mantiene un contexto 3D, dibujo bajo demanda, máximo de 30 fps y lado de render de 1024 píxeles. Al cambiar dimensiones libera y reconstruye el contexto, evitando el lienzo vacío. Estos límites no son una medición de rendimiento en teléfono.

Las primeras ejecuciones detectaron foco/jerarquía vacía en plata y desplazamiento de COP. La revisión móvil `c2d674b` superó sus repeticiones. Otro fallo pertenecía al observador de CI: tras bloquear el bucle Node al ejecutar Maestro, reutilizaba una conexión HTTP inactiva cerrada por el servidor. Se reprodujo con un servidor independiente y se corrigió usando conexiones nuevas en el observador. Las repeticiones definitivas de cuentas y desconexión aprobaron; no se borraron registros ni se convirtió una ejecución fallida en aprobada.

Se revisó la UI en el **navegador integrado**, a 360×800 y 412×850: cuatro divisas legibles, cuatro metales y WebGL después de redimensionar. Evidencia local: `artifacts/browser-review/rc-candidate-3d-20261029.jpg`. Se registra como navegador, separadamente del APK emulado.

## Datos de presentación y seguridad

Se prepararon catorce minas y 42 cuentas ficticias independientes para repeticiones y presentación, conservando los registros anteriores. El conjunto privado de **presentación** mantiene sus saldos iniciales y 5 g de cada metal. Usar sus dos compradores y su operador mediante inicio de sesión; no volver a registrarlos en otra mina. El [guion comercial](17-recorrido-demo-android.md) indica cantidades, saldos esperados y recorrido.

Para preparar otro conjunto, configurar `DEMO_ADMIN_TOKEN` en el entorno de un proceso privado y ejecutar desde la raíz:

```powershell
node api/scripts/prepare-demo.mjs --out "C:\demo-privada\presentacion-nueva" --label presentacion-nueva --kind presentation
```

El padre debe existir; el destino debe ser nuevo y estar fuera del repositorio. Se resuelve la ruta física, se aplican permisos privados y se guarda `credentials.json` antes de crear registros. No se imprimen claves, no se guarda el token administrativo, no se reinician cuentas y no se borran registros. Una interrupción conserva la preparación parcial para revisión; no reutilizar ciegamente su ruta.

Las claves de recuperación nativas se extrajeron de dos campos identificados, se enmascararon inmediatamente y se conservaron en memoria. No se publicaron capturas de recuperación ni diagnósticos privados de Maestro. Railway admin, conexión PostgreSQL y credenciales EAS no se entregaron a Actions. Los secretos temporales de QA se retiran al terminar las ejecuciones y el resultado se registra en el PR. Las credenciales de presentación se entregan en un archivo local privado. El [operador público autorizado](../demo-access/operator-public.json) sigue siendo compartido; el modo legacy sigue siendo una compatibilidad sin autenticación financiera.

## Railway y persistencia

Proyecto `openminerals-demo`, entorno `demo`, API `00e2d919-2cd1-4293-befd-d8af58df8069`, PostgreSQL `4cedb5b6-dbf2-4a3c-8a97-4c11df009e44`. [Health HTTPS](https://openminerals-api-demo.up.railway.app/health): `ok:true`, `demoOnly:true`, `mode:postgres-demo`.

La API sigue conectada a `Blaister9/Openminerals`, rama `main`, raíz `/api`, Dockerfile `/api/Dockerfile`, vigilancia `/api/**` y espera de CI. No se modifican variables ni el servicio PostgreSQL. No hay migración SQL nueva.

Antes de integrar se verificaron las cuatro minas de metales, desconexión y presentación intacta. Huella canónica de dominio guardada privadamente: `16f766e00fe1415949020f3998c705490ec22e87306d158280dd51dee792eea1`. Después del despliegue se compara la misma huella y se ejecutan las 89 comprobaciones del snapshot HTTPS anterior, sin reiniciar registros. El ID real del despliegue, su fuente y resultados se adjuntan al [registro de integración del PR #5](https://github.com/Blaister9/Openminerals/pull/5).

## Aceptación física pendiente

No había teléfono conectado por ADB y no se utilizó control de pantalla del PC. En Android físico: verificar revisión OTA, modelo/Android, recorrido de las tres cuentas, conservación al cerrar, importación de la sesión anterior si el propietario la elige, arrastre/omisión, movimiento reducido y fluidez/temperatura. No desinstalar ni borrar datos. No publicar claves o capturas de recuperación.

La candidata está comprobada con APK instalable en emulador. No se declara completada su aceptación en teléfono físico.
