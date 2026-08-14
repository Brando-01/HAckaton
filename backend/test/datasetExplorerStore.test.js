const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  writeCoverageReport,
  queryCoverageProfiles,
  readPrivateCoverageProfileByDemoId
} = require('../services/datasetCoverageStore');

function profile({
  demoId,
  subscriberKey,
  scenario,
  explainable = true,
  highConfidence = true,
  premium = false,
  rentType = 'RV'
}) {
  return {
    demoId,
    subscriberKey,
    customerKey:
      `C_${subscriberKey}`,
    lobType: 'WRLS',
    businessType: 'MOVIL',
    invoiceCount: 2,
    hasInvoices: true,
    consultable: true,
    comparable: true,
    explainable,
    highConfidence,
    fullyExplained: premium,
    demoPremium: premium,
    qualityTier:
      premium
        ? 'DEMO_PREMIUM'
        : highConfidence
          ? 'HIGH_CONFIDENCE'
          : explainable
            ? 'EXPLAINABLE'
            : 'COMPARABLE',
    status:
      explainable
        ? 'FULLY_EXPLAINED'
        : 'UNEXPLAINED',
    evidenceLevel:
      highConfidence
        ? 'HIGH'
        : explainable
          ? 'MEDIUM'
          : null,
    primaryScenario:
      scenario,
    scenarioCodes:
      scenario ? [scenario] : [],
    premiumScore:
      premium ? 100 : null,
    coveragePercent:
      premium ? 100 : null,
    currentTotal: 50,
    previousTotal: 45,
    difference: 5,
    currentCycleDate:
      '2026-07-15',
    previousCycleDate:
      '2026-06-15',
    rentType,
    integrityWarningCount: 0,
    errorCode: null
  };
}

test(
  'consulta el índice con filtros y mantiene identificadores oficiales fuera de la proyección pública',
  async () => {
    const dir =
      fs.mkdtempSync(
        path.join(
          os.tmpdir(),
          'phase10-store-'
        )
      );
    const dbPath =
      path.join(
        dir,
        'coverage.db'
      );

    try {
      await writeCoverageReport(
        {
          schemaVersion:
            'desafio1-dataset-coverage-v1',
          phase: 'PHASE_9',
          generatedAt:
            '2026-08-13T04:44:25.143Z',
          configuration: {},
          summary: {},
          profiles: [
            profile({
              demoId: 'DEMO000001',
              subscriberKey: 'SUB_SECRET_1',
              scenario: 'RECONNECTION',
              premium: true
            }),
            profile({
              demoId: 'DEMO000002',
              subscriberKey: 'SUB_SECRET_2',
              scenario: null,
              explainable: false,
              highConfidence: false,
              rentType: 'RA'
            })
          ],
          dataLineage: [],
          safeguards: {}
        },
        { outputPath: dbPath }
      );

      const publicResult =
        await queryCoverageProfiles({
          dbPath,
          capability: 'PREMIUM',
          scenario: 'RECONNECTION'
        });

      assert.equal(
        publicResult.pagination.total,
        1
      );
      assert.equal(
        publicResult.items[0].demoId,
        'DEMO000001'
      );
      assert.equal(
        JSON.stringify(publicResult)
          .includes('SUB_SECRET_1'),
        false
      );

      const privateResult =
        await readPrivateCoverageProfileByDemoId(
          'DEMO000001',
          { dbPath }
        );

      assert.equal(
        privateResult.subscriberKey,
        'SUB_SECRET_1'
      );
      assert.equal(
        privateResult.customerKey,
        'C_SUB_SECRET_1'
      );
    } finally {
      fs.rmSync(
        dir,
        {
          recursive: true,
          force: true
        }
      );
    }
  }
);
