# Desafío 1 · Fase 15
## Resolución de consulta y siguientes acciones deterministas

Fase 15 añade una capa explícita entre la respuesta financiera y lo que el cliente puede hacer después.

La ficha del desafío no pide únicamente explicar el recibo: también pide sugerir siguientes acciones cuando correspondan. Esta fase evita resolver ese requisito con botones estáticos o recomendaciones generadas libremente.

## 1. Dos conceptos distintos

El motor ya tenía estados financieros de Fase 3:

- `FULLY_EXPLAINED`
- `PARTIALLY_EXPLAINED`
- `UNEXPLAINED`
- `NO_VARIATION`
- `NO_PREVIOUS_BILL`

Esos estados describen cuánto de una **variación financiera** puede reconciliarse.

Fase 15 introduce estados de **resolución de la consulta del usuario**:

- `RESOLVED`
- `PARTIALLY_RESOLVED`
- `UNRESOLVED`

No son equivalentes.

Ejemplos:

- `¿Cuál es el total de mi recibo?` puede quedar `RESOLVED` aunque no exista una variación que explicar.
- `¿Cuánto debo?` queda `PARTIALLY_RESOLVED`: el total del recibo sí está disponible, pero FACTURACION v2 ya no entrega un saldo pendiente verificable.
- `¿Por qué subió mi recibo?` con `FULLY_EXPLAINED` queda `RESOLVED`.
- La misma pregunta con `PARTIALLY_EXPLAINED` queda `PARTIALLY_RESOLVED`.
- Un primer recibo con prorrateo puede resolver `Explícame mi recibo`, pero no puede fingir una comparación mensual que no existe.

## 2. Motor de resolución

La lógica vive en:

`services/desafio1ResolutionLogic.js`

La entrada es únicamente el contexto ya recuperado de forma segura:

- intención de la consulta;
- recibo actual/anterior;
- causas y hallazgos verificados;
- histórico cuando la intención lo requiere;
- tipo de renta cuando está resuelto;
- perfil seguro cuando la pregunta es de perfil.

La salida es:

```text
resolution
  status
  reasonCode
  items[]
  nextActions[]
  guards
```

`reasonCode` permite auditar por qué una consulta se consideró resuelta o no resuelta sin depender de texto generativo.

## 3. Reglas principales

### Total actual

```text
monto actual verificable
→ RESOLVED
```

### Saldo/deuda

```text
pregunta "¿cuánto debo?"
+
total del recibo disponible
+
saldo pendiente no disponible
→ PARTIALLY_RESOLVED
```

```text
pregunta "¿tengo deuda?"
+
estado de deuda no disponible
→ UNRESOLVED
```

No se infiere deuda desde el monto del recibo, el ciclo ni otros campos.

### Explicación de variación

```text
FULLY_EXPLAINED
→ RESOLVED

PARTIALLY_EXPLAINED
→ PARTIALLY_RESOLVED

UNEXPLAINED
→ UNRESOLVED

NO_VARIATION
→ RESOLVED
```

`NO_PREVIOUS_BILL` se evalúa según la pregunta. Un hallazgo actual verificado puede resolver una petición como `Explícame mi recibo`, pero no convierte en existente un recibo anterior.

### Hallazgos/casuísticas

Prorrateo, paquete, descuento y ajuste por suspensión solo quedan `RESOLVED` cuando la evidencia correspondiente está realmente presente en la experiencia.

### Histórico

- 2 o más recibos: la consulta de tendencia puede resolverse.
- 1 recibo: tendencia `PARTIALLY_RESOLVED`.
- sin histórico: `UNRESOLVED`.
- `LATEST_INCREASE` queda resuelto con al menos dos recibos aunque la conclusión correcta sea que no hubo aumento.

### Recurrencia

Si el cargo puede resolverse por nombre o por contexto conversacional, se clasifica con el histórico estructurado.

Si `este cobro` es ambiguo:

```text
UNRESOLVED
reasonCode = CHARGE_NEEDS_CLARIFICATION
```

No se escoge un cargo arbitrariamente ni se deriva automáticamente: se ofrece revisar los conceptos del recibo para que el cliente pueda especificarlo.

## 4. Multi-intent

Cada intención se resuelve por separado.

