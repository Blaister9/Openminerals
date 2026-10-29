# Openminerals · Diseño maestro móvil

**Objetivo de UX:** compra comprensible en menos pasos, con controles financieros claros. Impacto visual en el contexto narrativo; sobriedad en confirmación de operaciones.

## Arquitectura de información

Barra inferior (cinco secciones):

| Sección | Pantallas y acciones | MVP en código |
|---|---|---|
| Inicio | Patrimonio, metales, recorrido del lingote, accesos rápidos | Sí (narrativa básica) |
| Mercado | Catálogo, detalles, gramos, confirmación de compra | Sí (precios fijos) |
| Billetera | COP/EUR/USD/USDT, conversión, ingresos y retiros | Sí (simulado) |
| Metales | Posiciones, venta, oferta, solicitud de entrega | Sí (sin contraparte ni despacho) |
| Más | Historial, perfil ilustrativo, vista de operador | Sí (vista ilustrativa) |

## Identidad visual

- **Estética:** institutional luxury / metaltech; el color debe comunicar confianza y jerarquía, no apuestas.
- **Fondo:** azul carbón `#090F15`; superficies `#141E28`; bordes `#273541`.
- **Acento oro:** `#DCBC7F`; texto principal `#F7F6F2`; secundarios `#92A0AC`.
- **Metal:** Oro `#D8B676`; Plata `#CED3DE`; Platino `#B6C9D5`; Paladio `#B8A5C9`.
- **Tipografía:** jerarquía definida mediante tamaños, pesos y espaciado; evitar cifras diminutas o bajo contraste.
- **Movimiento:** sutil en operaciones. Respetar la opción del dispositivo de reducir movimiento.

## Scrollytelling nativo, fase visual posterior

1. **Origen:** vista de muestra/lote, relación con mina y documentación.
2. **Refinación:** transición a metal de pureza verificable, con información de ensayo.
3. **Custodia:** el lingote entra en una representación de bóveda; el custodio y el régimen de titularidad deben ser reales antes de presentarlos como hechos.
4. **Fraccionamiento:** representación visual de gramos digitales. No insinuar que un token on-chain existe si solo hay registro interno.
5. **Portafolio:** la fracción se transforma en una posición de usuario con historial trazable.

**Técnica sugerida:** secuencia animada 3D optimizada exportada para dispositivo o motor 3D solo en onboarding; transiciones Rive/Reanimated y controles reducidos de movimiento. El prototipo adjunto incluye un lingote con movimiento básico y una historia de cuatro pasos, **no** la secuencia 3D final.

La revisión móvil 0.1.1 sustituye los botones de pasos por cuatro escenas vinculadas al desplazamiento vertical, con transformaciones 2.5D nativas y reducción de movimiento. El motor 3D y la secuencia cinematográfica final siguen pendientes. La compilación y la comprobación visual en dispositivo se registran por separado en el informe de revisión.

## Reglas de interacción y accesibilidad

- Botones táctiles de mínimo 44×44 puntos; pantallas para 360–430 dp de ancho inicialmente.
- Siempre mostrar nombre de metal, cantidad, unidad, precio, comisión, importe final y moneda antes de ejecutar.
- Evitar abrir por defecto la compra desde una alerta de precio.
- Todas las operaciones que mueven saldos requieren una confirmación explícita.
- Diferenciar `saldo disponible`, `saldo reservado` y `saldo total`.
- Incluir `SIMULACIÓN` en todas las pantallas de la demo; la implementación de producción debe cambiar los servicios y controles, no solo ocultar esa etiqueta.
- Comprobar VoiceOver/TalkBack, modo oscuro, texto grande y preferencia de movimiento reducido en la siguiente fase.

## Flujos críticos

### F1. Compra

`Inicio → Billetera → Convertir USD/USDT → Mercado → Elegir metal → Introducir gramos → Confirmar → Comprobante → Portafolio`

Precondiciones: cantidad >=0,100 g, inventario disponible, USDT suficientes. Postcondiciones: saldo USDT menor; posición adquirida mayor; inventario ficticio menor; operación registrada una sola vez.

### F2. Venta a la plataforma

`Metales → Seleccionar posición → Vender → Confirmar precio y comisión → Comprobante → Billetera`

Condiciones: posición disponible; cotización aceptada; tasa de venta; política de recompra. El MVP simula recompra directa, no mercado P2P real.

### F3. Publicación de oferta

`Metales → Publicar oferta → Reservar gramos → Estado OPEN → Cancelar oferta`

No realiza emparejamiento, liquidación ni transferencia entre usuarios. Requerirá diseño de motor de órdenes, reglas de reserva, KYC y liquidez antes de implementar mercado secundario.

### F4. Entrega física

`Metales → Solicitar cotización → Reservar gramos → PENDING_QUOTE → Cancelar`

La demo no confirma impuestos, transportistas ni fechas; solo registra la solicitud de cotización.

### F5. Operador de mina

`Más → Vista del operador → Inventario ficticio → Operaciones → Comisiones → Solicitudes`

La demo no controla acceso por rol; fuera de demostración este panel requerirá permisos independientes.
