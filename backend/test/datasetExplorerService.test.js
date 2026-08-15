const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DatasetExplorerService,
  DatasetExplorerError
} = require('../services/datasetExplorerService');

function privateProfile() {
  return {
    demoId: 'DEMO000777',
    subscriberKey: 'SUB_SECRET',
    customerKey: 'CUST_SECRET',
    invoiceCount: 2,
    comparable: true,
    explainable: true,
    highConfidence: true,
    fullyExplained: true,
    demoPremium: true,
    qualityTier: 'DEMO_PREMIUM',
    status: 'FULLY_EXPLAINED',
    evidenceLevel: 'HIGH',
    primaryScenario: 'RECONNECTION',
    scenarioCodes: ['RECONNECTION'],
    premiumScore: 100,
    coveragePercent: 100,
    currentCycleDate: '2026-07-15',
    previousCycleDate: '2026-06-15',
    rentType: 'RV',
    integrityWarningCount: 0,
    differenceDirection: 'UP'
  };
}

function explanation() {
  return {
    subscriber: {
      lobType: 'WRLS',
      businessType: 'MOVIL'
    },
    currentBill: {
      cycleDate: '2026-07-15',
      total: 67.47,
      debtStatuses: ['SIN DEUDA'],
      items: [
        {
          chargeCode: 'PLAN',
          description: 'Plan demo',
          amount: 62.89,
          classification:
            'Cargo recurrente de plan'
        }
      ]
    },
    previousBill: {
      cycleDate: '2026-06-15',
      total: 62.89,
      debtStatuses: ['SIN DEUDA'],
      items: []
    },
    comparison: {
      difference: 4.58,
      percentage: 7.3,
      direction: 'UP'
    },
    interpretation: {
      status: 'FULLY_EXPLAINED',
      coveragePercent: 100,
      unexplainedAmount: 0,
      causes: [
        {
          code: 'RECONNECTION',
          label: 'Cargo por reconexión',
          impactAmount: 4.58,
          evidenceLevel: 'HIGH',
          evidence: []
        }
      ],
      currentBillFindings: [],
      rentContext: {
        current: {
          resolved: true,
          rentType: 'RV'
        }
      },
      customerFacing: {
        headline: 'Tu recibo aumentó S/ 4.58',
        summary: 'Se agregó un cargo por reconexión.',
        details: [],
        limitations: []
      }
    }
  };
}

test(
  'busca perfiles usando filtros normalizados y devuelve solo proyección segura',
  async () => {
    const calls = [];
    const service =
      new DatasetExplorerService({
        async queryProfiles(options) {
          calls.push(options);
          return {
            items: [
              privateProfile()
            ],
            pagination: {
              page: 1,
              pageSize: 24,
              total: 1,
              totalPages: 1
            }
          };
        }
      });

    const result =
      await service.searchProfiles({
        capability: 'high',
        scenario: 'reconnection'
      });

    assert.equal(
      calls[0].capability,
      'HIGH'
    );
    assert.equal(
      calls[0].scenario,
      'RECONNECTION'
    );
    assert.equal(
      JSON.stringify(result).includes(
        'SUB_SECRET'
      ),
      false
    );
  }
);

test(
  'service del explorador ya no fabrica identidades autenticables desde un alias',
  () => {
    const service =
      new DatasetExplorerService();

    assert.equal(
      typeof service.createAuthUserForDemoId,
      'undefined'
    );
  }
);

test(
  'la experiencia del explorador usa el subscriber privado solo dentro del backend',
  async () => {
    const explainCalls = [];
    const service =
      new DatasetExplorerService({
        async readPrivateProfile() {
          return privateProfile();
        },
        async explainSubscriber(key) {
          explainCalls.push(key);
          return explanation();
        },
        buildExperience({
          user,
          binding,
          explanation
        }) {
          return {
            schemaVersion:
              'base-experience',
            dataSource:
              'BASE',
            customer: {
              customerId:
                user.customerId,
              name: user.name,
              demoScenario:
                binding.scenario,
              demoScenarioLabel:
                binding.scenarioLabel
            },
            currentBill:
              explanation.currentBill,
            previousBill:
              explanation.previousBill,
            comparison:
              explanation.comparison,
            findings: [],
            financialExplanation:
              explanation.interpretation,
            nextActions: []
          };
        }
      });

    const experience =
      await service
        .getExperienceForUser({
          userId: 'EXP_DEMO000777',
          customerId:
            'EXP_DEMO000777',
          name:
            'Cliente DEMO000777',
          email: null,
          mode: 'EXPLORER',
          explorerDemoId:
            'DEMO000777'
        });

    assert.deepEqual(
      explainCalls,
      ['SUB_SECRET']
    );
    assert.equal(
      experience.dataSource,
      'DESAFIO1_COVERAGE_EXPLORER_LOCAL'
    );
    assert.equal(
      experience.customer.customerId,
      'EXP_DEMO000777'
    );
    assert.equal(
      experience.explorer.demoId,
      'DEMO000777'
    );
    assert.equal(
      JSON.stringify(experience).includes(
        'SUB_SECRET'
      ),
      false
    );
  }
);

test(
  'rechaza aliases inexistentes con un código explícito',
  async () => {
    const service =
      new DatasetExplorerService({
        async readPrivateProfile() {
          return null;
        }
      });

    await assert.rejects(
      () =>
        service.getSafeProfile(
          'DEMO999999'
        ),
      (error) => {
        assert.ok(
          error instanceof
            DatasetExplorerError
        );
        assert.equal(
          error.code,
          'EXPLORER_PROFILE_NOT_FOUND'
        );
        return true;
      }
    );
  }
);

test(
  'Fase 14 carga el histórico del explorer solo cuando se solicita',
  async () => {
    let historyCalls = 0;
    const service =
      new DatasetExplorerService({
        async readPrivateProfile() {
          return privateProfile();
        },
        async explainSubscriber() {
          return explanation();
        },
        async loadHistory(key) {
          historyCalls += 1;
          assert.equal(
            key,
            'SUB_SECRET'
          );
          return [
            explanation().currentBill,
            explanation().previousBill
          ];
        },
        buildExperience({
          user,
          explanation,
          historyInvoices
        }) {
          return {
            customer: {
              customerId:
                user.customerId
            },
            currentBill:
              explanation.currentBill,
            historyCount:
              historyInvoices
                ?.length || 0
          };
        }
      });

    const user = {
      userId: 'EXP_DEMO000777',
      customerId:
        'EXP_DEMO000777',
      name:
        'Cliente DEMO000777',
      mode: 'EXPLORER',
      explorerDemoId:
        'DEMO000777'
    };

    const regular =
      await service
        .getExperienceForUser(user);

    assert.equal(historyCalls, 0);
    assert.equal(
      regular.historyCount,
      0
    );

    const historical =
      await service
        .getExperienceForUser(
          user,
          { includeHistory: true }
        );

    assert.equal(historyCalls, 1);
    assert.equal(
      historical.historyCount,
      2
    );
  }
);
