const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.GROQ_API_KEY =
  process.env.GROQ_API_KEY ||
  'gsk_phase21_local_benchmark_placeholder';

const {
  createApp
} = require('../server');

const {
  dbReady
} = require('../db');

const {
  normalizePerformanceProfile
} = require(
  '../services/desafio1PerformanceLogic'
);

const {
  runPerformanceBenchmark
} = require(
  '../services/desafio1PerformanceBenchmarkService'
);

const {
  resetRuntimePerformanceMetrics
} = require(
  '../services/desafio1PerformanceMetrics'
);

function getArgValue(flag) {
  const index =
    process.argv.indexOf(flag);

  if (
    index < 0 ||
    index + 1 >=
      process.argv.length
  ) {
    return undefined;
  }

  return process.argv[index + 1];
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

function parseArgs() {
  return normalizePerformanceProfile({
    baselineJourneys:
      getArgValue(
        '--baseline-journeys'
      ),
    loadMultiplier:
      getArgValue(
        '--multiplier'
      ),
    baselineConcurrency:
      getArgValue(
        '--baseline-concurrency'
      ),
    requestTimeoutMs:
      getArgValue(
        '--timeout-ms'
      ),
    p95CeilingMs:
      getArgValue(
        '--p95-ms'
      ),
    relativeP95Factor:
      getArgValue(
        '--p95-factor'
      ),
    throughputFloorRatio:
      getArgValue(
        '--throughput-floor'
      ),
    warmupJourneys:
      getArgValue(
        '--warmup-journeys'
      )
  });
}

function formatMs(value) {
  return value === null ||
    value === undefined
    ? 'N/D'
    : `${Number(value).toFixed(2)} ms`;
}

function printStage(stage) {
  console.log('');
  console.log(
    `${stage.label.toUpperCase()} · ${stage.journeys} journeys · concurrencia ${stage.concurrency}`
  );
  console.log(
    `  Éxito journeys:     ${stage.journeySuccessRate.toFixed(2)}%`
  );
  console.log(
    `  Requests:           ${stage.successfulRequests}/${stage.totalRequests} OK · ${stage.timeoutRequests} timeout`
  );
  console.log(
    `  Latencia core p50:  ${formatMs(stage.latency.p50Ms)}`
  );
  console.log(
    `  Latencia core p95:  ${formatMs(stage.latency.p95Ms)}`
  );
  console.log(
    `  Throughput journey: ${stage.throughput.journeysPerSecond.toFixed(2)} j/s`
  );
  console.log(
    `  Throughput request: ${stage.throughput.requestsPerSecond.toFixed(2)} req/s`
  );
}

function printOperations(stage) {
  console.log('');
  console.log(
    `Detalle por operación · ${stage.label}`
  );

  stage.operations.forEach(
    (operation) => {
      console.log(
        `  ${operation.operation.padEnd(22)} ${String(operation.requests).padStart(3)} req · p50 ${formatMs(operation.p50Ms).padStart(12)} · p95 ${formatMs(operation.p95Ms).padStart(12)} · ${operation.successRate.toFixed(2)}% OK`
      );
    }
  );
}

function printReport(report, details) {
  console.log('');
  console.log(
    '==================================================='
  );
  console.log(
    '  FASE 21 · ESCALABILIDAD Y LATENCIA'
  );
  console.log(
    '==================================================='
  );
  console.log(
    `Estado:                  ${report.status}`
  );
  console.log(
    `Perfil de carga:         ${report.profile.baselineJourneys} → ${report.profile.targetJourneys} journeys (${report.profile.loadMultiplier}×)`
  );
  console.log(
    `Concurrencia:            ${report.profile.baselineConcurrency} → ${report.profile.targetConcurrency} (${report.profile.loadMultiplier}×)`
  );
  console.log(
    `Timeout por request:     ${report.profile.requestTimeoutMs} ms`
  );

  printStage(report.baseline);
  printStage(report.target);

  console.log('');
  console.log(
    `Controles: ${report.evaluation.passedChecks}/${report.evaluation.totalChecks}`
  );

  report.evaluation.checks.forEach(
    (check) => {
      console.log(
        `  ${check.pass ? '✓' : '✗'} ${check.code}`
      );
      console.log(
        `    ${check.description}`
      );
      if (check.observed) {
        console.log(
          `    Observado: ${check.observed}`
        );
      }
    }
  );

  if (details) {
    printOperations(report.baseline);
    printOperations(report.target);
  }

  console.log('');
  console.log('Alcance:');
  console.log(
    '  Benchmark local reproducible del prototipo; no representa SLA, tráfico productivo ni capacidad de red de Movistar.'
  );
  console.log(
    '  El workload usa Mi Movistar, Lucía determinista y WhatsApp simulado sobre la misma conversación.'
  );
}

function writeReport(report) {
  const destination =
    path.join(
      __dirname,
      '..',
      'data',
      'phase21-performance-audit.local.json'
    );

  fs.writeFileSync(
    destination,
    JSON.stringify(
      report,
      null,
      2
    ),
    'utf8'
  );

  console.log('');
  console.log(
    `Artefacto local: ${destination}`
  );
}

async function closeServer(server) {
  if (!server) {
    return;
  }

  await new Promise(
    (resolve) =>
      server.close(resolve)
  );
}

async function main() {
  const profile = parseArgs();
  const app =
    createApp({
      requestLogging: false
    });

  let server = null;

  try {
    await dbReady;

    server = app.listen(
      0,
      '127.0.0.1'
    );

    await new Promise(
      (resolve) =>
        server.once(
          'listening',
          resolve
        )
    );

    const address =
      server.address();

    const baseUrl =
      `http://127.0.0.1:${address.port}`;

    resetRuntimePerformanceMetrics();

    const report =
      await runPerformanceBenchmark({
        baseUrl,
        profile,
        environment: {
          nodeVersion:
            process.version,
          logicalCpuCount:
            os.cpus().length,
          platform:
            process.platform
        },
        onStage: (stage) => {
          const labels = {
            WARMUP:
              'Calentando rutas deterministas...',
            BASELINE:
              'Midiendo línea base...',
            TARGET:
              `Midiendo carga ${profile.loadMultiplier}×...`
          };

          console.log(
            labels[stage] || stage
          );
        }
      });

    printReport(
      report,
      hasFlag('--details')
    );

    if (hasFlag('--write')) {
      writeReport(report);
    }

    if (report.status !== 'PASS') {
      process.exitCode = 2;
    }
  } catch (error) {
    console.error('');
    console.error(
      'No se pudo ejecutar la auditoría de rendimiento F21.'
    );
    console.error(
      'Verifica que desafio1.db y el mapeo demo local estén configurados y vuelve a intentarlo.'
    );

    process.exitCode = 2;
  } finally {
    await closeServer(server);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  printReport
};
