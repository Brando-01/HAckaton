# Desafío 1 · Fase 10 — Explorador web del dataset

## Objetivo

Fase 10 convierte el índice local generado en Fase 9 en una herramienta web de exploración sin transformar los 18 450 clientes consultables en cuentas permanentes de Mi Movistar.

La vista `/explorer` permite:

- consultar las métricas agregadas del barrido completo;
- buscar aliases sintéticos `DEMO000001...DEMOn`;
- filtrar por comparabilidad, explicación, evidencia HIGH y casos premium;
- filtrar por escenario y tipo de renta;
- paginar el índice local sin cargar miles de filas en memoria del navegador;
- abrir cualquier alias consultable como una sesión temporal de Mi Movistar;
- continuar ese mismo caso en Lucía y, si corresponde, derivarlo al asesor.

## Privacidad y separación de responsabilidades

La lista pública del explorador nunca incluye `subscriberKey`, `customerKey`, cuenta financiera, teléfono hash ni hashes de lineage. Esos vínculos permanecen exclusivamente en `backend/data/demo-coverage.local.db`, archivo local ignorado por Git.

`POST /api/explorer/open` recibe únicamente un alias `DEMOxxxxxx`. El backend resuelve el vínculo privado, valida que corresponda a un cliente consultable y crea una sesión temporal con identidad sintética:

```text
Cliente DEMO000123
mode = EXPLORER
explorerDemoId = DEMO000123
```

La cookie no contiene el `subscriberKey`. Cuando Mi Movistar o Lucía necesitan datos financieros, `DatasetExplorerService` vuelve a resolver el alias dentro del backend y ejecuta el motor de Fases 2–3.

## Sesiones temporales, no cuentas

Fase 10 no modifica `authService` para registrar 18 450 usuarios y no genera correos o contraseñas masivos.

```text
/explorer
   ↓
DEMO000123
   ↓
POST /api/explorer/open
   ↓
sesión temporal EXPLORER
   ↓
/app
   ↓
/chat
```

Al cerrar sesión desde Mi Movistar, un perfil de exploración vuelve a `/explorer`.

## API segura

- `GET /api/explorer/summary`: métricas agregadas de Fase 9.
- `GET /api/explorer/profiles`: lista paginada y filtrada de perfiles seguros.
- `GET /api/explorer/profiles/:demoId`: metadata segura de un alias.
- `POST /api/explorer/open`: crea la sesión temporal para un alias consultable.

Los endpoints de listado no entregan importes de recibos. La información financiera detallada se obtiene después de abrir una sesión temporal y pasa por `/api/app/me` / `/api/chat`.

## Filtros

Capacidades disponibles:

- todos los consultables;
- comparables;
- explicables;
- evidencia HIGH;
- demo premium;
- sin causa reconocida por las reglas actuales.

Escenarios actualmente indexados:

- reconexión;
- descuento vigente;
- prorrateo;
- fin de descuento/promoción;
- descuento retirado;
- cambio de plan.

El buscador opera únicamente sobre alias DEMO y campos categóricos seguros (`lobType`, `businessType`).

## Relación con Release 1

Carlos, Ana y los seis perfiles curados de Fase 8 no se modifican. El explorador es una herramienta adicional de cobertura y pruebas. El preflight y smoke test del Release 1 continúan usando los casos congelados del pitch.

## Preparación para Fase 11

El filtro `Sin causa reconocida` permite localizar los clientes consultables que Fase 3 todavía no explica. Esa población será la base para agrupar patrones de variación y priorizar nuevas reglas financieras según frecuencia real en el dataset.
