# Desafío 1 · Hardening post-F22 · Frontera de autenticación del Explorador

## Motivo

Después del cierre F22 se detectó una inconsistencia de seguridad/UX: `/explorer` mostraba aliases sintéticos seguros, pero `POST /api/explorer/open` podía convertir cualquier alias consultable en una sesión temporal autenticada. Aunque los perfiles y datos visibles eran ficticios/anonimizados, ese comportamiento hacía que la navegación desde el Explorador actuara como un bypass del flujo explícito de autenticación.

La ficha del desafío exige autenticación antes de mostrar información sensible. Por eso el Explorador queda redefinido como una **herramienta de cobertura de solo lectura**.

## Política final

```text
Explorador
  - metadata segura / agregada
  - aliases DEMO
  - filtros de cobertura
  - NO crea sesión
  - NO adopta identidad
  - NO abre recibos

Datos personales
  - requieren /login
  - solo perfiles demo autorizados
  - Mi Movistar / Lucía / WhatsApp reutilizan esa identidad autenticada
```

`POST /api/explorer/open` se mantiene como barrera compatible para llamadas antiguas, pero siempre responde:

```text
403
code = EXPLORER_READ_ONLY
requiresAuth = true
redirect = /login
```

La llamada no crea `Set-Cookie`, no destruye la cookie existente y no reemplaza la identidad activa.

## Defensa en profundidad

El hardening incluye:

1. eliminación de `buildExplorerAuthUser` y `createAuthUserForDemoId`, de modo que la capa Explorer ya no fabrica identidades autenticables;
2. frontend sin llamada a `/api/explorer/open`;
3. cards de Explorer marcadas como cobertura segura de solo lectura;
4. login como único punto de entrada a datos personales;
5. regresiones HTTP que prueban que una llamada manual al endpoint bloqueado no entrega cookie y tampoco reemplaza una sesión ya autenticada;
6. control `EXPLORER_AUTH_BOUNDARY` dentro del preflight integral F22.

## Alcance

Esto no convierte la autenticación demo local en un sistema productivo de IAM. Las cuentas continúan siendo ficticias y el login es simulado para el prototipo. Lo que sí garantiza el producto es una frontera coherente: **explorar cobertura no equivale a autenticarse como un cliente**.
