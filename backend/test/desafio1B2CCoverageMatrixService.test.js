const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clampConcurrency,
  normalizeLimit,
  B2CCoverageMatrixService
} = require(
  '../services/desafio1B2CCoverageMatrixService'
);

function explanationFor({
  businessType = 'MOVIL',
  lobType = 'WRLS',
  rentType = 'RA',
  scenario = 'RECONNECTION'
} = {}) {
  return {
    subscriber: {
      subscriberKey: 'PRIVATE',
      customerKey: 'PRIVATE-CUSTOMER',
      businessType,
      lobType
    },
    currentBill: {
      invoiceNumber: 'PRIVATE-INV',
      total: 60,
      items: [
        {
          chargeCode: 'PLAN',
          rentType
        }
      ]
    },
    previousBill: {
      total: 50,
      items: []
    },
    interpretation: {
      rentContext: {
        current: {
          resolved: true,
          rentType
        }
      },
      causes: [
        {
          code: scenario,
          evidenceLevel: 'HIGH',
          ruleId: `${scenario}_RULE`,
          claimedChargeCodes: [
            'PLAN'
          ]
        }
      ],
      currentBillFindings: []
    },
    safeguards: {
      llmUsedForFinancialReasoning:
        false
    }
  };
}

function fixture({
  failKey = null
} = {}) {
  const calls = {
    repositoryOpen: 0,
    repositoryClose: 0,
    explain: [],
    serviceOpen: 0,
    serviceClose: 0
  };

  const seeds = [
    {
      subscriberKey: '100',
      customerKey: 'C1',
      businessType: 'MOVIL',
      lobType: 'WRLS',
      invoiceCount: 2
    },
    {
      subscriberKey: '200',
      customerKey: 'C2',
      businessType: 'FIJA',
      lobType: 'BB',
      invoiceCount: 0
    },
    {
      subscriberKey: '300',
      customerKey: 'C3',
      businessType: 'FIJA',
      lobType: 'TV',
      invoiceCount: 2
    }
  ];

  const repository = {
    calls,
    async open() {
      calls.repositoryOpen += 1;
    },
    async close() {
      calls.repositoryClose += 1;
    },
    async countCoverageSubscribers() {
      return seeds.length;
    },
    async listCoverageSubscriberSeeds({
      limit = null
    } = {}) {
      return limit
        ? seeds.slice(0, limit)
        : seeds.slice();
    },
    async getImportMetadata() {
      return [
        {
          datasetKey:
            'planta_clientes',
          importedRows: 20000,
          sha256: 'hash-private-safe'
        }
      ];
    }
  };

  const explanationServiceFactory =
    () => ({
      async open() {
        calls.serviceOpen += 1;
      },
      async close() {
        calls.serviceClose += 1;
      },
      async explainSubscriber(key) {
        calls.explain.push(key);

        if (key === failKey) {
          const error = new Error(
            'PRIVATE failure details'
          );
          error.code =
            'SIMULATED_ERROR';
          throw error;
        }

        if (key === '300') {
          return explanationFor({
            businessType: 'FIJA',
            lobType: 'TV',
            rentType: 'RV',
            scenario: 'DISCOUNT_ENDED'
          });
        }

        return explanationFor();
      }
    });

  return {
    calls,
    repository,
    explanationServiceFactory
  };
}

test(
  'clampConcurrency limita el barrido entre 1 y 8 workers',
  () => {
    assert.equal(
      clampConcurrency(0),
      1
    );
    assert.equal(
      clampConcurrency(4),
      4
    );
    assert.equal(
      clampConcurrency(99),
      8
    );
  }
);

test(
  'normalizeLimit usa null para escaneo completo y conserva límites positivos',
  () => {
    assert.equal(
      normalizeLimit(null),
      null
    );
    assert.equal(
      normalizeLimit(0),
      null
    );
    assert.equal(
      normalizeLimit('500'),
      500
    );
  }
);

test(
  'scan recorre la población completa, omite análisis financiero para quien no tiene recibos y devuelve solo agregados seguros',
  async () => {
    const {
      calls,
      repository,
      explanationServiceFactory
    } = fixture();

    const service =
      new B2CCoverageMatrixService({
        repository,
        explanationServiceFactory
      });

    try {
      const report =
        await service.scan({
          concurrency: 2
        });

      assert.equal(
        report.scope.population,
        3
      );
      assert.equal(
        report.scope.scanned,
        3
      );
      assert.equal(
        report.configuration
          .fullPopulationScan,
        true
      );
      assert.equal(
        calls.explain.length,
        2
      );
      assert.equal(
        calls.explain.includes('200'),
        false
      );
      assert.equal(
        JSON.stringify(report)
          .includes('PRIVATE-INV'),
        false
      );
      assert.equal(
        JSON.stringify(report)
          .includes('PRIVATE-CUSTOMER'),
        false
      );
    } finally {
      await service.close();
    }
  }
);

test(
  'un fallo individual queda como REVIEW_REQUIRED sin filtrar el mensaje ni cancelar el barrido',
  async () => {
    const {
      repository,
      explanationServiceFactory
    } = fixture({
      failKey: '300'
    });

    const service =
      new B2CCoverageMatrixService({
        repository,
        explanationServiceFactory
      });

    try {
      const report =
        await service.scan({
          concurrency: 1
        });

      assert.equal(
        report.status,
        'REVIEW_REQUIRED'
      );
      assert.equal(
        report.counts.analysisErrors,
        1
      );
      assert.equal(
        JSON.stringify(report)
          .includes(
            'PRIVATE failure details'
          ),
        false
      );
    } finally {
      await service.close();
    }
  }
);

test(
  'repositorio inyectado no se cierra por ownership pero cada worker cierra su servicio de explicación',
  async () => {
    const {
      calls,
      repository,
      explanationServiceFactory
    } = fixture();

    const service =
      new B2CCoverageMatrixService({
        repository,
        explanationServiceFactory
      });

    await service.scan({
      concurrency: 2
    });
    await service.close();

    assert.equal(
      calls.repositoryOpen,
      1
    );
    assert.equal(
      calls.repositoryClose,
      0
    );
    assert.equal(
      calls.serviceOpen,
      2
    );
    assert.equal(
      calls.serviceClose,
      2
    );
  }
);
