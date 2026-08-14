const fs = require('fs');
const path = require('path');

const {
  createB2CCoverageMatrixService
} = require(
  '../services/desafio1B2CCoverageMatrixService'
);

const DEFAULT_OUTPUT_PATH =
  path.resolve(
    __dirname,
    '../data/phase17-b2c-matrix.local.json'
  );

function parseArgs(argv) {
  const options = {
    limit: null,
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
FASE 17 · Matriz RA/RV × productos B2C × escenarios

Uso:
  npm run audit:b2c-matrix:desafio1
  npm run audit:b2c-matrix:desafio1 -- --details
  npm run audit:b2c-matrix:desafio1 -- --write
  npm run audit:b2c-matrix:desafio1 -- --limit 500
  npm run audit:b2c-matrix:desafio1 -- --concurrency 4

Comportamiento:
  - sin --limit recorre toda PLANTA CLIENTES;
  - un --limit produce estado SAMPLE_ONLY y no autoriza afirmar cobertura total;
  - VERIFIED requiere un caso observado HIGH y renta RA/RV resuelta;
  - cuota de equipo financiado permanece PENDING_MAPPING hasta tener un marcador inequívoco;
  - la matriz principal usa negocio × RA/RV;
  - --details agrega la matriz granular negocio + lob_type × RA/RV.

Privacidad:
  El reporte es agregado. No publica subscriberKey, customerKey, cuentas,
  facturas, teléfonos, documentos ni source rows.
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

function shortStatus(cell) {
  switch (cell.status) {
    case 'VERIFIED':
      return `✓${cell.verifiedCases}`;
    case 'OBSERVED_NOT_HIGH_CONFIDENCE':
      return `~${cell.observedCases}`;
    case 'PENDING_MAPPING':
      return 'PEND';
    case 'NO_RESOLVED_RENT_POPULATION':
      return 'N/A';
    default:
      return '—';
  }
}

function columnLabel(column) {
  if (column.lobType) {
    return `${column.businessType}/${column.lobType} ${column.rentType}`;
  }

  return `${column.businessType} ${column.rentType}`;
}

function printMatrix(matrix, title) {
  console.log(`\n${title}`);

  if (!matrix.columns.length) {
    console.log(
      '  No hay dimensiones observadas.'
    );
    return;
  }

  const scenarioWidth = 27;
  const columnWidth = Math.max(
    12,
    Math.min(
      26,
      Math.max(
        ...matrix.columns.map(
          (column) =>
            columnLabel(column).length
        )
      ) + 2
    )
  );

  const header = [
    'Escenario'.padEnd(
      scenarioWidth
    ),
    ...matrix.columns.map(
      (column) =>
        columnLabel(column)
          .slice(
            0,
            columnWidth - 1
          )
          .padStart(
            columnWidth
          )
    )
  ].join('');

  console.log(header);
  console.log(
    '-'.repeat(header.length)
  );

  for (const row of matrix.rows) {
    const values = row.cells.map(
      (cell) =>
        shortStatus(cell)
          .padStart(columnWidth)
    );

    console.log(
      [
        row.label
          .slice(
            0,
            scenarioWidth - 1
          )
          .padEnd(
            scenarioWidth
          ),
        ...values
      ].join('')
    );
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

    process.stdout.write(
      `\rMatriz B2C ${formatNumber(progress.processed)}/${formatNumber(progress.total)} · consultables ${formatNumber(progress.consultable)} · casos HIGH/renta resuelta ${formatNumber(progress.verifiedScenarioCases)} · renta pendiente ${formatNumber(progress.unresolvedRentScenarioCases)} · errores ${formatNumber(progress.errors)}`
    );

    if (
      progress.processed ===
      progress.total
    ) {
      process.stdout.write('\n');
    }
  };
}

function printScenarioSummary(report) {
  console.log(
    '\nCobertura crítica observada:'
  );

  for (
    const scenario of
      report.scenarioSummary
  ) {
    const rents =
      scenario.rentModesVerified
        .length
        ? scenario.rentModesVerified
            .join('/')
        : 'ninguna';

    const businesses =
      scenario.businessTypesVerified
        .length
        ? scenario.businessTypesVerified
            .join(', ')
        : 'ninguno';

    console.log(
      `  ${scenario.label.padEnd(28)} ${scenario.mappingStatus.padEnd(15)} · HIGH ${formatNumber(scenario.verifiedCases)} · rentas ${rents} · negocios ${businesses}`
    );

    if (scenario.limitation) {
      console.log(
        `    ↳ ${scenario.limitation}`
      );
    }
  }
}

function printReport(
  report,
  {
    details = false
  } = {}
) {
  console.log(
    '\n==================================================='
  );
  console.log(
    '  FASE 17 · MATRIZ RA/RV × PRODUCTOS B2C'
  );
  console.log(
    '==================================================='
  );
  console.log(
    `Estado:                    ${report.status}`
  );
  console.log(
    `Población PLANTA:          ${formatNumber(report.scope.population)}`
  );
  console.log(
    `Suscriptores analizados:   ${formatNumber(report.scope.scanned)}`
  );
  console.log(
    `Con facturación:           ${formatNumber(report.counts.hasInvoices)}`
  );
  console.log(
    `Consultables:              ${formatNumber(report.counts.consultable)}`
  );
  console.log(
    `Renta actual resuelta:     ${formatNumber(report.counts.rentResolved)}`
  );
  console.log(
    `Errores de análisis:       ${formatNumber(report.counts.analysisErrors)}`
  );
  console.log(
    `Celdas negocio verificadas:${String(report.metrics.business.verifiedCells).padStart(8)} / ${formatNumber(report.metrics.business.totalCells)} (${formatPercent(report.metrics.business.verifiedOfAllChallengeCellsPct)})`
  );
  console.log(
    `Celdas LOB verificadas:    ${String(report.metrics.product.verifiedCells).padStart(8)} / ${formatNumber(report.metrics.product.totalCells)} (${formatPercent(report.metrics.product.verifiedOfAllChallengeCellsPct)})`
  );

  if (report.scope.limited) {
    console.log(
      '\n⚠ SAMPLE_ONLY: se usó --limit. Esta ejecución sirve para probar el comando, no para afirmar cobertura B2C completa.'
    );
  }

  printScenarioSummary(report);

  printMatrix(
    report.businessMatrix,
    'Matriz principal · negocio × renta'
  );

  if (details) {
    printMatrix(
      report.productMatrix,
      'Matriz granular · negocio + lob_type × renta'
    );

    printMatrix(
      report.extendedCoverage
        .businessMatrix,
      'Cobertura adicional ya verificable'
    );
  }

  console.log(
    '\nLeyenda: ✓N = N casos HIGH verificados · ~N = observado sin HIGH/renta suficiente · — = sin caso verificable · N/A = sin población con renta resuelta · PEND = mapeo causal pendiente.'
  );

  console.log('\nSalvaguardas:');
  console.log(
    '  - Ninguna celda recibe ✓ por soporte teórico; exige al menos un caso HIGH observado.'
  );
  console.log(
    '  - RA/RV debe estar resuelta desde evidencia del escenario o contexto estructurado del recibo.'
  );
  console.log(
    '  - El scoring de la matriz no usa LLM.'
  );
  console.log(
    '  - El reporte no publica identificadores privados.'
  );
}

async function main() {
  const options = parseArgs(
    process.argv.slice(2)
  );

  if (options.help) {
    printHelp();
    return;
  }

  const service =
    createB2CCoverageMatrixService();

  let report;

  try {
    report = await service.scan({
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
      {
        recursive: true
      }
    );

    fs.writeFileSync(
      options.outputPath,
      `${JSON.stringify(
        report,
        null,
        2
      )}\n`,
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
    printReport(
      report,
      {
        details:
          options.details
      }
    );

    if (options.write) {
      console.log(
        `\nArtefacto local: ${options.outputPath}`
      );
    }
  }

  if (
    report.status ===
      'REVIEW_REQUIRED'
  ) {
    process.exitCode = 2;
  }
}

if (require.main === module) {
  main().catch(
    (error) => {
      console.error(
        `\n❌ No se pudo construir la matriz B2C: ${error.message}`
      );
      process.exitCode = 1;
    }
  );
}

module.exports = {
  DEFAULT_OUTPUT_PATH,
  parseArgs,
  shortStatus,
  columnLabel,
  printMatrix,
  printReport,
  createProgressPrinter,
  main
};
