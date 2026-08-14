# Desafío 1 · Fase 13 · Paquetes como causa financiera verificable

## Objetivo

Promover únicamente el escenario `PACKAGES` que Fase 12 clasificó como `MAPPED · HIGH` a una causa financiera determinista. La fase no promueve equipo financiado, suspensión, notas de crédito/débito ni la categoría genérica de otros cargos.

## Regla de identificación

Un concepto se considera paquete únicamente si FACTURACION contiene un marcador estructurado:

- `GRUPO = PAQUETES`, o
- `CHARGE_CODE_CLASSIFICATION` contiene la categoría `PAQUETE/PAQUETES`.

La palabra `paquete` en `CHARGE_CODE_DESC` por sí sola **no** es suficiente para crear una causa.

## Regla monetaria

La causa nunca toma el monto de una orden ni de un texto descriptivo. El impacto se deriva exclusivamente del delta del mismo `CHARGE_CODE_ID` entre el recibo actual y el anterior:

`impacto = monto_actual_del_cargo - monto_anterior_del_cargo`

Por tanto:

- cargo nuevo de paquete -> aumento verificable;
- cargo de paquete retirado -> reducción verificable;
- cargo de paquete que cambia -> solo se explica el delta exacto;
- paquete sin movimiento monetario -> no es causa de variación.

## Órdenes

Una orden entre ciclos que menciona activación, afiliación o desactivación de paquetes se conserva como soporte adicional cuando corresponde al mismo suscriptor. La orden **no es requisito** para afirmar que un cargo de paquete apareció/cambió en la factura y **no aporta el monto causal**.

Esto evita convertir una ausencia de orden en una falsa negativa, pero también evita afirmar que el cliente "compró" algo cuando la única evidencia es la propia facturación.

## Precedencia

Las causas más específicas conservan prioridad. En particular, si un cargo marcado como paquete también es proporcional y existe evidencia exacta de prorrateo, Fase 3 lo asigna a `PRORATION` y no vuelve a contarlo como `PACKAGES`.

## Experiencia de cliente

Lucía puede responder preguntas como:

- `¿Me cobraron algún paquete en mi recibo?`
- `¿Mi recibo cambió por un paquete?`

La respuesta usa la causa `PACKAGES` ya calculada. Si el motor no verificó una variación de paquete, Lucía se abstiene de inventarla.

## Cobertura masiva

Después de aplicar Fase 13 se debe regenerar el índice local:

```bash
npm run demo:coverage:desafio1
npm run demo:coverage:summary:desafio1
```

`PACKAGES` aparecerá en `Causas/hallazgos reconocidos` y el explorador permitirá filtrarlo. Esto mide el impacto real de la nueva regla sobre los 20,000 perfiles sin convertir `PACKAGES` en un escenario premium histórico de Fase 4.

## Estado funcional

Fase 11 pasa a considerar `Paquetes adicionales` como escenario consolidado. Los siguientes huecos permanecen sin promoción causal:

- cuota de equipo financiado: ambiguo;
- ajuste por suspensión: parcial;
- notas de crédito/débito: semántica pendiente;
- otros cargos adicionales: parcial y heterogéneo.

## Salvaguardas

- Sin LLM para decidir montos o causalidad.
- Sin inferir paquete desde texto libre únicamente.
- Sin sumar órdenes como importes.
- Sin doble conteo frente a prorrateos ya reclamados.
- Sin exponer `SUBSCRIBER_KEY`, `NUM_ANEXO`, cuentas financieras o hashes en la experiencia pública.
