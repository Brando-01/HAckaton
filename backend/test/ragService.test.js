const test = require('node:test');
const assert = require('node:assert/strict');

const { construirRespuestaFallback, respuestaMantieneHechos } = require('../services/ragService');

test('construirRespuestaFallback returns a useful debt summary when the AI service is unavailable', () => {
  const resumen = [
    'RESUMEN ESTRUCTURADO DE FACTURACIÓN',
    '- Cliente: 52115748',
    '- Estado de deuda: CON DEUDA',
    '- Monto neto estimado: S/ 120.50',
    '- Fecha de vencimiento: 2026-09-15',
    '- Cargos principales:',
    '  • Recarga adicional · S/ 120.50'
  ].join('\n');

  const reply = construirRespuestaFallback('¿tengo deuda o no?', '52115748', resumen, '');

  assert.match(reply, /CON DEUDA/);
  assert.match(reply, /120.50/);
  assert.match(reply, /2026-09-15/);
  assert.match(reply, /Recarga adicional/);
});

test('la capa amigable no puede introducir montos ni facturas ajenos al borrador verificado', () => {
  const draft = 'Tu factura S5AA-0081881237 tiene cargos por S/ 83.99, vence el 17/07/2026 y figura CON DEUDA.';

  assert.equal(respuestaMantieneHechos('Tu factura S5AA-0081881237 suma S/ 83.99, vence el 17/07/2026 y figura CON DEUDA.', draft), true);
  assert.equal(respuestaMantieneHechos('Tu factura S5AA-0099999999 suma S/ 99.99.', draft), false);
  assert.equal(respuestaMantieneHechos('Tu factura S5AA-0081881237 suma S/ 83.99 y vence el 18/07/2026.', draft), false);
  assert.equal(respuestaMantieneHechos('Tu factura S5AA-0081881237 suma S/ 83.99 y figura SIN DEUDA.', draft), false);
});

test('la capa amigable no puede prometer verificar pagos ni borrar una negativa a inventar', () => {
  const paidDraft = 'Los datos no incluyen pagos recientes. Si ya pagaste, no puedo concluir que sigas debiendo: falta confirmar la aplicación del pago.';
  const inventedDraft = 'No voy a ignorar los datos ni inventar una deuda o una causa. Tu último recibo suma S/ 39.90.';

  assert.equal(respuestaMantieneHechos('Revisa la plataforma para confirmar que el pago se aplicó.', paidDraft), false);
  assert.equal(respuestaMantieneHechos('Los datos no incluyen pagos recientes, así que no puedo confirmar si ya se aplicó.', paidDraft), true);
  assert.equal(respuestaMantieneHechos('No encontré una causa probable. Tu último recibo suma S/ 39.90.', inventedDraft), false);
  assert.equal(respuestaMantieneHechos('No puedo inventar una causa sin evidencia. Tu último recibo suma S/ 39.90.', inventedDraft), true);
});

test('la capa amigable conserva el concepto de recibo y rechaza recomendaciones agregadas', () => {
  const draft = 'Tu recibo aumentó S/ 39.57 frente al anterior.';

  assert.equal(respuestaMantieneHechos('El aumento en tu rédito fue de S/ 39.57.', draft), false);
  assert.equal(respuestaMantieneHechos('Tu recibo aumentó S/ 39.57; llama a servicio al cliente.', draft), false);
  assert.equal(respuestaMantieneHechos('Tu recibo aumentó S/ 39.57 frente al anterior.', draft), true);
});

test('el fallback prioriza un saludo sobre cualquier resumen personal cargado', () => {
  const summary = [
    '- Factura: S9AA-0082671200',
    '- Estado registrado: CON DEUDA',
    '- Total neto calculado de cargos: S/ 39.90'
  ].join('\n');

  const reply = construirRespuestaFallback('hola', '48728116', summary, '');

  assert.match(reply, /¡Hola!/);
  assert.doesNotMatch(reply, /S9AA-|CON DEUDA|S\/ 39\.90/);
});
