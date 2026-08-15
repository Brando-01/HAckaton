# Desafío 1 · Fase 22 · Cierre integral y preflight final

## Objetivo

Fase 22 es el cierre del roadmap técnico. **No agrega una nueva capacidad de negocio**: consolida en una sola comprobación reproducible lo que ya quedó construido y auditado entre Fases 14–21.

El comando final es:

```bash
cd backend
npm run challenge:preflight:desafio1 -- --details --write
```

La intención es sustituir “creo que funciona” por un reporte explícito de:

- qué requisitos están comprobados;
- con qué datasets/reglas se comprobaron;
- qué benchmarks permanecen en verde;
- qué casos de demo quedan congelados;
- cuáles limitaciones siguen abiertas y no deben ocultarse en el pitch.

## Estados posibles

```text
READY
READY_WITH_KNOWN_LIMITS
REVIEW_REQUIRED
```

`READY_WITH_KNOWN_LIMITS` es un cierre válido. Significa que **todos los controles bloqueantes pasan**, pero el reporte conserva limitaciones conocidas reales —por ejemplo, equipo financiado sin mapeo inequívoco— en vez de fabricar cobertura.

`REVIEW_REQUIRED` significa que al menos un control bloqueante falló y no se debe dar por cerrado el desafío hasta investigarlo.

## Qué ejecuta el único comando

El preflight corre secuencialmente:

1. `node --test` sobre la suite completa;
2. lineage de las **8 fuentes oficiales** y Release 1;
3. F16 · auditoría financiera / Retrieval Accuracy;
4. F17 · barrido completo de la matriz B2C RA/RV;
5. F19 · benchmark determinista de handoff;
6. F20 · contrato omnicanal;
7. guardas deterministas del histórico F14;
8. guardas restrictivas de cross-selling/Efecto Efervescente F18;
9. F21 · benchmark local de 3× volumen y 3× concurrencia;
10. smoke end-to-end del Release 1;
11. construcción del snapshot seguro de F22.

No reutiliza un resultado B2C `SAMPLE_ONLY` para aprobar el cierre. La matriz final debe provenir de un barrido completo sin errores de análisis.

## Controles finales

El reporte contiene, como mínimo:

```text
DATASETS_8_OF_8
TEST_SUITE
CRITICAL_DEMO_CAUSES
PRIVACY
EXPLORER_AUTH_BOUNDARY
DATASET_AUTH_BOUNDARY
CONVERSATIONAL_GROUNDING_BOUNDARY
RETRIEVAL_ACCURACY
HALLUCINATION_GUARD
HANDOFF_POLICY
BILLING_HISTORY
CROSS_SELLING_GUARD
B2C_MATRIX
OMNICHANNEL_CONTINUITY
PERFORMANCE_3X
RELEASE_SMOKE
```

### Frontera de autenticación del Explorador

El hardening post-F22 añade `EXPLORER_AUTH_BOUNDARY`: `/explorer` queda como herramienta de cobertura de solo lectura. Un alias `DEMOxxxxxx` no crea ni reemplaza una sesión autenticada y no permite abrir datos personales. Mi Movistar, Lucía y WhatsApp solo reciben contexto personal después de `/login`. Tras el hardening de login contra dataset, la UI cliente valida una pareja `COD_CLIENTE + NUM_ANEXO`; los perfiles demo versionados quedan reservados para automatización y benchmarks.

### Frontera de autenticación contra dataset

`DATASET_AUTH_BOUNDARY` exige que el acceso cliente use dos campos existentes en `PLANTA CLIENTES`, con coincidencia exacta y sin exponer `NUM_ANEXO` completo al navegador. Los identificadores son anonimizados del desafío y no se presentan como secretos productivos de Mi Movistar.

### Grounding conversacional

`CONVERSATIONAL_GROUNDING_BOUNDARY` mantiene al LLM fuera del cálculo financiero, valida referencias explícitas contra la cuenta autenticada y exige fallback determinista.

El endpoint histórico `POST /api/explorer/open` se conserva como barrera explícita y responde `403 EXPLORER_READ_ONLY` sin emitir cookie.

### Datasets 8/8

Se exige que el lineage contenga exactamente:

```text
planta_clientes
facturacion_clientes
ordenes
catalogo_ofertas
brainy_descuentos_cuotas
brainy_prorrateo
brainy_reconexiones
notas_credito
```

Cada fuente debe tener filas importadas, nombre de archivo y huella de importación. El snapshot final conserva únicamente la clave lógica y el número de filas, no el hash.

### Casos críticos congelados

El manifiesto final fija dos casos representativos del pitch:

```text
CLI000001 · Carlos Mendoza · RECONNECTION · HIGH
CLI000002 · Ana Torres     · PRORATION   · HIGH
```

El preflight no confía solo en que esos alias existan. Vuelve a comprobar que el Release 1 los resuelva con el escenario esperado, evidencia `HIGH` y estado `ready`.

### Retrieval y grounding

F16 debe terminar en `PASS` con:

```text
Retrieval Accuracy       100%
Grounding financiero     100%
Violaciones totales      0
```

La métrica de alucinación se mantiene deliberadamente acotada a **claims financieros estructurados evaluables**. Un 0% no se presenta como una demostración matemática sobre cualquier texto libre futuro.

### Handoff

