const test = require('node:test');
const assert = require('node:assert/strict');

const {
  REQUIRED_SOURCE_KEYS
} = require(
  '../config/desafio1ChallengeManifest'
);

const {
  parseTestMetric,
  ChallengePreflightService
} = require(
  '../services/desafio1ChallengePreflightService'
);

function lineage() {
  return REQUIRED_SOURCE_KEYS.map(
    (datasetKey, index) => ({
      datasetKey,
      fileName: `${datasetKey}.csv`,
      sha256: `hash-${index}`,
      importedRows: 10 + index
    })
  );
}

function fixtureReports() {
  return {
    release: {
      status: 'READY',
      checks: [
        {
          id: 'DATA_LINEAGE',
          ok: true
        },
        {
          id: 'PUBLIC_PAYLOAD_PRIVACY',
          ok: true
        }
      ],
      profiles: [
        {
          customerId: 'CLI000001',
          scenario: 'RECONNECTION',
          evidenceLevel: 'HIGH',
          ready: true
        },
        {
          customerId: 'CLI000002',
          scenario: 'PRORATION',
          evidenceLevel: 'HIGH',
          ready: true
        }
      ]
    },
    financial: {
      status: 'PASS',
      selection: {
        population: 18450,
        evaluated: 300
      },
      metrics: {
        retrievalAccuracyPct: 100,
        groundingAccuracyPct: 100,
        policyCompliancePct: 100,
        detectableFinancialHallucinationRatePct: 0,
        financialClaimViolations: 0,
        totalViolations: 0
      },
      scenarioCoverage: {},
      safeguards: {
        identifiersPrinted: false,
        subscriberKeyExposed: false,
        customerKeyExposed: false,
        rawFinancialAccountExposed: false,
        llmUsedForScoring: false,
        zeroHallucinationClaimScope:
          'DETECTABLE_STRUCTURED_FINANCIAL_CLAIMS_ONLY'
      }
    },
    b2c: {
      status: 'KNOWN_LIMITS',
      scope: {
        population: 20000,
        scanned: 20000,
        limited: false
      },
      counts: {
        analysisErrors: 0
      },
      metrics: {},
      scenarioSummary: []
    },
    handoff: {
      status: 'PASS',
      totalCases: 14,
      correctCases: 14,
      decisionAccuracy: 100,
      transferPrecision: 100,
      transferRecall: 100,
      falsePositiveTransfers: 0,
      falseNegativeTransfers: 0
    },
    omni: {
      status: 'PASS',
      passed: 1,
      assertions: [
        {
          passed: true
        }
      ],
      journey: []
    },
    performance: {
      status: 'PASS',
      profile: {
        baselineJourneys: 8,
        targetJourneys: 24,
        baselineConcurrency: 4,
        targetConcurrency: 12,
        loadMultiplier: 3
      },
      baseline: {
        journeySuccessRate: 100,
        totalRequests: 56,
        successfulRequests: 56,
        timeoutRequests: 0,
        latency: {
          p50Ms: 100,
          p95Ms: 200
        },
        throughput: {
          journeysPerSecond: 8
        }
      },
      target: {
        journeySuccessRate: 100,
        totalRequests: 168,
        successfulRequests: 168,
        timeoutRequests: 0,
        latency: {
          p50Ms: 200,
          p95Ms: 400
        },
        throughput: {
          journeysPerSecond: 12
        }
      },
      evaluation: {
        passedChecks: 8,
        totalChecks: 8
      }
    }
  };
}

test(
  'parseTestMetric reconoce salida moderna y TAP de node --test',
  () => {
    assert.equal(
      parseTestMetric(
        'ℹ tests 569\nℹ pass 569\nℹ fail 0',
        'tests'
      ),
      569
    );
    assert.equal(
      parseTestMetric(
        '# tests 42\n# pass 42\n# fail 0',
        'fail'
      ),
      0
    );
  }
);

test(
  'service F22 orquesta todas las auditorías y conserva known limits válidos',
  async () => {
    const reports =
      fixtureReports();
    const closed = {
      financial: false,
      b2c: false
    };

    const service =
      new ChallengePreflightService({
        testRunner: () => ({
          status: 'PASS',
          exitCode: 0,
          tests: 600,
          pass: 600,
          fail: 0
        }),
        smokeRunner: () => ({
          status: 'PASS',
          passed: 10,
          total: 10
        }),
        lineageProvider:
          async () => lineage(),
        releaseReadinessFactory:
          () => ({
            buildReport:
              async () =>
                reports.release
          }),
        financialAuditFactory:
          () => ({
            runBenchmark:
              async () =>
                reports.financial,
            close: async () => {
              closed.financial = true;
            }
          }),
        b2cAuditFactory:
          () => ({
            scan:
              async () =>
                reports.b2c,
            close: async () => {
              closed.b2c = true;
            }
          }),
        handoffRunner:
          () => reports.handoff,
        omnichannelRunner:
          () => reports.omni,
        performanceRunner:
          async () =>
            reports.performance,
        now:
          () =>
            new Date(
              '2026-08-15T00:00:00.000Z'
            )
      });

    const report =
      await service.run();

    assert.equal(
      report.status,
      'READY_WITH_KNOWN_LIMITS'
    );
    assert.equal(
      closed.financial,
      true
    );
    assert.equal(
      closed.b2c,
      true
    );
  }
);

