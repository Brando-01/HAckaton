# CLAUDE.md — BrainyBill / Asistente de Recibos (Hackathon AI Telecom 2026)

> Contexto operativo para Claude Code. Objetivo: **testear y endurecer el código existente**, no generar datasets (ya están en el repo).
>
> **Estado al 2026-08-13** — rama `rama-tony`, 167/167 tests en verde (eran 46).
> Los P0 y P1 están cerrados; el motor determinista funciona sobre la data real
> y se puede iniciar sesión con clientes del dataset. Ver §7 para el detalle y
> lo que sigue abierto.

---

## 1. Qué se está construyendo

**Desafío 1 — Atención inteligente y explicación de recibos** (Movistar Perú, AI Telecom Challenge 2026).

Un asistente conversacional omnicanal que:

1. Toma el **recibo actual y los 5 previos** de un cliente.
2. Detecta la **variación de monto** y su **causa concreta** (fin de descuento, prorrateo por alta, cuota de equipo, reconexión tras suspensión, cambio de plan a mitad de ciclo, nota de crédito).
3. Lo explica en **lenguaje simple y empático**, con **0% de alucinación financiera**.
4. Propone la **siguiente acción** (pagar, ver detalle, solución raíz) y **deriva a un asesor con el contexto ya cargado** cuando corresponde.
5. Hace **cross-selling solo cuando es oportuno**.

### Métricas que evalúa el jurado

| Indicador | Definición |
|---|---|
| **Retrieval Accuracy** | Capacidad de extraer el dato exacto de la base provista |
| **Tasa de alucinación** | Cero invenciones financieras, comprobable en logs |
| **Precisión del hand-off** | Acierto lógico al decidir cuándo derivar a humano |
| Impacto de negocio | −15% llamadas call center, +10% NPS FARECO, −5% reclamos de facturación |

**Principio rector del reto:** *"la explicación clara, empática y transparente vale más que la respuesta larga"*.

### Principio de arquitectura del equipo

> El LLM **narra números ya resueltos**; no infiere causas. Todo cálculo de variación debe ser determinista (código), y el modelo solo verbaliza el bloque de hechos. Este es el mecanismo que garantiza 0% alucinación — no el prompt.

✅ **Implementado al 2026-08-13.** `motorDiff.js` resuelve los números y
`narradorRecibos.js` verifica que toda cifra de la respuesta exista en el
bloque de hechos; si el modelo inventa una, se descarta su respuesta y se
narra el bloque, dejando registro en log. Ver §7.

---

## 2. Stack y layout del repo

Repo: `https://github.com/Brando-01/HAckaton` (rama `main`, historial aplastado en 1 commit).

```
backend/
  server.js                     # Express app + todas las rutas (1087 líneas)
  db.js                         # sql.js (WASM) sobre data/app.db — tablas clientes / recibos_anteriores
  routes/
    nbo.js                      # POST /api/nbo/recomendar (Desafío 2, fuera de alcance)
    webhook.js                  # Webhook WhatsApp Cloud API (Meta)
  services/
    ragService.js               # ⭐ NÚCLEO: prompt, contexto, llamada a Groq, fallback (1350 líneas)
    dataContextService.js       # Lectura/parseo de CSV/XLSX/SQLite de data/ (421 líneas)
    appExperienceService.js     # Mock de "Mi Movistar" — 2 clientes HARDCODEADOS
    sessionService.js           # Sesiones en memoria, TTL 30 min, historial máx 12 mensajes
    handoffService.js           # Detección de derivación + resumen para asesor (480 líneas)
    metricsService.js           # Métricas de interacción y dashboard (645 líneas)
    authService.js              # Login por celular + password, en memoria
    dbService.js                # SQLite readonly sobre Diccionario_de_datos.db
    nboService.js               # Reglas NBO (Desafío 2)
  scripts/                      # Importadores CSV/XLSX → SQLite
  test/                         # 11 archivos, 37 tests (node:test)
  data/                         # 205 MB de datasets — ver §4
frontend/
  index.html + chat.js (1629 líneas) + chat.css (1021 líneas) + logo.png
```

