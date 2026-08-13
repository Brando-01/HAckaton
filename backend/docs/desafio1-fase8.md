# Desafío 1 · Fase 8 · Perfiles demo 2 → N

## Objetivo

Generalizar la capa de autenticación y mapeo demo para que el prototipo deje de asumir que solo existen Carlos y Ana, sin modificar el motor financiero de las Fases 1–7 ni romper el Release 1 congelado.

La Fase 8 mantiene a Carlos y Ana como los dos perfiles oficiales del pitch, pero añade un catálogo versionado de perfiles ficticios que puede crecer sin volver a duplicar lógica de autenticación.

## Catálogo versionado

`backend/config/demoProfiles.js` contiene únicamente identidades ficticias y preferencias de selección. Nunca contiene `subscriberKey`, `customerKey`, cuenta financiera, teléfono hash ni filas oficiales.

Perfiles incluidos por defecto:

| customerId | Perfil | Escenario | Uso |
| --- | --- | --- | --- |
| CLI000001 | Carlos Mendoza | RECONNECTION · rank 1 | Pitch R1 |
| CLI000002 | Ana Torres | PRORATION · rank 1 | Pitch R1 |
| CLI000003 | Luis Ramírez | DISCOUNT_ENDED · rank 1 | Cobertura |
| CLI000004 | María López | PLAN_CHANGE · rank 1 | Cobertura |
| CLI000005 | José Vargas | RECONNECTION · rank 2 | Cobertura |
| CLI000006 | Sofía Rojas | PRORATION · rank 2 | Cobertura |

Los seis usuarios usan la contraseña local de demo `Demo1234!`. Esto no representa el esquema de autenticación productivo de Mi Movistar; solo evita crear credenciales artificiales por cada fila de PLANTA.

## Mapeo local v2

`npm run demo:configure:desafio1` genera ahora `desafio1-demo-users-v2` y, por defecto, intenta vincular los seis perfiles a seis suscriptores oficiales distintos del ranking de Fase 4.

El archivo sigue siendo:

`backend/data/demo-users.local.json`

por lo que permanece ignorado por Git.

También se puede reducir temporalmente la cantidad de perfiles:

```bash
npm run demo:configure:desafio1 -- --profiles 4
```

El mínimo es 2 porque Carlos y Ana siguen siendo obligatorios para el pitch congelado.

## Compatibilidad

La lectura conserva compatibilidad con `desafio1-demo-users-v1`. Si una máquina todavía tiene el archivo v1 con solo Carlos y Ana:

- el Release 1 sigue funcionando;
- los perfiles extendidos aparecen como pendientes;
- basta volver a ejecutar `npm run demo:configure:desafio1` para generar el mapeo v2.

## Release 1 no cambia

El preflight de Fase 7 filtra explícitamente los perfiles `release1Pitch=true`. Así, aunque existan 4, 6 o más perfiles de cobertura, el freeze sigue evaluando solamente:

- Carlos → reconexión;
- Ana → prorrateo.

Esto evita que una ampliación experimental cambie el criterio de READY del pitch.

## UI

`/login` obtiene la lista completa desde `/api/auth/demo-profiles` y no conoce un número fijo de usuarios.

Los perfiles se distinguen como:

- **Pitch R1**: Carlos y Ana;
- **Cobertura**: perfiles adicionales.

Un perfil extendido sin mapeo oficial local queda deshabilitado en la UI en vez de abrir una sesión que terminaría en error.

## Comandos

```bash
npm run demo:configure:desafio1
npm run demo:profiles:desafio1
npm run demo:preflight:desafio1
npm run demo:smoke:desafio1
```

`demo:profiles:desafio1` lista solamente aliases, nombres ficticios, correo demo, grupo y escenario público. No imprime identificadores oficiales.

## Alcance deliberado

Fase 8 no genera miles de cuentas. Deja la aplicación preparada para N perfiles curados y crea la base estructural para la siguiente ampliación: un explorador masivo separado que indexe los suscriptores utilizables del dataset sin convertir cada registro en una cuenta ficticia de Mi Movistar.
