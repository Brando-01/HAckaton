# Desafío 1 · Fase 20

## Continuidad omnicanal Mi Movistar → Lucía → WhatsApp → Asesor

La ficha del Desafío 1 menciona explícitamente los canales digitales **App Mi Movistar, Bot Lucía y WhatsApp**. Fase 20 no afirma una integración productiva con un proveedor externo: implementa una continuidad verificable dentro del prototipo y un contrato/adaptador de WhatsApp que reutiliza el mismo motor financiero, la misma identidad autenticada y el mismo contexto conversacional.

## Principio de diseño

La omnicanalidad no crea un segundo motor:

```text
Mi Movistar
    ↓
misma sesión autenticada
    ↓
Lucía web
    ↓
mismo sessionId + mismo contexto financiero
    ↓
WhatsApp simulado
    ↓
misma política de resolución / comercial / handoff
    ↓
Asesor con ruta de canales y transcript
```

Los canales solo transportan mensajes y contexto. No calculan montos, causas, deuda, prorrateos, descuentos ni elegibilidad comercial.

## Canales canónicos

```text
MI_MOVISTAR
LUCIA_WEB
WHATSAPP
ADVISOR
```

`desafio1OmnichannelLogic.js` normaliza alias, registra visitas y crea transiciones únicamente cuando realmente cambia el canal. Reabrir Mi Movistar dos veces no genera una transición ficticia.

El snapshot seguro expone únicamente:

```text
currentChannel
previousChannel
visitedChannels
transitionCount
transitions
journey
isOmnichannel
lastTouchAt
```

No contiene `subscriberKey`, `customerKey`, cuenta financiera, teléfono, invoice ids ni filas fuente.

## Mi Movistar

Al abrir `/app`, el frontend reutiliza o crea `chatSessionId`, asocia la identidad autenticada y registra:

```text
MI_MOVISTAR · VIEW
```

Al pulsar **Abrir Lucía** o **WhatsApp**, esa misma sesión se conserva mediante `sessionStorage` dentro de la demo del navegador.

La cookie `HttpOnly` sigue siendo la autoridad de identidad. Un `customerId` libre enviado por el navegador no puede sustituir la sesión autenticada.

## Lucía web

`POST /api/chat` registra siempre el canal como:

```text
LUCIA_WEB
```

Aunque un cliente intente enviar `channel: ADVISOR` en el body, el backend no confía en ese valor. El endpoint web es la autoridad sobre su propio canal.

Cada respuesta incorpora un snapshot de continuidad seguro para que la UI o las pruebas puedan verificar la ruta.

## Contrato de WhatsApp

Endpoint de demo:

```text
POST /api/channels/whatsapp/inbound
```

Requiere autenticación local y acepta un envelope mínimo:

```json
{
  "sessionId": "s_...",
  "message": "No entendí, explícamelo más fácil",
  "providerMessageId": "wamid.demo.001"
}
```

El adaptador fuerza:

```text
channel = WHATSAPP
provider = SIMULATED_WHATSAPP
liveProviderConnected = false
contractOnly = true
```

No usa `phone`, `customerId`, `subscriberKey` ni otros identificadores enviados por el webhook como autoridad de identidad. La demo utiliza la cookie autenticada existente.

### Idempotencia de webhook

`providerMessageId` se usa para evitar que un retry dentro de la misma conversación duplique el turno. La ventana local es de 30 minutos. Si el proveedor no entrega un ID, el adaptador procesa el mensaje pero no inventa una garantía de idempotencia.

Esta memoria de deduplicación es solo del prototipo y se reinicia con el proceso Node.

## Simulador visual

`/whatsapp` es una vista de demo autenticada. Recupera hasta los últimos 12 mensajes seguros de la misma sesión y muestra el canal de origen de cada uno.

La pantalla declara de forma visible que:

- el proveedor es simulado;
- no existe conexión live con Meta/Twilio;
- el contexto se reutiliza desde Mi Movistar/Lucía;
- el adaptador no realiza razonamiento financiero.

La prueba principal es comenzar una consulta en Lucía y formular el seguimiento en WhatsApp. La segunda respuesta debe conservar los montos/causas previamente verificados.

## Handoff con ruta de canales

Cuando Fase 19 decide `TRANSFER_NOW`, Fase 20 registra:

```text
ADVISOR · HANDOFF
```

antes de crear el caso. El caso recibe un snapshot seguro `omnichannel` y cada mensaje del transcript conserva su `channel`.

El portal del asesor puede mostrar, por ejemplo:

```text
Mi Movistar → Lucía web → WhatsApp → Asesor
```

sin exponer identificadores privados de las fuentes oficiales.

## Endpoint de continuidad

```text
GET /api/session/:sessionId/continuity
```

requiere autenticación y solo responde si la sesión pertenece a la misma identidad autenticada. Devuelve:

- snapshot omnicanal seguro;
- últimos mensajes de la conversación con `role`, `content` y `channel`.

No devuelve el objeto `context` completo de `SessionService`.

## Auditoría contractual

```bash
npm run audit:omnichannel:desafio1
```

Comprueba de forma determinista:

- idempotencia al tocar el mismo canal;
- ruta App → Lucía → WhatsApp → Asesor;
- uso de un conversation/session id compartido;
- rechazo conceptual de `customerId`/teléfono como identidad del adaptador;
- declaración explícita de proveedor simulado.

Esta auditoría prueba el contrato del prototipo. No afirma disponibilidad, SLA ni compatibilidad productiva con la API de WhatsApp Business.

## Limitaciones explícitas

- No hay webhook firmado de Meta, Twilio o BSP real.
- No hay entrega saliente real ni plantillas HSM.
- No hay mapeo cross-device entre número telefónico y cuenta Movistar.
- La continuidad de la demo usa cookie autenticada + `sessionStorage` del navegador.
- La deduplicación vive en memoria.
- El adaptador no agrega un canal de voz; voz sigue fuera del alcance de este release.

## Condición de salida

```text
suite completa                       PASS
audit:omnichannel:desafio1           PASS
F16 Retrieval Accuracy               100%
F19 handoff audit                    PASS
preflight                            READY
smoke                                10/10
Mi Movistar → Lucía                  conserva session/context
Lucía → WhatsApp                     conserva explicación financiera
WhatsApp → Asesor                    transfiere journey + transcript
retry providerMessageId              no duplica turno
```