**Runtime:** Node 22 · Express 4 · sqlite3 (nativo) + sql.js (WASM) · groq-sdk · xlsx · csv-parser
**Modelo:** Groq `llama-3.1-8b-instant` (configurable), `temperature=0.1`, `max_tokens=500`
**Tests:** `node --test` (runner nativo, sin framework externo)

### Variables de entorno (`backend/.env`, no versionado, no hay `.env.example`)

```env
PORT=3000
GROQ_API_KEY=...
GROQ_MODEL=llama-3.1-8b-instant     # opcional
GROQ_TEMPERATURE=0.1                # opcional
GROQ_MAX_TOKENS=500                 # opcional
GROQ_FALLBACK_MODE=1                # opcional: salta el LLM y usa el fallback local (útil para tests)
WEBHOOK_VERIFY_TOKEN=...            # WhatsApp
PHONE_NUMBER_ID=...                 # WhatsApp
WHATSAPP_TOKEN=...                  # WhatsApp
```

`GROQ_FALLBACK_MODE=1` es la palanca clave para testear sin quemar cuota ni depender de la red.

---

## 3. Superficie de API

| Método | Ruta | Qué hace |
|---|---|---|
| POST | `/api/chat` | **Endpoint principal.** `{message, sessionId}` → `{reply, foundData, sessionId, handoff?}` |
| DELETE | `/api/session/:sessionId` | "Nueva consulta": cierra la interacción y borra la sesión |
| POST | `/api/session/:sessionId/customer` | Asocia un `customerId` a la sesión |
| POST | `/api/auth/register` \| `/login` \| `/logout` | Auth de prototipo (celular + password) |
| GET | `/api/auth/me` | Sesión actual |
| GET | `/api/advisor/cases` \| `/:caseId` | Casos derivados |
| PATCH | `/api/advisor/cases/:caseId` | `{status: 'PENDING'\|'ATTENDED'}` |
| POST | `/api/metrics/:sessionId/satisfaction` | Encuesta 1–5 + comentario |
| POST | `/api/metrics/:sessionId/end` | Cierre manual de interacción |
| GET | `/api/metrics/dashboard` \| `/interactions` | Métricas agregadas |
| GET | `/api/app/customers` \| `/:customerId` | Mock Mi Movistar |
| GET | `/api/dictionary/cliente/:dni` | Ficha desde el diccionario de datos |
| POST | `/api/nbo/recomendar` | NBO (Desafío 2) |
| GET/POST | `/api/webhook` | WhatsApp Cloud API |
| GET | `/health` | `{ok:true}` |

**Vistas:** `/`, `/chat`, `/app`, `/advisor` → todas sirven el mismo `index.html`. `/login` → 302 a `/app`. `/dashboard` → 302 a `/`.

### Flujo de `/api/chat` (orden real de ejecución)

```
1. Valida mensaje no vacío
2. Si la interacción ya terminó por HANDOFF → responde "ya fue derivada"
3. registerMessage(user) para métricas
4. esSolicitudAsesor(msg)?  → crearCaso() + registerHandoff() + endInteraction('HANDOFF') → return
5. Gate de sensibilidad: regex /deuda|debo pagar|mi recibo|recibo/ sin cliente en sesión → pide login
6. procesarConsultaFactura(msg, sessionId):
   a. responderPreguntaCatalogo() → atajo determinista para "planes de fibra"
   b. extraerIdentificadorCliente() → si hay DNI/CLI y no hay sesión, exige login
   c. construirContextoApp(customerId)  ← mock hardcodeado, PRIORIDAD MÁXIMA
   d. si no: buildCustomerDataContext() + buildCustomerBillingSummary() sobre data/
   e. arma promptSistema (9 reglas + catálogo + contextos)
   f. últimos 6 mensajes de historial + llamada a Groq
   g. si falla o GROQ_FALLBACK_MODE → construirRespuestaFallback()
```

---

## 4. La data (verificada, no asumida)

`backend/data/` — **205 MB**, ya versionados. Todos los CSV grandes usan **`;` como delimitador** (`catalogo_ofertas_entrega.csv` usa `,`).

