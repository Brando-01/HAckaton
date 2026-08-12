const test = require('node:test');
const assert = require('node:assert/strict');

const { construirRespuestaFallback } = require('../services/ragService');

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
