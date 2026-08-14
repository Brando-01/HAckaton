# Desafío 1 · Fase 14 · Histórico verificable de recibos

## Objetivo

Ampliar la experiencia desde la comparación `actual vs. anterior` hacia una ventana de **hasta seis recibos**: el recibo actual y como máximo cinco recibos previos, tal como requiere la experiencia BrainyBill descrita para el desafío.

La Fase 14 no crea nuevas causas financieras. Su propósito es responder preguntas históricas usando exclusivamente importes y conceptos reconstruidos desde `FACTURACION-CLIENTES`.

## Regla de seguridad

El histórico se identifica por la misma suscripción (`NUM_ANEXO` / `SUBSCRIBER_KEY`) y nunca por `COD_CLIENTE`. Esto evita mezclar recibos de varios servicios pertenecientes al mismo cliente.

La ventana está limitada a:

- 1 recibo actual.
- hasta 5 recibos previos.
- máximo 6 recibos en total.

`FACTURACION-CLIENTES.csv` v2 corrige `PERIOD_START_DATE` y `PERIOD_END_DATE` para la mayoría de cargos. La migración los conserva como evidencia estructurada y normaliza `2222-01-01` a dato no disponible. Sin embargo, Fase 14 **no cambia su regla de ordenamiento ni convierte periodos en causas**: el histórico sigue ordenándose por `ciclo` y los periodos se reservan para auditorías posteriores de negocio.

## Capacidades nuevas

Lucía puede responder de forma determinista:

- `¿Cómo ha cambiado mi recibo en los últimos meses?`
- `Muéstrame mis últimos recibos.`
- `¿Cuál fue mi recibo más caro?`
- `¿Desde cuándo estoy pagando más?`
- `¿Este cargo aparece todos los meses?`
- `¿Este cobro fue único o recurrente?`

Las respuestas se limitan a la ventana disponible. Por ejemplo, si un cargo aparece una sola vez entre cuatro recibos, Lucía puede afirmar que **dentro de esos cuatro recibos** se comporta como puntual; no afirma que jamás haya aparecido antes.

## Recurrencia de cargos

La recurrencia prioriza `CHARGE_CODE_ID` como identidad del concepto. El texto del cargo solo se usa para permitir que el usuario señale un concepto por nombre.

Estados posibles:

- `ALL_AVAILABLE`: aparece en todos los recibos disponibles.
- `RECURRING`: aparece al menos dos veces, pero no en todos.
- `ONE_TIME_IN_WINDOW`: aparece una sola vez dentro de la ventana.
- `NOT_FOUND`: el concepto no aparece en el histórico cargado.

Si el usuario dice `este cargo` y el contexto no permite resolver inequívocamente cuál es, Lucía pide que lo especifique en lugar de seleccionar uno arbitrariamente.

## Rendimiento

El motor normal de explicación continúa reconstruyendo solamente el recibo actual y el anterior. Los cuatro intents históricos activan la lectura ampliada bajo demanda. Mi Movistar sí solicita la ventana completa porque presenta el histórico visualmente.

Así Fase 14 no incrementa el costo del barrido masivo de Fase 9 ni de todas las consultas financieras normales.

## Interfaz Mi Movistar

La vista `/app` incorpora `Historial de recibos` con los recibos realmente disponibles y un acceso a Lucía para preguntar por la evolución.

No se exponen:

- `SUBSCRIBER_KEY`.
- `NUM_ANEXO`.
- cuentas financieras.
- identificadores de factura internos.
- teléfonos o documentos.

## Límite de interpretación

La Fase 14 calcula tendencias, máximos, mínimos, diferencias y recurrencia. No convierte correlaciones históricas en causas. Las causas financieras siguen perteneciendo al motor causal verificado de Fases 3 y 13.

## Continuación posterior · Checkpoint 14B

Los periodos corregidos que Fase 14 conservó sin reinterpretar se reutilizan en Checkpoint 14B para una regla determinista de crédito por días suspendidos en renta adelantada. Esta extensión no modifica la ventana histórica ni convierte el histórico en razonamiento causal: el ajuste se publica como hallazgo verificable separado y no altera la suma de causas del cambio entre recibos.