test(
  'service emite etapas en orden reproducible',
  async () => {
    const reports =
      fixtureReports();
    const stages = [];

    const service =
      new ChallengePreflightService({
        testRunner: () => ({
          status: 'PASS',
          tests: 1,
          pass: 1,
          fail: 0,
          exitCode: 0
        }),
        smokeRunner: () => ({
          status: 'PASS',
          passed: 10,
          total: 10
        }),
        lineageProvider:
          async () => lineage(),
        releaseReadinessFactory:
          () => ({
            buildReport:
              async () =>
                reports.release
          }),
        financialAuditFactory:
          () => ({
            runBenchmark:
              async () =>
                reports.financial,
            close: async () => {}
          }),
        b2cAuditFactory:
          () => ({
            scan:
              async () =>
                reports.b2c,
            close: async () => {}
          }),
        handoffRunner:
          () => reports.handoff,
        omnichannelRunner:
          () => reports.omni,
        performanceRunner:
          async () =>
            reports.performance
      });

    await service.run({
      onStage: ({ id }) =>
        stages.push(id)
    });

    assert.deepEqual(
      stages,
      [
        'TEST_SUITE',
        'DATASETS_AND_RELEASE',
        'FINANCIAL_AUDIT',
        'B2C_MATRIX',
        'HANDOFF',
        'OMNICHANNEL',
        'HISTORY_AND_COMMERCIAL',
        'PERFORMANCE_3X',
        'RELEASE_SMOKE',
        'BUILD_REPORT'
      ]
    );
  }
);

test(
  'service pasa progreso financiero y B2C al consumidor sin exponer casos',
  async () => {
    const reports =
      fixtureReports();
    const progress = [];

    const service =
      new ChallengePreflightService({
        testRunner: () => ({
          status: 'PASS',
          tests: 1,
          pass: 1,
          fail: 0,
          exitCode: 0
        }),
        smokeRunner: () => ({
          status: 'PASS',
          passed: 10,
          total: 10
        }),
        lineageProvider:
          async () => lineage(),
        releaseReadinessFactory:
          () => ({
            buildReport:
              async () =>
                reports.release
          }),
        financialAuditFactory:
          () => ({
            runBenchmark:
              async ({ onProgress }) => {
                onProgress({
                  processed: 300,
                  total: 300
                });
                return reports.financial;
              },
            close: async () => {}
          }),
        b2cAuditFactory:
          () => ({
            scan:
              async ({ onProgress }) => {
                onProgress({
                  processed: 20000,
                  total: 20000
                });
                return reports.b2c;
              },
            close: async () => {}
          }),
        handoffRunner:
          () => reports.handoff,
        omnichannelRunner:
          () => reports.omni,
        performanceRunner:
          async () =>
            reports.performance
      });

    await service.run({
      onProgress:
        (item) =>
          progress.push(item)
    });

    assert.deepEqual(
      progress.map(
        (item) =>
          [
            item.stage,
            item.processed,
            item.total
          ]
      ),
      [
        [
          'FINANCIAL_AUDIT',
          300,
          300
        ],
        [
          'B2C_MATRIX',
          20000,
          20000
        ]
      ]
    );
  }
);

test(
  'fallo de una etapa queda resumido con código seguro y fuerza REVIEW_REQUIRED',
  async () => {
    const reports =
      fixtureReports();

    const service =
      new ChallengePreflightService({
        testRunner: () => ({
          status: 'PASS',
          tests: 1,
          pass: 1,
          fail: 0,
          exitCode: 0
        }),
        smokeRunner: () => ({
          status: 'PASS',
          passed: 10,
          total: 10
        }),
        lineageProvider:
          async () => lineage(),
        releaseReadinessFactory:
          () => ({
            buildReport:
              async () =>
                reports.release
          }),
        financialAuditFactory:
          () => ({
            runBenchmark:
              async () =>
                reports.financial,
            close: async () => {}
          }),
        b2cAuditFactory:
          () => ({
            scan:
              async () =>
                reports.b2c,
            close: async () => {}
          }),
        handoffRunner:
          () => reports.handoff,
        omnichannelRunner:
          () => reports.omni,
        performanceRunner:
          async () => {
            const error =
              new Error(
                'C:/private/path/should-not-leak'
              );
            error.code =
              'PERFORMANCE_STAGE_FAILED';
            throw error;
          }
      });

    const report =
      await service.run();

    assert.equal(
      report.status,
      'REVIEW_REQUIRED'
    );
    assert.equal(
      report.ready,
      false
    );
    assert.deepEqual(
      report.execution.stageFailures,
      [
        {
          stage: 'PERFORMANCE_3X',
          code:
            'PERFORMANCE_STAGE_FAILED'
        }
      ]
    );
    assert.equal(
      JSON.stringify(report)
        .includes(
          'private/path'
        ),
      false
    );
  }
);
