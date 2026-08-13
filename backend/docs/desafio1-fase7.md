# Desafío 1 · Fase 7 · Preparación del Release 1

Esta fase no agrega nuevas reglas financieras. Su objetivo es **congelar una versión demostrable, comprobable y repetible** sobre las Fases 1–6.

## Qué valida el preflight

`npm run demo:preflight:desafio1` revisa, sin iniciar el servidor web:

1. que existan exactamente los perfiles demo esperados y estén vinculados a casos oficiales locales;
2. que el mapeo local conserve trazabilidad hacia las ocho fuentes importadas;
3. que haya por lo menos dos escenarios críticos distintos preparados;
4. que los casos demo tengan evidencia `HIGH` y conciliación determinista;
5. que el LLM no participe en el cálculo de montos ni en la asignación de causas financieras;
6. que la experiencia pública no contenga identificadores oficiales (`subscriberKey`, `customerKey`, etc.);
7. que el texto visible para el cliente no exponga nombres internos como `Brainy`.

El resultado también está disponible en:

```text
GET /api/demo/release/readiness
```

El endpoint es seguro para la interfaz de demo: únicamente expone los alias `CLI000001` / `CLI000002`, nombres ficticios, escenarios y estado de los controles. No devuelve `subscriberKey`, `customerKey`, hashes ni lineage detallado.

## Smoke test end-to-end

Después de que el preflight indique `READY`:

```bash
npm run demo:smoke:desafio1
```

El smoke test levanta el servidor en un puerto efímero y comprueba el recorrido completo con los datos locales configurados:

- `/health`;
- preflight de Release 1;
- consulta educativa pública sin login;
- bloqueo de consulta personal anónima;
- login demo;
- Mi Movistar con la fuente oficial local;
- Lucía usando el motor financiero determinista;
- prorrateo de primer recibo sin inventar comparación;
- handoff con contexto;
- registro del handoff en el dashboard.

El servidor efímero se cierra al terminar, de modo que los casos y métricas creados durante el smoke test no contaminan una ejecución posterior de la demo.

## Flujo recomendado para el pitch

### Flujo principal · Carlos

1. Abrir `/chat` sin sesión.
2. Preguntar `¿Qué es un prorrateo?` para demostrar que las consultas generales son públicas.
3. Preguntar `¿Por qué subió mi recibo?`.
4. Lucía solicita autenticación solo en ese momento.
5. Iniciar sesión como Carlos.
6. Mostrar la explicación de reconexión con monto conciliado.
7. Abrir Mi Movistar para ver la misma variación en el recibo.
8. Indicar desacuerdo y pedir un asesor.
9. Abrir `/advisor` y mostrar que se transfieren el contexto, la causa, el nivel de evidencia y el transcript.
10. Abrir `/dashboard` y mostrar métricas de esta ejecución + controles de preparación del Release 1.

### Escenario de respaldo · Ana

1. Entrar con Ana.
2. Abrir Mi Movistar.
3. Mostrar que no se inventa un recibo anterior.
4. Mostrar el prorrateo como `Incluido` en el total, no como un monto adicional.
5. Preguntar a Lucía `¿Qué tipo de renta tengo?` para mostrar Renta Adelantada (RA).

## Dashboard

La antigua sección con indicadores de calidad `Pendiente` fue reemplazada por **controles que el prototipo sí puede verificar en tiempo de ejecución**:

- perfiles oficiales listos;
- grounding financiero;
- privacidad del payload público;
- trazabilidad de las ocho fuentes;
- escenarios demo preparados.

Los KPIs de interacción continúan marcándose como `proxy` cuando corresponde. El dashboard no afirma Retrieval Accuracy, NPS real ni impacto productivo sin una línea base.

## Handoff

La información del asesor usa lenguaje de audiencia interna. Las explicaciones del cliente permanecen intactas dentro del transcript, pero las tarjetas de contexto usan expresiones como `recibo del cliente` y `servicio del cliente`.

## Checklist antes de grabar o presentar

```bash
cd backend
npm test
npm run data:validate:desafio1
npm run demo:preflight:desafio1
npm run demo:smoke:desafio1
npm start
```

Después:

- comprobar Carlos en Lucía y Mi Movistar;
- crear un handoff nuevo y abrirlo en el asesor;
- comprobar Ana en Mi Movistar y Lucía;
- finalizar al menos una interacción y, si se desea mostrar satisfacción, registrar una calificación;
- abrir el dashboard al final del recorrido.

## Recuperación rápida

Si el preflight indica que falta el mapeo local:

```bash
npm run demo:configure:desafio1
npm run demo:preflight:desafio1
```

Si cambian los CSV oficiales, no reutilizar silenciosamente la base anterior. Volver a importar, validar, generar ranking y configurar los perfiles:

```bash
npm run data:import:desafio1
npm run data:validate:desafio1
npm run demo:rank:desafio1 -- --limit 5 --pool 2000 --write
npm run demo:configure:desafio1
npm run demo:preflight:desafio1
```

## Datos que nunca deben versionarse

- `backend/data/oficial/*`
- `backend/data/desafio1.db*`
- `backend/data/demo-case-selection.local.json`
- `backend/data/demo-users.local.json`

El código puede versionarse; los datos oficiales y los enlaces locales hacia sus identificadores permanecen fuera del repositorio.
