const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

let sqliteAvailable = true;
try {
  require.resolve('sqlite3');
} catch (error) {
  sqliteAvailable = false;
}

const {
  COVERAGE_SCHEMA_VERSION
} = require(
  '../services/datasetCoverageLogic'
);

const store = sqliteAvailable
  ? require(
      '../services/datasetCoverageStore'
    )
  : null;

function reportFixture() {
  return {
    schemaVersion:
      COVERAGE_SCHEMA_VERSION,
    phase: 'PHASE_9',
    generatedAt:
      '2026-08-13T00:00:00.000Z',
    configuration: {
      concurrency: 2,
      requestedLimit: 2
    },
    summary: {
      scope: {
        totalAvailable: 20,
        scanned: 2,
        limited: true
      },
      counts: {
        consultable: 1
      },
      percentages: {},
      statuses: {},
      scenarios: {},
      tiers: {}
    },
    profiles: [
      {
        demoId: 'DEMO000001',
        subscriberKey: 'OFFICIAL-LOCAL-1',
        customerKey: 'CUSTOMER-LOCAL-1',
        lobType: 'WRLS',
        businessType: 'MOVIL',
        invoiceCount: 2,
        hasInvoices: true,
        consultable: true,
        comparable: true,
        explainable: true,
        highConfidence: true,
        fullyExplained: true,
        demoPremium: true,
        qualityTier: 'DEMO_PREMIUM',
        status: 'FULLY_EXPLAINED',
        evidenceLevel: 'HIGH',
        primaryScenario: 'RECONNECTION',
        scenarioCodes: [
          'RECONNECTION'
        ],
        premiumScore: 100,
        coveragePercent: 100,
        currentTotal: 67.47,
        previousTotal: 62.89,
        difference: 4.58,
        currentCycleDate: '2026-07-15',
        previousCycleDate: '2026-06-15',
        rentType: 'RV',
        integrityWarningCount: 0,
        errorCode: null
      },
      {
        demoId: null,
        subscriberKey: 'OFFICIAL-LOCAL-2',
        customerKey: 'CUSTOMER-LOCAL-2',
        lobType: 'WRLS',
        businessType: 'MOVIL',
        invoiceCount: 0,
        hasInvoices: false,
        consultable: false,
        comparable: false,
        explainable: false,
        highConfidence: false,
        fullyExplained: false,
        demoPremium: false,
        qualityTier: 'NO_BILL',
        status: null,
        evidenceLevel: null,
        primaryScenario: null,
        scenarioCodes: [],
        premiumScore: null,
        coveragePercent: null,
        currentTotal: null,
        previousTotal: null,
        difference: null,
        currentCycleDate: null,
        previousCycleDate: null,
        rentType: null,
        integrityWarningCount: 0,
        errorCode: null
      }
    ],
    dataLineage: [],
    safeguards: {
      massProfilesAreLoginAccounts: false
    }
  };
}

test(
  'persiste el reporte en SQLite local y recupera solo metadata agregada',
  {
    skip: !sqliteAvailable
  },
  async () => {
    const dir =
      fs.mkdtempSync(
        path.join(
          os.tmpdir(),
          'phase9-coverage-'
        )
      );

    const dbPath =
      path.join(
        dir,
        'coverage.db'
      );

    try {
      await store.writeCoverageReport(
        reportFixture(),
        { outputPath: dbPath }
      );

      const meta =
        await store.readCoverageMeta({
          dbPath
        });

      assert.equal(
        meta.schemaVersion,
        COVERAGE_SCHEMA_VERSION
      );
      assert.equal(
        meta.storedProfiles,
        2
      );
      assert.equal(
        meta.summary.counts
          .consultable,
        1
      );
      assert.equal(
        Object.hasOwn(
          meta,
          'subscriberKey'
        ),
        false
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