```text
todas RESOLVED
→ RESOLVED

todas UNRESOLVED
→ UNRESOLVED

mezcla de estados
→ PARTIALLY_RESOLVED
```

Esto permite que una consulta como:

`¿Cuál es mi plan, tengo deuda y cuánto es mi recibo?`

conserve las respuestas verificables del plan/total y marque únicamente deuda como no resuelta.

Cuando el resultado global es `PARTIALLY_RESOLVED` o `UNRESOLVED`, las siguientes acciones se construyen solo desde las intenciones que todavía necesitan atención. Las sugerencias exploratorias de intenciones ya resueltas no se mezclan en ese turno. Por ejemplo, la consulta anterior ofrece revisar el detalle y hablar con un asesor por la deuda no verificable, pero no añade `EXPLAIN_VARIATION` solo porque exista un recibo anterior comparable.

## 5. Siguientes acciones

Las acciones ya no son una lista estática.

Se construyen por reglas y se deduplican. Los tipos permitidos en Fase 15 son:

- `CHAT`: continuar con una pregunta concreta a Lucía.
- `NAVIGATE`: abrir una vista local del prototipo, por ejemplo el detalle del recibo en Mi Movistar.

Ejemplos de acciones habilitadas por evidencia:

- `REVIEW_BILL_DETAIL`
- `EXPLAIN_VARIATION`
- `REVIEW_BILL_HISTORY`
- `CHECK_HIGHEST_BILL`
- `CHECK_LATEST_INCREASE`
- `CONTACT_ADVISOR`

El asesor se ofrece cuando la consulta queda parcial/no resuelta, excepto casos de aclaración que el cliente puede resolver especificando el concepto.

No se realiza handoff automático solo porque `resolutionStatus = UNRESOLVED`. El cliente mantiene control de la conversación; el handoff existente se ejecuta al solicitarlo o expresar desacuerdo/no resolución.

## 6. Guardas deliberadas

### Pago

Fase 15 **no ofrece `PAY_BILL`**.

FACTURACION v2 eliminó `DEUDA` y `FECHA-VENCIMIENTO`; por lo tanto no existe una base verificable para decir qué saldo está pendiente ni para activar una acción de pago basada en el dataset.

La respuesta puede mostrar el total del recibo, pero no equipararlo con deuda.

### Cross-selling

Fase 15 **no ofrece acciones comerciales**.

La política comercial se implementará en su fase específica y deberá exigir consulta resuelta + elegibilidad + oferta compatible + regla explícita.

### LLM

`guards.financialReasoningByLlm = false`.

La resolución y las acciones se derivan de estados/valores estructurados; el LLM no decide si una consulta quedó resuelta ni qué acción financiera mostrar.

## 7. Integración con interfaces

### Lucía

Las respuestas personales incluyen:

- `resolution`
- `resolutionStatus`
- `nextActions`

El chat muestra las acciones como botones debajo de la respuesta. `CHAT` vuelve a enviar un prompt explícito; `NAVIGATE` solo acepta rutas locales que empiezan con `/`.

### Mi Movistar

`nextActions` deja de construirse como dos botones fijos. La experiencia oficial usa la misma política de Fase 15 para decidir si corresponde explicar, revisar histórico u ofrecer asesor.

### Sesión conversacional

El backend conserva:

- `lastResolutionStatus`
- `lastResolutionReason`

Esto prepara fases posteriores sin usar el estado financiero como sustituto de la resolución conversacional.

## 8. Frontera con métricas

El dashboard todavía conserva el indicador histórico `Resolución digital*` como proxy basado en cierre sin handoff.

Fase 15 no lo reemplaza silenciosamente. La integración formal de `resolutionStatus` con KPIs/handoff accuracy se hará en la fase de medición, evitando cambiar la semántica de métricas antiguas sin una migración explícita.

## 9. Condición de salida

Fase 15 se considera cerrada cuando:

- existen los tres estados formales de resolución;
- el estado se calcula por intención y no por intuición textual;
- multi-intent agrega correctamente resultados mixtos;
- FACTURACION v2 no provoca una falsa acción de pago;
- asesor se ofrece por regla en consultas parciales/no resueltas;
- Lucía muestra siguientes acciones accionables;
- Mi Movistar deja de usar acciones oficiales estáticas;
- no se activa cross-selling;
- todos los tests previos y nuevos continúan en verde.
