# Desafío 1 · Fase 17 · Matriz RA/RV × productos B2C × escenarios

## 1. Objetivo

La ficha del desafío exige demostrar escenarios críticos de facturación en renta adelantada y renta vencida y para los productos B2C. Fase 17 convierte esa frase en una auditoría reproducible sobre los datos oficiales.

La regla central es:

```text
NO poner ✓ por soporte teórico.
VERIFIED = existe al menos un caso real del dataset con evidencia HIGH
           + renta RA/RV resuelta
           + razonamiento financiero determinista.
```

Por eso la matriz diferencia explícitamente entre cobertura demostrada, caso observado sin confianza suficiente, ausencia de caso verificable, falta de población con renta resuelta y escenario pendiente de mapeo.

## 2. Fuente de verdad

La matriz no usa prompts ni LLM para decidir cobertura. Recorre `PLANTA CLIENTES` mediante el repositorio oficial y, para cada suscripción con facturación, reutiliza el mismo servicio de explicación determinista de Fases 2–3.

Flujo:

```text
PLANTA CLIENTES
  ↓
subscriber interno (solo backend)
  ↓
explicación estructurada vigente
  ↓
causas / hallazgos + evidencia + ruleId
  ↓
renta del escenario o contexto estructurado del recibo
  ↓
agregación segura por negocio / lob_type / RA-RV
  ↓
matriz B2C
```

La salida agregada nunca publica el subscriber, customer key, factura, cuenta financiera, teléfono, documento ni source rows.

## 3. Dimensiones B2C

No se hardcodea una lista teórica de productos. Las dimensiones se descubren desde los valores presentes en `PLANTA CLIENTES`:

- `negocio`: matriz principal, porque representa la familia comercial disponible en la fuente;
- `lob_type`: desglose granular dentro de cada negocio;
- `RA` / `RV`: modalidad de renta resuelta por evidencia estructurada.

Se generan dos matrices críticas:

```text
A) negocio × RA/RV
B) negocio + lob_type × RA/RV
```

La segunda evita afirmar que cubrir una familia de negocio implica automáticamente cubrir todos sus LOB observados.

## 4. Escenarios críticos

La matriz principal usa exactamente los cinco escenarios críticos priorizados por el desafío:

```text
PRORATION            Prorrateo
FINANCED_EQUIPMENT   Cuota de equipo financiado
RECONNECTION         Reconexión tras suspensión
DISCOUNT_ENDED       Fin de descuento
PLAN_CHANGE          Cambio de plan
```

También se reporta cobertura adicional ya consolidada para:

```text
PACKAGES
SUSPENSION_ADJUSTMENT
```

Estos escenarios adicionales no sustituyen ninguno de los cinco críticos.

## 5. Regla de verificación de una celda

Una celda recibe `VERIFIED` solo cuando al menos un caso cumple simultáneamente:

1. el escenario aparece realmente en `causes` o `currentBillFindings`;
2. su nivel de evidencia más alto es `HIGH`;
3. la renta del escenario se resuelve como `RA` o `RV`;
4. `llmUsedForFinancialReasoning === false`;
5. el caso pertenece al `negocio` / `lob_type` de la celda.

La renta se intenta resolver en este orden:

```text
rentType explícito dentro de la evidencia del escenario
  ↓
rentType de los charge codes reclamados en el recibo actual/anterior
  ↓
contexto de renta del recibo actual si está resuelto
```

Si una misma evidencia contiene RA y RV de forma incompatible, la renta queda ambigua y el caso no recibe `VERIFIED`.

## 6. Estados de celda

```text
VERIFIED
  Existe ≥1 caso HIGH observado con renta resuelta.

OBSERVED_NOT_HIGH_CONFIDENCE
  Existe el escenario para esa combinación, pero no cumple el contrato HIGH/renta/guardas.

NO_VERIFIED_CASE
  Existe población para la combinación, pero no se observó un caso verificable del escenario.

NO_RESOLVED_RENT_POPULATION
  No hay población consultable cuya renta actual quede resuelta en esa combinación.

PENDING_MAPPING
  El escenario todavía no tiene una regla causal inequívoca y no puede recibir ✓.
```

La ausencia de `VERIFIED` significa únicamente **“no demostrado con la evidencia actual”**. No significa automáticamente que Movistar no soporte funcionalmente esa combinación en producción.

## 7. Equipo financiado permanece como límite conocido

