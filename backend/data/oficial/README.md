# Dataset oficial · Desafío 1

Esta carpeta es **solo local**. Los archivos entregados por Movistar no deben subirse al repositorio.

## Archivos CSV esperados por la Fase 1

Copia aquí, manteniendo exactamente estos nombres:

- `PLANTA CLIENTES.csv`
- `FACTURACION-CLIENTES_.csv`
- `Ordenes.csv` (también se acepta `Ordenes(1).csv` si Windows/navegador lo renombró al descargar)
- `CATALOGO-OFERTAS.csv`
- `BRAINY_DESCUENTOS_CUOTAS.csv`
- `BRAINY_PRORRATEO_ALTASV3.csv`
- `BRAINY_RECONEXIONESV3.csv`
- `NOTAS_CREDITO.csv`

El archivo `Diccionario de datos(1).xlsx` y los videos explicativos son fuentes de referencia para interpretar las columnas y reglas de negocio, pero **no son importados** a SQLite en esta fase.

## Ejecutar

Desde `backend/`:

```bash
npm run data:import:desafio1
```

La importación genera `backend/data/desafio1.db`. Esa base queda separada de `backend/data/app.db`, por lo que el prototipo actual no cambia todavía.

Para volver a ejecutar las validaciones sin reimportar:

```bash
npm run data:validate:desafio1
```

## Ruta alternativa

Si no quieres copiar los CSV a esta carpeta, define `DESAFIO1_DATA_DIR` apuntando al directorio donde están los ocho archivos.

Ejemplo en Windows CMD:

```bat
set DESAFIO1_DATA_DIR=C:\ruta\al\dataset
npm run data:import:desafio1
```

## Criterios de normalización usados

- Identificadores (`CUSTOMER_KEY`, `SUBSCRIBER_KEY`, cuentas, recibos, etc.) se guardan como texto.
- Fechas se normalizan a `YYYY-MM-DD` y datetimes a `YYYY-MM-DD HH:MM:SS`.
- El valor `00:00.0` de `PERIOD_START_DATE` / `PERIOD_END_DATE` se interpreta como dato no disponible (`NULL`), no como una fecha real.
- `PLANTA CLIENTES.ciclo` se guarda como día de ciclo (`billing_cycle_day`) porque los datos reales contienen valores como 5, 9, 15, 17, 23, etc.
- Los tipos de renta `ADELANTADA` / `VENCIDA` y `RA` / `RV` se normalizan internamente a `RA` y `RV`.
- `CATALOGO-OFERTAS.CHARGE CODE` **no se trata como clave única**: la entrega actual contiene códigos repetidos con distintas tarifas. Se conservan todas las filas para resolver esa ambigüedad en la Fase 2.
- Las columnas `Numero` presentes en los CSV Brainy se conservan, aunque no aparezcan en todas las hojas del diccionario. No se usan como llave de suscripción.

## Importante

La Fase 1 solo prepara y valida la capa de datos. No modifica todavía:

- los usuarios demo Carlos/Ana;
- Mi Movistar;
- Lucía;
- el handoff al asesor;
- el dashboard.

La integración funcional se hará después de reconstruir recibos y evidencias en la Fase 2.
