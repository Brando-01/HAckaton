const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DemoCaseSelectionService
} = require(
  '../services/demoCaseSelectionService'
);

function explanationFor(
  subscriberKey,
  {
    eligible = true
  } = {}
) {
  return {
    subscriber: {
      subscriberKey,
      customerKey:
        `customer-${subscriberKey}`,
      lobType: 'WRLS',
      businessType: 'MOVIL'
    },
    currentBill: {
      invoiceNumber:
        `current-${subscriberKey}`,
      cycleDate: '2026-07-27',
      total: 34.48,
      integrityWarnings: []
    },
    previousBill: {
      invoiceNumber:
        `previous-${subscriberKey}`,
      cycleDate: '2026-06-27',
      total: 29.9,
      integrityWarnings: []
    },
    comparison: {
      difference: 4.58,
      chargeChanges: [
        {
          chargeCode:
            'OC1_RECONEXION',
          delta: 4.58,
          ignoreForExplanation: false
        }
      ]
    },
    interpretation: {
      status: eligible
        ? 'FULLY_EXPLAINED'
        : 'PARTIALLY_EXPLAINED',
      coveragePercent:
        eligible ? 100 : 50,
      unexplainedAmount:
        eligible ? 0 : 2.29,
      causes: [
        {
          code: 'RECONNECTION',
          label: 'Cargo por reconexión',
          impactAmount: 4.58,
          evidenceLevel: 'HIGH',
          evidence: {
            orders: [
              { reason: 'Suspensión' },
              { reason: 'Reactivación' }
            ]
          }
        }
      ],
      currentBillFindings: [],
      rentContext: {
        current: {
          resolved: true,
          rentType: 'RV'
        }
      },
      diagnostics: {
        unmatchedProrationEvidence: []
      }
    },
    customerFacing: {
      headline: 'Aumento por reconexión',
      summary: 'Reconexión verificada'
    }
  };
}

test('rankScenario usa preselección del repositorio y excluye casos no elegibles', async () => {
  const repository = {
    opened: false,
    async open() {
      this.opened = true;
    },
    async close() {},
    async listDemoScenarioCandidateKeys(
      scenario,
      options
    ) {
      assert.equal(
        scenario,
        'RECONNECTION'
      );
      assert.equal(
        options.limit,
        10
      );
      return ['1', '2'];
    }
  };

  const explanationService = {
    calls: 0,
    async open() {},
    async close() {},
    async explainSubscriber(key) {
      this.calls += 1;
      return explanationFor(
        key,
        {
          eligible: key === '1'
        }
      );
    }
  };

  const service =
    new DemoCaseSelectionService({
      repository,
      explanationService
    });

  const result =
    await service.rankScenario(
      'RECONNECTION',
      {
        prefilterLimit: 10,
        limit: 5
      }
    );

  assert.equal(
    result.prefiltered,
    2
  );
  assert.equal(result.evaluated, 2);
  assert.equal(result.eligible, 1);
  assert.equal(result.top.length, 1);
  assert.equal(
    result.top[0].subscriberKey,
    '1'
  );

  await service.close();
});

test('cache evita recalcular la misma explicación entre escenarios o llamadas', async () => {
  const repository = {
    async open() {},
    async close() {},
    async listDemoScenarioCandidateKeys() {
      return ['same'];
    }
  };

  const explanationService = {
    calls: 0,
    async open() {},
    async close() {},
    async explainSubscriber(key) {
      this.calls += 1;
      return explanationFor(key);
    }
  };

  const service =
    new DemoCaseSelectionService({
      repository,
      explanationService
    });

  await service.explainCached('same');
  await service.explainCached('same');

  assert.equal(
    explanationService.calls,
    1
  );

  await service.close();
});

test('rankScenario conserva errores individuales sin cancelar el ranking completo', async () => {
  const repository = {
    async open() {},
    async close() {},
    async listDemoScenarioCandidateKeys() {
      return ['ok', 'bad'];
    }
  };

  const explanationService = {
    async open() {},
    async close() {},
    async explainSubscriber(key) {
      if (key === 'bad') {
        const error = new Error(
          'fallo controlado'
        );
        error.code = 'TEST_ERROR';
        throw error;
      }

      return explanationFor(key);
    }
  };

  const service =
    new DemoCaseSelectionService({
      repository,
      explanationService
    });

  const result =
    await service.rankScenario(
      'RECONNECTION'
    );

  assert.equal(result.evaluated, 1);
  assert.equal(result.errors.length, 1);
  assert.equal(
    result.errors[0].code,
    'TEST_ERROR'
  );

  await service.close();
});
