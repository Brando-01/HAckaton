# Desafío 1 · Fase 10 — Explorador web del dataset

## Objetivo

Fase 10 convierte el índice local generado en Fase 9 en una herramienta web de exploración sin transformar los 18 450 clientes consultables en cuentas permanentes de Mi Movistar.

La vista `/explorer` permite:

- consultar las métricas agregadas del barrido completo;
- buscar aliases sintéticos `DEMO000001...DEMOn`;
- filtrar por comparabilidad, explicación, evidencia HIGH y casos premium;
- filtrar por escenario y tipo de renta;
- paginar el índice local sin cargar miles de filas en memoria del navegador;
- revisar metadata segura de cobertura para aliases consultables;
- mantener la exploración separada de la autenticación de cliente: ningún alias DEMO del explorador crea una sesión ni habilita Mi Movistar/Lucía.

## Privacidad y separación de responsabilidades

La lista pública del explorador nunca incluye `subscriberKey`, `customerKey`, cuenta financiera, teléfono hash ni hashes de lineage. Esos vínculos permanecen exclusivamente en `backend/data/demo-coverage.local.db`, archivo local ignorado por Git.

Desde el hardening post-F22, el explorador es **solo lectura**. Conocer o seleccionar un alias `DEMOxxxxxx` no crea una cookie, no sustituye una identidad autenticada y no permite acceder al recibo del perfil.

`POST /api/explorer/open` se conserva únicamente como barrera explícita para clientes viejos o llamadas manuales y responde `403 EXPLORER_READ_ONLY`; nunca crea ni reemplaza una sesión.

Los datos personales de facturación solo se consultan después de pasar por `/login` y usar uno de los perfiles demo autorizados. Esto mantiene una frontera coherente con el requisito del desafío de no mostrar información sensible sin autenticación.

## Explorador de cobertura, no suplantación de cuentas

Fase 10 no registra los 18 450 perfiles consultables como usuarios de Mi Movistar. Tampoco permite convertir un alias del índice en una identidad autenticada.

```text
/explorer
   ↓
alias DEMO + metadata de cobertura segura
   ↓
solo lectura

/login
   ↓
perfil demo autorizado
   ↓
/app /chat /whatsapp
```

El objetivo del explorador es demostrar cobertura y localizar patrones del dataset, no funcionar como selector de cuentas de cliente.

## API segura

- `GET /api/explorer/summary`: métricas agregadas de Fase 9.
- `GET /api/explorer/profiles`: lista paginada y filtrada de perfiles seguros.
- `GET /api/explorer/profiles/:demoId`: metadata segura de un alias.
- `POST /api/explorer/open`: endpoint de compatibilidad bloqueado; responde `403 EXPLORER_READ_ONLY` y nunca crea una sesión.

Los endpoints de listado no entregan importes de recibos. La información financiera detallada solo está disponible después de autenticarse con un perfil demo autorizado mediante `/login`; el explorador no constituye una vía alternativa de acceso.

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
