/**
 * Capa de respuesta por intención.
 *
 * El bug que cubre: un cliente autenticado escribía "hola" y recibía el total,
 * la comparación, la causa, el estado de deuda, los seis últimos recibos y la
 * antigüedad de la cuenta. Todo de golpe, porque la única variable que decidía
 * la respuesta era *si había datos*, no *qué preguntó*.
 */

process.env.GROQ_FALLBACK_MODE = '1';

const test = require('node:test');
const assert = require('node:assert/strict');

const { construirBloqueDeHechos } = require('../services/motorDiff');
const { clasificarIntencion, INTENCIONES } = require('../services/intencionService');
const { construirRespuesta } = require('../services/respuestaProgresiva');
const { extraerMontos, verificarMontos } = require('../services/narradorRecibos');

function cargo(campos) {
  return {
    CUSTOMER_KEY: '12345678',
    FINANCIAL_ACCOUNT_KEY: '900000001',
    LEGAL_INVOICE_NUMBER: 'S1AA-0000000001',
    ciclo: '20260705',
    CHARGE_CODE_ID: 'RC_PLANRE500',
    CHARGE_CODE_DESC: 'RV Plan Mi Movistar',
    CHARGE_CODE_CLASSIFICATION: 'Cargo Recurrente De Plan',
    GRUPO: 'CARGO FIJO VENCIDO',
    SUB_GRUPO: 'CARGO FIJO VENCIDO MOVIL',
    'FECHA-VENCIMIENTO': '20260721',
    DEUDA: 'CON DEUDA',
    CHARGE_TOTAL_AMOUNT: '39.90',
    CHARGE_NET_AMOUNT: '33.81',
    ...campos
  };
}

const CICLOS = ['20260205', '20260305', '20260405', '20260505', '20260605', '20260705'];

/** Serie plana de S/ 79.90 con una reconexión de S/ 4.58 en el último ciclo. */
const BLOQUE = construirBloqueDeHechos([
  ...CICLOS.slice(0, 5).map((ciclo) => cargo({ ciclo, CHARGE_TOTAL_AMOUNT: '79.90' })),
  cargo({ ciclo: '20260705', CHARGE_TOTAL_AMOUNT: '79.90' }),
  cargo({
    ciclo: '20260705',
    CHARGE_CODE_ID: 'OC1_RECONEXION',
    CHARGE_CODE_DESC: 'Cargo por Reconexión',
    GRUPO: 'CARGO POR RECONEXION',
    CHARGE_TOTAL_AMOUNT: '4.58'
  })
]);

const CON_CLIENTE = { tieneCliente: true };
const SIN_CLIENTE = { tieneCliente: false };

/** Atajo: clasifica el mensaje y construye su respuesta. */
function responder(mensaje, bloque = BLOQUE, contexto = CON_CLIENTE, intencionAnterior = null) {
  const clasificacion = clasificarIntencion(mensaje, { intencionAnterior });
  return {
    clasificacion,
    respuesta: construirRespuesta(clasificacion, bloque, contexto)
  };
}

test('un saludo NO vuelca el recibo', () => {
  const { clasificacion, respuesta } = responder('hola');

  assert.equal(clasificacion.intencion, INTENCIONES.SALUDO);
  assert.ok(respuesta, 'el saludo debe responderse sin LLM');

  // Lo esencial: ni una cifra.
  assert.deepEqual(extraerMontos(respuesta.texto), [], 'un saludo no debe traer montos');
  assert.doesNotMatch(respuesta.texto, /recibo del ciclo|últimos \d+ recibos|reconexión/i);
  assert.ok(respuesta.sugerencias.length > 0, 'debe ofrecer por dónde seguir');
});

test('"hola, ¿por qué subió mi recibo?" NO se trata como saludo', () => {
  const { clasificacion } = responder('hola, por que subio mi recibo?');

  assert.equal(clasificacion.intencion, INTENCIONES.CONSULTA_VARIACION);
});