F19 debe conservar:

```text
status                    PASS
precisión lógica          100%
falsos positivos          0
falsos negativos          0
```

Es el benchmark del golden set determinista, no precisión productiva sobre tráfico real.

### Histórico

Además de la suite, F22 ejecuta una guarda semántica pequeña que verifica:

```text
máximo de recibos        6
previos                   5
ventana ordenada          sí
séptimo recibo excluido   sí
recurrencia estructurada  sí
```

Esto evita que el cierre dependa únicamente de encontrar texto en un archivo o de un test de contrato estático.

### Política comercial

La guarda F22 vuelve a comprobar que:

- una consulta `UNRESOLVED` nunca venda;
- un `RESOLVED` sin regla explícita no reciba oferta de fallback;
- `ACTIVE_DISCOUNT HIGH` se trate como beneficio que **ya existe**;
- ese beneficio tenga prioridad sobre cross-selling en el mismo turno;
- el LLM no decida la elegibilidad comercial ni altere el razonamiento financiero.

### Matriz B2C

Son válidos:

```text
PASS
KNOWN_LIMITS
```

pero únicamente con:

- barrido completo;
- `analysisErrors = 0`;
- ninguna celda verificada por soporte teórico.

`KNOWN_LIMITS` no se transforma artificialmente en `PASS`.

### Omnicanalidad

F20 debe conservar 100% de sus controles contractuales y la ruta:

```text
Mi Movistar → Lucía web → WhatsApp → Asesor
```

La vista WhatsApp continúa siendo un adaptador simulado/provider-neutral.

### Rendimiento 3×

F21 debe pasar con:

```text
loadMultiplier = 3
volumen objetivo = baseline × 3
concurrencia objetivo = baseline × 3
journey success = 100%
timeouts = 0
8/8 controles de F21
```

Los valores p50/p95/throughput se copian al snapshot de la corrida. No se congelan como SLA porque dependen del hardware local.

## Snapshot de arquitectura

`backend/config/desafio1ChallengeManifest.js` deja versionada la arquitectura que se considera cerrada:

```text
8 fuentes oficiales
        ↓
SQLite desafio1.db
        ↓
Repositorio estructurado
        ↓
Motor financiero determinista
        ↓
Resolution Engine F15
        ↓
F18 política comercial separada
        ↓
Mi Movistar / Lucía / WhatsApp
        ↓
F19 handoff
        ↓
Asesor
```

El LLM permanece fuera del cálculo monetario y de la asignación causal financiera.

## Limitaciones conocidas congeladas

El manifiesto conserva como mínimo:

- equipo financiado pendiente de mapeo inequívoco;
- semántica general de notas como contexto salvo el subconjunto de suspensión conciliado;
- estado de deuda/vencimiento no disponible en FACTURACION v2;
- capa comercial sintética/referencial;
- WhatsApp simulado, no Meta/Twilio live;
- estado/métricas/deduplicación runtime in-memory;
- benchmark 3× local, no SLA productivo;
- contactos repetidos como proxy local.

Además, F22 añade dinámicamente cualquier escenario B2C con `PENDING_MAPPING` o casos observados cuya RA/RV no pueda resolverse.

## Privacidad del reporte final

El JSON F22 no debe contener claves como:

```text
subscriberKey
customerKey
billingArrangement
financialAccount
sourceRows
phone
document
dni
cookie
```

El propio constructor del reporte ejecuta un auto-chequeo de esas claves. Si encuentra alguna, el estado final se fuerza a `REVIEW_REQUIRED`.

Los alias `CLI000001` / `CLI000002` sí se conservan porque son identificadores ficticios de la demo, no claves oficiales de los datasets.

## Artefacto local

Con `--write` se genera:

```text
backend/data/phase22-challenge-preflight.local.json
```

El archivo queda ignorado por Git. Contiene:

- estado final;
- controles;
- casos demo congelados;
- snapshot de arquitectura;
- resultados agregados de F16/F17/F19/F20/F21;
- limitaciones conocidas.

No se guardan casos financieros individuales, transcripts, cookies ni IDs oficiales.

## Reproducibilidad

Secuencia final recomendada después de un clone/configuración local:

```bash
cd backend
npm install
npm run challenge:preflight:desafio1 -- --details --write
```

El comando presupone que los datasets oficiales locales ya fueron importados y que `backend/data/desafio1.db` y `backend/data/demo-users.local.json` están configurados, igual que las fases anteriores.

Si el comando termina en `READY_WITH_KNOWN_LIMITS`, el equipo puede ensayar el pitch usando las limitaciones impresas como parte de la explicación técnica, no escondiéndolas.

## Condición de salida

Fase 22 queda cerrada cuando:

```text
suite completa                  PASS
datasets                        8/8
casos demo críticos             PASS
privacidad                      PASS
Retrieval / grounding           100% / 100%
hallucination guard             PASS
handoff                         PASS
historial                       PASS
cross-selling guard             PASS
matriz B2C                      PASS o KNOWN_LIMITS
omnicanalidad                   PASS
performance 3×                  PASS
smoke                           10/10
reporte final                   sin claves privadas
```

El estado esperado con las fuentes actuales puede ser `READY_WITH_KNOWN_LIMITS`. Ese resultado es más defendible que ocultar huecos de cobertura.
