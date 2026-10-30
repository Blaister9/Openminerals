# Verificación integral de la API DEMO

`scripts/integral-smoke.mjs` comprueba las fases 1–5 sobre **dos minas nuevas y seis cuentas sintéticas**. No utiliza la cuenta pública del operador ni las cuentas del propietario. Todos los importes, documentos, metales y despachos son ficticios.

Las minas nuevas sin `initialInventoryMg` comienzan vacías; en un saldo inicial parcial, los metales omitidos también quedan a cero. Solo se crean lotes iniciales para cantidades DEMO explícitas. Los fixtures de presentación declaran sus saldos iniciales y los registros ya existentes conservan sus cantidades, sin reiniciarse.

La vista del comprador usa la etiqueta fija `Mina virtual ficticia DEMO`, incluida la sesión de acceso, sin cambiar el identificador de mina. Nombre operativo, ubicación y textos de documentos, requisitos o motivos se conservan en la vista autenticada del operador. Las asignaciones públicas usan una lista explícita de campos; los atributos operativos desconocidos de registros anteriores no se propagan al cliente. Las pruebas HTTP con canarios cubren login, registro, identidad, estado, historial, custodia, certificado, lote, mercado, entregas y comprobantes, tanto en memoria como en la suite PostgreSQL cuando está configurada.

## Ejecución

Desde `api/`, disponer de `DEMO_ADMIN_TOKEN` en el entorno del proceso por el medio privado habitual. No escribir su valor en Git, capturas o archivos de comandos compartidos.

```powershell
$env:REQUIRE_POSTGRES='true'
node scripts/integral-smoke.mjs smoke https://API-DEMO.example
```

`smoke` crea los fixtures y revoca sus sesiones al finalizar. No genera un snapshot. En Railway se exige PostgreSQL; `memory-demo` no es aceptación de despliegue.

Para comparar los datos antes y después de reiniciar **solo el servicio API de demostración**:

```powershell
node scripts/integral-smoke.mjs prepare https://API-DEMO.example 'C:\ruta-privada-fuera-git\snapshot.json'
# Reiniciar la API por separado y verificar su nuevo arranque.
node scripts/integral-smoke.mjs verify https://API-DEMO.example 'C:\ruta-privada-fuera-git\snapshot.json'
```

La carpeta del snapshot debe existir, estar fuera de cualquier repositorio y conservarse de forma privada. `prepare` rechaza sobrescribir un archivo existente; tampoco permite redirigirlo hacia Git mediante un enlace simbólico. `verify` no requiere el token administrativo. Ambos modos exigen `postgres-demo` y exactamente el mismo origen HTTP/HTTPS; HTTP se admite únicamente en loopback.

El script no reinicia Railway ni demuestra por sí solo que ocurrió un reinicio. Esa operación y el nuevo arranque deben registrarse por separado. No reiniciar PostgreSQL ni un entorno de producción para ejecutar esta prueba.

## Contrato del snapshot, versión 3

El archivo conserva el identificador aleatorio de los fixtures, sus **tokens de autenticación sintéticos**, las claves idempotentes originales, los comprobantes y snapshots de estado, custodia, entregas, perfiles y gerencia. Un hash canónico permite comparar contenido sin depender del orden de las propiedades JSON. El historial gerencial se captura completo, siguiendo todos sus cursores.

No guarda contraseñas, token administrativo, claves de recuperación ni tokens temporales de recuperación. El comprador recuperado inicia sesión de nuevo y su token de fixture se actualiza antes de escribir el archivo. Una comprobación final impide serializar cualquiera de los secretos transitorios que se usaron. No publicar el snapshot ni copiar sus tokens en informes.

La verificación comprueba los alias e identidades sintéticos originales y los nombres operativos de las dos minas mediante sus operadores. Para cada comprador exige la etiqueta pública fija y el identificador de su mina original relacionado con su operador. Compara los datos anteriores, reenvía cada comando con su clave original y exige que el segundo snapshot permanezca idéntico. No vuelve a ejecutar el restablecimiento de contraseña: confirma su identidad posterior y el indicador `recovery.enabled`, sin disponer de la clave privada de recuperación.

## Recorridos y límites comprobados

| Fase | Comprobación integral |
| --- | --- |
| Custodia DEMO | Ingreso documentado de metal, dos lotes de origen, capacidad, asignaciones, certificados propios y aislamiento entre compradores/minas. |
| Marketplace | Ofertas con precio, reservas independientes, dos compradores concurrentes para una oferta, liquidación única, conservación de USDT más comisión, transferencia de los lotes exactos y comprobantes privados. |
| Entrega DEMO | Política y requisitos ficticios, desglose entero de costes, cotización con vigencia, aceptación y cobro único, transiciones ordenadas, cancelación/rechazo previo al cobro y conservación del peso histórico del lote al retirar suministro activo. |
| Gerencia | Historial completo de más de veinte eventos, cursores sin duplicados, filtros combinados y fechas, comisiones sin doble conteo, conciliación actual y consulta de cada comprobante sin snapshots de billeteras. |
| Perfil y recuperación | Preferencias ficticias de ambos roles, campos inmutables protegidos, operador sin recuperación pública, prueba de contraseña actual, errores genéricos para alias desconocido/clave incorrecta, token temporal, revocación de dos sesiones y nuevo acceso al mismo comprador con todos sus datos intactos. |

Las suites `npm test` y `npm run test:postgres` cubren además vencimiento efectivo, límites de intentos persistentes, carreras y rollback adversarial. La comprobación integral no sustituye esas suites ni los recorridos de la interfaz móvil.

## Evidencia local del 28 de octubre de 2026

Sobre la base `e611ea0f916dbf506f3b9172120d2ac065a6dd4c` y este incremento del script, `prepare` aprobó **930 comprobaciones** y `verify` **195**. Se detuvo y arrancó un proceso API propio usando el mismo esquema PostgreSQL local aislado. El esquema se eliminó después de verificar; el clúster de pruebas continuó ejecutándose. No se modificaron datos del propietario ni servicios Railway.

Esta evidencia acredita API HTTP y persistencia local tras reinicio de la API. La ejecución HTTPS contra Railway, el respaldo previo al despliegue, el APK actualizado y los recorridos Android/iOS deben documentarse por separado con sus resultados reales. No acredita custodia física, tasas legales, pagos reales ni aceptación nativa de la aplicación.
