const os = require('node:os');
const path = require('node:path');
const {
  spawnSync
} = require('node:child_process');

const {
  getDefaultLineage,
  createRelease1ReadinessService
} = require(
  './release1ReadinessService'
);

const {
  createFinancialAuditService
} = require(
  './desafio1FinancialAuditService'
);

const {
  createB2CCoverageMatrixService
} = require(
  './desafio1B2CCoverageMatrixService'
);

const {
  runHandoffPolicyBenchmark
} = require(
  './desafio1HandoffAuditLogic'
);

const {
  runOmnichannelContractAudit
} = require(
  './desafio1OmnichannelAuditLogic'
);

const {
  runHistoryGuardAudit,
  runCommercialGuardAudit,
  buildChallengePreflightReport
} = require(
  './desafio1ChallengePreflightLogic'
);

const {
  createDesafio1ConversationalAiService
} = require(
  './desafio1ConversationalAiService'
);

const BACKEND_ROOT = path.resolve(
  __dirname,
  '..'
);

function parseTestMetric(
  output,
  label
) {
  const lines = String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim());

  const pattern = new RegExp(
    `^(?:[#ℹ]\\s*)?${label}\\s+(\\d+)\\s*$`,
    'i'
  );

  for (
    let index = lines.length - 1;
    index >= 0;
    index -= 1
  ) {
    const match =
      lines[index].match(pattern);

    if (match) {
      return Number(match[1]);
    }
  }

  return null;
}

function runNodeTestSuite({
  cwd = BACKEND_ROOT,
  env = process.env
} = {}) {
  const result = spawnSync(
    process.execPath,
    ['--test'],
    {
      cwd,
      env,
      encoding: 'utf8',
      maxBuffer:
        32 * 1024 * 1024
    }
  );

  const output =
    `${result.stdout || ''}\n${result.stderr || ''}`;
  const tests =
    parseTestMetric(
      output,
      'tests'
    );
  const pass =
    parseTestMetric(
      output,
      'pass'
    );
  const fail =
    parseTestMetric(
      output,
      'fail'
    );
  const exitCode =
    Number.isInteger(result.status)
      ? result.status
      : 1;

  return {
    status:
      exitCode === 0 &&
      (fail === null || fail === 0)
        ? 'PASS'
        : 'FAIL',
    exitCode,
    tests,
    pass,
    fail,
    signal:
      result.signal || null,
    errorCode:
      result.error?.code || null
  };
}

