# Orden de trabajo — Capa de interacción de BrainyBill

> **Para Claude Code.** Este documento es el contexto completo de un trabajo que
> hay que implementar en este repo (rama `rama-tony`). No incluye código listo a
> propósito: describe qué está mal, con evidencia, y qué hay que construir.
> Lee todo antes de tocar nada.

---

## 1. Contexto del proyecto

Prototipo para el **Desafío 1 del AI Telecom Challenge 2026 (Movistar)**:
*atención inteligente y explicación de recibos*.

El asistente compara el recibo actual del cliente contra los 5 anteriores,
identifica la causa de la variación y la explica en lenguaje simple, con **0% de
alucinaciones financieras**, recomendando la siguiente acción y derivando a un
asesor humano con contexto cuando corresponde.

**Stack:** Node.js + Express, HTML/CSS/JS vanilla, Groq (Llama 3.1 8B) para
redacción, CSV indexados en memoria como fuente de datos.

### Regla de oro de la arquitectura

**El LLM narra números ya resueltos. Nunca los infiere, nunca los calcula.**

```
CSV de cargos
     │
cargosRepository ── indexa una vez en memoria (~139 MB, ~2 s, lazy)
     │
motorDiff ──────── PURO. Agrupa por ciclo, calcula deltas, clasifica causas
     │             Devuelve el BLOQUE DE HECHOS (JSON)
     │
ragService ─────── inyecta el bloque en el prompt; el modelo solo redacta
     │
narradorRecibos ── verifica que todo monto del texto exista en el bloque
     │
cliente
```

La garantía de 0% de alucinación es **arquitectónica**: el modelo no puede
inventar un monto porque los montos ya vienen resueltos, y cualquier cifra que no
esté en el bloque hace que la respuesta se descarte.

Esa parte del sistema (`motorDiff.js`, `narradorRecibos.js`,
`cargosRepository.js`) **está bien y no se toca**. El problema está en la capa de
conversación que la envuelve.

### Criterios por los que evalúa el jurado

Todo cambio debe poder justificarse contra al menos uno:

| Criterio | Definición del reto |
|---|---|
| **Precisión de recuperación** | Extraer el dato exacto de la base provista |
| **Tasa de alucinación** | Cero invenciones financieras comprobables en logs |
| **Precisión del hand-off** | Exactitud al decidir cuándo derivar, según umbrales de incomprensión |

Además pesan: reducción de contactos repetidos, claridad de la explicación,
experiencia App + Bot, y protección de datos (no mostrar información sensible sin
autenticación).

---

## 2. Diagnóstico

### 2.1 CRÍTICO — El asistente vuelca el recibo completo ante cualquier mensaje

**Síntoma observado.** Un cliente autenticado escribe `hola` y recibe: total del
recibo, comparación contra el mes anterior, causa de la variación, estado de
deuda, los seis últimos recibos y la antigüedad de la cuenta. Todo de golpe.

**Evidencia.** `backend/services/ragService.js`, función
`construirRespuestaSinModelo()`:

```js
if (bloqueDeHechos && (bloqueDeHechos.encontrado || bloqueDeHechos.motivo === 'CICLO_NO_ENCONTRADO')) {
  return narrarBloqueDeHechos(bloqueDeHechos);   // ← nunca mira el mensaje
}
return construirRespuestaFallback(mensajeTexto, ...);  // ← inalcanzable
```

`construirRespuestaFallback` **sí** tiene una rama para saludos
(`if (/hola|buen|saludos/i.test(texto))`), pero es código muerto para cualquier
cliente con recibos: el `if` de arriba siempre gana.

**Causa raíz — importante entenderla bien.** El problema no es ese `if`. Es que
**no existe una capa de clasificación de intención**. Todo mensaje entra al mismo
pipeline y la única variable que decide la respuesta es *si hay datos
disponibles*, no *qué preguntó el cliente*. Arreglar solo el `if` deja el
problema intacto para el resto de los casos.

**Por qué importa para el reto.** La evaluación premia claridad y reducción de
contactos repetidos. Un muro de texto ante un saludo es lo contrario de ambas
cosas, y es lo primero que va a ver el jurado en la demo.

---

### 2.2 CRÍTICO — El prompt contiene fuentes numéricas rivales

**Evidencia.** `ragService.js`, construcción de `promptSistema`. El prompt dice:

```
BLOQUE DE HECHOS — FUENTE DE VERDAD DE TODO MONTO
Si un monto no aparece acá, no existe: no lo escribas.
```

Y unas líneas más abajo inyecta, siempre:

```
--- CONTEXTO DE ARCHIVOS DE DATA ---
--- DATOS CRUZADOS DEL CLIENTE ---
--- RESUMEN ESTRUCTURADO DE FACTURACIÓN ---
--- CONTEXTO DEL CLIENTE ---
```

Esas cuatro secciones traen cifras. Se le está pidiendo al modelo que ignore
datos que uno mismo le puso delante, y después el verificador tiene que limpiar
el resultado.

**Por qué importa.** La garantía de 0% de alucinación es el argumento central del
proyecto. Si el bloque resolvió el recibo, el bloque debe ser la **única** fuente
numérica del prompt. Contaminarlo convierte una garantía arquitectónica en una
esperanza estadística.

---

### 2.3 CRÍTICO — El verificador anti-alucinación tiene un hueco

**Evidencia.** `ragService.js`, `blindarConFuentes()`:

```js
function blindarConFuentes(respuesta, bloqueDeHechos, customerId, contexto = {}) {
  if (!customerId) {
    return respuesta;   // ← sin cliente no se verifica NADA
  }
  ...
```

**Por qué importa.** Ese es justamente el escenario donde el modelo más inventa:
sin datos que narrar, rellena con precios plausibles. La verificación debe correr
siempre; lo que cambia sin cliente es el conjunto de montos permitidos, que se
reduce al catálogo público.

---

### 2.4 GRAVE — Exposición de datos de cualquier cliente

**Evidencia.** `backend/server.js`:

```js
app.get('/api/app/customers/:customerId', (req, res) => {
  const experience = getCustomerExperience(req.params.customerId);
  // sin ninguna verificación de sesión
```

Devuelve el recibo completo de cualquier cliente poniendo su ID en la URL, sin
token. Contradice el resto del código, que ya trata la identidad de sesión como
única fuente válida (ver los comentarios "Zero Trust" en
`/api/session/:sessionId/customer`).

`requireApiAuth` y `requirePageAuth` también están vacíos: son `return next()`.

---

### 2.5 GRAVE — El hand-off no tiene umbrales

**Evidencia.** `backend/services/handoffService.js`, `esSolicitudAsesor()`: nueve
patrones de keywords (`/\basesor\b/`, `/\bhumano\b/`, etc.). Eso es todo.

El reto pide explícitamente *"precisión del hand-off: exactitud lógica al decidir
cuándo derivar a un humano basándose en **umbrales de incomprensión**"*. Un
keyword match es un botón, no un umbral, y no mide nada.

No existe: contador de reformulaciones, detección de frustración, detección de
bucle (el cliente pregunta lo mismo tres veces), ni registro de por qué se derivó.

---

### 2.6 GRAVE — Las métricas del reto no se persisten, aunque ya se calculan

**Evidencia.** El `README.md` declara `Retrieval Accuracy`, tasa de alucinación y
precisión del hand-off como *"pendientes de instrumentación porque requieren
ground truth, logs y casos etiquetados"*.

Es falso para dos de las tres. `narradorRecibos.verificarMontos()` ya devuelve
`{valido, montos, inventados}` en cada turno — o sea, **la tasa de alucinación ya
se está calculando** y se tira a un `console.warn` que nadie recoge:

```js
console.warn('[ANTI-ALUCINACION] montos sin respaldo %j ...', verificacion.inventados, ...);
```

Solo la precisión del hand-off necesita ground truth de verdad.

---

### 2.7 MEDIO — Problemas de interacción en el frontend

`frontend/chat.js` y `frontend/index.html`:

- **Saludo duplicado.** `DOMContentLoaded` pinta
  `'Hola! Soy tu asistente virtual Movistar. En que puedo ayudarte hoy?'` (sin
  tildes, con typo), y cuando el usuario responde "hola" el bot se vuelve a
  presentar casi igual. Se lee como bug.
- **Sin sugerencias de seguimiento.** Después de cada respuesta el cliente queda
  frente a un campo vacío. En móvil eso es la fricción que más contactos pierde.
- **Sin vista visual del recibo.** El reto valora la experiencia App además del
  Bot ("llevar al cliente a una vista más visual en App").
- **El botón dice "🔑 Iniciar sesión".** No hay credenciales de chat en telco;
  hay validación de identidad. Debe decir "Verificar identidad".
