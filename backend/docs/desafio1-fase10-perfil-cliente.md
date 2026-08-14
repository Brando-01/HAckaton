# Fase 10 · Consultas deterministas del perfil del cliente

## Objetivo

Permitir que Lucía demuestre que la sesión está vinculada a datos estructurados del desafío, respondiendo preguntas concretas del perfil autenticado en lugar de enviar esas preguntas al LLM.

## Campos del perfil habilitados

Desde `PLANTA CLIENTES.csv` se pueden responder, cuando estén disponibles:

- código de cliente anonimizado (`COD_CLIENTE`);
- fecha de activación (`fecha_activacion_original`);
- día de ciclo (`ciclo`);
- tipo de servicio (`lob_type`);
- negocio (`negocio`).

Desde la experiencia de facturación ya reconstruida se pueden responder:

- plan/cargo principal del recibo;
- estado de deuda;
- conceptos visibles del recibo;
- presencia de una reconexión únicamente si el motor la verificó con evidencia.

Las consultas de total, recibo anterior, descuentos, prorrateo y tipo de renta continúan usando la lógica determinista de facturación existente.

## Identidad y privacidad

`DEMOxxxxxx` es un alias creado por la aplicación. Para demostrar la vinculación con el dataset, el chat puede mostrar `COD_CLIENTE` como código de cliente anonimizado cuando el usuario autenticado lo solicita.

No se exponen:

- `NUM_ANEXO` / `SUBSCRIBER_KEY`;
- cuentas financieras;
- `BILLING_ARRANGEMENT_KEY`;
- hash de teléfono.

El dataset entregado ya está anonimizado. El objetivo no es reconstruir una identidad real sino consultar consistentemente los registros asociados al perfil técnico.

## Flujo

```text
sesión autenticada / DEMOxxxxxx
        ↓
resolución privada del subscriber
        ↓
PLANTA CLIENTES.csv → desafio1.db
        ↓
perfil seguro
        ↓
clasificador determinista
        ↓
respuesta de Lucía
```

El LLM no participa en estas respuestas.

## Preguntas de demo recomendadas

- `¿Qué datos tienes de mí?`
- `¿Cuál es mi ID?`
- `¿Desde cuándo tengo el servicio?`
- `¿Cuál es mi ciclo de facturación?`
- `¿Qué tipo de servicio tengo?`
- `¿Cuál es mi plan?`
- `¿Tengo deuda?`
- `¿Qué cargos tengo?`
- `¿Estos datos vienen del CSV?`

Para el importe exacto del recibo se mantiene la consulta ya soportada:

- `¿Cuál es el total de mi recibo?`
