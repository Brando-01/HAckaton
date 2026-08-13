/**
 * Resolución del ciclo que pide el cliente.
 *
 * El riesgo que cubren estos tests no es inventar un monto: el blindaje ya
 * impide eso. Es responder por el recibo EQUIVOCADO con una cifra que sí
 * existe — el verificador comprueba montos, no a qué mes se los atribuye.
 */

process.env.GROQ_FALLBACK_MODE = '1';

const test = require('node:test');
const assert = require('node:assert/strict');

const { resolverCicloPedido, CICLO_FUERA_DE_RANGO } = require('../services/ragService');

/** Historial de 6 ciclos, del más reciente al más antiguo (como lo arma el motor). */
const BLOQUE = {
  encontrado: true,
  reciboActual: { ciclo: '20260630' },
  historial: [
    { ciclo: '20260630', total: 74.89 },
    { ciclo: '20260531', total: 74.89 },
    { ciclo: '20260430', total: 74.89 },
    { ciclo: '20260331', total: 429.89 },
    { ciclo: '20260228', total: 85.9 },
    { ciclo: '20260131', total: 68.72 }
  ]
};

test('"hace 3 meses" retrocede tres recibos, no responde por el actual', () => {
  assert.equal(resolverCicloPedido('quiero el recibo de hace 3 meses', BLOQUE), '20260331');
  assert.equal(resolverCicloPedido('cuanto pague hace 3 meses?', BLOQUE), '20260331');
});

test('entiende la cantidad escrita con letras', () => {
  assert.equal(resolverCicloPedido('el recibo de hace tres meses', BLOQUE), '20260331');
  assert.equal(resolverCicloPedido('hace dos meses cuanto pague?', BLOQUE), '20260430');
  assert.equal(resolverCicloPedido('hace un mes', BLOQUE), '20260531');
});

test('entiende "el mes pasado" y sus variantes', () => {
  assert.equal(resolverCicloPedido('cuanto pague el mes pasado?', BLOQUE), '20260531');
  assert.equal(resolverCicloPedido('el recibo anterior', BLOQUE), '20260531');
  assert.equal(resolverCicloPedido('el mes antepasado', BLOQUE), '20260430');
});

test('el nombre del mes sigue funcionando', () => {
  assert.equal(resolverCicloPedido('dame el recibo de marzo', BLOQUE), '20260331');
  assert.equal(resolverCicloPedido('por que subio en febrero?', BLOQUE), '20260228');
});

test('pedir un recibo que el cliente no tuvo no responde por otro mes', () => {
  // Solo hay 6 ciclos: "hace 10 meses" no existe. Antes esto caía al recibo
  // actual y contestaba como si fuera el pedido.
  assert.equal(resolverCicloPedido('el recibo de hace 10 meses', BLOQUE), CICLO_FUERA_DE_RANGO);
  assert.equal(resolverCicloPedido('hace 6 meses', BLOQUE), CICLO_FUERA_DE_RANGO);
});

test('una pregunta sin referencia temporal deja el recibo actual', () => {
  assert.equal(resolverCicloPedido('por que subio mi recibo?', BLOQUE), null);
  assert.equal(resolverCicloPedido('cuanto debo?', BLOQUE), null);
  assert.equal(resolverCicloPedido('hola', BLOQUE), null);
});

test('nombrar el mes del recibo actual no fuerza un recálculo', () => {
  assert.equal(resolverCicloPedido('el recibo de junio', BLOQUE), null);
});

test('sin bloque de hechos no resuelve nada', () => {
  assert.equal(resolverCicloPedido('hace 3 meses', null), null);
  assert.equal(resolverCicloPedido('hace 3 meses', { encontrado: false }), null);
});
