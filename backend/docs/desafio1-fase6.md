# Desafío 1 · Fase 6 — Presentación al cliente y handoff trazable

## Objetivo

La Fase 6 no cambia el razonamiento financiero de las Fases 2 y 3. Su objetivo es separar con claridad dos capas:

1. **evidencia técnica interna**, que conserva trazabilidad y reglas deterministas;
2. **explicación para el cliente**, que evita nombres internos de fuentes y comunica los montos sin ambigüedad.

La misma separación mejora el handoff: el asesor recibe el contexto financiero y un resumen de verificación, pero el cliente ve una explicación simple.

## Cambios de presentación

- Las respuestas de Mi Movistar y Lucía ya no muestran nombres internos como `Brainy Reconexiones` o `Brainy Prorrateo`.
- Reconexión, fin de descuento, cambio de plan y prorrateo se redactan desde la estructura verificada de Fase 3, no mediante un LLM.
- La nota técnica sobre el campo `ciclo` deja de mostrarse al cliente. La regla conservadora sigue vigente en backend: `ciclo` no se convierte en fecha de emisión.
- Un prorrateo se etiqueta como **Incluido en el total**, evitando que visualmente parezca un monto que debe sumarse otra vez.
- Los descuentos vigentes se etiquetan como **Aplicado al total**.

## Semántica de impactos

Cada motivo/hallazgo expuesto por la experiencia demo puede declarar:

- `VARIATION`: el monto representa una variación frente al recibo anterior;
- `INCLUDED_IN_TOTAL`: el monto ya forma parte del total actual, como un prorrateo de primer recibo;
- `APPLIED_TO_TOTAL`: el monto representa un beneficio o ajuste ya aplicado al recibo.

Esta semántica es únicamente de presentación; no modifica los cálculos financieros.

## Trazabilidad para el asesor

El handoff conserva, cuando existe:

- nivel de evidencia (`HIGH`, `MEDIUM`, `LOW`);
- etiqueta legible de verificación;
- fuentes funcionales, por ejemplo `Facturación`, `Registro de reconexión` y `Órdenes del servicio`.

No se transfieren al frontend identificadores oficiales de suscriptor/cliente ni filas del dataset.

## Salvaguardas que siguen vigentes

- El LLM no calcula montos ni descubre causas financieras.
- Los montos visibles siguen viniendo del recibo reconstruido.
- El texto técnico original de Fase 3 permanece disponible para pruebas y trazabilidad interna; la capa de presentación genera una copia orientada al cliente.
- `NO CONSIDERAR` continúa formando parte de la conciliación matemática, pero no se presenta como concepto principal al cliente.
- Los archivos oficiales, la base `desafio1.db` y los mapeos demo locales continúan fuera de Git.

## Resultado esperado en demo

### Carlos — reconexión

Lucía debe responder con lenguaje semejante a:

> Se agregó S/ 4.58 por la reconexión de tu servicio. Este cargo ya está incluido en el total de tu recibo.

No debe mencionar el nombre interno del archivo/fuente que respalda la reconexión.

### Ana — prorrateo

Mi Movistar debe presentar el hallazgo como:

> Prorrateo — Incluido: S/ 21.92

La descripción debe aclarar que el importe ya forma parte del total del recibo.

### Asesor

Si cualquiera de los dos casos se deriva, el portal del asesor debe conservar el motivo, el transcript y el contexto financiero, y además mostrar el nivel de evidencia y las fuentes funcionales que respaldaron la explicación.
