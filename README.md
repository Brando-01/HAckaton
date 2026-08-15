# Hackaton Telecom - Desafío 1

Repositorio con backend Express y frontend estático para un asistente de factura.

## Estructura

- `backend/`: servidor Node.js y rutas API.
- `frontend/`: HTML, CSS y JavaScript del cliente.

## Qué no subir

- `node_modules/`
- `backend/.env`
- cualquier archivo de configuración con credenciales o claves privadas

## Preparar el repositorio después de clonar

1. Clona el repo:
```bash
git clone https://github.com/Brando-01/HAckaton.git
cd HAckaton
```

2. Instala dependencias del backend:
```bash
cd backend
npm install
```

3. Crea un archivo `.env` en `backend/` con al menos estas variables:
```env
PORT=3000
GROQ_API_KEY=tu_clave_groq_aqui
```

4. Arranca el servidor:
```bash
npm run dev
```

5. Abre la aplicación en el navegador:

- http://localhost:3000/

## Notas

- El frontend se sirve desde el backend, por lo que no debes usar Live Server en `frontend/`.
- Si alguien baja el repo, solo necesita ejecutar `npm install` dentro de `backend/`.
- Si el proyecto crece, puedes agregar un `package.json` en `frontend/` si haces bundling o usas herramientas de frontend.

## Autenticación local de la demo

El acceso cliente del prototipo se valida contra dos campos **reales del dataset anonimizado** de `PLANTA CLIENTES`: `COD_CLIENTE` + `NUM_ANEXO`. La pareja debe pertenecer a la misma fila y el servicio debe tener facturación importada para abrir Mi Movistar.

- `http://localhost:3000/login` solicita `COD_CLIENTE` y `NUM_ANEXO`.
- `http://localhost:3000/app` requiere una sesión autenticada.
- una pareja incorrecta no crea cookie ni sesión;
- un `COD_CLIENTE` correcto combinado con el `NUM_ANEXO` de otra cuenta también se rechaza;
- `NUM_ANEXO` se conserva únicamente dentro de la sesión del backend y el navegador recibe una versión enmascarada;
- `/explorer` sigue siendo de solo lectura y no permite adoptar identidades;
- los perfiles `CLI000001`–`CLI000006` se conservan internamente para regresiones, benchmarks y los casos congelados de Release 1, pero ya no son el login cliente mostrado en la UI.

Esto **no representa la autenticación productiva de Mi Movistar**: `COD_CLIENTE` y `NUM_ANEXO` son identificadores anonimizados del desafío, no contraseñas ni secretos. La demo valida que la identidad seleccionada exista realmente en el dataset antes de habilitar datos personales.

## Dashboard de métricas del Desafío 1

`http://localhost:3000/dashboard` separa las métricas que sí se pueden observar en el prototipo de las que requieren evaluación con dataset oficial o una línea base productiva.

Métricas calculadas durante la ejecución local:

- **resolución verificada**: cierres sin handoff cuyo último estado medible es `RESOLVED` / cierres sin handoff con estado de resolución medible;
- tasa de derivación y motivos de handoff;
- reformulaciones e interacciones que alcanzan el umbral de incomprensión;
- satisfacción media, porcentaje de valoraciones positivas y tasa de respuesta a la encuesta;
- **silencio post-explicación**: cierre inmediato después de un turno `RESOLVED`, sin una nueva pregunta;
- contactos repetidos **proxy** por cliente identificado dentro de la misma ejecución;
- duración, cierre, mensajes y trazabilidad de las interacciones.

El dashboard no inventa valores para métricas que todavía no están instrumentadas. Desde Fase 16, `Retrieval Accuracy` y la tasa de alucinación financiera **detectable** se miden mediante `npm run audit:financial:desafio1`, contrastando las afirmaciones estructuradas contra filas SQLite crudas e invariantes deterministas. Desde Fase 19, la lógica de handoff se contrasta con casos etiquetados mediante `npm run audit:handoff:desafio1`; el resultado demuestra consistencia de la política implementada y no se presenta como precisión productiva sobre tráfico real.

Las métricas se mantienen en memoria para el MVP y se reinician al reiniciar el servidor.

## Matriz B2C RA/RV del Desafío 1

Desde Fase 17 la cobertura de escenarios críticos no se declara por diseño teórico. El comando:

```bash
cd backend
npm run audit:b2c-matrix:desafio1
```

