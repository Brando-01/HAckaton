const fs = require('fs');
const path = require('path');

const {
  runHandoffPolicyBenchmark
} = require('../services/desafio1HandoffAuditLogic');

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function printSummary(report) {
  console.log('');
  console.log('===================================================');
  console.log('  FASE 19 · PRECISIÓN DE HANDOFF');
  console.log('===================================================');
  console.log(`Estado:                    ${report.status}`);
  console.log(`Casos etiquetados:         ${report.totalCases}`);
  console.log(`Decisiones correctas:      ${report.correctCases}`);
  console.log(`Precisión lógica:          ${report.decisionAccuracy.toFixed(2)}%`);
  console.log(`Precisión de transferencia:${String(report.transferPrecision.toFixed(2)).padStart(10)}%`);
  console.log(`Recall de transferencia:   ${String(report.transferRecall.toFixed(2)).padStart(10)}%`);
  console.log(`Falsos positivos:          ${report.falsePositiveTransfers}`);
  console.log(`Falsos negativos:          ${report.falseNegativeTransfers}`);
  console.log('');
  console.log('Alcance: benchmark determinista de la política F19; no representa precisión productiva sobre tráfico real.');
}

function printDetails(report) {
  console.log('');
  console.log('Casos:');

  report.cases.forEach((item) => {
    const marker = item.ok ? '✓' : '✗';
    console.log(
      `  ${marker} ${item.caseRef} · ${item.stage} · esperado ${item.expectedDecision}/${item.expectedReason || '—'} · obtenido ${item.actualDecision}/${item.actualReason || '—'}`
    );
  });
}

function writeReport(report) {
  const destination = path.join(
    __dirname,
    '..',
    'data',
    'phase19-handoff-audit.local.json'
  );

  fs.writeFileSync(
    destination,
    JSON.stringify(report, null, 2),
    'utf8'
  );

  console.log('');
  console.log(`Artefacto local: ${destination}`);
}

function main() {
  const report =
    runHandoffPolicyBenchmark();

  printSummary(report);

  if (hasFlag('--details')) {
    printDetails(report);
  }

  if (hasFlag('--write')) {
    writeReport(report);
  }

  if (report.status !== 'PASS') {
    process.exitCode = 2;
  }
}

main();