function runReleaseSmoke({
  cwd = BACKEND_ROOT,
  env = process.env
} = {}) {
  const result = spawnSync(
    process.execPath,
    [
      'scripts/smokeRelease1Desafio1.js'
    ],
    {
      cwd,
      env,
      encoding: 'utf8',
      maxBuffer:
        16 * 1024 * 1024
    }
  );

  const output =
    `${result.stdout || ''}\n${result.stderr || ''}`;
  const match =
    output.match(
      /Resultado:\s*(\d+)\/(\d+)\s+controles\s+OK/i
    );
  const passed =
    match ? Number(match[1]) : 0;
  const total =
    match ? Number(match[2]) : 0;
  const exitCode =
    Number.isInteger(result.status)
      ? result.status
      : 1;

  return {
    status:
      exitCode === 0 &&
      total > 0 &&
      passed === total
        ? 'PASS'
        : 'FAIL',
    exitCode,
    passed,
    total,
    signal:
      result.signal || null,
    errorCode:
      result.error?.code || null
  };
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

async function runLocalPerformanceAudit() {
  process.env.GROQ_API_KEY =
    process.env.GROQ_API_KEY ||
    'gsk_phase22_local_benchmark_placeholder';

  const {
    createApp
  } = require('../server');
  const {
    dbReady
  } = require('../db');
  const {
    runPerformanceBenchmark
  } = require(
    './desafio1PerformanceBenchmarkService'
  );
  const {
    normalizePerformanceProfile
  } = require(
    './desafio1PerformanceLogic'
  );
  const {
    resetRuntimePerformanceMetrics
  } = require(
    './desafio1PerformanceMetrics'
  );

  const profile =
    normalizePerformanceProfile({});
  const app =
    createApp({
      requestLogging: false,
      conversationalAiService:
        createDesafio1ConversationalAiService({
          enabled: false
        })
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

    return await runPerformanceBenchmark({
      baseUrl,
      profile,
      environment: {
        nodeVersion:
          process.version,
        logicalCpuCount:
          os.cpus().length,
        platform:
          process.platform
      }
    });
  } finally {
    await closeServer(server);
  }
}

class ChallengePreflightService {
  constructor({
    testRunner = null,
    smokeRunner = null,
    lineageProvider = null,
    releaseReadinessFactory = null,
    financialAuditFactory = null,
    b2cAuditFactory = null,
    handoffRunner = null,
    omnichannelRunner = null,
    performanceRunner = null,
    historyRunner = null,
    commercialRunner = null,
    now = null
  } = {}) {
    this.testRunner =
      testRunner ||
      runNodeTestSuite;
    this.smokeRunner =
      smokeRunner ||
      runReleaseSmoke;
    this.lineageProvider =
      lineageProvider ||
      getDefaultLineage;
    this.releaseReadinessFactory =
      releaseReadinessFactory ||
      createRelease1ReadinessService;
    this.financialAuditFactory =
      financialAuditFactory ||
      createFinancialAuditService;
    this.b2cAuditFactory =
      b2cAuditFactory ||
      createB2CCoverageMatrixService;
    this.handoffRunner =
      handoffRunner ||
      runHandoffPolicyBenchmark;
    this.omnichannelRunner =
      omnichannelRunner ||
      runOmnichannelContractAudit;
    this.performanceRunner =
      performanceRunner ||
      runLocalPerformanceAudit;
    this.historyRunner =
      historyRunner ||
      runHistoryGuardAudit;
    this.commercialRunner =
      commercialRunner ||
      runCommercialGuardAudit;
    this.now =
      now ||
      (() => new Date());
  }

  async run({
    onStage = null,
    onProgress = null
  } = {}) {
    const stageFailures = [];

    const stage = (
      id,
      detail = null
    ) => {
      if (
        typeof onStage ===
        'function'
      ) {
        onStage({ id, detail });
      }
    };

    const safeStage = async (
      id,
      runner,
      fallback = null
    ) => {
      try {
        return await runner();
      } catch (error) {
        stageFailures.push({
          stage: id,
          code:
            String(
              error?.code ||
              'STAGE_EXECUTION_FAILED'
            )
        });
        return fallback;
      }
    };

    stage('TEST_SUITE');
    const testReport =
      await safeStage(
        'TEST_SUITE',
        () =>
          Promise.resolve(
            this.testRunner()
          ),
        {
          status: 'FAIL',
          exitCode: 1,
          tests: null,
          pass: null,
          fail: null
        }
      );

    stage('DATASETS_AND_RELEASE');
    const lineage =
      await safeStage(
        'DATASETS_AND_RELEASE',
        () => this.lineageProvider(),
        []
      );

    const releaseReport =
      await safeStage(
        'DATASETS_AND_RELEASE',
        async () => {
          const releaseService =
            this.releaseReadinessFactory({
              lineageProvider:
                async () => lineage,
              cacheTtlMs: 0
            });

          return releaseService
            .buildReport({
              force: true
            });
        },
        null
      );

    stage('FINANCIAL_AUDIT');
    const financialReport =
      await safeStage(
        'FINANCIAL_AUDIT',
        async () => {
          const financialService =
            this.financialAuditFactory();

          try {
            return await financialService
              .runBenchmark({
                limit: 300,
                concurrency: 4,
                onProgress:
                  typeof onProgress ===
                    'function'
                    ? (progress) =>
                        onProgress({
                          stage:
                            'FINANCIAL_AUDIT',
                          ...progress
                        })
                    : null
              });
          } finally {
            if (
              financialService &&
              typeof financialService.close ===
                'function'
            ) {
              await financialService.close();
            }
          }
        },
        null
      );

    stage('B2C_MATRIX');
    const b2cReport =
      await safeStage(
        'B2C_MATRIX',
        async () => {
          const b2cService =
            this.b2cAuditFactory();

          try {
            return await b2cService.scan({
              limit: null,
              concurrency: 4,
              onProgress:
                typeof onProgress ===
                  'function'
                  ? (progress) =>
                      onProgress({
                        stage:
                          'B2C_MATRIX',
                        ...progress
                      })
                  : null
            });
          } finally {
            if (
              b2cService &&
              typeof b2cService.close ===
                'function'
            ) {
              await b2cService.close();
            }
          }
        },
        null
      );

    stage('HANDOFF');
    const handoffReport =
      await safeStage(
        'HANDOFF',
        () =>
          Promise.resolve(
            this.handoffRunner()
          ),
        null
      );

    stage('OMNICHANNEL');
    const omnichannelReport =
      await safeStage(
        'OMNICHANNEL',
        () =>
          Promise.resolve(
            this.omnichannelRunner()
          ),
        null
      );

    stage('HISTORY_AND_COMMERCIAL');
    const historyReport =
      await safeStage(
        'HISTORY_AND_COMMERCIAL',
        () =>
          Promise.resolve(
            this.historyRunner()
          ),
        null
      );
    const commercialReport =
      await safeStage(
        'HISTORY_AND_COMMERCIAL',
        () =>
          Promise.resolve(
            this.commercialRunner()
          ),
        null
      );

    stage('PERFORMANCE_3X');
    const performanceReport =
      await safeStage(
        'PERFORMANCE_3X',
        () =>
          this.performanceRunner(),
        null
      );

    stage('RELEASE_SMOKE');
    const smokeReport =
      await safeStage(
        'RELEASE_SMOKE',
        () =>
          Promise.resolve(
            this.smokeRunner()
          ),
        {
          status: 'FAIL',
          passed: 0,
          total: 0,
          exitCode: 1
        }
      );

    stage('BUILD_REPORT');
    return buildChallengePreflightReport({
      generatedAt:
        this.now().toISOString(),
      testReport,
      smokeReport,
      lineage,
      releaseReport,
      financialReport,
      b2cReport,
      handoffReport,
      omnichannelReport,
      performanceReport,
      historyReport,
      commercialReport,
      stageFailures
    });
  }
}

function createChallengePreflightService(
  options = {}
) {
  return new ChallengePreflightService(
    options
  );
}

module.exports = {
  BACKEND_ROOT,
  parseTestMetric,
  runNodeTestSuite,
  runReleaseSmoke,
  runLocalPerformanceAudit,
  ChallengePreflightService,
  createChallengePreflightService
};
