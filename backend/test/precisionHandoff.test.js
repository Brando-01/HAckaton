/**
 * Precisión del hand-off — métrica que el jurado evalúa explícitamente.
 *
 * Se mide en las dos direcciones, porque las dos cuentan:
 *
 *   - Falso negativo: el cliente pide un asesor y el bot lo ignora.
 *   - Falso positivo: el cliente solo quería una explicación y se le deriva.
 *     Esto es peor de lo que parece: derivar a quien preguntó "no entiendo mi
 *     recibo" contradice el propósito del asistente y dispara las llamadas al
 *     call center, que es justo el indicador de negocio que hay que bajar.
 *
 * Antes `esSolicitudAsesor` tenía 9 patrones de frase casi exacta.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { esSolicitudAsesor, determinarMotivoDerivacion } = require('../services/handoffService');

/** Frases que SÍ deben derivar. */
const DERIVAR = {
  'pide un humano explícitamente': [
    'quiero hablar con un asesor',
    'necesito un asesor',
    'me pasas con un humano?',
    'quiero hablar con una persona real',
    'atencion humana por favor',
    'quiero atencion al cliente',
    'pasame con un agente',
    'necesito hablar con un ejecutivo',
    'quiero un representante',
    'comunicame con un supervisor',
    'derivame con alguien',
    'quiero hablar con alguien'
  ],
  'está en desacuerdo con el cobro': [
    'no estoy de acuerdo con el monto',
    'no me cuadra lo que me cobran',
    'esto esta mal',
    'esta mal mi recibo',
    'me cobraron de mas',
    'esto es un cobro indebido',
    'esto es un abuso',
    'me estan estafando'
  ],
  'quiere reclamar o escalar': [
    'quiero presentar un reclamo',
    'voy a hacer un reclamo',
    'quiero reclamar',
    'voy a ir a osiptel',
    'esto lo llevo a indecopi',
    'quiero el libro de reclamaciones'
  ],
  'riesgo de fuga': [
    'quiero dar de baja mi servicio',
    'quiero cancelar mi servicio',
    'me quiero ir a otro operador',
    'quiero portabilidad'
  ],
  'el bot ya falló': [
    'esto no me ayudo',
    'no resolvio mi problema',
    'sigo sin entender nada',
    'ya te explique y no me entiendes',
    'pesimo servicio'
  ]
};

/** Frases que NO deben derivar: son trabajo del asistente. */
const NO_DERIVAR = {
  'solo quiere que le expliquen': [
    'no entiendo mi recibo',
    'no entiendo',
    'explicame mejor',
    'me puedes explicar por que subio?',
    'no me queda claro',
    'que significa este cargo?',
    'explicamelo mas facil'
  ],
  'consulta normal de facturación': [
    'cuanto debo pagar?',
    'por que subio mi recibo?',
    'cuando vence mi recibo?',
    'quiero ver mis ultimos recibos',
    'cuanto pague el mes pasado?'
  ],
  'consulta de catálogo': [
    'que planes de fibra tienen?',
    'cuanto cuesta el internet de 200mb?',
    'quiero contratar un plan'
  ],
  'cortesía': [
    'hola',
    'buenos dias',
    'gracias',
    'ya entendi, gracias',
    'perfecto'
  ]
};

test('deriva cuando el cliente lo pide o está disconforme', () => {
  const fallos = [];

  for (const [grupo, frases] of Object.entries(DERIVAR)) {
    for (const frase of frases) {
      if (!esSolicitudAsesor(frase)) {
        fallos.push(`[${grupo}] "${frase}"`);
      }
    }
  }

  assert.deepEqual(fallos, [], `falsos negativos: no se derivaron ${fallos.length} frases`);
});

test('NO deriva cuando el cliente solo quiere una explicación', () => {
  const fallos = [];

  for (const [grupo, frases] of Object.entries(NO_DERIVAR)) {
    for (const frase of frases) {
      if (esSolicitudAsesor(frase)) {
        fallos.push(`[${grupo}] "${frase}"`);
      }
    }
  }

  assert.deepEqual(fallos, [], `falsos positivos: se derivaron ${fallos.length} frases que no debían`);
});

test('funciona con y sin tildes y sin importar mayúsculas', () => {
  assert.equal(esSolicitudAsesor('Quiero hablar con un ASESOR'), true);
  assert.equal(esSolicitudAsesor('no me cuadra'), true);
  assert.equal(esSolicitudAsesor('No me cuadrá'), true);
  assert.equal(esSolicitudAsesor('QUIERO RECLAMAR'), true);
});

test('un mensaje vacío no deriva', () => {
  assert.equal(esSolicitudAsesor(''), false);
  assert.equal(esSolicitudAsesor('   '), false);
  assert.equal(esSolicitudAsesor(null), false);
  assert.equal(esSolicitudAsesor(undefined), false);
});

test('la precisión global se mide y no baja del 95%', () => {
  // Deja constancia numérica de la métrica que evalúa el jurado.
  const positivos = Object.values(DERIVAR).flat();
  const negativos = Object.values(NO_DERIVAR).flat();

  const verdaderosPositivos = positivos.filter((f) => esSolicitudAsesor(f)).length;
  const verdaderosNegativos = negativos.filter((f) => !esSolicitudAsesor(f)).length;

  const total = positivos.length + negativos.length;
  const aciertos = verdaderosPositivos + verdaderosNegativos;
  const precision = aciertos / total;

  assert.ok(
    precision >= 0.95,
    `precisión ${(precision * 100).toFixed(1)}% sobre ${total} frases (${aciertos} aciertos)`
  );
});

test('el motivo del caso distingue desacuerdo, no resuelto y pedido', () => {
  assert.equal(determinarMotivoDerivacion('quiero hablar con un asesor'), 'CLIENT_REQUEST');
  assert.equal(determinarMotivoDerivacion('quiero dar de baja mi servicio'), 'CLIENT_REQUEST');

  assert.equal(determinarMotivoDerivacion('no estoy de acuerdo'), 'CUSTOMER_DISAGREES');
  assert.equal(determinarMotivoDerivacion('no me cuadra el cobro'), 'CUSTOMER_DISAGREES');
  assert.equal(determinarMotivoDerivacion('quiero reclamar'), 'CUSTOMER_DISAGREES');
  assert.equal(determinarMotivoDerivacion('voy a ir a osiptel'), 'CUSTOMER_DISAGREES');
  assert.equal(determinarMotivoDerivacion('me cobraron de mas'), 'CUSTOMER_DISAGREES');

  assert.equal(determinarMotivoDerivacion('esto no me ayudo'), 'NOT_RESOLVED');
  assert.equal(determinarMotivoDerivacion('no resolvio mi problema'), 'NOT_RESOLVED');
  assert.equal(determinarMotivoDerivacion('sigo sin entender'), 'NOT_RESOLVED');
});

test('el motivo solo usa los tres códigos que valida metricsService', () => {
  const CODIGOS = ['CLIENT_REQUEST', 'CUSTOMER_DISAGREES', 'NOT_RESOLVED'];

  for (const frase of Object.values(DERIVAR).flat()) {
    assert.ok(
      CODIGOS.includes(determinarMotivoDerivacion(frase)),
      `"${frase}" produjo un motivo fuera del conjunto cerrado`
    );
  }
});
