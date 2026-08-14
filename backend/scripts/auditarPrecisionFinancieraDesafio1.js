const fs = require('fs');
const path = require('path');

const {
  createFinancialAuditService
} = require(
  '../services/desafio1FinancialAuditService'
);

const DEFAULT_OUTPUT_PATH =
  path.resolve(
    __dirname,
    '../data/phase16-financial-audit.local.json'
  );

function parseArgs(argv) {
  const options = {
    limit: 300,
    concurrency: 4,
    json: false,
    details: false,
    write: false,
    outputPath:
      DEFAULT_OUTPUT_PATH
  };

  for (
    let index = 0;
    index < argv.length;
    index += 1
  ) {
    const arg = argv[index];

    if (
      arg === '--limit' ||
      arg === '-n'
    ) {
      options.limit =
        Number.parseInt(
          argv[index + 1],
          10
        );
      index += 1;
      continue;
    }

    if (
      arg === '--concurrency' ||
      arg === '-c'
    ) {
      options.concurrency =
        Number.parseInt(
          argv[index + 1],
          10
        );
      index += 1;
      continue;
    }

    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg === '--details') {
      options.details = true;
      continue;
    }

    if (arg === '--write') {
      options.write = true;

      const next = argv[index + 1];
      if (
        next &&
        !next.startsWith('-')
      ) {
        options.outputPath =
          path.resolve(
            process.cwd(),
            next
          );
        index += 1;
      }
      continue;
    }

    if (
      arg === '--help' ||
      arg === '-h'
    ) {
      options.help = true;
      continue;
    }

    throw new Error(
      `Argumento no reconocido: ${arg}`
    );
  }

  return options;
}

function printHelp() {
  console.log(`
FASE 16 · Auditoría financiera y Retrieval Accuracy

Uso:
  npm run audit:financial:desafio1
  npm run audit:financial:desafio1 -- --limit 100
  npm run audit:financial:desafio1 -- --concurrency 4
  npm run audit:financial:desafio1 -- --details
  npm run audit:financial:desafio1 -- --json
  npm run audit:financial:desafio1 -- --write

Qué mide:
  - total actual recuperado vs filas crudas de FACTURACION;
  - total anterior y diferencia exacta;
  - agregación por CHARGE_CODE y deltas;
  - impacto de cada causa vs deltas crudos reclamados;
  - grounding de prorrateos, descuentos y ajustes por suspensión;
  - guardas que impiden razonamiento financiero por LLM;
  - tasa de violaciones monetarias detectables.

Privacidad:
  El reporte público usa AUD000001... y nunca imprime subscriberKey,
  customerKey, cuentas financieras, teléfonos o documentos.

Nota:
  "0% alucinación" se reporta únicamente para las afirmaciones
  financieras estructuradas que esta auditoría puede comprobar.
`);
}

function formatPercent(value) {
  return value === null ||
    value === undefined
      ? 'N/A'
      : `${Number(value).toFixed(2)}%`;
}

function formatNumber(value) {
  return Number(value || 0)
    .toLocaleString('es-PE');
}

function createProgressPrinter() {
  let lastPrinted = 0;

  return (progress) => {
    if (
      progress.processed !==
        progress.total &&
      progress.processed -
        lastPrinted < 10
    ) {
      return;
    }

    lastPrinted =
      progress.processed;

    process.stdout.write(
      `\rAuditando ${formatNumber(progress.processed)}/${formatNumber(progress.total)} · violaciones ${formatNumber(progress.violations)} · errores ${formatNumber(progress.errors)}`
    );

    if (
      progress.processed ===
      progress.total
    ) {
      process.stdout.write('\n');
    }
  };
}