recorre por defecto toda la población de `PLANTA CLIENTES` y construye una matriz basada en las dimensiones oficiales `negocio` y `lob_type`, cruzadas con renta adelantada (`RA`) y renta vencida (`RV`). Una celda se marca `VERIFIED` solo cuando existe al menos un caso observado con evidencia `HIGH` y renta resuelta por reglas deterministas.

La matriz mantiene `FINANCED_EQUIPMENT` como `PENDING_MAPPING` mientras las fuentes disponibles no permitan distinguir inequívocamente una cuota de equipo financiado de otras señales de financiamiento/equipamiento. `--limit` sirve solo para una prueba rápida y produce `SAMPLE_ONLY`; no autoriza afirmar cobertura total. `--details` muestra además el desglose granular `negocio + lob_type × RA/RV`, y `--write` guarda un JSON agregado local ignorado por Git.

## Política comercial restrictiva y Efecto Efervescente

Desde Fase 18, Lucía mantiene la recomendación comercial separada del motor financiero. El cross-selling solo se evalúa después de un turno `RESOLVED`, con las guardas financieras activas y una regla explícita sobre la capa comercial sintética existente (`dataset_clientes.csv`, `catalogo_ofertas_entrega.csv` e `historial_campanias.csv`). No existe una oferta genérica de fallback y esta capa no modifica montos ni causas del Desafío 1.

El *Efecto Efervescente* reutiliza únicamente beneficios `ACTIVE_DISCOUNT` con evidencia `HIGH` que ya están aplicados al cliente; se muestran como beneficios existentes y nunca como altas nuevas. Mi Movistar puede recordar esos beneficios, pero no realiza cross-selling por abrir la vista. Las ofertas mostradas son referenciales y no ejecutan contratación ni cambios de servicio.

Las reglas, supresiones, separación de fuentes y limitaciones están documentadas en `backend/docs/desafio1-fase18.md`.

## Handoff inteligente y métricas conversacionales

Desde Fase 19, la derivación deja de depender solo de frases explícitas. La política determinista transfiere inmediatamente cuando el cliente solicita un humano, declara desacuerdo/no resolución, plantea una consulta inequívocamente fuera del alcance de facturación o alcanza dos reformulaciones consecutivas dentro de un contexto personal de facturación/perfil. Una sola reformulación intenta reparar la explicación; `PARTIALLY_RESOLVED` y `UNRESOLVED` ofrecen asesor sin forzar la transferencia.

El comando:

```bash
cd backend
npm run audit:handoff:desafio1 -- --details
```

mide la exactitud lógica contra casos etiquetados y reporta precisión, recall y falsos positivos/negativos. El dashboard registra además el estado de resolución por turno, reformulaciones y una señal específica de silencio post-explicación, separada de la respuesta a la encuesta. Los detalles y limitaciones están documentados en `backend/docs/desafio1-fase19.md`.

## Continuidad omnicanal y adaptador WhatsApp

Desde Fase 20, Mi Movistar, Lucía web, el simulador de WhatsApp y el Portal del asesor comparten una ruta de continuidad sobre la misma sesión autenticada. El backend registra los canales canónicos `MI_MOVISTAR`, `LUCIA_WEB`, `WHATSAPP` y `ADVISOR`, conserva el canal de cada mensaje y transfiere al asesor un journey seguro junto con el transcript.

La vista `http://localhost:3000/whatsapp` y `POST /api/channels/whatsapp/inbound` representan un **contrato/adaptador simulado**, no una conexión live con Meta, Twilio o un BSP. La identidad sigue viniendo de la cookie autenticada de la demo; un teléfono o `customerId` enviado por el payload no reemplaza esa autoridad. `providerMessageId` permite deduplicar retries locales dentro de la misma conversación.

El contrato puede comprobarse con:

```bash
cd backend
npm run audit:omnichannel:desafio1
```

Los detalles, limitaciones y recorrido recomendado están documentados en `backend/docs/desafio1-fase20.md`.

## Escalabilidad y latencia del prototipo

Desde Fase 21 el backend incorpora instrumentación liviana de los endpoints núcleo y un benchmark local reproducible que compara una línea base con un perfil de **3× volumen y 3× concurrencia**. El comando principal es:

```bash
cd backend
npm run audit:performance:desafio1 -- --details --write
```

