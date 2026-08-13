# Desafío 1 · Fase 9

## Cobertura masiva del dataset oficial

La Fase 9 no crea más credenciales de Mi Movistar. Su objetivo es medir, sobre los suscriptores realmente importados desde **PLANTA CLIENTES**, cuánto del dataset puede consumir el motor construido en Fases 2 y 3.

El resultado es un índice SQLite **local e ignorado por Git**:

`backend/data/demo-coverage.local.db`

Cada suscriptor con un recibo reconstruible recibe un alias sintético `DEMO000001`, `DEMO000002`, etc. El vínculo entre ese alias y `subscriberKey` solo existe en el índice local. No se publica en frontend ni se versiona.

## Métricas

Las capacidades son independientes; no forman una jerarquía estricta porque un primer recibo con prorrateo puede ser explicable aunque todavía no sea comparable.

- **Con facturación**: PLANTA tiene al menos un encabezado de recibo en FACTURACION.
- **Consultable**: Fase 2 puede reconstruir el recibo actual y producir un total válido.
- **Comparable**: además existe recibo anterior y comparación reconstruida.
- **Explicable**: Fase 3 reconoce al menos una causa o hallazgo financiero real. `ADJUSTMENT_NOTE_CONTEXT` no cuenta como explicación automática.
- **Evidencia HIGH**: al menos una causa/hallazgo explicable alcanza evidencia HIGH.
- **Fully explained**: una comparación queda `FULLY_EXPLAINED` y sin residual monetario.
- **Demo premium**: el caso cumple las reglas estrictas de elegibilidad de Fase 4 para al menos uno de los escenarios soportados (reconexión, fin de descuento, cambio de plan o prorrateo).

## Ejecución

Prueba corta antes del escaneo completo:

```bash
npm run demo:coverage:desafio1 -- --limit 500
```

Escaneo completo:

```bash
npm run demo:coverage:desafio1
```

Por defecto se usan 4 lectores en paralelo. Puede ajustarse entre 1 y 8:

```bash
npm run demo:coverage:desafio1 -- --concurrency 6
```

El análisis completo puede tardar varios minutos porque los suscriptores con facturación pasan por las mismas reglas deterministas de Fase 2 y Fase 3; no se clasifica una muestra y luego se extrapola al resto.

Para volver a ver el resumen sin recalcular:

```bash
npm run demo:coverage:summary:desafio1
```

## Persistencia local

`coverage_profiles` conserva la información necesaria para la futura Fase 10 (explorador): alias DEMO, identificador oficial local, cantidad de recibos, flags de capacidad, calidad, escenarios reconocidos, montos de comparación y tipo de renta.

El archivo contiene identificadores oficiales y por eso se ignora con:

`/backend/data/demo-coverage.local.db*`

Los scripts de resumen nunca imprimen `subscriberKey`, `customerKey`, cuenta financiera ni teléfono.

## Relación con Release 1

Carlos, Ana y el catálogo de seis perfiles de Fase 8 no se modifican. Preflight y smoke test siguen congelados en el Release 1. La Fase 9 es una herramienta local de cobertura y prepara la Fase 10 sin convertir miles de registros en cuentas de autenticación.