- **Sin indicador de nivel de acceso.** No hay forma visual de demostrar el
  requisito de "no mostrar información sensible sin autenticación".

---

## 3. Qué hay que construir

### 3.1 `backend/services/intencionService.js` (nuevo)

Clasificador de intención **determinista** (regex, sin LLM).

Determinista por las mismas razones que `motorDiff`: la decisión "esto requiere
identidad autenticada" no puede depender de un modelo probabilístico, tiene que
ser auditable en logs, y no vale gastar cuota clasificando un "gracias".

**Intenciones mínimas:**

```
SALUDO · DESPEDIDA · AGRADECIMIENTO · CONFIRMACION · NEGACION
CONSULTA_MONTO · CONSULTA_VARIACION · CONSULTA_DETALLE
CONSULTA_VENCIMIENTO · CONSULTA_HISTORIAL · CONSULTA_CONCEPTO
DISPUTA_COBRO · NO_ENTIENDE · SOLICITUD_ASESOR
CATALOGO_PLANES · SOPORTE_TECNICO · FUERA_DE_ALCANCE · DESCONOCIDA
```

**Firma:**

```js
clasificarIntencion(mensaje, { intencionAnterior })
  → { intencion, confianza, requiereIdentidad, resuelveMotor,
      esSeguimiento, slots, textoNormalizado }
```

**Requisitos no negociables:**

1. **El saludo puro va último en la lista de reglas** y solo gana si el mensaje
   es *únicamente* el saludo. `"hola, ¿por qué subió mi recibo?"` debe clasificar
   como `CONSULTA_VARIACION`.
2. **Seguimientos elípticos heredan la intención del turno anterior.**
   `"¿y el mes pasado?"` tras una consulta de variación sigue siendo variación.
   Sin esto el cliente repite la pregunta completa — el contacto repetido que el
   reto penaliza.
3. **`requiereIdentidad` se calcula sobre la intención resuelta**, no sobre el
   texto crudo. Así un seguimiento hereda la sensibilidad del hilo aunque su
   texto no traiga ninguna palabra sensible. Esto reemplaza conceptualmente a
   `consultaSensible.js` (que puede quedarse como red de seguridad).
4. **Normalizar** tildes, mayúsculas y signos antes de evaluar.
5. Los `slots` deben extraer mes nombrado (`"marzo"`) y referencia relativa
   (`"hace 3 meses"`), para alimentar `resolverCicloPedido()` que ya existe en
   `ragService.js`.

**Trampa conocida:** si filtras muletillas antes de evaluar el saludo, no incluyas
`"buenas"` en la lista de relleno — te come el saludo mismo y `"buenas tardes"`
cae en `DESCONOCIDA`.

---

### 3.2 `backend/services/respuestaProgresiva.js` (nuevo)

Construye respuestas **por capas**, según la intención ya clasificada.

**Estructura de tres pasos** para explicar una variación:

```
1. QUÉ PASÓ   — el hecho, en una línea
2. POR QUÉ    — la causa, traducida a lenguaje cliente
3. QUÉ HACER  — la siguiente acción concreta
```

**Máximo tres párrafos cortos.** El historial completo, el desglose y la
antigüedad quedan detrás de un chip de seguimiento, nunca en la primera
respuesta.

**Diccionario jerga → lenguaje cliente.** Una entrada por cada código de
`CAUSAS` en `motorDiff.js` (`FIN_DESCUENTO`, `PRORRATEO`, `RECONEXION`,
`CAMBIO_PLAN`, `CUOTA_EQUIPO`, `CONSUMO_ADICIONAL`, `CARGO_TERCEROS`, `PAQUETE`,
`NOTA_CREDITO`, `NUEVO_DESCUENTO`, `AJUSTE_TARIFA`), con tres campos:

- `corta` — va en la respuesta inicial, media línea
- `ampliada` — se usa cuando el cliente dice "no entendí"; **cambia de registro,
  no repite lo mismo con sinónimos**
- `accion` — la siguiente mejor acción para esa causa

**Firma:**

```js
construirRespuesta(intencion, bloqueDeHechos, contexto)
  → { texto, sugerencias[], tarjeta?, sugerirHandoff?, cerrarInteraccion? }
  → null  // si la intención no la resuelve el motor: delegar al LLM
```

**`sugerencias`** son los chips de seguimiento (máx. 4). Cada chip debe
corresponder a una intención que el clasificador reconozca — si agregas un chip,
verifica que su texto clasifique a donde esperas.

