# Custodia documental y Web3: diseño futuro para Colombia

Notas solicitadas por el propietario después de instalar Android 0.2.0. Son decisiones pendientes para una etapa futura; no se implementó blockchain, documentación legal, custodia física ni movimientos reales. El certificado actual conserva su aviso DEMO.

## Qué representa el lote actual

`lot-…` es la clave de un registro en PostgreSQL. Se deriva de mina, metal y origen de la operación; no es dirección de contrato, token ni hash de un documento. El «Registro ilustrativo DEMO» es texto generado por la aplicación cuando el lote no recibe otros metadatos de prueba. No procede de una autoridad, laboratorio o custodio.

El certificado permite consultar la relación entre una cuenta y una cantidad asignada de un lote simulado. Sus campos ayudan a diseñar una integración posterior; no acreditan por sí mismos existencia, propiedad o pureza del metal.

## Documentos y responsables que habría que definir

| Finalidad | Emisor o responsable | Alcance |
| --- | --- | --- |
| Procedencia lícita | Explotador autorizado u otro emisor aplicable al origen del mineral | Certificado de origen y soportes de comercialización; la minería de subsistencia y las plantas tienen reglas particulares. Consultar [ANM/RUCOM](https://www.anm.gov.co/sites/default/files/2024-11-12-ABECE-RUCOM-ACTUALIZADO-2024.pdf). |
| Peso y pureza | Laboratorio que realiza el ensayo | Vincular muestra, lote, método, fecha y resultados. Comprobar la competencia y el alcance acreditado del laboratorio en [ONAC](https://onac.org.co/servicios/laboratorios-de-ensayo/). |
| Recepción y custodia | Custodio real contratado | Diseñar contrato y constancias con identificación del metal, ubicación, responsabilidades y condiciones de entrega. Es una propuesta documental que debe concretarse con los participantes. |
| Derecho del comprador | Partes de la operación y su documentación jurídica | Definir qué se adquiere y cómo se transfiere o exige su entrega. El certificado de depósito de un Almacén General de Depósito tiene un régimen específico: [Código de Comercio, artículos 757 y siguientes](https://cancilleria.gov.co/sites/default/files/Normograma/docs/codigo_comercio_pr023.htm). No atribuir ese carácter al certificado propio de Openminerals. |

La plataforma podría generar una constancia digital que referencia estos soportes y sus emisores. No existe una «legalización del PDF» que supla toda esa cadena. Primero debe definirse el acto, el derecho y las obligaciones documentadas.

La [Ley 527 de 1999](https://normas.cra.gov.co/gestor/docs/ley_0527_1999.htm) reconoce efectos y valor probatorio de mensajes de datos con las condiciones correspondientes de identificación, integridad, conservación y confiabilidad. La firma ayuda a acreditar autoría y aprobación; no realiza un ensayo ni verifica físicamente el metal. Una firma de wallet tampoco debe equipararse automáticamente a cualquier firma digital certificada exigible.

## Dónde podría participar blockchain

Un contrato inteligente es un programa desplegado en una dirección de red; puede gestionar muchos lotes. El ID interno podría vincularse después a un identificador de token y a la red/contrato correspondientes. [Ethereum: contratos inteligentes](https://ethereum.org/developers/docs/smart-contracts/).

- **Lotes y documentos:** hash del archivo definitivo, emisor, versión y referencia de verificación; consulta por QR.
- **Custodia:** eventos de recepción, ensayo, asignación y salida emitidos por participantes identificados.
- **Portafolio:** cantidades tokenizadas y vínculo explícito con el derecho contractual ofrecido.
- **Marketplace:** transferencias o liquidaciones bajo las reglas que se diseñen para esos derechos.

[ERC-721](https://eips.ethereum.org/EIPS/eip-721) permite tokens únicos; [ERC-1155](https://eips.ethereum.org/EIPS/eip-1155) permite varios tipos y cantidades en un contrato. La elección queda pendiente: esos estándares no definen la existencia del metal ni sus derechos de rescate. La conexión con el mundo físico depende de emisores y verificadores externos, el problema que describe Ethereum en [oráculos](https://ethereum.org/developers/docs/oracles/).

La app React Native puede incorporar esas funciones Web3 conservando el backend. Documentos privados, datos personales y credenciales deben mantenerse fuera de una cadena pública. La propuesta es registrar únicamente las referencias y eventos necesarios, después de definir su modelo jurídico y de privacidad.

## Costes que habría que presupuestar

La [ANM indica que la inscripción RUCOM no tiene costo](https://www.anm.gov.co/sites/default/files/2024-11-12-ABECE-RUCOM-ACTUALIZADO-2024.pdf) (p. 6). Eso no cubre todos los requisitos empresariales ni certifica un lote de Openminerals.

Ensayo/muestreo, custodia, seguro, contratos y servicios de firma requieren cotizaciones concretas. El artículo 31 de la Ley 527 contempla remuneración libre de los servicios de las entidades de certificación. No se identificó una tarifa oficial única para «legalizar el certificado de lote». Tampoco debe suponerse que toda operación requiere el mismo trámite notarial o apostilla.

Blockchain añade desarrollo, revisión y operación, además de comisiones variables de red. El [gas](https://ethereum.org/developers/docs/gas/) paga ejecución informática; no es una tasa de legalización colombiana. No se contratan servicios ni se estiman importes sin definir el modelo y proveedores.

## Acceso sin login y evolución futura

El propietario confirmó instalación 0.2.0, conservación de sesión/saldo/historial y visualización de lotes/certificados. También señaló que había datos visibles sin iniciar sesión. Se verificó el comportamiento actual: cerrar sesión elimina el token y restaura la sesión ilustrativa anterior de esa instalación; una cuenta autenticada puede reabrirse mediante su token guardado en SecureStore. La cabecera distingue «Sesión sin cuenta», origen importado «solo consulta» y «Comprador/Operador · alias».

Prueba dirigida con cliente TypeScript y API HTTP local: seis casos de logout/reapertura/aislamiento aprobaron, además de 22 pruebas existentes. Las rutas de custodia y certificados de cuenta rechazaron consultas con solo el identificador legacy. No se observó un fallo de aislamiento que requiriera cambiar la app; esta comprobación no se ejecutó en el teléfono del propietario.

Para una integración real, exigir autenticación y autorización para cada dato privado, separar expresamente la experiencia ilustrativa y conservar el bloqueo de cambios de identidad durante operaciones pendientes. El modo legacy actual y el operador público son recursos exclusivos de demostración; no constituyen el modelo de acceso de una plataforma con activos reales.
