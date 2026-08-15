# Desafío 1 · Fase 21 · Escalabilidad y latencia

## Objetivo

Fase 21 convierte el requisito de soportar aproximadamente **3× del volumen normal** en una comprobación reproducible del prototipo. La fase mide:

- latencia p50 y p95;
- throughput de journeys y requests;
- concurrencia;
- errores y timeouts;
- conservación de la corrección financiera/omnicanal bajo carga.

El resultado es una **prueba local de capacidad del prototipo**, no un SLA productivo ni una estimación de capacidad de la red de Movistar.

## Principio de diseño

Rendimiento no puede aprobarse sacrificando exactitud. Una corrida F21 falla aunque sea rápida si:

- una respuesta deja de ser determinista;
- se pierde el contexto entre canales;
- aparece un error HTTP;
- hay timeouts;
- una validación del journey falla.

El benchmark no llama a un LLM para calcular montos o causas. Reutiliza las rutas financieras ya protegidas por F16.

## Workload reproducible

Cada journey representa una interacción completa de la demo:

```text
demo login
   ↓
asociación de identidad a sessionId
   ↓
Mi Movistar
   ↓
GET /api/app/me
   ↓
Lucía web · consulta financiera determinista
   ↓
WhatsApp simulado · primera reformulación
   ↓
GET continuity
```

Los perfiles alternan entre Carlos y Ana para no medir una sola ruta causal.

Operaciones consideradas **núcleo** para p50/p95:

```text
APP_EXPERIENCE
LUCIA_CHAT
WHATSAPP_REPAIR
```

Login, asociación, cambio de canal y lectura de continuidad sí participan en el throughput total del journey, pero no diluyen la latencia core.

## Perfil de carga por defecto

```text
warmup                      2 journeys · concurrencia 1
baseline                    8 journeys · concurrencia 4
objetivo 3×                24 journeys · concurrencia 12
```

Por tanto F21 multiplica simultáneamente:

```text
volumen       8 → 24 = 3×
concurrencia  4 → 12 = 3×
```

No se llama “3×” a una corrida que solo aumente uno de los dos valores.

## Comando

```bash
cd backend
npm run audit:performance:desafio1
```

Con detalle por operación y artefacto local:

```bash
npm run audit:performance:desafio1 -- --details --write
```

Opciones:

```text
--baseline-journeys N
--baseline-concurrency N
--multiplier N
--timeout-ms N
--p95-ms N
--p95-factor N
--throughput-floor N
--warmup-journeys N
```

El archivo generado con `--write` queda en:

```text
backend/data/phase21-performance-audit.local.json
```

y está ignorado por Git.

## Criterios PASS

La comparación tiene ocho controles:

1. el volumen objetivo es exactamente el múltiplo declarado;
2. la concurrencia objetivo usa el mismo múltiplo;
3. baseline sin errores;
4. objetivo sin errores;
5. objetivo sin timeouts;
6. corrección de journeys y requests = 100%;
7. p95 objetivo dentro de la guarda local;
8. throughput objetivo sin colapso material frente a baseline.

### Guarda p95

El límite se calcula como el mayor de:

```text
3000 ms
baseline p95 × 3.5
```

Es una guarda del prototipo para detectar degradaciones grandes sin convertir el hardware de desarrollo en un SLA universal.

### Guarda de throughput

El throughput objetivo debe conservar al menos:

```text
70% del throughput de journeys de baseline
```

No se exige que aumente 3×: SQLite local, apertura de repositorios y el hardware de una laptop no representan una arquitectura productiva horizontal. Lo que se prohíbe es un colapso bajo el aumento de carga.

## Instrumentación runtime

Además del benchmark, `server.js` mide en memoria únicamente:

```text
GET  /api/app/me
POST /api/chat
POST /api/channels/whatsapp/inbound
POST /api/session/:id/customer
POST /api/session/:id/channel
```

La muestra guarda solo:

```text
operation
statusCode
durationMs
timestamp
```

No guarda body, cookie, sessionId, customerId, teléfono, transcript ni identificadores oficiales.

El buffer está acotado a las últimas 1000 muestras y el Dashboard muestra una ventana de 5 minutos con:

- p50;
- p95;
- tasa de éxito;
- cantidad de muestras.

Esta telemetría se reinicia al reiniciar Node.

## Separación entre runtime y benchmark 3×

El Dashboard responde:

> “¿Qué latencias se están observando en esta ejecución local?”

El CLI F21 responde:

> “¿El prototipo conserva corrección y una degradación acotada al multiplicar 3× el perfil local declarado?”

No se presenta el p95 runtime como prueba de escalabilidad ni el benchmark como SLA productivo.

## Privacidad

El artefacto agregado no conserva:

- cookies;
- `sessionId`;
- `customerId` por journey;
- `subscriberKey`;
- `customerKey`;
- teléfono;
- filas fuente;
- transcript.

Los fallos se expresan mediante códigos seguros como:

```text
REQUEST_TIMEOUT
HTTP_STATUS_ERROR
RESPONSE_VALIDATION_FAILED
```

sin serializar mensajes de error que puedan contener rutas locales o datos privados.

## Limitaciones

- El benchmark corre en una sola máquina y un solo proceso Node.
- SQLite local no modela replicación, pooling productivo ni escalamiento horizontal.
- La prueba no modela latencia de Meta/Twilio porque WhatsApp sigue siendo un adaptador simulado.
- No hay tráfico de voz.
- Los umbrales de F21 son guardas de ingeniería del prototipo, no SLO/SLA oficiales.
- Una corrida aislada no reemplaza soak tests de horas, chaos testing ni monitoreo productivo.

## Condición de salida

```text
suite completa                     PASS
audit:performance:desafio1         PASS
volumen objetivo                   3× baseline
concurrencia objetivo              3× baseline
journey/request success            100%
timeouts objetivo                  0
p50/p95                            medidos y reportados
throughput                         medido y sin colapso
F16 Retrieval Accuracy             100%
F19 handoff audit                  PASS
F20 omnichannel audit              PASS
preflight                          READY
smoke                              10/10
```
