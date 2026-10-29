# Candidata Android · 29 de octubre de 2026

Continuación de `main` `0f07113` en `codex/android-demo-candidate-20261029`. Todo sigue siendo **SIMULADO**. No se reconstruyeron los módulos comerciales ni se cambiaron SDK, permisos, módulos nativos o firma. Se conserva el APK Android 0.2.0/código 5 y el runtime OTA 0.2.0.

## Cambios y evidencia local

- Presentación ampliada a siete escenas: Mina → Lingote → Custodia → Compra fraccionada → Portafolio → Marketplace → Entrega física. Omisión, lectura sin movimiento y preferencia del sistema conservadas.
- Inicio, Mercado, Billetera, Metales y Mina comparten tipografía institucional, jerarquía y colores. La composición del portafolio usa las posiciones existentes; no incorpora saldos de billetera ni métricas inventadas.
- Un único contexto 3D, dibujo bajo demanda con límite de 30 fps y lado máximo de render de 1024 píxeles. Se corrigió el lienzo vacío al cambiar el tamaño: ExpoGL limpiaba el buffer después del dibujo. El contexto se reconstruye y libera al cambiar las dimensiones. Los límites no constituyen una medición de rendimiento en teléfono.
- Navegador **integrado**: revisión visual a 360×800 y 412×850, cuatro divisas legibles, cuatro metales y lingote real WebGL después de redimensionar. No acredita ejecución Android.
- API con PostgreSQL 17 local: **150/150**, sin omisiones; runner PostgreSQL obligatorio **71/71**. Matriz de 12 conversiones, ingresos/retiros en cuatro divisas, compras/ventas/intercambio/custodia/entrega de cuatro metales, idempotencia concurrente entre dos conexiones, importación, recuperación, perfil y reconexión persistente. Cada suite PostgreSQL crea y elimina exclusivamente su esquema temporal.
- Móvil: **195 aprobadas y una prueba opcional de GL omitida**, TypeScript correcto, compatibilidad Expo correcta y Doctor **21/21**. API sin avisos npm; móvil con siete bajos y ninguno moderado, alto o crítico. La mitigación `check:toolchain` verifica sus tres entradas de `deepmerge`.

## Ejecución Android de esta candidata

Fuente publicada `c75c40dbbe98ff2ff03c2c8b2857eaba895d8126`, [PR #5](https://github.com/Blaister9/Openminerals/pull/5), [CI aprobado](https://github.com/Blaister9/Openminerals/actions/runs/40947944750). OTA Android `01a18951-9730-7bb9-bc2c-89ca01275bfc`, grupo `1ce353a3-12ee-45eb-9f87-31c1347926cd`, runtime 0.2.0, canal `demo`, publicada el 29 de octubre a las 20:19 UTC. No se generó un APK adicional.

[Matriz Android 40948276994](https://github.com/Blaister9/Openminerals/actions/runs/40948276994) en ejecución: cuatro metales y cuentas. Todavía no se considera aprobada. La evidencia anterior en [el sprint previo](16-sprint-android-2026-10-29.md) corresponde a otra revisión y no acredita automáticamente estos cambios.

La matriz manual de `.github/workflows/android-ui.yml` permite `case_scope=all`: cuatro minas privadas independientes para XAU/XAG/XPT/XPD y un caso de cuentas. El caso oro conserva actualización de APK anterior, desconexión/reintento y recorrido completo; los otros metales repiten el recorrido comercial con cantidades, precios, saldos, comisiones, lotes e inventario comprobados por API. Cuentas verifica ingresos/retiros con coma decimal, las 12 conversiones, importación explícita, origen de solo consulta, perfil, clave de recuperación incorrecta, confirmación de contraseña, revocación, reingreso y apertura en frío.

Las claves del caso de recuperación se extraen de dos campos identificados dentro del emulador, se enmascaran inmediatamente y se mantienen en memoria. Los flujos no solicitan capturas de recuperación. Los diagnósticos automáticos de Maestro permanecen privados en el runner; solo se publican resultados revisados y capturas anónimas anteriores a introducir credenciales. El administrador de Railway y la conexión PostgreSQL no se entregan a GitHub Actions.

## Preparación reproducible de presentación

Con `DEMO_ADMIN_TOKEN` configurado en el entorno de un proceso privado, desde la raíz:

```powershell
node api/scripts/prepare-demo.mjs --out "C:\demo-privada\presentacion-nueva" --label presentacion-nueva --kind presentation
```

El directorio padre debe existir y el destino debe ser nuevo y estar fuera del repositorio. El programa resuelve la ruta física, aplica permisos privados y guarda `credentials.json` antes de crear registros. Crea una mina nueva con 5 g de cada metal, dos compradores y un operador; verifica sus roles y saldos iniciales. No imprime claves, no guarda el token administrativo, no reinicia cuentas y no borra registros. Si se interrumpe, conserva la preparación parcial para revisión; no volver a usar ciegamente la misma ruta.

Se prepararon seis minas nuevas y 18 cuentas sin reiniciar registros: cinco conjuntos de QA para la matriz y un conjunto privado de presentación. Las credenciales de presentación se entregan localmente al propietario; no se publican en este documento. Las 30 credenciales temporales de CI se retirarán al terminar sus ejecuciones.

Usar las tres cuentas de la misma preparación privada en el [guion comercial](17-recorrido-demo-android.md), mediante inicio de sesión, sin volver a registrarlas. Conservar sus datos después de la presentación. Para repetir desde los saldos iniciales, crear otra preparación nueva; no restablecer la anterior. El operador público autorizado sigue disponible en [su archivo](../demo-access/operator-public.json), pero comparte historial con otras demostraciones.

## Aceptación física pendiente

En esta ejecución ADB no tenía teléfono ni emulador conectado. No se utilizó control de pantalla del PC. Registrar por separado en un Android físico: revisión OTA aplicada, modelo/versión Android, recorrido de las tres cuentas, persistencia al cerrar, importación de la sesión del propietario si la elige, arrastre/omisión de siete escenas, movimiento reducido y fluidez/temperatura. No desinstalar ni borrar datos. No publicar claves o capturas de recuperación.

| Estado | Alcance actual |
| --- | --- |
| Implementado y probado | Lógica comercial de las cuatro divisas/metales en memoria y PostgreSQL, aislamiento, permisos, idempotencia, importación, recuperación, perfil y persistencia; revisión visual web integrada. |
| Implementado, pendiente de pruebas | Esta revisión visual y la matriz ampliada en Android emulado; recorrido completo y rendimiento en teléfono físico. Se actualizará esta fila con los resultados reales. |
| Todavía no desarrollado | KYC/AML, dinero o custodia física reales, bancos, blockchain, documentos jurídicos y backoffice empresarial. Quedan fuera del alcance de la demo; iOS excluido. |

No se declara finalizada la aceptación Android mientras falte la ejecución de sus recorridos principales y la evidencia indicada.