test('el saludo anónimo invita a iniciar sesión y no filtra nada', () => {
  const { respuesta } = responder('buenos dias', null, SIN_CLIENTE);

  assert.match(respuesta.texto, /iniciar sesión|inicies sesión/i);
  assert.deepEqual(extraerMontos(respuesta.texto), []);
});

test('agradecer y despedirse no traen datos', () => {
  const gracias = responder('gracias');
  assert.deepEqual(extraerMontos(gracias.respuesta.texto), []);

  const adios = responder('adios');
  assert.deepEqual(extraerMontos(adios.respuesta.texto), []);
  assert.equal(adios.respuesta.cerrarInteraccion, true);
});

test('una pregunta fuera de alcance se declina sin inventar', () => {
  const { clasificacion, respuesta } = responder('cuentame un chiste');

  assert.equal(clasificacion.intencion, INTENCIONES.FUERA_DE_ALCANCE);
  assert.deepEqual(extraerMontos(respuesta.texto), []);
});

test('preguntar el monto responde el monto, no el historial completo', () => {
  const { respuesta } = responder('cuanto debo pagar?');

  assert.match(respuesta.texto, /S\/ 84\.48/);
  assert.match(respuesta.texto, /pendiente/i);
  assert.match(respuesta.texto, /21\/07\/2026/, 'avisa del vencimiento si hay deuda');
  // No arrastra la serie de seis recibos.
  assert.equal(extraerMontos(respuesta.texto).length, 1, 'solo el monto preguntado');
  assert.ok(respuesta.texto.length < 300, 'la respuesta debe ser breve');
});

test('la variación sigue los tres pasos: qué pasó, por qué, qué hacer', () => {
  const { respuesta } = responder('por que subio mi recibo?');
  const parrafos = respuesta.texto.split('\n\n');

  assert.equal(parrafos.length, 3, 'deben ser tres párrafos');

  // 1. El hecho: los dos totales y la diferencia, con sus meses.
  const montosDelHecho = extraerMontos(parrafos[0]);
  assert.ok(montosDelHecho.includes(4.58), 'debe decir cuánto cambió');
  assert.ok(montosDelHecho.includes(79.9), 'debe decir el total anterior');
  assert.ok(montosDelHecho.includes(84.48), 'debe decir el total actual');
  assert.match(parrafos[0], /julio.*junio|junio.*julio/s, 'debe nombrar los dos meses');

  assert.match(parrafos[1], /reconexión/i, 'la causa en lenguaje de cliente');
  assert.match(parrafos[2], /vencimiento|puedo/i, 'la acción siguiente');
});

test('"no entendí" cambia de registro, no repite lo mismo', () => {
  const primera = responder('por que subio mi recibo?').respuesta.texto;
  const segunda = responder('no entendi', BLOQUE, CON_CLIENTE, INTENCIONES.CONSULTA_VARIACION).respuesta.texto;

  assert.notEqual(primera, segunda);
  assert.match(segunda, /suspende|reactivarlo|una sola vez/i, 'debe explicar el mecanismo');
});

test('el detalle lista los cargos, la variación no', () => {
  const detalle = responder('quiero ver el detalle de cargos').respuesta.texto;

  assert.match(detalle, /Cargo por Reconexión/i, 'debe listar los conceptos');
  assert.match(detalle, /RV Plan Mi Movistar/i);
  assert.match(detalle, /S\/ 84\.48/, 'debe encabezar con el total');
});

test('el historial solo aparece si se pide', () => {
  const historial = responder('quiero ver mis ultimos recibos').respuesta.texto;

  // Los seis ciclos, cada uno con su mes.
  assert.equal((historial.match(/^• /gm) || []).length, 6);
  assert.match(historial, /promedio/i);
});

test('el vencimiento responde la fecha, no el recibo entero', () => {
  const { respuesta } = responder('cuando vence?');

  assert.match(respuesta.texto, /21\/07\/2026/);
  assert.ok(respuesta.texto.length < 250);
});