| Archivo | Filas | Contenido |
|---|---|---|
| `Cargos_FacturadosV2.csv` | 297K | **Líneas de cargo facturadas.** Fuente de verdad del recibo |
| `FACTURACION-CLIENTES.csv` | 297K | ⚠️ **Byte-idéntico al anterior** (mismo md5). Duplicado |
| `PLANTA CLIENTES.csv` | 20K | Planta de clientes / servicios |
| `REGISTROS_CLIENTES_20MIL.csv` | 20K | ⚠️ **Byte-idéntico al anterior**. Duplicado |
| `BRAINY_RECONEXIONESV3.csv` | 50K | Cargos por reconexión tras corte |
| `BRAINY_DESCUENTOS_CUOTAS.csv` | 33K | Promos, duración, cuotas, fin de descuento |
| `BRAINY_PRORRATEO_ALTASV3.csv` | 8K | Prorrateos por alta a mitad de ciclo |
| `NOTAS_CREDITO.csv` | 8K | Notas de crédito y cancelaciones |
| `Ordenes.csv` | 58K | Cambios de plan, altas/bajas, motivos |
| `CATALOGO-OFERTAS.csv` | 6.9K | `CHARGE CODE` → tarifa |
| `catalogo_ofertas_entrega.csv` | 22 | Catálogo comercial (Desafío 2) |
| `app.db` | 62 MB | SQLite: `dataset_clientes` (100K), `historial_campanias` (300K), `clientes` (2), `recibos_anteriores` (3) |
| `Diccionario_de_datos.db/.xlsx` | — | Diccionario de campos (34 + 16 + 6 filas) |

### Claves de join (verificadas empíricamente)

```
PLANTA CLIENTES.COD_CLIENTE       ==  Cargos_Facturados.CUSTOMER_KEY          (18,427 de 19,973 cruzan)
PLANTA CLIENTES.FINANCIAL_ACCOUNT ==  Cargos_Facturados.FINANCIAL_ACCOUNT_KEY (18,421 cruzan)
PLANTA CLIENTES.NUM_ANEXO         ==  Cargos_Facturados.SUBSCRIBER_KEY
BRAINY_*.CuentaFinanciera / BA    ->  FINANCIAL_ACCOUNT / BILLING_ARRANGEMENT_KEY
```

Un recibo = `LEGAL_INVOICE_NUMBER` (98,389 recibos únicos). Un periodo = `ciclo` (formato `YYYYMMDD`, es la fecha de cierre del ciclo, no el mes calendario).

### 🎯 Dato clave para el reto

**14,426 clientes tienen 6 o más ciclos facturados.** Es decir, el requisito "recibo actual + 5 previos" **se puede cumplir con la data real**, sin inventar nada.

### Semántica de facturación imprescindible

- `CHARGE_TOTAL_AMOUNT` = con IGV · `CHARGE_NET_AMOUNT` = sin IGV. **Al cliente se le habla en total con IGV.**
- `GRUPO = 'NO CONSIDERAR'` → líneas que **no deben sumarse al total explicable**. Aparecen en pares que se anulan (ej. `RCD_PAQRE197 +47.37` con `RCD_BONPAQRE197 −47.37` = bonificación Disney+ neta 0). Si se suman ingenuamente, el diff explica variaciones fantasma.
- Montos negativos = créditos/descuentos (ver `NOTAS_CREDITO.csv`).
- `DEUDA` ∈ {`CON DEUDA`, `SIN DEUDA`} · `FECHA-VENCIMIENTO ` **tiene un espacio al final del nombre de columna** — cuidado al parsear.
- `tipo de renta`: `RA` = renta adelantada, `RV` = renta vencida. Cambia cómo se interpreta el prorrateo.

### Fixtures reales para testear (verificados 2026-08-13)

⚠️ **Corrección importante.** Una versión anterior de esta tabla daba totales
**negativos** para `128757351` y `58013061`. Eran un artefacto de sumar las
líneas `GRUPO='NO CONSIDERAR'`: el dataset tiene bonos `RCD_BONPAQRE*`
negativos **huérfanos**, sin su contraparte positiva `RCD_PAQRE*`. Por ejemplo
`128757351` en el ciclo `20260605` trae `−105.02` y `−98.24` sin cargo que los
balancee. Filtrando bien, **ningún cliente tiene recibos negativos**.

