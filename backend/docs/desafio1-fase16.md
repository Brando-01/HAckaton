# Desafío 1 · Fase 16
## Auditoría financiera, Retrieval Accuracy y trazabilidad segura

Fase 16 convierte la precisión financiera del prototipo en una propiedad **medible y reproducible**. No cambia las causas financieras de Fase 3/13/14B ni añade nuevas respuestas comerciales: crea un benchmark independiente que vuelve a leer las filas crudas de la base oficial local y contrasta contra ellas las afirmaciones estructuradas que produce el motor.

La meta no es declarar precisión por intuición ni pedirle a un LLM que evalúe a otro LLM. El ground truth de esta fase se reconstruye desde SQLite y desde invariantes deterministas.

## 1. Qué significa Retrieval Accuracy en este prototipo

La métrica `Retrieval Accuracy` responde a esta pregunta:

```text
¿Los valores estructurados recuperados/reconstruidos por el motor
coinciden exactamente con los valores que se pueden recalcular
desde las filas crudas de las fuentes oficiales locales?
```

La auditoría vuelve a cargar, de forma independiente del objeto ya reconstruido:

- filas crudas de `FACTURACION` del recibo actual;
- filas crudas del recibo anterior cuando existe;
- prorrateos crudos;
- reconexiones crudas;
- descuentos/promociones crudos;
- notas de crédito/débito crudas;
- órdenes crudas entre ambos recibos.

Después recalcula totales, montos netos, agrupaciones por `CHARGE_CODE` y deltas. La explicación pasa únicamente si lo publicado por el motor coincide con ese ground truth.

La fórmula agregada es:

```text
Retrieval Accuracy =
assertions RETRIEVAL aprobadas / assertions RETRIEVAL evaluables
```

No se calcula sobre similitud textual ni sobre una autoevaluación generativa.

### Semántica de cambios estructurales

La comparación no interpreta `delta = 0` como sinónimo de “no hubo ningún cambio estructural”. Un `CHARGE_CODE` que aparece por primera vez o desaparece del recibo forma parte de `chargeChanges` aunque su importe sea `S/ 0.00`. El auditor reproduce esa misma semántica de presencia actual/anterior y no genera un falso fallo únicamente porque el movimiento monetario sea cero.

## 2. Qué verifica la auditoría

### Retrieval

Se comprueba, entre otros controles:

- total actual = suma cruda de `CHARGE_TOTAL_AMOUNT`;
- total neto actual = suma cruda de `CHARGE_NET_AMOUNT`;
- número de filas crudas recuperadas;
- monto, monto neto y `sourceRows` de cada `CHARGE_CODE` reconstruido;
- los mismos controles para el recibo anterior;
- total actual/anterior de la comparación;
- diferencia exacta `actual - anterior`;
- monto anterior, actual y delta de cada cargo;
- reconciliación de los deltas con la diferencia total.

### Grounding financiero

Además de recuperar valores exactos, una causa debe poder demostrar **de dónde sale**.

Ejemplos:

- `RECONNECTION`: sus filas declaradas deben existir realmente en la evidencia cruda de reconexión;
- `DISCOUNT_ENDED` / `DISCOUNT_REMOVED`: deben apuntar a la evidencia cruda de descuento anterior;
- `PLAN_CHANGE`: debe tener órdenes crudas compatibles;
- `PACKAGES`: el código reclamado debe tener marcador estructurado de paquete en facturación;
- `PRORATION`: el hallazgo y monto deben reconciliar con facturación y prorrateo crudos;
- `ACTIVE_DISCOUNT`: el monto debe coincidir con facturación y con la fuente de descuentos;
- `SUSPENSION_ADJUSTMENT`: la nota, el monto y la línea temporal corte→reconexión se contrastan contra las fuentes crudas según Checkpoint 14B.

Para cada causa también se vuelve a calcular:

```text
impacto esperado = suma de deltas crudos de los CHARGE_CODE reclamados
```

El `impactAmount` de la causa debe coincidir con ese valor. Finalmente, `explainedNetAmount` debe coincidir con la suma de causas grounded.

## 3. Guardas de política

El benchmark no solo compara dinero. También exige que continúen activas las decisiones de seguridad ya establecidas:

```text
llmUsedForFinancialReasoning = false
causeAmountsDerivedFromChargeDeltas = true
notesAddedAsCausesAutomatically = false
suspensionCreditsAddedAsVariationCauses = false
```

Una guarda ausente se considera un fallo; no se interpreta silenciosamente como valor seguro.

### Redondeo financiero simétrico

Los importes se redondean a centavos sobre su magnitud y luego se restaura el signo. Esto evita la asimetría de `Math.round` para empates negativos. Por contrato:

```text
 5.635 →  5.64
-5.635 → -5.64
```

Esta regla es relevante para créditos y descuentos negativos: la magnitud de un crédito no puede perder un centavo únicamente por haber sido representada con signo negativo.

## 4. Tasa de alucinación financiera detectable

Fase 16 publica:

```text
detectableFinancialHallucinationRatePct
```

En este prototipo se define como:

```text
claims monetarios estructurados que contradicen el ground truth
-------------------------------------------------------------- × 100
claims monetarios estructurados evaluables
```

Por ejemplo, un total distinto de la suma cruda, un delta incorrecto o un impacto causal que no coincide con los cargos reclamados cuenta como violación monetaria.

