# Desafío 1 · Fase 11 · Cobertura funcional de datos

## Objetivo

La Fase 11 deja de medir solamente cuántos clientes son consultables y responde una pregunta distinta:

> ¿Qué función concreta cumple cada una de las ocho fuentes del desafío dentro del prototipo y qué escenarios siguen pendientes de una regla de negocio confiable?

No se fuerza que cada CSV produzca una causa visible en Lucía. Una fuente puede cumplir un rol de **núcleo**, **evidencia**, **referencia** o **contexto**. Esto evita inventar causalidad únicamente para decir que un archivo “se usa”.

## Las ocho fuentes tienen un rol explícito

1. **PLANTA CLIENTES**: perfil del servicio, ciclo, fecha de activación, tipo de servicio y ancla de suscripción.
2. **FACTURACION-CLIENTES**: recibos, conceptos, importes, deuda, producto y comparación entre ciclos.
3. **ORDENES**: eventos del servicio y evidencia de cambio de plan/suspensión.
4. **CATALOGO-OFERTAS**: referencia de códigos, tarifa y tipo de renta.
5. **DESCUENTOS Y CUOTAS**: evidencia de promociones y descuentos.
6. **PRORRATEOS**: evidencia monetaria y temporal de cargos proporcionales.
7. **RECONEXIONES**: evidencia de corte/reconexión y cargo asociado.
8. **NOTAS DE CRÉDITO/DÉBITO**: contexto de ajustes financieros; por ahora no se declara automáticamente como causa.

## Reglas confirmadas en la sesión de preguntas

- **Cruce canónico por suscripción**: `PLANTA.NUM_ANEXO` representa el subscriber y debe relacionarse con `SUBSCRIBER_KEY` en las fuentes que lo contienen. `COD_CLIENTE` puede agrupar varias suscripciones y por ello no debe usarse como llave principal para reconstruir un único servicio.
- **Ciclo de PLANTA**: valores como 5, 9, 15 o 17 representan el día del ciclo/cierre.
- **Producto**: `CHARGE_CODE_DESC` contiene la información del producto/concepto facturado. La interfaz puede limpiar un precio redundante para presentación, conservando el valor fuente y tomando el importe estructurado como monto visual.
- **`PERIOD_START_DATE` / `PERIOD_END_DATE`**: el líder confirmó una incidencia en la entrega actual que será revisada. El prototipo no inventa esos periodos mientras la fuente no sea utilizable.
- **Arquitectura financiera**: la elección entre SQL/reglas y RAG queda a criterio del equipo. El prototipo mantiene SQL + reglas deterministas para dinero/evidencia y reserva la IA para comprensión y conversación cuando corresponde.

## Escenarios consolidados

Actualmente el motor tiene una regla verificable para:

- perfil del servicio;
- reconstrucción/comparación de recibos;
- tipo de renta;
- descuentos;
- prorrateos;
- reconexiones;
- cambio de plan;
- paquetes adicionales (promovido en Fase 13 con marcador estructurado y delta monetario conciliado).

## Escenarios que no deben forzarse

### Notas de crédito/débito

Se cruzan y preservan como contexto. Falta confirmar la semántica exacta que permite convertir una nota en causa del cambio sin riesgo de atribución incorrecta.

### Ajuste por suspensión

ORDENES permite detectar eventos candidatos de suspensión/corte, pero falta una regla confirmada que reconcilie el efecto monetario con FACTURACION.

### Cuota de equipo financiado

Los materiales de capacitación confirman que puede aparecer como cuota en el recibo/Brainy. Falta identificar de manera inequívoca qué campo, código o clasificación de los archivos entregados representa esa cuota. Hasta entonces se marca como `PENDING_MAPPING`.

## Auditoría

Ejecutar:

```bash
npm run data:functional-coverage:desafio1
```

El comando muestra únicamente métricas agregadas, roles de fuentes y estado de escenarios. No imprime `NUM_ANEXO`, `SUBSCRIBER_KEY`, claves de cliente, cuentas financieras ni hashes.

El Dashboard consulta el mismo reporte en:

```text
GET /api/demo/data-coverage
```

Esto permite enseñar al comité que **8/8 fuentes están integradas** sin afirmar falsamente que todos los escenarios ya están completamente resueltos.
