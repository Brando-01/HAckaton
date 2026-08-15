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

El prototipo incluye una autenticación local para proteger la vista de Mi Movistar y conservar la identidad del cliente al pasar a Lucía.

- `http://localhost:3000/login` muestra el inicio de sesión.
- `http://localhost:3000/app` requiere una sesión autenticada.
- El modo demo permite entrar como Carlos o Ana sin escribir credenciales.
- La sesión se guarda en una cookie `HttpOnly` y se reutiliza al abrir Lucía.
- Al cerrar sesión se invalida el acceso a Mi Movistar.

Cuentas ficticias disponibles:

```text
Carlos Mendoza
Correo: carlos.demo@movistar.pe
Contraseña: Demo1234!

Ana Torres
Correo: ana.demo@movistar.pe
Contraseña: Demo1234!
```

Estas cuentas son exclusivamente para el prototipo. El sistema de autenticación se mantiene en memoria y no sustituye la autenticación real de Mi Movistar.

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
