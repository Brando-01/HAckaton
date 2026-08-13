const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clampConcurrency,
  normalizeLimit,
  createDatasetCoverageService
} = require(
  '../services/datasetCoverageService'
);

function explanation(
  subscriberKey,
  {
    previous = true,
    scenario = 'RECONNECTION'
  } = {}
) {
  const proration =
    scenario === 'PRORATION';

  return {
    subscriber: {
      subscriberKey,
      customerKey: `CUS-${subscriberKey}`,
      lobType: 'WRLS',
      businessType: 'MOVIL'
    },
    currentBill: {
      invoiceNumber: `INV-${subscriberKey}`,
      cycleDate: '2026-07-01',
      total: 50,
      integrityWarnings: []
    },
    previousBill:
      previous
        ? {
            invoiceNumber:
              `PREV-${subscriberKey}`,
            cycleDate: '2026-06-01',
            total: 45,
            integrityWarnings: []
          }
        : null,
    comparison:
      previous
        ? {
            difference: 5,
            chargeChanges: [
              {
                chargeCode: 'X',
                delta: 5,
                ignoreForExplanation: false
              }
            ]
          }
        : null,
    interpretation: {
      status:
        previous
          ? 'FULLY_EXPLAINED'
          : 'NO_PREVIOUS_BILL',
      coveragePercent:
        previous ? 100 : null,
      unexplainedAmount:
        previous ? 0 : null,
      causes:
        previous
          ? [
              {
                code: scenario,
                impactAmount: 5,
                evidenceLevel: 'HIGH',
                evidence:
                  scenario ===
                    'RECONNECTION'
                    ? {
                        orders: [
                          {},
                          {}
                        ]
                      }
                    : {}
              }
            ]
          : [],
      currentBillFindings:
        proration && !previous
          ? [
              {
                code: 'PRORATION',
                amount: 20,
                evidenceLevel: 'HIGH',
                periodStartDate:
                  '2026-06-01',
                periodEndDate:
                  '2026-06-20',
                rentType: 'RA'
              }
            ]
          : [],
      rentContext: {
        current: {
          resolved: true,
          rentType:
            proration
              ? 'RA'
              : 'RV'
        }
      },
      diagnostics: {
        unmatchedProrationEvidence: []
      }
    },
    customerFacing: {
      headline: 'Fixture',
      summary: 'Fixture'
    }
  };
}

function createRepository() {
  return {
    opened: false,
    closed: false,
    async open() {
      this.opened = true;
    },
    async close() {
      this.closed = true;
    },
    async countCoverageSubscribers() {
      return 4;
    },
    async listCoverageSubscriberSeeds({
      limit
    }) {
      const rows = [
        {
          subscriberKey: 'A',
          invoiceCount: 0
        },
        {
          subscriberKey: 'B',
          invoiceCount: 2
        },
        {
          subscriberKey: 'C',
          invoiceCount: 1
        },
        {
          subscriberKey: 'D',
          invoiceCount: 2
        }
      ];

      return limit
        ? rows.slice(0, limit)
        : rows;
    },
    async getImportMetadata() {
      return [
        {
          datasetKey: 'clientes',
          importedRows: 4,
          importedAt: '2026-08-12',
          sha256: 'hash'
        }
      ];
    }
  };
}

test(
  'limita concurrencia entre 1 y 8',
  () => {
    assert.equal(clampConcurrency(0), 1);
    assert.equal(clampConcurrency(4), 4);
    assert.equal(clampConcurrency(20), 8);
  }
);

test(
  'normaliza limit nulo como escaneo completo',
  () => {
    assert.equal(normalizeLimit(null), null);
    assert.equal(normalizeLimit(0), null);
    assert.equal(normalizeLimit('500'), 500);
  }
);

test(
  'no invoca Fase 3 para suscriptores sin recibos',
  async () => {
    const repository =
      createRepository();
    const calls = [];

    const service =
      createDatasetCoverageService({
        repository,
        explanationServiceFactory:
          () => ({
            async open() {},
            async close() {},
            async explainSubscriber(key) {
              calls.push(key);
              return explanation(key);
            }
          })
      });

    const report =
      await service.scan({
        concurrency: 2
      });

    assert.equal(
      calls.includes('A'),
      false
    );
    assert.equal(
      report.profiles[0]
        .qualityTier,
      'NO_BILL'
    );
  }
);

test(
  'genera alias DEMO para todos los consultables sin crear cuentas de login',
  async () => {
    const repository =
      createRepository();

    const service =
      createDatasetCoverageService({
        repository,
        explanationServiceFactory:
          () => ({
            async open() {},
            async close() {},
            async explainSubscriber(key) {
              if (key === 'C') {
                return explanation(
                  key,
                  {
                    previous: false,
                    scenario: 'PRORATION'
                  }
                );
              }
              return explanation(key);
            }
          })
      });

    const report =
      await service.scan({
        concurrency: 3
      });

    assert.deepEqual(
      report.profiles.map(
        (item) => item.demoId
      ),
      [
        null,
        'DEMO000001',
        'DEMO000002',
        'DEMO000003'
      ]
    );
    assert.equal(
      report.safeguards
        .massProfilesAreLoginAccounts,
      false
    );
  }
);

test(
  'captura errores individuales y continúa el barrido',
  async () => {
    const repository =
      createRepository();

    const service =
      createDatasetCoverageService({
        repository,
        explanationServiceFactory:
          () => ({
            async open() {},
            async close() {},
            async explainSubscriber(key) {
              if (key === 'D') {
                const error =
                  new Error('fixture');
                error.code =
                  'BROKEN_CASE';
                throw error;
              }
              return explanation(key);
            }
          })
      });

    const report =
      await service.scan();

    const broken =
      report.profiles.find(
        (item) =>
          item.subscriberKey === 'D'
      );

    assert.equal(
      broken.errorCode,
      'BROKEN_CASE'
    );
    assert.equal(
      report.summary.counts
        .analysisErrors,
      1
    );
    assert.equal(
      report.profiles.length,
      4
    );
  }
);

test(
  '--limit conserva el total disponible para no presentar una muestra como cobertura total',
  async () => {
    const repository =
      createRepository();

    const service =
      createDatasetCoverageService({
        repository,
        explanationServiceFactory:
          () => ({
            async open() {},
            async close() {},
            async explainSubscriber(key) {
              return explanation(key);
            }
          })
      });

    const report =
      await service.scan({
        limit: 2
      });

    assert.equal(
      report.summary.scope
        .totalAvailable,
      4
    );
    assert.equal(
      report.summary.scope.scanned,
      2
    );
    assert.equal(
      report.summary.scope.limited,
      true
    );
  }
);

test(
  'reporta progreso sin exponer identificadores en el callback',
  async () => {
    const repository =
      createRepository();
    const progress = [];

    const service =
      createDatasetCoverageService({
        repository,
        explanationServiceFactory:
          () => ({
            async open() {},
            async close() {},
            async explainSubscriber(key) {
              return explanation(key);
            }
          })
      });

    await service.scan({
      onProgress(value) {
        progress.push(value);
      }
    });

    assert.equal(progress.length, 4);
    assert.equal(
      progress.at(-1).processed,
      4
    );
    assert.equal(
      Object.hasOwn(
        progress.at(-1),
        'subscriberKey'
      ),
      false
    );
  }
);
