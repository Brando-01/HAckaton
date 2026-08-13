# Desafío 1 · Fase 4 · Selección reproducible de casos demo

## Objetivo

La Fase 4 no modifica el chatbot ni crea usuarios nuevos. Su objetivo es recorrer una preselección de los registros importados y encontrar casos de demostración sólidos utilizando exclusivamente el resultado verificable de la Fase 3.

El flujo es:

```text
desafio1.db
   ↓
preselección SQL por escenario
   ↓
Fase 2: reconstrucción del recibo
   ↓
Fase 3: causas verificables
   ↓
Fase 4: elegibilidad + score de demo
   ↓
top local por escenario
```

## Escenarios evaluados

- `RECONNECTION`
- `DISCOUNT_ENDED`
- `PLAN_CHANGE`
- `PRORATION`

Los tres primeros exigen una causa `HIGH` y una variación `FULLY_EXPLAINED` sin residual financiero. Prorrateo también admite el caso especial `NO_PREVIOUS_BILL` cuando el monto está verificado contra Brainy y un componente proporcional del recibo; esto evita inventar una comparación mensual que no existe.

## Score

El score máximo es 100 y se compone de:

- 35 puntos: evidencia del escenario.
- 25 puntos: consistencia/conciliación financiera.
- 20 puntos: claridad del caso para una demo.
- 10 puntos: contexto complementario (por ejemplo RA/RV u órdenes de soporte).
- 10 puntos: calidad e integridad de los datos usados.

Un score alto no cambia la verdad financiera. El score solo ayuda a elegir qué caso es más sencillo y defendible para presentar.

## Preselección

No se analizan ciegamente los 20 000 registros. SQLite reduce primero el universo por señales estructuradas:

- reconexión: recibo actual enlazado con `BRAINY_RECONEXIONES` y código de cargo real;
- fin de descuento: descuento Brainy del recibo anterior, cargo negativo y señales de fin de promoción;
- cambio de plan: orden explícita entre los dos ciclos más recientes;
- prorrateo: recibo actual enlazado con Brainy y componente `PROPORCIONAL` del mismo monto.

Después la Fase 3 decide si realmente existe una causa/hallazgo verificable. La preselección por sí sola nunca se presenta como causa.

## Uso

```bash
npm run demo:rank:desafio1
```

Opciones útiles:

```bash
npm run demo:rank:desafio1 -- --scenario RECONNECTION
npm run demo:rank:desafio1 -- --limit 3 --pool 500
npm run demo:rank:desafio1 -- --json
npm run demo:rank:desafio1 -- --write
```

`--write` genera por defecto:

```text
backend/data/demo-case-selection.local.json
```

Ese archivo está ignorado por Git porque contiene identificadores concretos de la entrega oficial. No debe copiarse a documentación pública ni hardcodearse en un commit.

## Qué NO hace esta fase

- no asigna todavía Carlos/Ana a un `SUBSCRIBER_KEY`;
- no crea 20 000 logins;
- no modifica `authService.js`;
- no modifica Mi Movistar;
- no conecta todavía el motor con Lucía;
- no usa un LLM para rankear;
- no recalcula ni altera las causas de Fase 3.

La selección final de 2–3 casos se hará revisando la salida local. El mapeo de los usuarios demo a casos seleccionados pertenece a la siguiente integración.
