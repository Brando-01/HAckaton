# Desafío 1 · Fase 12 · Mapeo de escenarios financieros pendientes

## Objetivo

Fase 11 confirmó que las ocho fuentes oficiales están integradas y separó cobertura funcional de cobertura causal. Fase 12 no añade nuevas respuestas financieras a Lucía: audita los huecos restantes para determinar qué escenarios pueden mapearse de forma verificable antes de ampliar el motor causal.

Se analizan cinco frentes:

1. paquetes adicionales;
2. cuota de equipo financiado;
3. otros cargos adicionales;
4. ajustes por suspensión;
5. notas de crédito/débito.

La salida es agregada. No se publica `SUBSCRIBER_KEY`, `NUM_ANEXO`, `CUSTOMER_KEY`, cuenta financiera, teléfono, documento ni ningún vínculo DEMO ↔ suscriptor.

## Principio de Fase 12

Encontrar una palabra, una clasificación o dos eventos cercanos no demuestra por sí solo una causa financiera. El objetivo es encontrar **marcadores estructurados candidatos** y separar:

- `MAPPED`: existe un marcador estructurado suficientemente directo para pasar a reconciliación monetaria en Fase 13;
- `PARTIAL`: existe evidencia útil, pero no alcanza para una regla causal única;
- `AMBIGUOUS`: existen señales, pero pueden representar fenómenos distintos;
- `SEMANTICS_PENDING`: el patrón de datos es medible, pero falta confirmar su significado de negocio;
- `NOT_MAPPABLE`: la entrega actual no aporta una señal suficiente.

## Paquetes

FACTURACION permite detectar paquetes mediante `GRUPO = PAQUETES` y clasificaciones específicas como `Cargo Unico Paquete`, `Cargo Recurrente Paquete` o `PAQUETE Fija`. ORDENES también puede aportar eventos explícitos de activación/afiliación de paquetes.

Esto permite mapear el escenario, pero Fase 12 **no afirma todavía que un paquete explique una variación**. Fase 13 deberá comparar recibos y reconciliar el delta del cargo.

## Equipo financiado

Los materiales del desafío confirman que una cuota de equipo financiado puede formar parte del recibo. Sin embargo, una señal textual de “financiamiento” no se toma como equivalente.

En particular, un concepto como **“Financiamiento de Deuda Móvil” no equivale automáticamente a una cuota de equipo**. Del mismo modo, `SUB_GRUPO = EQUIPOS` puede corresponder a equipamiento o puntos adicionales de servicios fijos y no necesariamente a financiamiento de terminal.

Fase 12 mide por separado:

- cargos que mencionan explícitamente equipo/terminal/cuota;
- cargos que mencionan financiamiento;
- cargos descritos como financiamiento de deuda;
- filas del subgrupo EQUIPOS;
- órdenes relacionadas con equipo o CAEQ.

Mientras no exista un marcador inequívoco y conciliable con el recibo, el escenario permanece ambiguo y no se promueve a causa.

## Otros cargos adicionales

Se consideran señales explícitas, entre otras:

- `TRAFICO ADICIONAL`;
- `ROAMING`;
- cargos recurrentes de servicios;
- ciertos cargos únicos fuera de categorías ya consolidadas.

Tráfico adicional y roaming son subtipos claros. La categoría general “otros cargos adicionales” sigue siendo parcial porque agruparlos bajo una sola causa podría ocultar significados de negocio diferentes.

## Suspensión

ORDENES contiene eventos de suspensión/corte. FACTURACION contiene cargos proporcionales. Fase 12 calcula también cuántos recibos con proporcionales aparecen temporalmente cerca de un evento de suspensión del mismo `SUBSCRIBER_KEY`.

Esa coocurrencia es solo una **señal de investigación**. No se considera evidencia causal suficiente mientras no exista una regla que demuestre qué días se descontaron o ajustaron y cómo ese efecto reconcilia con el recibo.

## Notas de crédito/débito

Fase 12 caracteriza `CANCEL_CHARGE_TYPE`, signo de `AMOUNT` y capacidad de cruce por suscripción, código de cargo y ciclo. Aunque los tipos presenten un patrón de signo consistente, no se asigna por inferencia el significado financiero de `CRD` o `DSC`.

La semántica debe confirmarse con negocio antes de convertir una nota en causa. Hasta entonces, las notas continúan siendo evidencia/contexto.

## Ejecución

```bash
npm run data:scenario-mapping:desafio1
```

El mismo reporte agregado se expone en:

```text
GET /api/demo/scenario-mapping
```

y se visualiza en el Dashboard como **Fase 12 · Mapeo de escenarios**.

## Paso a Fase 13

Fase 13 solo debe convertir un mapeo en nueva causa cuando se cumplan las dos condiciones:

1. la semántica del concepto/evento es inequívoca;
2. el impacto monetario se reconcilia con la diferencia observada entre recibos o con el recibo actual cuando no existe histórico.

Esto preserva la política de 0% de invenciones financieras y evita mejorar la “cobertura” a costa de precisión.

## Revalidación posterior · Checkpoint 14B

La actualización de `FACTURACION-CLIENTES` corrigió los periodos de cargo y permitió volver a evaluar suspensión con una regla más fuerte que la coocurrencia usada originalmente en Fase 12.

El escenario `SUSPENSION_ADJUSTMENT` pasa a `MAPPED · HIGH` **como hallazgo verificable**, no como causa del cambio entre recibos. La regla exige simultáneamente renta adelantada inequívoca, nota negativa `CRD`, periodo exacto corte → día anterior a reconexión y conciliación del monto por días contra el cargo neto facturado.

La semántica general de `ADJUSTMENT_NOTES` permanece `SEMANTICS_PENDING`: resolver el subconjunto de suspensión no autoriza a interpretar automáticamente todas las notas `CRD`/`DSC`.
