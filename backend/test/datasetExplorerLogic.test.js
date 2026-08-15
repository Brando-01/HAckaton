const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeExplorerQuery,
  getScenarioLabel,
  getExplorerAccessPolicy,
  toSafeExplorerProfile,
  buildExplorerSummary
} = require('../services/datasetExplorerLogic');

test(
  'normaliza filtros y limita pageSize sin aceptar escenarios arbitrarios',
  () => {
    assert.deepEqual(
      normalizeExplorerQuery({
        search: '  demo001  ',
        capability: 'high',
        scenario: 'reconnection',
        rentType: 'rv',
        sort: 'premium_first',
        page: '3',
        pageSize: '999'
      }),
      {
        search: 'demo001',
        capability: 'HIGH',
        scenario: 'RECONNECTION',
        rentType: 'RV',
        qualityTier: 'ALL',
        sort: 'PREMIUM_FIRST',
        page: 3,
        pageSize: 60
      }
    );

    assert.equal(
      normalizeExplorerQuery({
        scenario: 'INVENTED'
      }).scenario,
      'ALL'
    );
  }
);

test(
  'política del explorador es solo lectura y no permite suplantar cuentas',
  () => {
    assert.deepEqual(
      getExplorerAccessPolicy(),
      {
        mode:
          'READ_ONLY_COVERAGE',
        publicMetadataOnly: true,
        accountImpersonationAllowed:
          false,
        explorerCreatesAuthSession:
          false,
        financialDetailsRequireAuthenticatedDemoProfile:
          true,
        authenticatedEntryPoint:
          '/login'
      }
    );
  }
);

test(
  'el perfil público elimina subscriberKey y customerKey aunque existan en memoria',
  () => {
    const safe =
      toSafeExplorerProfile({
        demoId: 'DEMO000321',
        subscriberKey: 'SECRET_SUB',
        customerKey: 'SECRET_CUST',
        invoiceCount: 3,
        comparable: true,
        explainable: true,
        highConfidence: true,
        fullyExplained: true,
        demoPremium: true,
        qualityTier: 'DEMO_PREMIUM',
        primaryScenario: 'PRORATION',
        scenarioCodes: ['PRORATION'],
        coveragePercent: 100,
        rentType: 'RA'
      });

    const serialized =
      JSON.stringify(safe);

    assert.equal(
      serialized.includes(
        'subscriberKey'
      ),
      false
    );
    assert.equal(
      serialized.includes(
        'customerKey'
      ),
      false
    );
    assert.equal(
      safe.primaryScenarioLabel,
      'Prorrateo'
    );
  }
);

test(
  'resume el barrido completo sin exponer lineage ni ids por cliente',
  () => {
    const summary =
      buildExplorerSummary({
        generatedAt:
          '2026-08-13T04:44:25.143Z',
        summary: {
          scope: {
            totalAvailable: 20000,
            scanned: 20000,
            limited: false
          },
          counts: {
            consultable: 18450,
            comparable: 17745,
            explainable: 2158,
            highConfidence: 2145,
            demoPremium: 677,
            noBills: 1550,
            analysisErrors: 0
          },
          percentages: {
            consultableOfScanned: 92.25,
            comparableOfConsultable: 96.18,
            explainableOfConsultable: 11.7,
            highConfidenceOfConsultable: 11.63,
            premiumOfConsultable: 3.67
          },
          scenarios: {
            RECONNECTION: 964
          }
        },
        dataLineage: [
          {
            sha256: 'PRIVATE_HASH'
          }
        ]
      });

    assert.equal(
      summary.fullDataset,
      true
    );
    assert.equal(
      summary.counts.consultable,
      18450
    );
    assert.equal(
      JSON.stringify(summary).includes(
        'PRIVATE_HASH'
      ),
      false
    );
  }
);

test(
  'etiqueta explícitamente escenarios soportados y casos sin causa',
  () => {
    assert.equal(
      getScenarioLabel(
        'PLAN_CHANGE'
      ),
      'Cambio de plan'
    );
    assert.equal(
      getScenarioLabel(null),
      'Sin causa reconocida'
    );
  }
);

test(
  'Fase 13 permite filtrar y etiquetar perfiles con paquetes verificados',
  () => {
    const query =
      normalizeExplorerQuery({
        scenario: 'packages'
      });

    assert.equal(
      query.scenario,
      'PACKAGES'
    );
    assert.equal(
      getScenarioLabel(
        'PACKAGES'
      ),
      'Paquetes adicionales'
    );
  }
);

test(
  'Checkpoint 14B permite filtrar perfiles con ajuste de suspensión verificado',
  () => {
    const query =
      normalizeExplorerQuery({
        scenario:
          'suspension_adjustment'
      });

    assert.equal(
      query.scenario,
      'SUSPENSION_ADJUSTMENT'
    );
    assert.equal(
      getScenarioLabel(
        'SUSPENSION_ADJUSTMENT'
      ),
      'Ajuste por suspensión'
    );
  }
);