| CUSTOMER_KEY | Serie de totales por ciclo (antiguo → reciente) | Caso |
|---|---|---|
| `48799623` | 68.72 → 85.90 → **429.89** → 74.89 ×3 | Pico por terceros: `OLDI_UC011977 "Llamadas por AMERICATEL" S/343.99`. El pico está en un ciclo **viejo**, así que el recibo actual está plano: sirve para probar "¿por qué mi recibo de marzo salió tan alto?" |
| `58364152` | **149.90** → 89.91 ×5 | Baja tras primer ciclo (alta/prorrateo) |
| `130857463` | **120.00** → 60.01 ×5 | Baja a la mitad |
| `128757351` | 39.90 ×4 → 39.98 → 39.99 | Estable (**no** es nota de crédito) |
| `58013061` | 77.89 ×2 → 74.94 → 54.53 → 39.99 ×2 | Reconexión, prorrateos y cambio de plan |
| `125420001` | 79.90 ×5 → **84.48** | Reconexión limpia de S/ 4.58. Ojo: el código es `FRIORX_001`, **no** `OC1_RECONEXION` — hay que clasificar por `GRUPO`, no por prefijo de código |
| `123165012` | 34.95 ×5 → **49.89** | Dos causas que se compensan: fin de campaña (+34.95) y plan que baja (−20.01) = +14.94 |

**Invariante verificada sobre 300 clientes reales:** la suma de los impactos de
las causas cuadra exactamente con la variación del recibo.

**Trampa del dataset:** `CHARGE_CODE_DESC` trae la tarifa de lista pegada al
nombre (`"RV Plan Porta S/49.9"`) y **no** coincide con lo facturado (S/ 49.89).
Hay que limpiarla antes de mostrarla o se cuela una cifra sin respaldo.

---

## 5. Hallazgos (los P0 y P1 ya están resueltos — ver §7)

### ✅ ~~P0 — El diff de recibos no existe sobre data real~~ — RESUELTO

`construirContextoApp()` tiene **prioridad máxima** y lee de `appExperienceService.js`, que es un `Map` con **2 clientes hardcodeados** (`CLI000001` Carlos Mendoza, `CLI000002` Ana Torres) con montos, causas e impactos escritos a mano.

Para cualquier otro cliente, el único cálculo es `buildCustomerBillingSummary()`, que **suma los cargos encontrados y reporta un saldo**. No agrupa por ciclo, no compara periodos, no calcula deltas por línea, no clasifica causas.

**Consecuencia:** la funcionalidad central del Desafío 1 —comparar contra 5 recibos previos e identificar la causa— **solo funciona en la demo scriptada**. El jurado que pida un cliente distinto verá el fallback.

**Lo que falta construir:** un `motorDiff` determinista que, dado un `CUSTOMER_KEY`:
1. Agrupe `Cargos_FacturadosV2` por `ciclo`, filtrando `GRUPO='NO CONSIDERAR'`.
2. Tome los 6 ciclos más recientes y calcule total por ciclo.
3. Haga diff línea a línea (`CHARGE_CODE_ID`) entre ciclo actual y anterior: aparecidos, desaparecidos, cambiados.
4. Clasifique cada delta cruzando con `BRAINY_DESCUENTOS_CUOTAS` (fin de promo), `BRAINY_RECONEXIONESV3` (reconexión), `BRAINY_PRORRATEO_ALTASV3` (prorrateo), `NOTAS_CREDITO` (crédito), `Ordenes` (cambio de plan).
5. Emita un **bloque de hechos JSON** con montos ya resueltos; el LLM solo lo narra.

### ✅ ~~P0 — Rendimiento: la data se relee en cada mensaje~~ — RESUELTO

`buildCustomerDataContext()` y `buildCustomerBillingSummary()` recorren **todos** los archivos de `data/` con `fs.readFileSync` **síncrono** y los parsean completos, y **cada una hace dos pasadas** (una para claves directas, otra para claves relacionadas). Son ~4 pasadas sobre ~139 MB de CSV **por cada mensaje de chat**, bloqueando el event loop. Además `buildDataContext()` corre al arrancar y también lee todo (aunque luego recorte a 3000 chars).

**Fix:** cargar una vez a SQLite indexado (los scripts de `scripts/` ya apuntan a eso) o construir índices en memoria al boot. La latencia percibida es criterio de demo.

### ✅ ~~P1 — El fallback alucina precios~~ — RESUELTO

