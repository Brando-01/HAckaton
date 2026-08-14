# Desafío 1 · Fase 18 — cross-selling restrictivo y Efecto Efervescente

## Objetivo

Fase 18 incorpora una capa comercial **separada** del razonamiento financiero. La ficha del desafío permite revisar alternativas comerciales cuando corresponda y define el *Efecto Efervescente* como recordar de forma proactiva beneficios que el cliente **ya posee**, sin presentarlos como altas nuevas.

La regla de seguridad de esta fase es:

```text
consulta RESOLVED
+ guardas financieras confirmadas
+ perfil comercial simulado disponible
+ oferta compatible
+ regla explícita
+ sin contacto previo de la misma oferta en el historial disponible
= puede mostrarse una opción comercial
```

Si cualquiera de esas condiciones falla, **no hay oferta**.

## Separación de fuentes

Los ocho datasets oficiales del Desafío 1 continúan siendo la única base para importes, causas, renta, recibos y beneficios financieros verificados.

La recomendación comercial usa exclusivamente una capa sintética que ya existía en el repositorio:

- `dataset_clientes.csv`;
- `catalogo_ofertas_entrega.csv`;
- `historial_campanias.csv`.

El contrato la identifica como `SIMULATED_COMMERCIAL_LAYER`. Sus datos **no pueden alterar** totales, deltas, causas, Retrieval Accuracy ni el estado financiero del cliente.

## Política de cross-selling

No existe una oferta por defecto. Fase 18 implementa solo estas reglas explícitas del prototipo:

### `MT_EXPLICIT_ELIGIBILITY`

Puede proponer una oferta del catálogo marcada como Movistar Total únicamente si el perfil comercial simulado indica simultáneamente:

- `elegible_mt = true`;
- todavía no es Movistar Total;
- tiene servicio móvil;
- tiene servicio hogar.

Se elige la opción Movistar Total de menor precio disponible en el catálogo simulado. Esto no se presenta como disponibilidad contractual confirmada.

### `MOBILE_USAGE_NEAR_ALLOWANCE`

Es una **regla simplificada del prototipo, no una política oficial de Movistar**. Puede ofrecer el siguiente plan móvil del catálogo cuando:

- el negocio oficial del servicio es `MOVIL`;
- el perfil comercial simulado registra servicio móvil;
- el plan comercial actual existe en el catálogo y tiene GB finitos;
- el consumo promedio simulado alcanza al menos 90% de los GB incluidos;
- existe un plan móvil con mayor capacidad.

El umbral se declara expresamente para que la decisión sea auditable y no quede escondida en un modelo generativo.

## Supresiones

Aunque exista una regla compatible, no se muestra cross-selling cuando:

- la resolución es `PARTIALLY_RESOLVED` o `UNRESOLVED`;
- no se puede confirmar que el LLM quedó fuera del razonamiento financiero;
- el turno contiene un momento sensible de `RECONNECTION` o `SUSPENSION_ADJUSTMENT`;
- ya se mostró una oferta en la misma sesión;
- en el historial comercial disponible la misma oferta ya figura como `aceptada`, `rechazada` o `pendiente`;
- no existe perfil/catálogo comercial utilizable;
- no hay una regla explícita compatible.

No se usa `n_reclamos` como veto en esta fase porque el material entregado no define un umbral de reclamos que autorice o prohíba una oferta. Inventar ese umbral sería una regla de negocio no sustentada.

## Efecto Efervescente

Se implementa por separado del cross-selling.

Solo un `ACTIVE_DISCOUNT` con `evidenceLevel = HIGH`, ya presente en la experiencia financiera oficial, puede producir el recordatorio:

```text
Beneficio vigente
Ya cuentas con este beneficio
<descripción ya verificada>
```

Guardas:

- `existingBenefit = true`;
- `newAddition = false`;
- no se inventan ventajas;
- evidencia `MEDIUM` no basta;
- se muestra como máximo una vez por sesión;
- si hay un beneficio vigente verificable, tiene prioridad sobre una oferta comercial en ese turno.

Mi Movistar puede mostrar este recordatorio porque es un dato ya verificado del recibo. Abrir Mi Movistar **no** constituye una consulta resuelta y por eso nunca dispara cross-selling por sí solo.

## Seguimiento de una oferta

El botón `Conocer esta opción` envía una intención fija al backend. La respuesta se construye de forma determinista usando únicamente la oferta segura guardada en la sesión. Se aclara que:

- el precio es referencial y proviene del catálogo comercial simulado;
- mostrar la opción no cambia servicio ni recibo;
- disponibilidad y contratación deben confirmarse mediante un canal comercial.

Fase 18 no implementa contratación, cobro, alta de plan ni modificación del servicio.

## Código legado NBO

`services/nboService.js` y `routes/nbo.js` se consideran legado de una iteración anterior. Contienen fallbacks y valores comerciales inventados y **no forman parte del flujo de Fase 18 ni están montados por `server.js`**. No deben reutilizarse para afirmar cumplimiento del desafío.

## Privacidad y trazabilidad

`commercialExperience` es una proyección segura. No contiene `SUBSCRIBER_KEY`, `CUSTOMER_KEY`, número de factura, cuenta financiera, filas fuente, documento ni teléfono.

La sesión solo conserva una proyección segura de la oferta mostrada y estados como `commercialOfferShown` / `effervescentBenefitShown` para impedir spam. Las decisiones comerciales no se delegan al LLM.

## Condición de salida

Fase 18 puede aprobarse si:

1. todos los tests pasan;
2. una consulta no resuelta no ofrece cross-selling;
3. un momento sensible no ofrece cross-selling;
4. una regla compatible puede ofrecer una opción real del catálogo simulado sin fallback;
5. la misma oferta no se repite si ya consta en historial o en la sesión;
6. Efecto Efervescente solo recuerda beneficios `HIGH` existentes;
7. Mi Movistar no dispara ofertas por el mero hecho de abrirse;
8. Fase 16 mantiene 100% de Retrieval Accuracy / grounding y 0 violaciones detectables;
9. preflight y smoke permanecen sin regresiones.