`FINANCED_EQUIPMENT` se conserva como `PENDING_MAPPING`.

La auditoría previa encontró señales relacionadas con financiamiento/equipamiento, pero no una relación inequívoca que permita afirmar que un cargo corresponde a una **cuota de equipo financiado**. Por eso Fase 17 no convierte esas señales en causa ni marca celdas como soportadas.

Esto es deliberado:

```text
señal ambigua de financiamiento ≠ cuota de equipo financiado verificada
```

La matriz está diseñada para hacer visible ese límite en lugar de esconderlo.

## 8. Ejecución

Desde `backend/`:

```bash
npm run audit:b2c-matrix:desafio1
```

Por defecto no existe `--limit`: se recorre toda la población disponible.

Prueba rápida:

```bash
npm run audit:b2c-matrix:desafio1 -- --limit 500
```

Una ejecución limitada queda obligatoriamente:

```text
SAMPLE_ONLY
```

y no debe citarse como cobertura total.

Desglose granular:

```bash
npm run audit:b2c-matrix:desafio1 -- --details
```

Salida JSON por consola:

```bash
npm run audit:b2c-matrix:desafio1 -- --json
```

Persistencia local:

```bash
npm run audit:b2c-matrix:desafio1 -- --write
```

Genera por defecto:

```text
backend/data/phase17-b2c-matrix.local.json
```

Ese artefacto está ignorado por Git.

## 9. Estado global

La fase usa cuatro estados globales:

```text
PASS
  Toda celda crítica exigida quedó verificada.

KNOWN_LIMITS
  La matriz completa se generó sin errores, pero existen celdas no verificadas
  o escenarios pendientes de mapeo.

SAMPLE_ONLY
  Se ejecutó con --limit; el resultado no representa la población completa.

REVIEW_REQUIRED
  Hubo uno o más errores de análisis durante el barrido.
```

`KNOWN_LIMITS` es un resultado válido y explícito: permite defender exactamente qué está probado y qué falta, sin convertir huecos del dataset en falsos positivos.

## 10. Privacidad y trazabilidad

El reporte público contiene únicamente:

- conteos agregados;
- `negocio` y `lob_type` observados;
- RA/RV;
- códigos de escenario;
- estados de celdas;
- metadata agregada de lineage.

No contiene:

- `SUBSCRIBER_KEY`;
- `CUSTOMER_KEY`;
- factura interna;
- billing arrangement;
- cuenta financiera;
- teléfono/documento;
- `sourceRows`.

El escaneo puede utilizar claves privadas internamente para consultar SQLite, pero se descartan antes de formar la observación agregable.

## 11. Relación con Fase 16

Fase 16 demostró Retrieval Accuracy / grounding con un benchmark separado. Fase 17 no reemplaza esa auditoría ni vuelve a juzgar montos; utiliza la explicación estructurada vigente para responder otra pregunta:

> ¿En qué combinaciones reales de negocio/producto y RA/RV tenemos casos verificables para cada escenario crítico?

Por eso aumentar cobertura nunca debe reducir las salvaguardas de precisión de Fase 16.

## 12. Limpieza de parches locales

Los archivos `*.patch` colocados temporalmente en la raíz del repositorio quedan ignorados mediante:

```text
/*.patch
```

Fase 17 elimina del árbol versionado el parche correctivo de Fase 16 que se había incluido accidentalmente en el commit. El código de Fase 16 permanece intacto; únicamente se retira el artefacto de transporte.

## 13. Condición de salida

Fase 17 queda cerrada cuando:

- suite completa en verde;
- escaneo completo sin `analysisErrors`;
- estado `PASS` o `KNOWN_LIMITS`, nunca `SAMPLE_ONLY` para el resultado final;
- matrices negocio × RA/RV y negocio + lob_type × RA/RV generadas;
- ninguna celda `VERIFIED` proviene de soporte teórico;
- equipo financiado sigue pendiente salvo que aparezca una regla inequívoca nueva;
- el reporte no expone identificadores privados;
- Fase 16 sigue en PASS;
- preflight y smoke continúan en verde.

La salida esperable con las fuentes actuales puede ser `KNOWN_LIMITS`; eso no es un fallo si refleja honestamente combinaciones sin caso verificable o el pendiente de equipo financiado.

La siguiente fase del roadmap es la política comercial restrictiva / cross-selling y Efecto Efervescente, construida solo después de conocer qué cobertura financiera está realmente demostrada.