`construirRespuestaFallback()` devuelve precios **escritos a mano en el código** (`S/ 89.90`, `S/ 109.90`, `S/ 129.90`, `S/ 149.90`…) que no salen de ningún dataset. Es exactamente lo que el reto puntúa como alucinación financiera, y se dispara justo cuando falla Groq — o sea, en el peor momento de la demo.

### ✅ ~~P1 — Truncado ciego del contexto~~ — RESUELTO (`recortarPorRegistros`)

En el prompt: `catalogoOfertasTexto.slice(0, 1500)` y `dataContextTexto.slice(0, 1500)`. Corta a mitad de registro y puede dejar un número partido dentro del contexto. Truncar por registros completos, nunca por caracteres.

### ✅ ~~P1 — Suplantación de identidad~~ — RESUELTO

Eran **tres** vectores, no uno. Además del `customerExists` que validaba
formato y del binding anónimo del endpoint, había un tercero que no estaba
documentado: `extraerIdentificadorCliente` captura cualquier número de 5+
dígitos del mensaje, y el ID tecleado **ganaba sobre la identidad
autenticada**. Un usuario logueado escribía *"mi código es 115358834"* y
recibía los recibos de esa otra persona. Hoy la sesión manda siempre.

Descripción original del hallazgo:

```js
function customerExists(customerId) { return Boolean(customerId); }   // acepta CUALQUIER string
```

Con `requireApiAuth` convertido en no-op, cualquiera puede hacer `POST /api/session/:id/customer {customerId:'X'}` y quedar asociado a ese cliente. El gate de sensibilidad es un regex (`/deuda|debo pagar|mi recibo|recibo/`) que no cubre parafraseos ("¿cuánto me toca este mes?"). El reto pide explícitamente **Zero Trust y no mostrar información sensible sin autenticación**.

### ✅ ~~P1 — `npm install` falla en limpio~~ — DESCARTADO (verificado 2026-08-12)

Este hallazgo era **falso**. `sqlite3@6.0.1` **sí publica prebuilds** para Node 22 (NAPI v6). Verificado con `curl -I` contra los releases de `TryGhost/node-sqlite3`: **200 en las cinco plataformas** (`linux-x64`, `linux-arm64`, `darwin-x64`, `darwin-arm64`, `win32-x64`).

Instalación limpia en scratch: 9 s, sin compilar — `prebuild-install` descargó `sqlite3-v6.0.1-napi-v6-win32-x64.tar.gz` y el módulo carga bien en Node 22.19.0.

**No hay que bajar a `5.1.7` ni migrar a `better-sqlite3`.** El síntoma original (`Could not locate the bindings file`) casi seguro vino de un entorno **sin salida a GitHub Releases**, donde `prebuild-install` no puede bajar el binario y cae a `node-gyp`. Si le pasa a alguien del equipo, el problema es la red, no la versión.

### ✅ ~~P2 — Contrato de retorno inconsistente~~ — RESUELTO

`procesarConsultaFactura()` devuelve un **string** en el camino feliz y un **objeto** `{reply, foundData, sessionId}` en los fallbacks. `server.js` y `webhook.js` parchean ambos casos, pero en el camino feliz se pierden `foundData` y `sessionId`. Además hay ~40 líneas de **código muerto después de un `return`** dentro del `catch`.

### 🟡 P2 — README desactualizado (riesgo de demo)

El README documenta cosas que **ya no existen o cambiaron**:

| README dice | Código hace |
|---|---|
| `/login` muestra login | 302 → `/app` |
| `/app` requiere sesión | `requirePageAuth` es `return next()` |
| `/dashboard` muestra métricas | 302 → `/` |
| Login con `carlos.demo@movistar.pe` | `authService` siembra **celular** `987654321` / `912345678`, pass `Demo1234!` |
| Vista de asesor | `/advisor` sirve el chat |

Las APIs de métricas y de asesor siguen vivas, solo se cayó la UI.

### ✅ ~~P2 — `dbService` leía la base equivocada~~ — RESUELTO