**`tarjeta`** son los datos estructurados para la vista visual: periodo, total,
estado, vencimiento, recibo anterior, variación, causas e historial. Todos sus
montos salen del bloque, así que hereda la garantía anti-alucinación.

**Ojo con las descripciones de cargo.** `CHARGE_CODE_DESC` trae la tarifa pegada
al nombre (`"Dscto por campaña VEN A MOVISTAR 1 S/39.96"`) y esa cifra no siempre
es la facturada. Usa `narradorRecibos.limpiarDescripcion()`, que ya existe.

---

### 3.3 `backend/services/comprensionService.js` (nuevo)

Estado por sesión + umbrales de derivación.

Cada regla debe tener **nombre**. Explícitas a propósito: una decisión de
derivación tiene que poder justificarse ante el jurado señalando la regla, no la
intuición de un modelo.

| Regla | Acción | Umbral sugerido |
|---|---|---|
| `PETICION_EXPLICITA` | DERIVAR | inmediato |
| `ACEPTA_OFRECIMIENTO` | DERIVAR | tras ofrecer |
| `FRUSTRACION_SOSTENIDA` | DERIVAR | 2 señales |
| `UMBRAL_REFORMULACIONES` | OFRECER | 2 "no entendí" |
| `DISPUTA_PERSISTENTE` | OFRECER | 2 turnos |
| `INTENCION_NO_RECONOCIDA` | OFRECER | 3 seguidas |
| `BUCLE_MISMA_INTENCION` | OFRECER | 3 repeticiones |
| `SIN_DATOS_DE_FACTURACION` | OFRECER | inmediato |
| `CONVERSACION_EXTENSA` | OFRECER | 8 turnos |

**La distinción `OFRECER` vs `DERIVAR` es el punto central.** Derivar de más
también es un error de precisión de hand-off. `OFRECER` anexa la propuesta a la
respuesta y deja la decisión en el cliente; `DERIVAR` ejecuta.

**Comportamientos requeridos:**

- Un `"ahora sí entendí"` **resetea** el contador de reformulaciones y marca la
  sesión como resuelta.
- El **tema vigente sobrevive a los "no entendí"**, para poder reformular sobre
  lo correcto. Si el cliente preguntó por el vencimiento y luego dice "no
  entendí", el tema sigue siendo el vencimiento.
- La frustración es **acumulativa**, no se reinicia: un cliente que ya se molestó
  sigue molesto aunque el siguiente mensaje sea neutro.

**Señales de frustración a detectar:** `"esto no me ayuda"`, `"qué mal servicio"`,
`"ya te dije"`, `"cuántas veces"`, `"voy a cancelar"`, `"osiptel"`, `"indecopi"`,
`"estafa"`.

---

### 3.4 `backend/services/observabilidadService.js` (nuevo)

Persistir en memoria lo que hoy se pierde en `console.warn`.

**Registro por turno:** intención, confianza, requiereIdentidad, autenticado,
bloqueEncontrado, origenRespuesta (`MOTOR` / `LLM` / `FALLBACK` / `GATE`),
montosEnRespuesta, montosInventados, respuestaReemplazada, derivación
(`{accion, motivo, regla}`), latenciaMs.

**Métricas a exponer:**

- **Tasa de alucinación.** Denominador: turnos que mostraron **al menos un
  monto**. Un turno sin cifras no puede alucinar cifras; incluirlo bajaría el
  resultado artificialmente y el jurado lo notaría. Registrar aparte los
  **interceptados por el blindaje**: alucinaciones que el modelo produjo pero que
  nunca llegaron al cliente. Esa distinción es un argumento fuerte.
- **Precisión de recuperación.** De los turnos donde el cliente pidió un dato
  personal, en cuántos el sistema tenía el bloque y respondió desde él.
- **Comportamiento del hand-off.** Distribución por regla y por motivo, más la
  **tasa de contención** (sesiones resueltas sin humano / total) — el indicador
  de impacto del proyecto.
- Distribución de intenciones y tasa de no reconocidas.
- Latencias p50/p95 por origen (justifica el motor determinista).

**Emitir una línea `[TURNO]` grepeable por cada turno.** Es la evidencia
"comprobable mediante logs de la terminal" que el reto pide textualmente.

**Endpoints nuevos:**

```
GET /api/metrics/desafio1          → resumen calculado
GET /api/metrics/desafio1/export   → registros crudos para la ficha técnica
```

