const fs = require('node:fs');
const path = require('node:path');

const {
  createChallengePreflightService
} = require(
  '../services/desafio1ChallengePreflightService'
);

const DEFAULT_OUTPUT_PATH =
  path.resolve(
    __dirname,
    '../data/phase22-challenge-preflight.local.json'
  );

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function parseArgs(argv) {
  const options = {
    json: false,
    details: false,
    write: false,
    help: false,
    outputPath:
      DEFAULT_OUTPUT_PATH
  };

  for (
    let index = 0;
    index < argv.length;
    index += 1
  ) {
    const arg = argv[index];

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
FASE 22 · Preflight integral del Desafío 1

Uso:
  npm run challenge:preflight:desafio1
  npm run challenge:preflight:desafio1 -- --details
  npm run challenge:preflight:desafio1 -- --write
  npm run challenge:preflight:desafio1 -- --json

El comando ejecuta en una sola corrida:
  - suite completa;
  - 8/8 datasets + Release 1;
  - F16 Retrieval Accuracy / hallucination guard;
  - F17 matriz B2C completa;
  - F19 handoff;
  - F20 omnicanalidad;
  - guardas F14/F18 de histórico y cross-selling;
  - F21 benchmark local 3×;
  - smoke end-to-end de Release 1.

Estados finales:
  READY
  READY_WITH_KNOWN_LIMITS
  REVIEW_REQUIRED

READY_WITH_KNOWN_LIMITS es válido cuando todos los controles bloqueantes pasan y las limitaciones conocidas permanecen explícitas (por ejemplo, equipo financiado pendiente de mapeo).
`);
}

function formatCheck(check) {
  const marker =
    check.status === 'PASS'
      ? '✓'
      : check.status ===
          'KNOWN_LIMITS'
        ? '~'
        : '✗';

  return `  ${marker} ${check.id.padEnd(28)} ${check.status.padEnd(13)} ${check.detail}`;
}

function printReport(
  report,
  {
    details = false
  } = {}
) {
  console.log('');
  console.log('===================================================');
  console.log('  FASE 22 · PREFLIGHT INTEGRAL DESAFÍO 1');
  console.log('===================================================');
  console.log(
    `Estado:                  ${report.status}`
  );
  console.log(
    `Controles:               ${report.summary.passed} PASS · ${report.summary.knownLimits} KNOWN_LIMITS · ${report.summary.failed} FAIL`
  );
  console.log(
    `Privacidad del reporte:  ${report.reportPrivacy.status}`
  );
  console.log('');
  console.log('Controles finales:');

  report.checks.forEach(
    (check) =>
      console.log(
        formatCheck(check)
      )
  );

  const performance =
    report.benchmarks
      ?.performance;
  const financial =
    report.benchmarks
      ?.financial;
  const handoff =
    report.benchmarks
      ?.handoff;
  const b2c =
    report.benchmarks?.b2c;

  console.log('');
  console.log('Snapshot de benchmarks:');
  console.log(
    `  F16 Retrieval:          ${financial?.metrics?.retrievalAccuracyPct ?? 'N/D'}% · grounding ${financial?.metrics?.groundingAccuracyPct ?? 'N/D'}% · violaciones ${financial?.metrics?.totalViolations ?? 'N/D'}`
  );
  console.log(
    `  F19 Handoff:            ${handoff?.decisionAccuracy ?? 'N/D'}% · FP ${handoff?.falsePositiveTransfers ?? 'N/D'} · FN ${handoff?.falseNegativeTransfers ?? 'N/D'}`
  );
  console.log(
    `  F17 B2C:                ${b2c?.status || 'N/D'} · ${b2c?.scope?.scanned || 0}/${b2c?.scope?.population || 0} perfiles escaneados`
  );
  console.log(
    `  F21 3× p95:             ${performance?.target?.latency?.p95Ms ?? 'N/D'} ms · throughput ${performance?.target?.throughput?.journeysPerSecond ?? 'N/D'} j/s`
  );

  console.log('');
  console.log('Casos demo congelados:');
  report.frozenDemoCases.forEach(
    (item) =>
      console.log(
        `  - ${item.customerId} · ${item.name} · ${item.scenario}`
      )
  );

  if (details) {
    console.log('');
    console.log(
      `Limitaciones conocidas (${report.knownLimits.length}):`
    );
    report.knownLimits.forEach(
      (item) => {
        console.log(
          `  - ${item.code} · ${item.area}`
        );
        console.log(
          `    ${item.detail}`
        );
      }
    );
  } else {
    console.log('');
    console.log(
      `Limitaciones conocidas: ${report.knownLimits.length} (usa --details para listarlas).`
    );
  }

  console.log('');
  console.log('Alcance:');
  console.log(
    '  El preflight prueba el prototipo local y congela su evidencia reproducible; no convierte benchmarks locales, datos sintéticos o adaptadores simulados en afirmaciones productivas.'
  );
}

function stagePrinter({ id }) {
  const labels = {
    TEST_SUITE:
      'Ejecutando suite completa...',
    DATASETS_AND_RELEASE:
      'Validando datasets 8/8 y Release 1...',
    FINANCIAL_AUDIT:
      'Ejecutando F16 Retrieval Accuracy...',
    B2C_MATRIX:
      'Escaneando matriz B2C completa...',
    HANDOFF:
      'Validando política de handoff F19...',
    OMNICHANNEL:
      'Validando continuidad omnicanal F20...',
    HISTORY_AND_COMMERCIAL:
      'Validando guardas de histórico y cross-selling...',
    PERFORMANCE_3X:
      'Ejecutando benchmark local 3× F21...',
    RELEASE_SMOKE:
      'Ejecutando smoke end-to-end...',
    BUILD_REPORT:
      'Construyendo snapshot final...'
  };

  console.log(
    labels[id] || id
  );
}

function createProgressPrinter() {
  const last = new Map();

  return (progress) => {
    const total =
      Number(progress.total || 0);
    const processed =
      Number(progress.processed || 0);

    if (!total) {
      return;
    }

    const step =
      progress.stage ===
        'B2C_MATRIX'
        ? 2000
        : 50;
    const previous =
      last.get(progress.stage) || 0;

    if (
      processed !== total &&
      processed - previous < step
    ) {
      return;
    }

    last.set(
      progress.stage,
      processed
    );

    console.log(
      `  ${progress.stage}: ${processed}/${total}`
    );
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

  process.env.GROQ_API_KEY =
    process.env.GROQ_API_KEY ||
    'gsk_phase22_preflight_placeholder';

  const service =
    createChallengePreflightService();

  const report =
    await service.run({
      onStage:
        options.json
          ? null
          : stagePrinter,
      onProgress:
        options.json
          ? null
          : createProgressPrinter()
    });

  if (options.write) {
    fs.mkdirSync(
      path.dirname(
        options.outputPath
      ),
      { recursive: true }
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
    process.stdout.write(
      `${JSON.stringify(
        report,
        null,
        2
      )}\n`
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
      console.log('');
      console.log(
        `Artefacto local: ${options.outputPath}`
      );
    }
  }

  if (!report.ready) {
    process.exitCode = 2;
  }
}

if (require.main === module) {
  main().catch(
    (error) => {
      console.error('');
      console.error(
        'No se pudo completar el preflight integral F22.'
      );
      console.error(
        error?.code ||
        error?.message ||
        'CHALLENGE_PREFLIGHT_ERROR'
      );
      process.exitCode = 2;
    }
  );
}

module.exports = {
  DEFAULT_OUTPUT_PATH,
  hasFlag,
  parseArgs,
  formatCheck,
  printReport,
  stagePrinter,
  createProgressPrinter,
  main
};