Hallazgo nuevo, no estaba en la lista original. `dbService.js` apuntaba entero
a `Diccionario_de_datos.db` y consultaba ahí `clientes`, `recibos_anteriores`,
`dataset_clientes` e `historial_campanias`. Esa base tiene esas tablas
**creadas pero vacías**, así que no saltaba ningún error: `getFichaCliente()`
devolvía `null` para todo el mundo y `/api/dictionary/cliente/:dni` respondía
una ficha vacía para cualquier DNI. Los datos reales (100K perfiles, 300K
campañas) están en `data/app.db`.

Segundo bug tapado por el mismo silencio: la consulta pedía
`clientes.cliente_id`, columna que **no existe** en esa tabla, y los
`.catch(() => null)` mudos lo convertían en "no encontrado".

Es la ambigüedad de los tres SQLite mordiendo de verdad. En el arranque:
`dataset_clientes: 0 → 100000`, `historial_campanias: 0 → 300112`.

### 🟡 P2 — Higiene del repo

- `data/` (205 MB) y `app.db` (62 MB) versionados → clone lento.
- `backend/ngrok.exe` commiteado (binario Windows).
- `database.db` vacío (0 bytes), `data/app.db` vs `backend/app.db` (este último con tablas vacías): **tres SQLite** y `obtenerRutaBD()` resuelve por orden de existencia. Ambigüedad peligrosa.
- Falta `.env.example`. `.env` sí está ignorado ✅.
- Mezcla de finales de línea CRLF/LF entre archivos.

---

## 6. Estado de los tests

`npm test` → `node --test`. **46 tests en 11 archivos.**

**Estado al 2026-08-12: 46/46 en verde** (`GROQ_FALLBACK_MODE=1 npm test`, ~4 s). Ningún fallo de bindings de `sqlite3`.

Los 3 fallos que había se arreglaron:

| Fallo | Causa real | Arreglo |
|---|---|---|
| `authApi` — register devolvía 400, no 201 | El test usaba celulares de **8 dígitos** (`99988877`, `98765432`); `validatePhone` exige 9 empezando en 9, y así están sembradas las cuentas demo | Test corregido a `999888777` / `987654321` |
| `appApi` — "rechaza cliente inválido" devolvía 200 | `customerExists()` era `return Boolean(customerId)` | Ver abajo |
| `appExperienceService` — "rechaza cliente inexistente" | Misma causa | Ver abajo |

`customerExists()` ahora acepta los IDs del catálogo mock (`CLI000001/2`) **o** un identificador con forma de DNI/`CUSTOMER_KEY` (`/^\d{6,15}$/`), y rechaza cadenas arbitrarias como `NO_EXISTE`. ⚠️ Para los IDs reales sigue siendo **validación de formato, no de existencia** — cerrar eso de verdad requiere el índice de clientes (§5 P0 rendimiento). El agenda ítem 7 sigue abierto.

**Cobertura actual:** sesiones, handoff (detección + resumen + API), métricas (servicio + API), contexto de datos, auth, mock de app, un test de `construirRespuestaFallback` y dos de integración de servidor.

**Actualización 2026-08-13 — 167 tests, todos en verde.** Lo que estaba sin
cobertura ya la tiene:

| Riesgo | Cubierto por |
|---|---|
| Diff entre ciclos | `motorDiff.test.js` (26 tests) |
| Retrieval Accuracy | `cargosRepository.test.js` — ground truth de 7 clientes |
| Tasa de alucinación | `narradorRecibos.test.js` — 200 clientes, 0 inventados |
| Precisión del hand-off | `precisionHandoff.test.js` — 60 frases, ambos sentidos |
| Parseo CSV (`;`, `FECHA-VENCIMIENTO `, negativos, `NO CONSIDERAR`) | `motorDiff` + `cargosRepository` |
| Latencia por mensaje | `scripts/medirLatencia.js` |
| Suplantación de identidad | `appApi.test.js` + `chatMotorDiff.test.js` |
| Truncado del contexto | `recorteContexto.test.js` |
| Cuentas de la demo | `cuentasDemo.test.js` |

**Invariante fuerte que se comprueba:** la suma de los impactos de las causas
cuadra con la variación del recibo, verificada sobre 300 clientes reales.

---

## 7. Agenda de trabajo

Estado al **2026-08-13**, rama `rama-tony`. **167/167 tests en verde** (eran 46).