### Frontera de la afirmación “0%”

Un resultado de `0.00%` significa:

> **0 violaciones financieras detectables entre las afirmaciones estructuradas que el benchmark pudo contrastar contra el ground truth.**

No significa que un conjunto finito de pruebas pueda demostrar matemáticamente que ningún texto libre futuro jamás contendrá un error. Por eso el reporte expone explícitamente:

```text
zeroHallucinationClaimScope = DETECTABLE_STRUCTURED_FINANCIAL_CLAIMS_ONLY
```

Esta formulación evita convertir una métrica real en una promesa más amplia de lo que la evidencia permite demostrar.

## 5. Selección reproducible del benchmark

El comando por defecto audita hasta **300 suscriptores con facturación**.

No selecciona IDs al azar ni depende del índice del Explorador. La población se obtiene directamente desde la base oficial y la muestra se distribuye de forma determinista entre el inicio y el final de la población ordenada:

```text
selection.method = EVENLY_SPACED_BILLABLE_SUBSCRIBERS
```

Esto permite repetir la auditoría sobre el mismo dataset y obtener la misma selección lógica.

El límite puede ampliarse hasta 2,000 casos y la concurrencia está limitada entre 1 y 8 para no convertir el benchmark en una prueba de carga (esa corresponde a una fase posterior).

## 6. Comando de auditoría

Desde `backend`:

```bash
npm run audit:financial:desafio1
```

Opciones:

```bash
npm run audit:financial:desafio1 -- --limit 100
npm run audit:financial:desafio1 -- --concurrency 4
npm run audit:financial:desafio1 -- --details
npm run audit:financial:desafio1 -- --json
npm run audit:financial:desafio1 -- --write
```

`--write` guarda por defecto:

```text
backend/data/phase16-financial-audit.local.json
```

El archivo está ignorado por Git porque es un artefacto local de auditoría.

Si existe cualquier violación, el comando termina con estado `FAIL` y `exitCode = 2`, para que el resultado pueda integrarse después al preflight integral del desafío.

## 7. Métricas del reporte

El reporte agregado contiene:

- `retrievalAccuracyPct`;
- `groundingAccuracyPct`;
- `policyCompliancePct`;
- `detectableFinancialHallucinationRatePct`;
- `financialClaimViolations`;
- `totalViolations`;
- `evaluatedAssertions`;
- cobertura de causas/hallazgos observados dentro de la muestra.

También publica salvaguardas explícitas:

```text
benchmarkGroundTruth = RAW_SQLITE_ROWS_AND_DETERMINISTIC_INVARIANTS
monetaryRounding = SYMMETRIC_HALF_AWAY_FROM_ZERO_TO_CENTS
structuralZeroAmountChangesIncluded = true
llmUsedForScoring = false
identifiersPrinted = false
```

No se asigna un porcentaje artificial cuando una categoría no tiene assertions evaluables; se conserva como `N/A`/`null`.

## 8. Trazabilidad por respuesta

Fase 16 añade una traza segura a las respuestas personales del backend:

```text
financialTrace
```

La traza resume:

```text
recibo actual/anterior recuperado
→ diferencia estructurada
→ versión/estado de reglas
→ monto explicado/no explicado
→ causas/hallazgos aplicados
→ nivel de evidencia
→ datasets consultados
→ estado de resolución del turno
```

La sesión conserva `lastFinancialTrace` para que fases posteriores puedan utilizar la evidencia ya calculada sin reconstruir una explicación a partir de texto libre.

### Lo que la traza NO contiene

No publica:

- `SUBSCRIBER_KEY`;
- `CUSTOMER_KEY`;
- número interno de factura;
- billing arrangement/cuenta financiera;
- `sourceRows`;
- teléfono o documento.

Los casos del benchmark usan únicamente aliases:

```text
AUD000001
AUD000002
...
```

La trazabilidad pública demuestra el proceso sin convertir el lineage interno en una filtración de identificadores.

## 9. Qué no hace Fase 16

Fase 16 **no**:

- modifica los montos o causas de Fase 3;
- convierte notas generales en causas;
- cambia la regla de suspensión de 14B;
- ofrece pago;
- hace cross-selling;
- modifica `resolutionStatus` de Fase 15;
- calcula todavía `Handoff Accuracy`;
- sustituye las pruebas de concurrencia/latencia.

La precisión del handoff necesita un conjunto de decisiones esperadas/etiquetadas y se instrumentará junto con la política de handoff y métricas correspondiente.

## 10. Condición de salida

Fase 16 queda cerrada cuando:

- el benchmark se ejecuta sobre datos oficiales locales sin usar LLM como juez;
- `Retrieval Accuracy` se calcula contra filas crudas e invariantes independientes;
- montos y causas estructuradas tienen controles de grounding;
- cualquier contradicción monetaria produce una violación visible y un benchmark `FAIL`;
- el reporte no expone identificadores privados;
- las respuestas personales incluyen una traza financiera segura;
- la afirmación de 0% queda limitada a claims financieros estructurados comprobables;
- la suite completa, preflight y smoke permanecen en verde.

La siguiente fase es la **matriz RA/RV × productos B2C × escenarios**, usando la evidencia ya auditada para medir cobertura real antes de implementar la capa comercial.
