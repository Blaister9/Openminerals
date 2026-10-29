# Openminerals · Plan de ejecución y criterios de aceptación

## Entrega 0 · Base técnica (este paquete)

- [x] Definición de propuesta de valor para operador de mina.
- [x] Mapa móvil, identidad y flujos de primera versión.
- [x] API de simulación con compras, ventas, conversiones y reservas.
- [x] Código React Native/Expo con cinco áreas y vista gerencial ilustrativa.
- [x] Tests unitarios HTTP/dominio sin DB externa y script de aceptación API para Railway.
- [x] Instalar y validar dependencias; compilar APK Android e iOS para simulador. El build de simulador no equivale a probar iPhone.
- [x] Publicar el código en el repositorio GitHub oficial.
- [x] Desplegar API + PostgreSQL de demostración en Railway.
- [x] Probar persistencia y concurrencia sobre PostgreSQL Railway.
- [x] Publicar APK Android: el propietario confirmó operaciones parciales en 0.1.0 y actualización sin desinstalar, historial conservado y valores visibles en 0.1.1.
- [ ] Completar el recorrido de aceptación Android y resolver la experiencia de scrollytelling no aceptada.
- [ ] Instalar y ejecutar en iPhone físico; bloqueado por firma Apple. El simulador compilado tampoco se ha ejecutado.
- [ ] Validar UI con usuario de mina y definir contenido/documentación auténticos.

## Entrega 1 · Demo comercial verificable

Estado actualizado tras la prueba del propietario: la infraestructura y las operaciones básicas tienen evidencia; el recorrido comercial completo todavía no. El [backlog priorizado](09-prioridades-demo.md) separa funciones existentes con límites, funciones pendientes y pruebas pendientes. No se marcará toda esta entrega como aprobada por tener un APK.

Criterios obligatorios para considerar **demo montada**:

1. URL HTTPS del backend de Railway responde `/health` y anuncia `postgres-demo`.
2. Dos usuarios con sesiones diferentes tienen historiales y saldos independientes.
3. Convertir USD 200 a USDT; comprar oro 2,000 g; visualizar reducción de USDT y aumento de posición.
4. Reiniciar la app y observar la misma posición y los mismos movimientos.
5. Venta de 0,500 g modifica saldos e inventario y presenta comisión explícita.
6. Publicar una oferta reserva metal; venta que excede disponible es rechazada; cancelación libera reserva.
7. Solicitud de entrega queda `PENDING_QUOTE`; no aparece como despacho ejecutado.
8. El operador observa operaciones, inventario ficticio y solicitudes.
9. El build interno se instala y navega sin servidor local desde Android y iOS.
10. Video comercial grabado desde la app compilada, no imágenes falsas; simulación claramente visible.

## Entrega 2 · Viabilidad de operación real

**Bloqueos empresariales:** estructura de derechos, contrato de compraventa, custodio, cadena de custodia, certificación de lotes, proveedores regulados de dinero/USDT, liquidez de recompra, impuestos y jurisdicciones.

**Bloqueos técnicos:** identidad real, segregación, libro mayor de doble entrada, eventos inmutables, reconciliación, antifraude, RBAC, cotización ejecutable y cierre contable, seguridad de cliente y pruebas de recuperación.

No activar dinero o metal real antes de resolverlos y pasar auditoría técnica/jurídica adecuada.

## Pruebas mínimas de calidad del próximo sprint

- Ejecutar `npm test` en `api/` y registrar resultados.
- Validar serialización de operaciones concurrentes sobre DB real.
- Revisar `npx expo install --check` y `npm run check` del móvil.
- Probar compra USDT insuficiente, inventario insuficiente, duplicación de orden, reintentos de red.
- Probar teléfono sin red, reinicio y caducidad de una sesión de demostración.
- Verificar tamaños de texto, lectores de pantalla y reducción de movimiento.
