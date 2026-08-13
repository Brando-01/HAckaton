const path = require('path');

const {
  createDatasetCoverageService
} = require(
  '../services/datasetCoverageService'
);

const {
  DEFAULT_COVERAGE_DB_PATH,
  writeCoverageReport
} = require(
  '../services/datasetCoverageStore'
);

function parseArgs(argv) {
  const options = {
    limit: null,
    concurrency: 4,
    outputPath:
      DEFAULT_COVERAGE_DB_PATH,
    write: true
  };

  for (
    let index = 0;
    index < argv.length;
    index += 1
  ) {
    const arg = argv[index];

    if (arg === '--limit') {
      const value =
        Number.parseInt(
          argv[index + 1],
          10
        );
      index += 1;

      if (
        !Number.isInteger(value) ||
        value <= 0
      ) {
        throw new Error(
          '--limit debe ser un entero mayor que cero.'
        );
      }

      options.limit = value;
      continue;
    }

    if (
      arg === '--concurrency' ||
      arg === '-c'
    ) {
      const value =
        Number.parseInt(
          argv[index + 1],
          10
        );
      index += 1;

      if (
        !Number.isInteger(value) ||
        value < 1 ||
        value > 8
      ) {
        throw new Error(
          '--concurrency debe estar entre 1 y 8.'
        );
      }

      options.concurrency = value;
      continue;
    }

    if (arg === '--output') {
      options.outputPath =
        path.resolve(
          process.cwd(),
          argv[index + 1]
        );
      index += 1;
      continue;
    }

    if (arg === '--no-write') {
      options.write = false;
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
FASE 9 · Cobertura masiva del dataset oficial

Uso:
  npm run demo:coverage:desafio1
  npm run demo:coverage:desafio1 -- --limit 500
  npm run demo:coverage:desafio1 -- --concurrency 4
  npm run demo:coverage:desafio1 -- --output ruta/local.db

Qué hace:
  1. Recorre los suscriptores de PLANTA CLIENTES.
  2. Detecta quién tiene al menos un recibo.
  3. Ejecuta Fases 2-3 para los casos con facturación.
  4. Mide consultables, comparables, explicables, HIGH y demo premium.
  5. Genera alias locales DEMO000001... sin crear cuentas de login.

La ejecución completa puede tardar varios minutos según el equipo.
El índice local contiene identificadores oficiales y está ignorado por Git.
`);
}

function formatNumber(value) {
  return Number(value || 0)
    .toLocaleString('es-PE');
}

function formatPercent(value) {
  return `${Number(value || 0)
    .toFixed(2)}%`;
}

function printSummary(summary) {
  const { counts, percentages } =
    summary;

  console.log('\n===================================================');
  console.log('  FASE 9 · COBERTURA REAL DEL DATASET');
  console.log('===================================================');
  console.log(
    `PLANTA disponible:       ${formatNumber(summary.scope.totalAvailable)}`
  );
  console.log(
    `Suscriptores escaneados: ${formatNumber(summary.scope.scanned)}${summary.scope.limited ? ' · MUESTRA LIMITADA' : ''}`
  );
  console.log(
    `Con facturación:         ${formatNumber(counts.hasInvoices)} · ${formatPercent(percentages.hasInvoicesOfScanned)}`
  );
  console.log(
    `Consultables:            ${formatNumber(counts.consultable)} · ${formatPercent(percentages.consultableOfScanned)}`
  );
  console.log(
    `Comparables:             ${formatNumber(counts.comparable)} · ${formatPercent(percentages.comparableOfConsultable)} de consultables`
  );
  console.log(
    `Explicables:             ${formatNumber(counts.explainable)} · ${formatPercent(percentages.explainableOfConsultable)} de consultables`
  );
  console.log(
    `Evidencia HIGH:          ${formatNumber(counts.highConfidence)} · ${formatPercent(percentages.highConfidenceOfConsultable)} de consultables`
  );
  console.log(
    `Demo premium:            ${formatNumber(counts.demoPremium)} · ${formatPercent(percentages.premiumOfConsultable)} de consultables`
  );
  console.log(
    `Sin recibo:              ${formatNumber(counts.noBills)}`
  );
  console.log(
    `Errores de análisis:     ${formatNumber(counts.analysisErrors)}`
  );

  const scenarios =
    Object.entries(
      summary.scenarios || {}
    ).sort(
      (a, b) => b[1] - a[1]
    );

  if (scenarios.length) {
    console.log('\nCausas/hallazgos reconocidos:');
    for (
      const [code, count] of
        scenarios
    ) {
      console.log(
        `  ${code.padEnd(24)} ${formatNumber(count)}`
      );
    }
  }
}

function createProgressPrinter() {
  let lastPrinted = 0;

  return (progress) => {
    if (
      progress.processed !==
        progress.total &&
      progress.processed -
        lastPrinted < 100
    ) {
      return;
    }

    lastPrinted =
      progress.processed;

    const pct =
      progress.total
        ? (
            progress.processed /
            progress.total *
            100
          ).toFixed(1)
        : '100.0';

    process.stdout.write(
      `\rAnalizando ${formatNumber(progress.processed)}/${formatNumber(progress.total)} (${pct}%) · explicables ${formatNumber(progress.explainable)} · HIGH ${formatNumber(progress.highConfidence)} · premium ${formatNumber(progress.demoPremium)} · errores ${formatNumber(progress.errors)}`
    );

    if (
      progress.processed ===
      progress.total
    ) {
      process.stdout.write('\n');
    }
  };
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

  console.log('\nFASE 9 · Iniciando análisis de cobertura...');
  console.log(
    `Concurrencia: ${options.concurrency}${options.limit ? ` · límite ${options.limit}` : ' · dataset completo'}`
  );

  const service =
    createDatasetCoverageService();

  let report;

  try {
    report =
      await service.scan({
        limit: options.limit,
        concurrency:
          options.concurrency,
        onProgress:
          createProgressPrinter()
      });
  } finally {
    await service.close();
  }

  printSummary(
    report.summary
  );

  if (options.write) {
    const outputPath =
      await writeCoverageReport(
        report,
        {
          outputPath:
            options.outputPath
        }
      );

    console.log(
      `\n💾 Índice local guardado en: ${outputPath}`
    );
    console.log(
      '🔒 Contiene el vínculo DEMO ↔ subscriberKey y está ignorado por Git.'
    );
  } else {
    console.log(
      '\nℹ️ --no-write: no se creó el índice local.'
    );
  }
}

if (require.main === module) {
  main().catch(
    (error) => {
      console.error(
        `\n❌ ${error.message}`
      );
      process.exitCode = 1;
    }
  );
}

module.exports = {
  parseArgs,
  printSummary,
  createProgressPrinter
};
