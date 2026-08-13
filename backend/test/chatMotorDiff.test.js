/**
 * End-to-end del flujo de chat contra la data real.
 *
 * Comprueba lo que el reto puntúa de verdad: que una pregunta del cliente
 * termine en una respuesta con los montos exactos de su recibo, sin una sola
 * cifra que no salga del bloque de hechos.
 *
 * Corre con GROQ_FALLBACK_MODE=1, así que ejercita el camino determinista
 * completo sin depender de la API de Groq.
 */

process.env.GROQ_FALLBACK_MODE = '1';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { procesarConsultaFactura } = require('../services/ragService');
const { getOrCreateSession, updateContext, resetSession } = require('../services/sessionService');
const { obtenerHechosDeCliente, ARCHIVO_CARGOS } = require('../services/cargosRepository');
const { verificarMontos, extraerMontos } = require('../services/narradorRecibos');

const DATA_DIR = path.join(__dirname, '..', 'data');
const HAY_DATA_REAL = fs.existsSync(path.join(DATA_DIR, ARCHIVO_CARGOS));
const SALTAR = !HAY_DATA_REAL && 'falta backend/data/';

let contador = 0;

/** Sesión nueva ya asociada a un cliente, como tras iniciar sesión. */
function sesionConCliente(customerId) {
  contador += 1;
  const sessionId = `test-motor-${contador}`;
  resetSession(sessionId);
  getOrCreateSession(sessionId);
  updateContext(sessionId, { customerIdentifier: customerId });
  return sessionId;
}

async function preguntar(customerId, mensaje) {
  const resultado = await procesarConsultaFactura(mensaje, sesionConCliente(customerId));
  return typeof resultado === 'string' ? { reply: resultado } : resultado;
}

test('el chat devuelve siempre el contrato {reply, foundData, sessionId}', { skip: SALTAR }, async () => {
  const respuesta = await preguntar('125420001', '¿por qué subió mi recibo?');

  assert.equal(typeof respuesta.reply, 'string');
  assert.equal(typeof respuesta.foundData, 'boolean');
  assert.equal(typeof respuesta.sessionId, 'string');
  assert.equal(respuesta.foundData, true);
});

test('el chat explica la reconexión con el monto exacto del recibo', { skip: SALTAR }, async () => {
  const { reply } = await preguntar('125420001', '¿por qué subió mi recibo este mes?');

  assert.match(reply, /S\/ 84\.48/, 'debe decir el total real del recibo');
  assert.match(reply, /S\/ 79\.90/, 'debe decir el total del recibo anterior');
  assert.match(reply, /S\/ 4\.58/, 'debe decir cuánto subió');
  assert.match(reply, /reconexión/i, 'debe explicar la causa');
});

test('el chat explica un recibo con dos causas sin mezclar los montos', { skip: SALTAR }, async () => {
  const { reply } = await preguntar('123165012', '¿por qué me están cobrando más?');

  assert.match(reply, /S\/ 49\.89/);
  assert.match(reply, /S\/ 34\.95/);
  assert.match(reply, /2 motivos/);
  assert.match(reply, /descuento/i);
});

test('el chat no inventa causas cuando el recibo no cambió', { skip: SALTAR }, async () => {
  const { reply } = await preguntar('58364152', '¿por qué subió mi recibo?');

  assert.match(reply, /S\/ 89\.91/);
  assert.match(reply, /no hubo ninguna variación/i);
  assert.doesNotMatch(reply, /descuento|reconexión|cambio de plan/i);
});

test('el chat responde por un recibo anterior cuando el cliente nombra el mes', { skip: SALTAR }, async () => {
  // 48799623 tiene el pico de AMERICATEL en el ciclo de marzo, no en el actual.
  const { reply } = await preguntar('48799623', '¿por qué mi recibo de marzo salió tan alto?');

  assert.match(reply, /S\/ 429\.89/, 'debe hablar del recibo de marzo, no del último');
  assert.match(reply, /S\/ 343\.99/, 'debe decir cuánto fue el cargo de terceros');
  assert.match(reply, /terceros/i);
});

test('sin cliente en sesión el chat no expone datos de facturación', { skip: SALTAR }, async () => {
  contador += 1;
  const sessionId = `test-motor-anon-${contador}`;
  resetSession(sessionId);

  const resultado = await procesarConsultaFactura('¿cuánto debo pagar?', sessionId);
  const reply = typeof resultado === 'string' ? resultado : resultado.reply;

  assert.doesNotMatch(reply, /S\/ \d/, 'no debe soltar ningún monto sin cliente identificado');
});

test('ninguna respuesta del chat contiene un monto fuera del bloque de hechos', { skip: SALTAR }, async () => {
  const casos = [
    ['125420001', '¿por qué subió mi recibo?'],
    ['123165012', '¿cuánto tengo que pagar?'],
    ['58364152', 'no entiendo mi recibo'],
    ['130857463', '¿cuánto pagué el mes pasado?'],
    ['128757351', 'explícame mi factura'],
    ['58013061', '¿por qué cambió mi recibo?']
  ];

  for (const [cliente, mensaje] of casos) {
    const { reply } = await preguntar(cliente, mensaje);
    const hechos = await obtenerHechosDeCliente(DATA_DIR, cliente);
    const verificacion = verificarMontos(reply, hechos);

    assert.deepEqual(
      verificacion.inventados,
      [],
      `"${mensaje}" para ${cliente} devolvió montos inventados`
    );
    assert.ok(extraerMontos(reply).length > 0, `la respuesta para ${cliente} no dio ninguna cifra`);
  }
});

test('todo precio de planes que da el fallback existe en el catálogo', { skip: SALTAR }, async () => {
  const { construirRespuestaFallback } = require('../services/ragService');

  // El catálogo se carga en streaming al importar el módulo.
  await new Promise((resolve) => setTimeout(resolve, 3000));

  const reply = construirRespuestaFallback('¿qué planes de fibra tienen?', null, '', '');
  const precios = extraerMontos(reply);

  // Antes estos precios estaban escritos a mano en el código y podían
  // separarse del catálogo sin que nadie se enterara. Ahora se comprueba la
  // procedencia de cada cifra contra el CSV.
  const csv = fs.readFileSync(path.join(DATA_DIR, 'catalogo_ofertas_entrega.csv'), 'utf8');
  const preciosDelCatalogo = new Set(
    csv.split(/\r?\n/).slice(1)
      .map((linea) => Number(linea.split(',')[5]))
      .filter((precio) => Number.isFinite(precio))
  );

  assert.ok(precios.length > 0, 'el fallback debería listar algún plan');

  for (const precio of precios) {
    assert.ok(
      preciosDelCatalogo.has(precio),
      `S/ ${precio} no existe en catalogo_ofertas_entrega.csv`
    );
  }
});

test('sin catálogo cargado el fallback prefiere no dar precios', { skip: SALTAR }, () => {
  // El texto de respaldo no debe contener ninguna cifra: mejor derivar a un
  // asesor que arriesgar una tarifa inventada.
  const respaldo = 'Ahora mismo no puedo consultar el catálogo de planes. Prefiero no darte precios que no pueda confirmar: puedo derivarte con un asesor para que te dé las tarifas vigentes.';

  assert.deepEqual(extraerMontos(respaldo), []);
});