test('una disputa explica primero y OFRECE el asesor, no lo impone', () => {
  const { clasificacion, respuesta } = responder('no me cuadra el cobro');

  assert.equal(clasificacion.intencion, INTENCIONES.DISPUTA_COBRO);
  assert.match(respuesta.texto, /S\/ 84\.48/, 'debe mostrar el dato real');
  assert.match(respuesta.texto, /reconexión/i, 'debe explicar la causa');
  assert.match(respuesta.texto, /asesor/i, 'debe ofrecer la derivación');
  assert.equal(respuesta.sugerirHandoff, true);
});

test('sin cliente en sesión, ninguna consulta sensible suelta un monto', () => {
  const sensibles = [
    'cuanto debo pagar?',
    'por que subio mi recibo?',
    'cuando vence?',
    'quiero ver el detalle',
    'mis ultimos recibos',
    'no me cuadra el cobro'
  ];

  for (const mensaje of sensibles) {
    const { respuesta } = responder(mensaje, null, SIN_CLIENTE);

    assert.ok(respuesta, `"${mensaje}" debería tener respuesta`);
    assert.deepEqual(
      extraerMontos(respuesta.texto),
      [],
      `"${mensaje}" filtró un monto sin cliente autenticado`
    );
  }
});

test('cliente autenticado sin recibos no recibe cifras inventadas', () => {
  const vacio = construirBloqueDeHechos([]);
  const { respuesta } = responder('cuanto debo pagar?', vacio, CON_CLIENTE);

  assert.deepEqual(extraerMontos(respuesta.texto), []);
  assert.match(respuesta.texto, /asesor/i);
});

test('INVARIANTE: todo monto de toda respuesta existe en el bloque', () => {
  const mensajes = [
    'hola', 'cuanto debo pagar?', 'por que subio?', 'cuando vence?',
    'ver el detalle de cargos', 'mis ultimos recibos', 'no entendi',
    'no me cuadra el cobro', 'gracias', 'adios'
  ];

  for (const mensaje of mensajes) {
    const { respuesta } = responder(mensaje);
    if (!respuesta) continue;

    const verificacion = verificarMontos(respuesta.texto, BLOQUE);
    assert.deepEqual(
      verificacion.inventados,
      [],
      `"${mensaje}" mencionó montos que el bloque no respalda`
    );
  }
});

test('las intenciones que necesitan redacción libre se delegan al LLM', () => {
  // Devolver null es la señal de "esto lo escribe el modelo".
  for (const mensaje of ['que planes de fibra tienen?', 'mi internet esta lento', 'que es el prorrateo?']) {
    const { respuesta } = responder(mensaje);
    assert.equal(respuesta, null, `"${mensaje}" no debería resolverse por capas`);
  }
});

test('la tarjeta hereda los montos del bloque', () => {
  const { respuesta } = responder('por que subio mi recibo?');

  assert.ok(respuesta.tarjeta);
  assert.equal(respuesta.tarjeta.total, 84.48);
  assert.equal(respuesta.tarjeta.totalAnterior, 79.9);
  assert.equal(respuesta.tarjeta.historial.length, 6);
  assert.equal(respuesta.tarjeta.causas[0].codigo, 'RECONEXION');
});

test('los chips ofrecidos clasifican a donde prometen', () => {
  const { respuesta } = responder('cuanto debo pagar?');

  const esperado = {
    '¿Por qué cambió mi recibo?': INTENCIONES.CONSULTA_VARIACION,
    'Ver el detalle de cargos': INTENCIONES.CONSULTA_DETALLE,
    'Ver mis últimos recibos': INTENCIONES.CONSULTA_HISTORIAL
  };

  for (const chip of respuesta.sugerencias) {
    if (esperado[chip]) {
      assert.equal(
        clasificarIntencion(chip).intencion,
        esperado[chip],
        `el chip "${chip}" no clasifica donde promete`
      );
    }
  }
});
