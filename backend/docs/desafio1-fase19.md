# Desafío 1 · Fase 19

## Handoff inteligente y medición conversacional final

La Fase 19 convierte el handoff que ya existía en una política determinista, auditable y medible. El objetivo no es derivar más, sino poder explicar **por qué** se derivó, **qué umbral se alcanzó** y **qué estado de resolución tenía la conversación**.

La ficha del desafío pide precisión lógica del handoff basada en umbrales de incomprensión, transferencia de contexto al asesor y un mecanismo de satisfacción o silencio post-explicación. Esta fase instrumenta esos puntos sin delegar la decisión de handoff al LLM.

## Política previa al turno

La política se evalúa antes de procesar una respuesta cuando existe una señal inequívoca:

```text
solicitud explícita de asesor
→ TRANSFER_NOW

cliente dice que no está de acuerdo
→ TRANSFER_NOW

cliente declara que no se resolvió
→ TRANSFER_NOW

consulta claramente fuera de facturación
→ TRANSFER_NOW

dos reformulaciones consecutivas en BILLING/PROFILE/COMPOSITE
→ TRANSFER_NOW
```

El umbral de incomprensión es explícito:

```text
REPAIR_TRANSFER_THRESHOLD = 2
```

Una sola frase como “no entendí, explícamelo más fácil” no deriva por sí sola; el sistema intenta reparar la explicación. Si el cliente vuelve a pedir otra aclaración consecutiva dentro del mismo contexto personal, se alcanza el umbral.

## Alcance fuera de facturación

La derivación automática por alcance usa patrones conservadores de soporte técnico: Wi-Fi, router, módem, avería, señal, roaming, SIM/chip, portabilidad, llamadas o datos que no funcionan.

Antes de clasificar una consulta como técnica, la política busca señales de facturación. Por ejemplo:

```text
“Me cobraron una reconexión después de quedarme sin internet”
```

sigue siendo una consulta de facturación y no se deriva por la mera presencia de la palabra “internet”.

## Política posterior al turno

Los estados de Fase 15 siguen siendo la fuente de verdad:

```text
RESOLVED
→ no se fuerza handoff

PARTIALLY_RESOLVED
→ OFFER_ADVISOR

UNRESOLVED
→ OFFER_ADVISOR
```

`OFFER_ADVISOR` no significa transferencia automática. Conserva el control del cliente y se apoya en las acciones de Fase 15. La transferencia automática queda reservada a reglas previas explícitas y auditables.

## Contexto transferido

Cada caso puede incluir un snapshot seguro de la política:

```text
decision
reasonCode
ruleId
trigger
threshold
observedRepairCount
resolutionStatusAtDecision
```

No se añaden `subscriberKey`, `customerKey`, facturas internas ni filas fuente. El portal del asesor muestra la regla aplicada y, cuando corresponde, el umbral de incomprensión alcanzado.

## Precisión de handoff

Se añade:

```bash
npm run audit:handoff:desafio1
```

El benchmark utiliza casos etiquetados (`HOF001...`) con decisión y motivo esperados. Evalúa:

- exactitud de la decisión `NONE / OFFER_ADVISOR / TRANSFER_NOW`;
- precisión de transferencia;
- recall de transferencia;
- falsos positivos;
- falsos negativos.

Puede ejecutarse con:

```bash
npm run audit:handoff:desafio1 -- --details --write
```

El JSON local se guarda en:

```text
backend/data/phase19-handoff-audit.local.json
```

El benchmark sirve para demostrar coherencia de la política determinista sobre **casos etiquetados**. **No equivale a precisión productiva** sobre tráfico real de clientes.

## Resolución conversacional medible

Hasta Fase 18, el dashboard usaba “finalizó sin handoff” como proxy de resolución. Fase 19 conserva ese campo por compatibilidad API, pero deja de usarlo como KPI principal.

Ahora se registra por turno:

```text
RESOLVED
PARTIALLY_RESOLVED
UNRESOLVED
```

y el cierre conserva el estado existente en ese momento. La métrica `verifiedResolutionRate` usa únicamente cierres sin handoff cuyo estado de resolución es medible.

## Silencio post-explicación

El silencio ya no se aproxima con “no respondió la encuesta”. Se instrumenta una señal específica:

1. Lucía termina un turno `RESOLVED`.
2. Se marca `awaitingPostExplanationOutcome = true`.
3. Si el cliente formula otra pregunta, la señal se cancela y se registra un follow-up.
4. Si el cliente finaliza la sesión sin una nueva pregunta, el cierre queda como:

```text
RESOLVED_POST_EXPLANATION_SILENCE
```

Esto permite distinguir:

```text
no contestó la encuesta
≠
entendió/cerró inmediatamente después de una explicación resuelta
```

## Reformulaciones

Las métricas registran:

- interacciones con al menos una reformulación;
- cantidad total de turnos de reparación;
- máximo de reformulaciones consecutivas;
- interacciones que alcanzaron el umbral 2.

## Métricas que siguen siendo proxy

`repeatContactRate` sigue identificado como proxy local porque las interacciones viven en memoria y no existe una ventana productiva persistente de contactos.

## Salvaguardas

- El LLM no decide cuándo transferir.
- Una consulta técnica solo deriva por patrones explícitos.
- Una palabra técnica dentro de una consulta de cobro no dispara handoff.
- Una sola incomprensión no dispara transferencia automática.
- `PARTIALLY_RESOLVED` y `UNRESOLVED` ofrecen asesor pero no fuerzan handoff.
- El asesor recibe contexto y regla, no identificadores privados del dataset.
- La precisión de handoff se presenta como benchmark de política, no como dato productivo.

## Condición de salida

Fase 19 queda lista cuando:

```text
suite completa                     PASS
benchmark handoff                  PASS
precisión lógica                   100% en golden set
falsos positivos/negativos         0 en golden set
Fase 16 Retrieval Accuracy         100%
preflight Release 1                READY
smoke                              10/10
prueba out-of-scope                deriva con contexto
prueba 2 reparaciones              deriva por umbral
cierre tras RESOLVED               registra silencio post-explicación
```

## Revalidación de identidad sin destruir contexto

`frontend/chat.js` revalida la cookie autenticada antes de cada envío mediante
`POST /api/session/:sessionId/customer`. Esa operación es **idempotente** cuando
la identidad autenticada sigue siendo la misma: conserva `hasOfficialBillingContext`,
`lastBillingIntent`, el dominio conversacional y los contadores de reparación.

El contexto solo se inicializa de nuevo cuando la sesión todavía no tenía una
identidad asociada o cuando el backend rota el `sessionId` por un cambio real de
cliente. Esto evita que una reformulación financiera válida caiga al RAG general
solo por la resincronización de autenticación del frontend.
