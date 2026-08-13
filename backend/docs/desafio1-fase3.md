# Desafío 1 · Fase 3 — causas financieras verificables

Esta fase se monta **encima de Fase 2**. Su objetivo es pasar de:

```text
recibo + comparación + evidencia
```

a:

```text
causas verificadas + monto explicado + monto no explicado + texto seguro
```

Todavía **no conecta Lucía ni los usuarios demo**. La salida queda preparada para que
la capa conversacional la consuma después sin pedirle al LLM que calcule importes o
invente causalidad.

## Principio de seguridad

El monto de una causa siempre se toma del **delta de un cargo de FACTURACION-CLIENTES**.
Brainy, órdenes y otras fuentes sirven para **clasificar y respaldar** ese delta, no
para sumar montos de forma independiente.

Esto evita doble conteo cuando una misma situación aparece en varias fuentes.

Ejemplo:

```text
FACTURACIÓN              +4.58 OC1_RECONEXION
BRAINY RECONEXIONES      4.58
ORDENES                  Reactivación con Cargo

=> una causa de +4.58, no +9.16 ni +13.74
```

## Reglas implementadas

### 1. Reconexión — HIGH

Se asigna `RECONNECTION` solo cuando:

1. existe un cambio positivo del cargo en la comparación;
2. Brainy Reconexiones contiene el mismo `code`;
3. la suma de eventos Brainy únicos coincide exactamente con el delta del cargo.

Órdenes de suspensión/reactivación se conservan como evidencia adicional, pero no son
necesarias para inventar el monto.

La regla fue validada localmente contra casos de la entrega oficial con factura,
Brainy y órdenes concordantes. Los identificadores y valores concretos de esos casos no
se incluyen en documentación versionada.

### 2. Fin de descuento/promoción — HIGH/MEDIUM

Se parte de un **cargo negativo de descuento** que estaba en el recibo anterior y ya
no está en el actual.

Para relacionarlo con Brainy se exige:

- misma descripción normalizada;
- mismo monto en valor absoluto;
- ausencia de la misma promoción en el ciclo actual.

Se marca `DISCOUNT_ENDED` con evidencia `HIGH` cuando Brainy además indica que se llegó
a la última cuota/mes de la promoción o que su fecha de término ya fue alcanzada.

Si existe coincidencia del descuento anterior, pero no hay suficiente respaldo para
afirmar su fecha de término, se utiliza `DISCOUNT_REMOVED` con evidencia `MEDIUM`.

La regla fue validada localmente con casos en los que el cargo negativo desaparece y
Brainy confirma descripción, monto y término de la promoción. Los ejemplos concretos
se mantienen fuera del repositorio.

### 3. Cambio de plan — HIGH

No se interpreta cualquier orden `Cambiar` como un cambio de plan.

Se exige simultáneamente:

1. una orden explícita como `Cambio de Plan`, `Hacia un plan menor - Retención` o
   `Hacia un plan mayor - Retención` entre ambos ciclos;
2. una transición verificable de cargos clasificados como plan.

La regla fue validada localmente con casos que combinan una orden explícita de cambio
de plan y sustitución verificable de cargos. Los identificadores de esos casos no se
versionan.

### 4. Prorrateo — HIGH

Fase 2 agrupaba por charge code. Para comprobar el prorrateo con precisión, Fase 3
conserva también los componentes físicos de cada concepto (`components`).

Un prorrateo se presenta como verificado solo cuando:

1. Brainy Prorrateo registra el monto;
2. dentro del recibo existe un componente cuyo grupo/subgrupo contiene
   `PROPORCIONAL`;
3. el importe de ese componente coincide exactamente con Brainy.

Si además existe un recibo anterior y el mismo importe coincide con el delta del
charge code, el prorrateo puede asignarse como causa de la variación. Si no existe un
recibo anterior, se presenta como **hallazgo del recibo actual**, no como comparación
inventada.

La regla fue validada localmente con primeros recibos que contienen prorrateos
respaldados por Brainy. En esos casos el motor devuelve `NO_PREVIOUS_BILL` y explica el
prorrateo sin afirmar un aumento respecto de un mes anterior inexistente. Los datos
concretos de validación no se incluyen en el repositorio.