El perfil por defecto ejecuta 8 journeys con concurrencia 4 y los compara con 24 journeys con concurrencia 12. Cada journey recorre autenticación demo, Mi Movistar, Lucía determinista y una continuación por el adaptador WhatsApp. El reporte mide p50/p95, throughput, errores, timeouts y corrección; una corrida no puede aprobar solo por ser rápida si pierde grounding o continuidad.

El Dashboard muestra además p50/p95 y éxito de los endpoints núcleo observados durante los últimos cinco minutos de la ejecución local. Estas métricas son in-memory y no constituyen un SLA. La prueba 3× tampoco se extrapola a tráfico productivo, infraestructura Movistar, Meta/Twilio ni escalamiento horizontal. Los criterios, guardas y limitaciones están documentados en `backend/docs/desafio1-fase21.md`.

## Preflight integral del Desafío 1

Fase 22 cierra el roadmap sin añadir nuevas reglas financieras. El comando final reúne en una sola corrida la suite, lineage 8/8, Release 1, auditoría financiera F16, matriz B2C F17, handoff F19, omnicanalidad F20, guardas de histórico/cross-selling, benchmark 3× F21 y smoke end-to-end:

```bash
cd backend
npm run challenge:preflight:desafio1 -- --details --write
```

Estados finales:

```text
READY
READY_WITH_KNOWN_LIMITS
REVIEW_REQUIRED
```

`READY_WITH_KNOWN_LIMITS` es válido cuando todos los controles bloqueantes pasan pero permanecen límites explícitos del dataset/prototipo. No se fuerza `PASS` para equipo financiado, combinaciones B2C no verificadas, WhatsApp simulado ni benchmarks locales.

Con `--write`, el snapshot agregado se guarda en `backend/data/phase22-challenge-preflight.local.json` y queda ignorado por Git. El reporte congela los casos demo `CLI000001`/Carlos (`RECONNECTION`) y `CLI000002`/Ana (`PRORATION`), la arquitectura, resultados agregados de benchmarks y limitaciones conocidas sin copiar identificadores oficiales, transcripts o filas fuente.

El diseño y la condición de salida están documentados en `backend/docs/desafio1-fase22.md`.

> Hardening post-F22: `/explorer` es de solo lectura. Los aliases DEMO no crean sesiones ni permiten adoptar identidades; los datos personales requieren `/login`. Ver `backend/docs/desafio1-postfase22-hardening-explorer-auth.md`.

> Hardening conversacional post-F22: Lucía valida referencias explícitas de factura **y de periodo (mes/año)** contra el historial de la cuenta autenticada; si el periodo solicitado no existe, no lo sustituye por el recibo anterior. Tampoco permite cambiar de cliente mediante IDs escritos en el chat. Con una clave Groq real, el LLM puede ayudar a interpretar formulaciones no reconocidas y naturalizar una respuesta ya grounded; los montos/causas siguen siendo deterministas y cualquier naturalización que altere claims protegidos cae al fallback. Ver `backend/docs/desafio1-postfase22-hardening-conversacional.md`.


> Hardening de autenticación con dataset: el login público valida `COD_CLIENTE + NUM_ANEXO` directamente contra `PLANTA CLIENTES`, mantiene `NUM_ANEXO` fuera de los payloads y conserva los perfiles ficticios solo para automatización interna. Ver `backend/docs/desafio1-postfase22-login-dataset.md`.


### Elegir un caso Premium/HIGH para la demo

El Explorador muestra `Caso #000074` en vez del alias técnico `DEMO000074`. Si el presentador necesita abrir exactamente ese caso mediante el login del dataset, puede resolver la pareja **solo desde la terminal local**:

```bash
cd backend
npm run demo:login-case:desafio1 -- --case 74
```

También puede pedir el mejor caso disponible por escenario:

```bash
npm run demo:login-case:desafio1 -- --scenario RECONNECTION --quality PREMIUM
```

El comando revalida `COD_CLIENTE + NUM_ANEXO` contra PLANTA y confirma facturación antes de imprimirlos. No existe un endpoint web equivalente, no crea sesión y no guarda las credenciales en un artefacto. Consulta `backend/docs/desafio1-postfase22-presenter-case-login.md`.

> Seguimientos grounded post-F22: pedir `más detalle`, `profundiza` o `desglósalo` reutiliza el último sujeto financiero autenticado y amplía la respuesta con hechos estructurados del recibo. Estas frases no consumen el umbral de incomprensión de Fase 19. Ver `backend/docs/desafio1-postfase22-followup-detalle-grounded.md`.
