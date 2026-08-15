# Desafío 1 · Hardening conversacional post-F22

## Objetivo

Cerrar la principal debilidad conversacional detectada después del preflight de Fase 22: algunas preguntas personales podían caer en intents demasiado rígidos o ignorar referencias explícitas escritas por el cliente. El síntoma visible era una respuesta correcta en datos pero poco natural o, peor, una respuesta sobre el recibo actual aunque el usuario hubiera escrito un código de factura distinto.

Este hardening **no cambia el motor financiero**. Los montos, causas, periodos y estados siguen saliendo de datos estructurados y reglas deterministas.

## Arquitectura resultante

```text
mensaje del cliente
      ↓
clasificación determinista
      ↓
si falta intención clara: Groq solo puede proponer intent
      ↓
validación de identidad y referencias explícitas
      ↓
motor financiero determinista
      ↓
respuesta base con hechos permitidos
      ↓
Groq puede naturalizar el lenguaje
      ↓
validador de claims protegidos
      ↓
respuesta al cliente
```

La autoridad financiera permanece congelada en:

```text
STRUCTURED_DATA_AND_DETERMINISTIC_RULES
```

Groq puede ayudar en dos lugares:

1. **interpretación semántica de fallback** cuando las reglas no reconocen una formulación personal;
2. **naturalización del texto** de una respuesta que el backend ya construyó.

Groq **no puede crear hechos financieros**. Si el naturalizador cambia/agrega un monto, porcentaje, fecha, código o número protegido, el candidato se descarta y se usa la respuesta determinista original.

## Referencias de factura

El chat reconoce referencias con formato de factura del dataset, por ejemplo:

```text
S7AA-0066221831
```

Cuando el usuario escribe una referencia:

- se valida únicamente contra el historial de hasta seis recibos de la **cuenta autenticada**;
- nunca se consulta otra identidad para responder si el código existe globalmente;
- una referencia inexistente no se reemplaza silenciosamente por el recibo actual;
- una referencia histórica puede confirmar periodo y total, pero no inventa una causa histórica que el motor no tenga verificada;
- si la referencia coincide con el recibo actual, el backend puede continuar con la intención solicitada.

La respuesta pública solo publica si la referencia fue validada dentro del historial autenticado y su posición (`CURRENT`, `PREVIOUS`, `HISTORY`); no expone `subscriberKey`, `customerKey`, cuenta financiera ni filas fuente.

## Referencias temporales de recibo

Las menciones explícitas de mes/año también se consideran una referencia, no un sinónimo genérico de "recibo anterior". Ejemplos:

```text
¿Cuál fue mi recibo de marzo 2026?
Dime mi factura en marzo
```

El backend extrae el mes/año y busca únicamente dentro del historial autenticado de hasta seis recibos. Si marzo no está disponible, Lucía debe decirlo de forma explícita y **no sustituir la petición por junio, por el recibo anterior ni por el actual**. Si el mes aparece más de una vez y el usuario no indicó año, se pide precisión antes de responder.

Esta validación temporal ocurre antes de usar un intent genérico como `PREVIOUS_BILL`; por eso una clasificación semántica imperfecta del LLM no puede cambiar silenciosamente el periodo solicitado.

## IDs escritos en el chat

Un ID/código de cliente escrito dentro del mensaje **nunca cambia la identidad de la sesión**.

Ejemplos:

```text
"dame la factura del cliente 155358834"
"abre CLI000002"
```

Si la sesión corresponde a otro perfil, Lucía rechaza el cambio y pide usar el login. La cookie/sesión autenticada sigue siendo la única autoridad de identidad.

## Lenguaje más natural sin perder grounding

Frases naturales adicionales, como:

```text
¿Cuánto estoy pagando actualmente?
¿Cuál es mi recibo actual?
¿Cuánto me están cobrando?
```

se interpretan como consulta del total actual.

Cuando la frase puede confundirse con deuda/saldo pendiente, la respuesta separa ambos conceptos:

- total del recibo: verificable desde FACTURACION;
- saldo pendiente exacto: no disponible en FACTURACION v2 y, por tanto, no se infiere.

Esto evita respuestas genéricas del tipo "no tengo acceso a tus datos" cuando el usuario sí está autenticado y el total del recibo sí existe.

## Fallback

Si Groq no está configurado, está caído, excede el timeout o produce una respuesta que viola las guardas, la aplicación usa la respuesta determinista existente. Por eso:

```text
languageGenerationByLlm = false
financialReasoningByLlm = false
```

sigue siendo un estado operativo válido.

Cuando la naturalización pasa las guardas:

```text
languageGenerationByLlm = true
financialReasoningByLlm = false
```

## Rendimiento

El benchmark F21 desactiva expresamente esta capa de lenguaje para seguir midiendo la ruta determinista del prototipo. El resultado 3× no se contamina con latencia de un proveedor LLM externo y conserva el alcance original del benchmark local.

## Preflight F22

El preflight integral añade el control:

```text
CONVERSATIONAL_GROUNDING_BOUNDARY
```

que exige:

- autoridad financiera determinista;
- LLM limitado a interpretación/lenguaje;
- prohibición de crear hechos financieros;
- validación de referencias de factura y de periodos/meses contra historial autenticado;
- imposibilidad de cambiar identidad mediante un ID escrito en chat;
- fallback determinista obligatorio.

El hardening no pretende demostrar comprensión semántica perfecta de lenguaje abierto. Su objetivo es combinar naturalidad con una frontera comprobable entre **comprender/redactar** y **afirmar hechos financieros**.
