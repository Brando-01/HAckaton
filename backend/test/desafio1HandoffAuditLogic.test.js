const test = require('node:test');
const assert = require('node:assert/strict');

const {
  GOLDEN_HANDOFF_CASES,
  evaluateGoldenCase,
  runHandoffPolicyBenchmark
} = require('../services/desafio1HandoffAuditLogic');

test('benchmark de handoff usa casos etiquetados y no tráfico sintético aleatorio', () => {
  assert.equal(GOLDEN_HANDOFF_CASES.length, 14);
  assert.ok(GOLDEN_HANDOFF_CASES.every((item) => /^HOF\d{3}$/.test(item.caseRef)));
});

test('cada caso dorado coincide con su decisión y motivo esperados', () => {
  const results = GOLDEN_HANDOFF_CASES.map(evaluateGoldenCase);
  assert.ok(results.every((item) => item.ok));
});

test('benchmark reporta 100% de precisión lógica sin falsos positivos ni negativos', () => {
  const report = runHandoffPolicyBenchmark();

  assert.equal(report.status, 'PASS');
  assert.equal(report.decisionAccuracy, 100);
  assert.equal(report.transferPrecision, 100);
  assert.equal(report.transferRecall, 100);
  assert.equal(report.falsePositiveTransfers, 0);
  assert.equal(report.falseNegativeTransfers, 0);
});

test('benchmark declara alcance acotado a la política determinista', () => {
  const report = runHandoffPolicyBenchmark();

  assert.equal(report.scope, 'DETERMINISTIC_POLICY_GOLDEN_CASES');
  assert.equal(report.violations.length, 0);
});
