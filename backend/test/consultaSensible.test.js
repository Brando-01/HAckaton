const test = require('node:test');
const assert = require('node:assert/strict');

const { esConsultaSensible, normalizar } = require('../services/consultaSensible');

test('normalizar quita tildes y baja a minúsculas', () => {
  assert.equal(normalizar('¿Cuánto DEBO pagar?'), '¿cuanto debo pagar?');
  assert.equal(normalizar('Mi Recibo SUBIÓ'), 'mi recibo subio');
  assert.equal(normalizar(null), '');
});

test('detecta las consultas que el regex viejo ya cubría', () => {
  const cubiertas = [
    'tengo deuda?',
    'cuánto debo pagar',
    'quiero ver mi recibo',
    'mi recibo de este mes'
  ];

  for (const mensaje of cubiertas) {
    assert.ok(esConsultaSensible(mensaje), `debería ser sensible: "${mensaje}"`);
  }
});

test('detecta los parafraseos peruanos que antes se colaban', () => {
  // Todas estas pasaban el gate viejo y llegaban a la data sin autenticación.
  const parafraseos = [
    '¿cuánto me toca este mes?',
    '¿cuánto me sale este mes?',
    '¿cuánto me cobraron?',
    '¿cuánto me llegó?',
    '¿por qué subió?',
    '¿por qué me cobraron más?',
    '¿por qué vino más caro?',
    'no me cuadra el monto',
    '¿cuándo vence?',
    '¿qué día tengo que pagar?',
    'fecha de vencimiento',
    '¿qué plan tengo?',
    'quiero ver mis pagos',
    'mi historial',
    '¿estoy al día?',
    'me van a cortar el servicio?',
    'mi saldo',
    'mi consumo',
    'el recibo del mes pasado',
    'mi último recibo'
  ];

  for (const mensaje of parafraseos) {
    assert.ok(esConsultaSensible(mensaje), `debería ser sensible: "${mensaje}"`);
  }
});

test('funciona con y sin tildes', () => {
  assert.equal(esConsultaSensible('¿cuánto me toca?'), true);
  assert.equal(esConsultaSensible('cuanto me toca'), true);
  assert.equal(esConsultaSensible('¿por qué subió mi recibo?'), true);
  assert.equal(esConsultaSensible('por que subio mi recibo'), true);
});

test('no bloquea las preguntas de catálogo público', () => {
  // Responderlas no requiere mirar los datos de nadie: bloquearlas sería
  // hostil y además rompería el atajo de catálogo del chat.
  const publicas = [
    '¿qué planes de fibra óptica tienen?',
    '¿cuánto cuesta el internet hogar de 200Mb?',
    'quiero contratar fibra',
    'hola',
    'buenos días',
    '¿tienen cobertura en Arequipa?',
    'gracias',
    '¿cómo funciona Movistar Total?'
  ];

  for (const mensaje of publicas) {
    assert.ok(!esConsultaSensible(mensaje), `no debería ser sensible: "${mensaje}"`);
  }
});

test('un mensaje vacío no es sensible', () => {
  assert.equal(esConsultaSensible(''), false);
  assert.equal(esConsultaSensible('   '), false);
  assert.equal(esConsultaSensible(null), false);
  assert.equal(esConsultaSensible(undefined), false);
});