---

### 3.5 `backend/services/orquestador.js` (nuevo)

Punto de entrada único para `/api/chat`.

```
mensaje
  ├─ 1. clasificarIntencion()
  ├─ 2. gate de identidad (si requiereIdentidad && !autenticado → cortar)
  ├─ 3. cargar bloque de hechos (obtenerHechosDeCliente + resolverCicloPedido)
  ├─ 4. evaluarDerivacion()
  ├─ 5a. respuestaProgresiva()   ← si el motor puede resolverlo
  │   5b. ragService()           ← si hace falta redacción libre
  ├─ 6. verificar montos (SIEMPRE, con o sin customerId)
  └─ 7. registrar en observabilidad
```

**El cambio de fondo:** el LLM deja de ser la puerta de entrada y pasa a ser el
último recurso, solo para lo que el motor no sabe responder (catálogo, glosario,
soporte, desconocidas). Baja latencia, baja consumo de cuota y **reduce la
superficie donde puede alucinar**.

**Manejo de `NO_ENTIENDE`:** no es una intención en sí, es un pedido de
reformular el tema vigente. Resuélvelo antes de seguir, para que el resto del
flujo trabaje sobre el tema real y no sobre la meta-petición.

**El gate de identidad** debe redactarse como *validación*, no como *login*: "para
explicarte por qué cambió tu recibo necesito verificar tu identidad primero".
Y debe ofrecer lo que sí puede hacer sin identidad (conceptos, catálogo).

**Si `evaluarDerivacion` devuelve `OFRECER`:** anexar el ofrecimiento a la
respuesta, no reemplazarla. El cliente recibe primero el intento de ayuda.

---

### 3.6 Modificar `backend/services/ragService.js`

1. **Descontaminar el prompt.** Extraer un helper que decida qué contexto
   auxiliar entra. Si el motor resolvió (`bloque.encontrado`), **omitir**
   `CONTEXTO DE ARCHIVOS DE DATA`, `DATOS CRUZADOS`, `RESUMEN ESTRUCTURADO` y el
   contexto legacy. Dejar solo el bloque de hechos y el catálogo (precios
   públicos, no personales).
2. **Eliminar el `if (!customerId) return respuesta;`** de `blindarConFuentes()`.
3. Mantener `resolverCicloPedido()` exportado: el orquestador lo usa.

---

### 3.7 Modificar `backend/server.js`

1. Reescribir `/api/chat` sobre el orquestador.
2. El caso de hand-off debe registrar **la regla que lo disparó**
   (`resultado.reglaHandoff`), no solo un regex sobre el último mensaje.
3. **Cerrar `GET /api/app/customers/:customerId`:** exigir sesión y que el
   `customerId` coincida con el de la sesión (401 / 403).
4. Agregar los dos endpoints de métricas.

---

### 3.8 Frontend

Crear `frontend/interaccion.js` y `frontend/interaccion.css`, y parchear
`chat.js` e `index.html` con el mínimo de cambios (`chat.js` es un IIFE cerrado;
conviene exponer funciones globales desde el módulo nuevo y llamarlas desde tres
puntos, en vez de reescribirlo).

**Piezas:**

- **Chips de seguimiento** tras cada respuesta. Limpiarlos cuando el usuario
  envía un mensaje: dejar chips viejos invita a hacer clic sobre una sugerencia
  que ya no aplica.
- **Tarjeta de recibo:** total, estado, variación, causas y mini-serie de barras
  del historial. La forma de la curva comunica la tendencia mucho más rápido que
  seis líneas de texto.
- **Badge de nivel de identidad** en el encabezado:
  `Modo general · sin datos personales` / `Verificado · Mario · ••••5678`.
  Nunca mostrar el documento completo.
- **Aviso de verificación inline** dentro del chat, no un modal que saque al
  cliente de la conversación.
- Corregir el saludo duplicado y sus tildes.
- Botón `🔑 Iniciar sesión` → `🛡️ Verificar identidad`.

**Paleta:** mantener la de Movistar que ya está en `chat.css` (azul `#019DF4`
sobre marino `#0B2739`). No rediseñar: el reto se juega en la conversación.

Respetar `prefers-reduced-motion` y que sea usable a 640 px.

---

## 4. Tests que hay que escribir

Crear `backend/test/interaccion.test.js` con `node:test`. Casos mínimos:

**Clasificación**
- `"hola"`, `"buenas tardes"`, `"qué tal"` → `SALUDO`
- `"hola, ¿por qué subió mi recibo?"` → `CONSULTA_VARIACION` (no `SALUDO`)
- `"¿qué es un prorrateo?"` → `requiereIdentidad === false`
- `"¿cuánto debo?"` → `requiereIdentidad === true`
- `"¿y el mes pasado?"` con `intencionAnterior` → hereda la intención
- `"no entendí"`, `"explícamelo más fácil"`, `"sigo sin entender"` → `NO_ENTIENDE`

**Respuesta progresiva**
- **El saludo con bloque de hechos presente NO contiene ningún monto.** Este es
  el test que blinda el bug original.
- La explicación de variación tiene ≤ 3 párrafos y menciona total, diferencia y
  causa.
- La reformulación produce un texto **distinto** al de la primera respuesta.
- La segunda reformulación ofrece un asesor.
- Sin recibos: la respuesta no contiene `S/` y sugiere derivación.
- La tarjeta solo contiene montos que existen en el bloque.

**Umbrales**
- Petición explícita → `DERIVAR` / `PETICION_EXPLICITA`.
- Un solo "no entendí" → `NINGUNA`. Dos → `OFRECER` / `UMBRAL_REFORMULACIONES`.
- Dos señales de frustración → `DERIVAR` / `FRUSTRACION_SOSTENIDA`.
- `"ahora sí entendí"` resetea el contador a 0.
- El tema sobrevive a un "no entendí".

**Métricas**
- La tasa de alucinación **excluye** del denominador los turnos sin montos.
- La tasa de contención se calcula sobre **sesiones**, no sobre turnos.

---

## 5. Verificación al terminar

```bash
cd backend
npm install
node --test test/interaccion.test.js   # los nuevos
npm test                                # la suite completa
npm run dev
```

**`npm test` va a necesitar atención.** `server.test.js` y `chatMotorDiff.test.js`
afirman sobre `/api/chat`, que se reescribe. Las aserciones sobre `reply` y
`sessionId` seguirán pasando; lo que puede romper es cualquier test que compare
el objeto de respuesta completo, porque ahora incluye `sugerencias`, `tarjeta` e
`intencion`.

**Revisar también:** `package.json` declara `"sqlite3": "^6.0.1"`. Confirmar que
esa versión existe; si no, fijar la última estable.

### Prueba manual — los cinco escenarios del reto

Verificar con las cuentas demo, en ambas modalidades (renta adelantada y
vencida): fin de descuento, prorrateo por alta, cuota de equipo financiado,
reconexión tras suspensión, cambio de plan a mitad de ciclo.

---

## 6. Reglas permanentes al modificar este código

- **Ningún monto se muestra si no está en el bloque de hechos.** Si necesitas un
  número nuevo, primero hazlo salir de `motorDiff`.
- **No agregues fuentes numéricas al prompt.** Si el bloque resolvió, es la única.
- **Toda decisión de derivación necesita una regla con nombre.** Nada de
  heurísticas anónimas.
- **Las respuestas nuevas van en `respuestaProgresiva`**, no en el prompt del
  LLM. El prompt es para redacción, no para lógica de negocio.
- **Máximo tres párrafos** en una respuesta de facturación. Lo demás, detrás de
  un chip.
- **Los chips no son decoración:** cada uno debe corresponder a una intención que
  el clasificador reconozca.

**No tocar** (son la base correcta): `motorDiff.js`, `narradorRecibos.js`,
`cargosRepository.js`, `sessionService.js`, `metricsService.js`.

---

## 7. Guion de demo al que apunta todo esto

Con la terminal visible junto al navegador:

1. `hola` → saludo breve con un gancho, **sin volcar el recibo**
2. Clic en el chip *"¿Por qué cambió mi monto?"* → explicación de 3 pasos +
   tarjeta visual
3. `no entendí` → reformulación con otro registro, no los mismos datos
   reordenados
4. `sigo sin entender` → dispara `UMBRAL_REFORMULACIONES`, ofrece asesor
5. `sí` → crea el caso con la regla registrada
6. Abrir `/api/metrics/desafio1` → las tres métricas con números reales

Cada turno imprime su línea `[TURNO]` en consola. Esa es literalmente la
evidencia que el reto pide como *"comprobable mediante logs de la terminal"*: la
terminal debería estar en pantalla durante toda la demo, no solo al final.
