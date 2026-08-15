# Post-Fase 22 · Seguimientos de mayor detalle grounded

Este correctivo mejora la continuidad conversacional cuando el cliente no está diciendo que no entendió, sino que quiere **profundizar** una respuesta ya correcta.

Ejemplos cubiertos:

- `Quiero saber más detalles de mi recibo actual`.
- `Explícamelo a más detalle`.
- `Más a detalle` / `Más detalles`.
- `Profundiza más`.
- `Desglósalo`.

## Regla principal

Pedir más detalle **no es una reparación por incomprensión**. Por tanto no incrementa el contador de reformulaciones de Fase 19 ni consume el umbral `HANDOFF_REPAIR_THRESHOLD_2`.

Si existe contexto personal autenticado, el seguimiento reutiliza el último sujeto financiero grounded. Por ejemplo:

```text
¿Cuál es mi recibo actual?
        ↓
CURRENT_TOTAL
        ↓
Más a detalle
        ↓
CURRENT_TOTAL + DETAIL
```

No se vuelve a clasificar el mensaje aislado como una consulta genérica ni se cae a RAG por perder el sujeto.

## Respuesta detallada

Para el recibo actual, el backend puede ampliar únicamente con hechos ya estructurados:

- total y ciclo del recibo actual;
- total y ciclo anterior, si existe;
- diferencia monetaria estructurada;
- resumen causal verificado por el motor financiero;
- conceptos públicos ya filtrados de la factura.

No se incorporan `subscriberKey`, `customerKey`, `chargeCode` privados ni filas fuente. Si no existe recibo anterior, se declara esa ausencia y no se inventa una comparación.

Groq puede naturalizar el texto final bajo las guardas post-F22, pero no puede modificar ni crear montos, fechas o causas.

## Frontera F22

`CONVERSATIONAL_GROUNDING_BOUNDARY` incorpora la propiedad:

```text
groundedDetailFollowUpsReuseLastFinancialSubject = true
```

Una regresión que vuelva a tratar `más a detalle` como pérdida de contexto o reparación de handoff hace fallar esa frontera.
