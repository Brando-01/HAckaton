const {
  runOmnichannelContractAudit
} = require(
  '../services/desafio1OmnichannelAuditLogic'
);

function main() {
  const report =
    runOmnichannelContractAudit();

  console.log('');
  console.log(
    '==================================================='
  );
  console.log(
    '  FASE 20 · CONTINUIDAD OMNICANAL'
  );
  console.log(
    '==================================================='
  );
  console.log(
    `Estado:                ${report.status}`
  );
  console.log(
    `Controles aprobados:   ${report.passed}/${report.assertions.length}`
  );
  console.log('');
  console.log('Ruta contractual:');
  console.log(
    `  ${report.journey.map((item) => item.label).join(' → ')}`
  );
  console.log('');

  report.assertions.forEach(
    (item) => {
      console.log(
        `  ${item.passed ? '✓' : '✗'} ${item.code}`
      );
      console.log(
        `    ${item.detail}`
      );
    }
  );

  console.log('');
  console.log('Salvaguardas:');
  report.safeguards.forEach(
    (item) =>
      console.log(`  - ${item}`)
  );

  if (report.status !== 'PASS') {
    process.exitCode = 2;
  }
}

main();
