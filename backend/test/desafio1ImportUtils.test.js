const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeHeader,
  toInteger,
  toNumber,
  normalizeDate,
  normalizeDateTime,
  normalizeRentType,
  shouldCountParseWarning,
  validateHeaders
} = require('../scripts/desafio1/importUtils');

test('normaliza BOM y espacios de encabezados', () => {
  assert.equal(normalizeHeader('\uFEFFFECHA-VENCIMIENTO '), 'FECHA-VENCIMIENTO');
});

test('normaliza fechas YYYYMMDD y DD/MM/YYYY', () => {
  assert.equal(normalizeDate('20260705'), '2026-07-05');
  assert.equal(normalizeDate('27/03/2026'), '2026-03-27');
  assert.equal(normalizeDate('2026-03-27'), '2026-03-27');
});

test('normaliza datetimes de las distintas fuentes', () => {
  assert.equal(
    normalizeDateTime('25/03/2026 00:00:00'),
    '2026-03-25 00:00:00'
  );
  assert.equal(
    normalizeDateTime('2026-07-31 23:53:17.000'),
    '2026-07-31 23:53:17'
  );
  assert.equal(
    normalizeDateTime('18/02/2022 00:00'),
    '2022-02-18 00:00:00'
  );
});

test('00:00.0 se interpreta como fecha no disponible', () => {
  assert.equal(normalizeDate('00:00.0'), null);
  assert.equal(normalizeDateTime('00:00.0'), null);
  assert.equal(shouldCountParseWarning('datetime', '00:00.0', null), false);
});

test('normaliza renta adelantada y vencida', () => {
  assert.equal(normalizeRentType('RA'), 'RA');
  assert.equal(normalizeRentType('ADELANTADA'), 'RA');
  assert.equal(normalizeRentType('RV'), 'RV');
  assert.equal(normalizeRentType('VENCIDA'), 'RV');
  assert.equal(normalizeRentType(''), null);
});

test('convierte enteros y montos sin inventar valores inválidos', () => {
  assert.equal(toInteger('31'), 31);
  assert.equal(toInteger('3.5'), null);
  assert.equal(toNumber('4.58'), 4.58);
  assert.equal(toNumber('30,00'), 30);
  assert.equal(toNumber(''), null);
});

test('detecta cambios de estructura del CSV', () => {
  const result = validateHeaders(
    ['A', 'B ', 'C'],
    ['A', 'B', 'D']
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, ['D']);
  assert.deepEqual(result.unexpected, ['C']);
});
