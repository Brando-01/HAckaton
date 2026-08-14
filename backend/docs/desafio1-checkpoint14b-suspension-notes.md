# Desafío 1 · Checkpoint 14B · Ajustes por suspensión y notas verificables

## Objetivo

Aprovechar los periodos corregidos de `FACTURACION-CLIENTES.csv` v2 para reauditar dos huecos que Fase 12 dejó deliberadamente abiertos:

- ajuste por días de suspensión;
- semántica de notas de crédito/débito.

El checkpoint no relaja la política de evidencia. Una orden de suspensión, una nota o una proximidad temporal aislada siguen sin bastar para afirmar una causa financiera.

## Regla de negocio utilizada

El material de capacitación de facturación entregado junto con el desafío describe, para **renta adelantada (RA)**, que los días facturados pero no consumidos durante una suspensión pueden reflejarse mediante una nota de crédito y tomarse en cuenta como días pagados/ajustados.

Esa regla de negocio se usa únicamente para buscar un subconjunto demostrable en la data. No se extrapola automáticamente a renta vencida ni a todas las notas `CRD`/`DSC`.

## Regla determinista confirmada

Un registro se publica como `SUSPENSION_ADJUSTMENT` únicamente cuando se cumplen simultáneamente estas condiciones:

1. existe una nota con importe negativo y `CANCEL_CHARGE_TYPE = CRD`;
2. el `CHARGE_CODE` de la nota corresponde a un código con tipo de renta **RA inequívoco** en catálogo;
3. la nota pertenece a la misma suscripción y al ciclo de la factura que contiene la evidencia de reconexión;
4. `PERIOD_START_DATE` de la nota coincide exactamente con la fecha de corte;
5. `PERIOD_END_DATE` de la nota coincide exactamente con el día anterior a la reconexión;
6. existe un componente de `FACTURACION` del mismo `CHARGE_CODE` cuyo periodo contiene por completo el periodo de la nota;
7. el componente tiene `CHARGE_NET_AMOUNT > 0`;
8. el importe de la nota reconcilia en centavos con:

```text
crédito esperado =
CHARGE_NET_AMOUNT × días suspendidos / días del periodo facturado
```

La tolerancia usa la misma política monetaria del motor: comparación después de redondear a dos decimales.

## Resultado sobre la entrega actual

La auditoría agregada, deduplicando notas lógicamente equivalentes, encuentra:

- notas negativas `CRD` con línea de tiempo corte → día anterior a reconexión: **793**;
- candidatas de ese conjunto con código inequívoco RA: **731**;
- notas que además reconcilian monetariamente: **678**;
- suscriptores con al menos una coincidencia verificada: **523**;
- candidatas RA con línea de tiempo exacta pero sin conciliación monetaria suficiente: **53**.

Las 53 no conciliadas permanecen como contexto; no se fuerzan a verde.

## Por qué es un hallazgo y no una causa del delta mensual

`NOTAS_CREDITO` aporta evidencia de un ajuste, pero ese importe no debe sumarse automáticamente a la diferencia entre los totales reconstruidos de dos recibos.

Por eso el motor crea:

```text
SUSPENSION_ADJUSTMENT
  evidenceLevel: HIGH
  causalImpact: false
```

El hallazgo puede responder preguntas como:

```text
¿Me descontaron los días que estuve suspendido?
```

pero no modifica:

- el total reconstruido del recibo;
- `explainedNetAmount`;
- `unexplainedAmount`;
- las causas que explican la variación entre recibos.

La salvaguarda queda explícita como:

```text
suspensionCreditsAddedAsVariationCauses: false
```

## Semántica general de notas

Checkpoint 14B **no** declara resuelta la semántica general de `CRD` y `DSC`.

Solo se resolvió el subconjunto que cumple la regla anterior. El resto conserva:

```text
ADJUSTMENT_NOTE_CONTEXT
```

y `ADJUSTMENT_NOTES` permanece como `SEMANTICS_PENDING` en la auditoría de mapeo.

Esto es necesario porque los materiales de negocio muestran otros motivos capaces de producir notas o saldos a favor, por ejemplo cambios/totalización de servicios. Por tanto:

```text
nota de crédito != suspensión
```

sin evidencia adicional.

## Presentación al cliente

Lucía puede presentar únicamente el resultado verificado, por ejemplo:

```text
Se verificó un ajuste de S/ X.XX a tu favor por N días sin servicio,
del DD/MM/AAAA al DD/MM/AAAA.
```

No expone:

- `CRD`;
- `SUBSCRIBER_KEY`;
- cuentas financieras;
- nombres de tablas/CSV;
- filas internas de evidencia.

Si no existe coincidencia completa, responde con abstención y no infiere el ajuste a partir de una reconexión aislada.

## Explorador

`SUSPENSION_ADJUSTMENT` se incorpora como filtro del Explorador de Dataset. Esto permite encontrar perfiles con hallazgo verificado para prueba manual sin convertirlos en cuentas nuevas ni publicar la llave oficial.

El hallazgo cuenta como capacidad `HIGH` dentro de la cobertura masiva, pero **no** se convierte en escenario `demoPremium` de Fase 4 porque no es una causa de variación.

## Auditorías esperadas

```bash
npm run data:scenario-mapping:desafio1
npm run data:functional-coverage:desafio1
```

El mapeo debe mostrar suspensión como `MAPPED · HIGH`, pero `canPromoteToCause = false`. La cobertura funcional puede presentar `Ajuste por suspensión` como consolidado porque ya existe una regla verificable de hallazgo.

Las notas de crédito/débito generales continúan como solo contexto / semántica pendiente.
