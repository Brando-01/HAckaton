# Desafío 1 · Checkpoint 14A · Migración FACTURACION v2

## Objetivo

Adoptar de forma controlada la versión actualizada de `FACTURACION-CLIENTES.csv` sin cambiar todavía las reglas causales de Fases 3, 13 o 14.

La actualización conserva el universo financiero observado en la entrega anterior, pero corrige el layout y vuelve utilizables los periodos de los cargos. También retira dos columnas auxiliares que el prototipo no debe intentar reconstruir por inferencia.

## Cambios de layout

La fuente canónica pasa a ser:

```text
FACTURACION-CLIENTES.csv
```

con separador `,`.

El layout v2:

- incorpora `PRIMARY_RESOURCE_VALUE`;
- incorpora `SUBSCRIBER_KEY_1` como duplicado de control;
- corrige `PERIOD_START_DATE` y `PERIOD_END_DATE`;
- elimina `DEUDA`;
- elimina `FECHA-VENCIMIENTO`.

`PRIMARY_RESOURCE_VALUE` y `SUBSCRIBER_KEY_1` forman parte del contrato de entrada, pero **no se persisten en `d1_facturacion`**.

## Baseline observado en el CSV recibido

La migración se diseñó contra el archivo actualizado entregado para este checkpoint. La auditoría local previa al parche observó:

- `297,002` filas, igual que la entrega anterior;
- `18,450` suscripciones y `98,389` recibos, igual que la entrega anterior;
- los campos financieros comunes de ambas entregas forman el mismo multiconjunto después de normalizar representación numérica (`60.3` vs `60.30`);
- `282,846` filas (`95.23%`) tienen inicio y fin de periodo reales utilizables;
- `10,299` filas usan `2222-01-01` como fin técnico/no aplicable;
- `0` periodos reales tienen fin anterior al inicio;
- `0` filas presentan diferencia entre `SUBSCRIBER_KEY` y `SUBSCRIBER_KEY_1`.

Estos valores son un **baseline de esta entrega**, no constantes de negocio. La importación no los hardcodea: valida estructura y consistencia sobre el archivo que se coloque localmente.

## Control de suscripción

`SUBSCRIBER_KEY` continúa siendo la llave canónica de FACTURACION.

Durante la importación se exige:

```text
SUBSCRIBER_KEY == SUBSCRIBER_KEY_1
```

Si una fila no cumple esa igualdad o uno de los dos campos falta, la importación se detiene. El mensaje de error indica la fila, pero no imprime el identificador privado.

## Periodos corregidos

`PERIOD_START_DATE` se normaliza como datetime.

`PERIOD_END_DATE` usa una normalización específica para FACTURACION v2:

```text
2222-01-01
    ↓
sentinel técnico
    ↓
NULL semántico
```

Ese valor no cuenta como error de parseo y nunca se expone como una fecha real.

La validación posterior a la importación también bloquea la base si encuentra un periodo real cuyo fin sea anterior al inicio.

## Deuda y vencimiento

La versión v2 ya no entrega `DEUDA` ni `FECHA-VENCIMIENTO`.

Por tanto:

- `d1_facturacion` deja de persistir `debt_status` y `due_date`;
- Mi Movistar mantiene `dueDate: null`;
- una consulta por estado de deuda solo responde un estado cuando existe evidencia explícita;
- si el estado no está disponible, Lucía se abstiene y explica que no puede verificarlo;
- ante `¿Cuánto debo?`, Lucía puede informar el total reconstruido del recibo como referencia, pero aclara que no dispone de un saldo pendiente verificable separado y **no equipara total facturado con deuda pendiente**;
- no se infiere deuda desde el total, el ciclo, cargos positivos o cualquier otra heurística.

Esta limitación deberá considerarse en la Fase 15 al definir acciones de pago.

## Compatibilidad con Fase 14

La migración **no reescribe el histórico**.

Fase 14 continúa:

- recuperando el recibo actual + hasta cinco previos;
- ordenando por `ciclo`;
- calculando tendencia y recurrencia por datos estructurados;
- sin usar los periodos corregidos como una nueva causa financiera.

Los periodos quedan disponibles para el Checkpoint 14B, donde se reauditará la relación entre suspensión, notas de crédito/débito y facturación.

## Reimportación requerida

Después de aplicar el parche:

1. reemplazar localmente `FACTURACION-CLIENTES_.csv` por `FACTURACION-CLIENTES.csv`;
2. mantener los otros siete CSV oficiales sin cambios;
3. volver a ejecutar la importación completa para regenerar `backend/data/desafio1.db`;
4. regenerar cobertura y mapeo demo porque ambas bases derivadas dependen del DB oficial;
5. ejecutar tests, preflight y smoke antes de continuar al Checkpoint 14B.

El CSV oficial sigue siendo local y no debe entrar al commit.

## Secuencia de validación recomendada

Desde `backend/`, después de colocar el CSV v2 y conservar las otras siete fuentes:

```bash
npm run data:import:desafio1
npm run data:validate:desafio1
npm run data:functional-coverage:desafio1
npm run data:scenario-mapping:desafio1
npm run demo:rank:desafio1
npm run demo:configure:desafio1
npm run demo:coverage:desafio1
npm test
npm run demo:preflight:desafio1
npm run demo:smoke:desafio1
```

`demo:rank:desafio1` se vuelve a ejecutar para no reutilizar un ranking local generado con la huella del CSV anterior. La cobertura masiva también debe regenerarse porque su índice deriva de `desafio1.db`.

El checkpoint se considera cerrado solo si la importación/validación no reporta errores, la regresión permanece verde y preflight/smoke siguen listos después de reconstruir los artefactos locales.