| # | Ítem | Estado |
|---|---|---|
| 1 | Arreglar `npm install` | ✅ descartado, no había problema |
| 2 | Tests en verde | ✅ |
| 3 | **`motorDiff` determinista** | ✅ `motorDiff.js` + `cargosRepository.js` |
| 4 | **Harness anti-alucinación** | ✅ `narradorRecibos.js`; 200 clientes narrados, 0 montos inventados |
| 5 | Precios hardcodeados fuera del fallback | ✅ lee del catálogo o no da cifras |
| 6 | **Indexar la data una sola vez** | ✅ p50 **7244 ms → 0.1 ms**, p95 **7595 ms → 0.2 ms** (`scripts/medirLatencia.js`) |
| 7 | Cerrar `customerExists()` y el gate | ✅ + se cerró la suplantación por chat |
| 8 | Sincronizar README | ❌ **pendiente** |
| 9 | **Precisión del hand-off** | ✅ 100% sobre 60 frases peruanas, medida en ambos sentidos |

### Lo que se construyó

```
services/motorDiff.js         Puro, sin I/O. Agrupa por ciclo, excluye
                              NO CONSIDERAR, diff línea a línea, clasifica causa.
services/cargosRepository.js  Indexa el CSV de 139 MB una vez (~1.4 s) por
                              CUSTOMER_KEY / FINANCIAL_ACCOUNT / SUBSCRIBER.
                              También la ficha de servicio de PLANTA CLIENTES.
services/narradorRecibos.js   Narra el bloque sin LLM y VERIFICA que cada monto
                              de cualquier respuesta exista en el bloque.
services/consultaSensible.js  Gate Zero Trust con 20 parafraseos reales.
scripts/generarCuentasDemo.js Elige solos los clientes de la demo: barre los
                              14 426 con 6 ciclos y toma el mejor de cada causa.
scripts/medirLatencia.js      p50/p95 antes vs. después de indexar.
scripts/probar-demo.ps1       Recorrido de prueba de punta a punta.
```

### Cómo probar

```powershell
cd backend                      # ⚠️ no hay package.json en la raíz
$env:GROQ_FALLBACK_MODE = "1"   # narrador determinista, sin gastar cuota
npm run dev
```

**Cuentas del dataset** (`data/cuentas-demo.json`, password `Demo1234!`):
`900548096` reconexión · `926549642` cambio de plan · `920764227` fin de
descuento · `903352291` consumo adicional · `948799623` pico histórico ·
`959505991` estable. Las cuentas viven **en memoria**: se reinician con el
servidor.

⚠️ Las cuentas mock `987654321` / `912345678` apuntan a `CLI000001/2`, que
**no existen en la facturación**: con ellas el motor no se ejecuta.

⚠️ **El dataset está anonimizado.** `PLANTA CLIENTES` solo trae
`telefono_hash` (SHA-256) y los `BRAINY_*` traen `Telefono` y
`numerodocumento` como `xxxx`. No hay credenciales reales: las de la demo se
generan y se atan a un `CUSTOMER_KEY` que sí existe.

### Lo que sigue abierto

- **Ítem 8 — README** desactualizado (§5 P2).
- **DNI autoafirmado**: `registerUser` acepta como identidad el documento que
  el usuario declare. Se valida que exista, pero existencia ≠ propiedad.
  Cerrarlo de verdad exige OTP o validación documental.
- **Higiene del repo** (§5 P2): falta `.env.example`, `ngrok.exe` y
  `database.db` (0 bytes) siguen versionados, mezcla CRLF/LF.
- **Datasets auxiliares sin usar**: `BRAINY_*`, `NOTAS_CREDITO` y `Ordenes` no
  se leen. La causa se identifica bien con las señales de la propia fila
  (`GRUPO`), pero cruzarlos daría más evidencia: fecha exacta de corte,
  duración de la promo vencida, número de cuota.

### Convenciones a respetar

- **Todo en español**: código de cara al usuario, mensajes, tests, commits.
- Montos siempre `S/ X.XX` con IGV.
- **Nunca** dejar que el LLM calcule: si un número aparece en la respuesta, tuvo que existir antes en el bloque de hechos.
- Tests con `node:test` + `node:assert/strict`, sin agregar frameworks.
- Usar `GROQ_FALLBACK_MODE=1` en tests para no depender de la API.
- Ante la duda entre explicar más o explicar claro: **claro**.
