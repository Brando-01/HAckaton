# Desafío 1 · Fase 2 — reconstrucción de recibos y evidencia

Esta fase se monta **encima de la Fase 1**. No reemplaza `app.db`, no cambia todavía
a Carlos/Ana, no modifica Lucía y no decide aún la causa financiera de una variación.

## Objetivo

Convertir `desafio1.db` en una capa de consulta segura y determinista capaz de:

1. localizar un suscriptor de `PLANTA CLIENTES`;
2. obtener sus dos recibos más recientes;
3. reconstruir cada recibo a partir de todas las filas de `FACTURACION-CLIENTES`;
4. comparar los conceptos por `CHARGE_CODE_ID`;
5. verificar que la suma de los cambios concilie con la variación total;
6. adjuntar evidencia estructurada de:
   - Brainy Prorrateo;
   - Brainy Reconexiones;
   - Brainy Descuentos/Cuotas;
   - Notas de crédito/débito;
   - órdenes ocurridas entre ambos ciclos;
7. conservar trazabilidad hasta `source_row`;
8. colapsar duplicados físicos de Brainy sin multiplicar montos.

## Decisiones importantes

### El recibo se reconstruye por número de factura

Un `LEGAL_INVOICE_NUMBER` puede contener cargos de más de un `SUBSCRIBER_KEY` dentro
del mismo billing arrangement. Por eso se usa el suscriptor solo para encontrar sus
recibos y luego se reconstruye **la factura completa** por `LEGAL_INVOICE_NUMBER`.

### Los duplicados Brainy no se suman automáticamente

En los archivos Brainy existen múltiples filas físicamente idénticas para un mismo
evento. La Fase 2 las agrupa como un único registro de evidencia y conserva:

- `occurrences`: cuántas veces apareció físicamente;
- `sourceRows`: qué filas originales lo respaldan.

Esto evita convertir, por ejemplo, diez copias de un cargo de S/ 4.58 en S/ 45.80.

### `NO CONSIDERAR` no se elimina del total

Las filas cuyo `GRUPO` es `NO CONSIDERAR` siguen formando parte de la reconstrucción
matemática del recibo. Solo quedan marcadas con `ignoreForExplanation` para que las
fases posteriores puedan evitar ruido al explicar diferencias.

### Tipo de renta

Por ahora solo se adjunta como dato estructurado:

1. `CATALOGO-OFERTAS.TIPO DE RENTA`, cuando existe un único valor;
2. en ausencia de catálogo, un prefijo explícito `RA` o `RV` en la descripción.

Si no hay evidencia suficiente, queda `null`. La interpretación de RA/RV y las reglas
de negocio de los videos se aplicarán en la Fase 3.

### Esta fase NO suma evidencia como causas

Prorrateo, reconexión, descuento y nota pueden representar fuentes que se superponen.
Por eso la Fase 2 **no** calcula todavía `explainedAmount` ni afirma que una evidencia
sea la causa de una variación. Esa asignación corresponde a la Fase 3.

## Archivos principales

- `services/desafio1Repository.js`: consultas SQL indexadas sobre `desafio1.db`.
- `services/desafio1BillingLogic.js`: reconstrucción, comparación y deduplicación.
- `services/billingAnalysisService.js`: orquesta el análisis de un suscriptor.
- `scripts/inspeccionarFacturacionDesafio1.js`: inspección manual desde terminal.

## Prueba manual

Después de importar la Fase 1:

```bash
npm run billing:inspect:desafio1 -- --subscriber <SUBSCRIBER_KEY>
```

Para ver el objeto completo:

```bash
npm run billing:inspect:desafio1 -- --subscriber <SUBSCRIBER_KEY> --json
```

La salida debe mostrar:

- recibo actual y anterior;
- total reconstruido;
- diferencia;
- `Conciliación de diferencias: OK`;
- cambios por charge code;
- conteos de evidencia;
- órdenes entre los dos ciclos.

## Contrato para la Fase 3

La Fase 3 debe consumir este resultado y convertir evidencia en causas **solo mediante
reglas verificables**. No debe pedirle al LLM que descubra o calcule los montos desde
los CSV.