## Renta adelantada / renta vencida

Las reglas de los videos de capacitación se usan como **definiciones de negocio**, no
como fórmula para recalcular importes.

- `RA` — Renta adelantada: el periodo está identificado como cobrado por adelantado.
- `RV` — Renta vencida: el periodo está identificado como facturado después de
  transcurrido.

La clasificación solo se muestra cuando Fase 2 encontró evidencia explícita en el
catálogo, Brainy o la descripción. Si aparecen RA y RV simultáneamente, se marca como
ambiguo en vez de elegir uno.

## Notas de crédito/débito

`NOTAS_CREDITO.csv` se conserva como contexto (`ADJUSTMENT_NOTE_CONTEXT`).

**No se suma automáticamente como causa.** Los valores `CRD`/`DSC`, el signo del monto
y el efecto final sobre la factura no deben interpretarse más allá de lo que permiten
las relaciones del dataset. Si una fase posterior quiere convertir una nota en causa,
debe existir una regla adicional que la concilie con un cambio de cargo específico.

## Campos temporales

`billing_cycle_date` se usa para ordenar recibos y delimitar eventos entre ciclos.
No se presenta como `fecha de emisión`.

Esto es deliberado porque en la entrega actual existen recibos cuyo
`FECHA-VENCIMIENTO` es anterior al valor de `ciclo`. Fase 3 mantiene la salvaguarda:

```text
cycleDateAssumedAsIssueDate = false
```

## Cobertura y monto no explicado

Para cada comparación se calcula:

```text
explainedNetAmount = suma neta de los deltas reclamados por reglas
unexplainedAmount = diferencia total - explainedNetAmount
coveragePercent = suma absoluta de movimientos reclamados / suma absoluta de todos los movimientos
```

La cobertura usa movimientos absolutos para no dar resultados engañosos cuando un
aumento verificado se compensa con una reducción todavía no explicada.

Estados posibles:

- `FULLY_EXPLAINED`: residual menor a medio céntimo;
- `PARTIALLY_EXPLAINED`: hay causas, pero queda residual;
- `UNEXPLAINED`: ninguna regla segura explica la variación;
- `NO_VARIATION`: ambos recibos tienen el mismo total;
- `NO_PREVIOUS_BILL`: no existe un recibo anterior para comparar.

El motor nunca crea una causa genérica para forzar cobertura de 100 %.

## Salida preparada para Lucía

`billingExplanationService.js` devuelve el objeto completo de Fase 2 y añade:

```text
interpretation
  ├─ status
  ├─ difference
  ├─ explainedNetAmount
  ├─ unexplainedAmount
  ├─ coveragePercent
  ├─ causes[]
  ├─ currentBillFindings[]
  ├─ rentContext
  ├─ unexplainedChanges[]
  └─ diagnostics

customerFacing
  ├─ headline
  ├─ summary
  ├─ details[]
  └─ limitations[]
```

`customerFacing` se genera con plantillas deterministas. Un LLM podrá reformularlo en
una fase posterior, pero no tendrá permiso para cambiar montos, fechas o causas.

## Prueba manual

Usa un `SUBSCRIBER_KEY` de la copia local del dataset oficial; no agregues ese
identificador a documentación o fixtures versionados.

```bash
npm run billing:explain:desafio1 -- --subscriber <SUBSCRIBER_KEY_LOCAL>
```

Objeto completo:

```bash
npm run billing:explain:desafio1 -- --subscriber <SUBSCRIBER_KEY_LOCAL> --json
```

## Fuera de alcance deliberadamente

Por ahora el motor **no** clasifica automáticamente:

- cuota de equipo financiado, porque la entrega actual no ofrece un marcador
  suficientemente inequívoco para construir una regla financiera segura;
- cualquier `Cambiar` como cambio de plan;
- cualquier nota de crédito/débito como impacto monetario;
- una causa por semejanza semántica sin conciliación de montos.

Es preferible devolver `unexplainedAmount` antes que completar una explicación con una
suposición.