function printReport(
  report,
  {
    details = false
  } = {}
) {
  console.log('\n===================================================');
  console.log('  FASE 16 · AUDITORÍA FINANCIERA / RETRIEVAL');
  console.log('===================================================');
  console.log(
    `Estado:                    ${report.status}`
  );
  console.log(
    `Población facturable:      ${formatNumber(report.selection.population)}`
  );
  console.log(
    `Casos auditados:           ${formatNumber(report.selection.evaluated)}`
  );
  console.log(
    `Aserciones evaluadas:      ${formatNumber(report.metrics.evaluatedAssertions)}`
  );
  console.log(
    `Retrieval Accuracy:        ${formatPercent(report.metrics.retrievalAccuracyPct)}`
  );
  console.log(
    `Grounding financiero:      ${formatPercent(report.metrics.groundingAccuracyPct)}`
  );
  console.log(
    `Cumplimiento de guardas:   ${formatPercent(report.metrics.policyCompliancePct)}`
  );
  console.log(
    `Alucinación detectable:    ${formatPercent(report.metrics.detectableFinancialHallucinationRatePct)}`
  );
  console.log(
    `Violaciones monetarias:    ${formatNumber(report.metrics.financialClaimViolations)}`
  );
  console.log(
    `Violaciones totales:       ${formatNumber(report.metrics.totalViolations)}`
  );

  const scenarios =
    Object.entries(
      report.scenarioCoverage || {}
    ).sort(
      (left, right) =>
        right[1] - left[1]
    );

  if (scenarios.length) {
    console.log('\nEscenarios/hallazgos presentes en la muestra:');
    for (const [code, count] of scenarios) {
      console.log(
        `  ${code.padEnd(26)} ${formatNumber(count)}`
      );
    }
  }

  if (details) {
    const failed =
      report.cases.filter(
        (item) =>
          item.status !== 'PASS'
      );

    console.log('\nDetalle seguro de casos con observaciones:');

    if (!failed.length) {
      console.log(
        '  Ningún caso presentó violaciones.'
      );
    } else {
      for (const item of failed) {
        console.log(
          `  ${item.caseRef} · ${item.status} · ${item.assertions.failed} violación(es)`
        );
        for (
          const assertion of
            item.failedAssertions || []
        ) {
          console.log(
            `    - ${assertion.id} · ${assertion.reason || 'FAIL'}`
          );
        }
      }
    }
  }

  console.log('\nSalvaguardas:');
  console.log(
    '  - El benchmark no usa LLM para calcular ni calificar resultados.'
  );
  console.log(
    '  - El ground truth se reconstruye desde filas SQLite crudas e invariantes deterministas.'
  );
  console.log(
    '  - No se imprimen identificadores oficiales de clientes/suscripciones.'
  );
  console.log(
    '  - La tasa de alucinación se limita a claims financieros estructurados comprobables.'
  );
}

async function main() {
  const options =
    parseArgs(
      process.argv.slice(2)
    );

  if (options.help) {
    printHelp();
    return;
  }

  const service =
    createFinancialAuditService();

  let report;

  try {
    report =
      await service.runBenchmark({
        limit: options.limit,
        concurrency:
          options.concurrency,
        onProgress:
          options.json
            ? null
            : createProgressPrinter()
      });
  } finally {
    await service.close();
  }

  if (options.write) {
    fs.mkdirSync(
      path.dirname(
        options.outputPath
      ),
      { recursive: true }
    );
    fs.writeFileSync(
      options.outputPath,
      JSON.stringify(
        report,
        null,
        2
      ),
      'utf8'
    );
  }

  if (options.json) {
    console.log(
      JSON.stringify(
        report,
        null,
        2
      )
    );
  } else {
    printReport(report, {
      details: options.details
    });

    if (options.write) {
      console.log(
        `\n💾 Reporte seguro guardado en: ${options.outputPath}`
      );
    }
  }

  if (report.status !== 'PASS') {
    process.exitCode = 2;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      '\n❌ No se pudo completar la auditoría financiera:'
    );
    console.error(
      error?.message || error
    );
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_OUTPUT_PATH,
  parseArgs,
  formatPercent,
  printReport
};
