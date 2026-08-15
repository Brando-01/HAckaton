const test = require('node:test');
const assert = require('node:assert/strict');

const {
  runOmnichannelContractAudit
} = require('../services/desafio1OmnichannelAuditLogic');

test('auditoría contractual F20 aprueba ruta y salvaguardas', () => {
  const report =
    runOmnichannelContractAudit();

  assert.equal(report.status, 'PASS');
  assert.equal(report.failed, 0);
  assert.equal(
    report.passed,
    report.assertions.length
  );
  assert.deepEqual(
    report.journey.map(
      (item) => item.label
    ),
    [
      'Mi Movistar',
      'Lucía web',
      'WhatsApp',
      'Asesor'
    ]
  );
});
