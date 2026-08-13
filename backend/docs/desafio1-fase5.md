# Desafío 1 · Fase 5 · Integración de casos oficiales con Mi Movistar y Lucía

## Objetivo

Conectar las Fases 1–4 con la experiencia visible del prototipo sin crear cuentas para los 20 000 registros del dataset y sin publicar identificadores oficiales en Git.

La arquitectura queda así:

```text
Carlos / Ana (alias de login demo)
        ↓
backend/data/demo-users.local.json   [ignorado por Git]
        ↓
un único subscriberKey oficial por alias
        ↓
desafio1.db
        ↓
Fase 2 · reconstrucción
        ↓
Fase 3 · causas verificables
        ↓
Mi Movistar / Lucía
```

Los 20 000 registros siguen siendo datos de clientes/servicios. No se transforman en 20 000 usuarios de autenticación.

## Configuración local obligatoria para la demo oficial

Después de ejecutar el ranking de Fase 4:

```bash
npm run demo:rank:desafio1 -- --limit 5 --pool 2000 --write
npm run demo:configure:desafio1
```

`demo:configure:desafio1` selecciona localmente:

- `CLI000001` / Carlos → mejor caso `RECONNECTION`.
- `CLI000002` / Ana → mejor caso `PRORATION`.

El resultado se escribe en:

```text
backend/data/demo-users.local.json
```

Ese archivo contiene los `subscriberKey` concretos y está ignorado por Git. Si cambia la entrega de datos, se vuelve a ejecutar el ranking y luego la configuración; no hace falta modificar el código ni crear usuarios nuevos.

## Mi Movistar

`GET /api/app/me` intenta obtener la experiencia oficial asociada al alias autenticado.

La respuesta visible no expone `subscriberKey`, `customerKey` ni otras llaves oficiales. El frontend recibe:

- alias (`CLI000001` / `CLI000002`);
- nombre ficticio (`Carlos Mendoza` / `Ana Torres`);
- recibo actual reconstruido;
- recibo anterior cuando existe;
- causas verificadas;
- hallazgos como prorrateo;
- contexto RA/RV;
- acciones hacia Lucía o asesor.

Los conceptos marcados `NO CONSIDERAR` permanecen en el cálculo de Fase 2, pero no se muestran como conceptos principales al cliente.

Para el caso de primer recibo (prorrateo), el frontend soporta explícitamente `previousBill = null`: muestra que no hay recibo anterior comparable y no inventa variación ni porcentaje.

`FECHA-VENCIMIENTO` no se muestra en esta integración porque la entrega actual presenta combinaciones que no deben reinterpretarse como si `ciclo` fuese una fecha de emisión.

## Autenticación progresiva en Lucía

`/chat` sigue siendo público.

Consultas generales como:

- `¿Qué es un prorrateo?`
- `¿Cómo consulto mi recibo?`

pueden continuar sin login.

Consultas que requieren datos del cliente, por ejemplo:

- `¿Por qué subió mi recibo?`
- `¿Cuánto debo pagar?`
- `¿Qué descuento tengo?`
- `¿Y el mes pasado?` después de iniciar una conversación personal

requieren autenticación.

Si el usuario no está autenticado, `/api/chat` devuelve `requiresAuth: true` y un `authUrl` local. El navegador conserva el `chatSessionId` y la consulta pendiente en `sessionStorage`. Tras iniciar sesión, vuelve a `/chat?resume=1`, asocia la identidad autenticada y retoma automáticamente la consulta.

## Regla de seguridad de identidad

`POST /api/session/:sessionId/customer` ya no acepta que un usuario anónimo envíe libremente un `customerId`.

Solo una cookie autenticada puede asociar `CLI000001` o `CLI000002` a una conversación. Si el body intenta indicar otro alias, responde 403.

Además, `ragService` no puede reemplazar una identidad autenticada detectando un DNI/número escrito en el mensaje. Para las llamadas del chat público se deshabilita la identificación explícita y el contexto personal legacy.

## Razonamiento financiero

Las consultas personales de facturación no delegan montos o causalidad al LLM.

```text
mensaje personal
    ↓
clasificador determinista
    ↓
experiencia oficial de Fase 3
    ↓
plantilla segura según intención
    ↓
respuesta de Lucía
```

El LLM queda disponible para conversación general, pero no decide la causa financiera ni recalcula importes de un recibo personal.

## Intenciones deterministas iniciales

- explicación/variación;
- total actual;
- recibo anterior;
- prorrateo;
- descuento/promoción;
- tipo de renta RA/RV.

Los seguimientos cortos (`¿por qué?`, `¿y el mes pasado?`, `explícamelo mejor`) se consideran personales únicamente cuando la sesión ya tiene contexto financiero autenticado.

## Compatibilidad

El servicio sintético anterior se conserva como fallback técnico cuando el archivo local de mapeo aún no existe, principalmente para no romper flujos y pruebas antiguas. Para la demo final debe ejecutarse `npm run demo:configure:desafio1` y `/api/app/me` debe informar `dataSource: DESAFIO1_OFFICIAL_LOCAL`.

## Verificación recomendada

```bash
node --test test/demoProfileBindingService.test.js test/officialDemoExperienceService.test.js test/desafio1ConversationLogic.test.js test/progressiveAuthApi.test.js
npm test
```

Después:

```bash
npm run demo:configure:desafio1
npm start
```

Flujo manual recomendado:

1. Abrir `/chat` sin login.
2. Preguntar `¿Qué es un prorrateo?` y comprobar que el chat sigue disponible.
3. Preguntar `¿Por qué subió mi recibo?` y comprobar que solicita login.
4. Entrar como Carlos y verificar que la consulta se retoma con el caso oficial de reconexión.
5. Cerrar sesión, entrar como Ana y abrir Mi Movistar.
6. Verificar que Ana muestra un primer recibo con prorrateo y sin inventar recibo anterior.
7. Desde Mi Movistar abrir Lucía y preguntar por `mi prorrateo` y `qué tipo de renta tengo`.
