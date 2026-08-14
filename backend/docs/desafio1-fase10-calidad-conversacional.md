# Fase 10 · Calidad conversacional para Release 1

Esta mejora prioriza los criterios indicados por el líder del Desafío 1 para una demostración libre por chat: lenguaje natural, conservación de contexto, baja latencia, interrupciones y capacidad de responder preguntas no guiadas.

## Cambios

- Multi-intent: un solo mensaje puede preguntar por plan, ciclo, tipo de servicio, deuda, cargos y montos, y Lucía responde todos los puntos en una sola intervención.
- Reparación conversacional: expresiones como `no entendí` o `explícamelo más fácil` reutilizan el último tema real de la conversación en vez de cambiar accidentalmente a otra intención.
- Dominio conversacional: se recuerda si el último turno fue de perfil, facturación o una consulta compuesta para no arrastrar contexto viejo.
- Interrupciones: una petición de asesor tiene prioridad aunque la misma frase mencione plan, recibo u otros datos.
- Copy natural: los nombres de CSV y detalles técnicos se reservan para preguntas de trazabilidad; las respuestas normales hablan como atención al cliente.
- Latencia: las consultas compuestas cargan perfil y facturación en paralelo y no realizan varias llamadas a un LLM para contestar cada subpregunta.
- Seguridad financiera: montos y causas siguen siendo deterministas; esta fase no delega razonamiento financiero al LLM.

## Ejemplos esperados

`¿Cuál es mi plan, cuánto pago y tengo deuda?`

Lucía debe responder los tres puntos en el mismo turno.

`No entendí, explícamelo más fácil.`

Lucía debe reformular el último tema atendido, no recuperar un tema antiguo de otra parte de la conversación.

`Quiero hablar con un asesor sobre mi plan.`

Debe priorizar el handoff y conservar el contexto para el asesor.

`¿De dónde salen estos datos?`

Solo en esta clase de pregunta se muestran las fuentes CSV y se explica que los montos y causas no son generados libremente por IA.
