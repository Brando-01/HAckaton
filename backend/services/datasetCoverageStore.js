const fs = require('fs');
const path = require('path');
const sqlite3 =
  require('sqlite3').verbose();

const {
  COVERAGE_SCHEMA_VERSION
} = require(
  './datasetCoverageLogic'
);

const DEFAULT_COVERAGE_DB_PATH =
  path.resolve(
    __dirname,
    '../data/demo-coverage.local.db'
  );

function resolveCoverageDbPath(
  explicitPath = null
) {
  return path.resolve(
    explicitPath ||
    process.env
      .DESAFIO1_COVERAGE_DB_PATH ||
    DEFAULT_COVERAGE_DB_PATH
  );
}

function openDatabase(
  dbPath,
  mode =
    sqlite3.OPEN_READWRITE |
    sqlite3.OPEN_CREATE
) {
  return new Promise(
    (resolve, reject) => {
      const db =
        new sqlite3.Database(
          dbPath,
          mode,
          (error) => {
            if (error) {
              reject(error);
              return;
            }
            resolve(db);
          }
        );
    }
  );
}

function run(
  db,
  sql,
  params = []
) {
  return new Promise(
    (resolve, reject) => {
      db.run(
        sql,
        params,
        function onRun(error) {
          if (error) {
            reject(error);
            return;
          }
          resolve(this);
        }
      );
    }
  );
}

function get(
  db,
  sql,
  params = []
) {
  return new Promise(
    (resolve, reject) => {
      db.get(
        sql,
        params,
        (error, row) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(row || null);
        }
      );
    }
  );
}

function close(db) {
  return new Promise(
    (resolve, reject) => {
      db.close(
        (error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve();
        }
      );
    }
  );
}

function removeIfExists(
  filePath
) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

async function createSchema(db) {
  await run(
    db,
    `
      CREATE TABLE coverage_meta (
        key TEXT PRIMARY KEY,
        value_json TEXT NOT NULL
      )
    `
  );

  await run(
    db,
    `
      CREATE TABLE coverage_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        demo_id TEXT UNIQUE,
        subscriber_key TEXT NOT NULL UNIQUE,
        customer_key TEXT,
        lob_type TEXT,
        business_type TEXT,
        invoice_count INTEGER NOT NULL,
        has_invoices INTEGER NOT NULL,
        consultable INTEGER NOT NULL,
        comparable INTEGER NOT NULL,
        explainable INTEGER NOT NULL,
        high_confidence INTEGER NOT NULL,
        fully_explained INTEGER NOT NULL,
        demo_premium INTEGER NOT NULL,
        quality_tier TEXT NOT NULL,
        explanation_status TEXT,
        evidence_level TEXT,
        primary_scenario TEXT,
        scenario_codes_json TEXT NOT NULL,
        premium_score INTEGER,
        coverage_percent REAL,
        current_total REAL,
        previous_total REAL,
        difference REAL,
        current_cycle_date TEXT,
        previous_cycle_date TEXT,
        rent_type TEXT,
        integrity_warning_count INTEGER NOT NULL,
        error_code TEXT
      )
    `
  );

  const indexes = [
    'CREATE INDEX idx_cov_demo ON coverage_profiles(demo_id)',
    'CREATE INDEX idx_cov_tier ON coverage_profiles(quality_tier)',
    'CREATE INDEX idx_cov_consultable ON coverage_profiles(consultable)',
    'CREATE INDEX idx_cov_comparable ON coverage_profiles(comparable)',
    'CREATE INDEX idx_cov_explainable ON coverage_profiles(explainable)',
    'CREATE INDEX idx_cov_high ON coverage_profiles(high_confidence)',
    'CREATE INDEX idx_cov_premium ON coverage_profiles(demo_premium)',
    'CREATE INDEX idx_cov_scenario ON coverage_profiles(primary_scenario)',
    'CREATE INDEX idx_cov_status ON coverage_profiles(explanation_status)'
  ];

  for (const statement of indexes) {
    await run(db, statement);
  }
}

function profileParams(profile) {
  return [
    profile.demoId,
    profile.subscriberKey,
    profile.customerKey,
    profile.lobType,
    profile.businessType,
    profile.invoiceCount,
    profile.hasInvoices ? 1 : 0,
    profile.consultable ? 1 : 0,
    profile.comparable ? 1 : 0,
    profile.explainable ? 1 : 0,
    profile.highConfidence ? 1 : 0,
    profile.fullyExplained ? 1 : 0,
    profile.demoPremium ? 1 : 0,
    profile.qualityTier,
    profile.status,
    profile.evidenceLevel,
    profile.primaryScenario,
    JSON.stringify(
      profile.scenarioCodes || []
    ),
    profile.premiumScore,
    profile.coveragePercent,
    profile.currentTotal,
    profile.previousTotal,
    profile.difference,
    profile.currentCycleDate,
    profile.previousCycleDate,
    profile.rentType,
    profile.integrityWarningCount,
    profile.errorCode
  ];
}

async function insertProfiles(
  db,
  profiles
) {
  const sql = `
    INSERT INTO coverage_profiles (
      demo_id,
      subscriber_key,
      customer_key,
      lob_type,
      business_type,
      invoice_count,
      has_invoices,
      consultable,
      comparable,
      explainable,
      high_confidence,
      fully_explained,
      demo_premium,
      quality_tier,
      explanation_status,
      evidence_level,
      primary_scenario,
      scenario_codes_json,
      premium_score,
      coverage_percent,
      current_total,
      previous_total,
      difference,
      current_cycle_date,
      previous_cycle_date,
      rent_type,
      integrity_warning_count,
      error_code
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `;

  await run(db, 'BEGIN TRANSACTION');

  try {
    for (const profile of profiles) {
      await run(
        db,
        sql,
        profileParams(profile)
      );
    }

    await run(db, 'COMMIT');
  } catch (error) {
    await run(db, 'ROLLBACK');
    throw error;
  }
}

async function writeCoverageReport(
  report,
  {
    outputPath = null
  } = {}
) {
  if (
    report?.schemaVersion !==
      COVERAGE_SCHEMA_VERSION
  ) {
    throw new Error(
      'El reporte de cobertura no usa el schemaVersion esperado de Fase 9.'
    );
  }

  const finalPath =
    resolveCoverageDbPath(
      outputPath
    );

  const tempPath =
    `${finalPath}.tmp`;

  fs.mkdirSync(
    path.dirname(finalPath),
    { recursive: true }
  );

  removeIfExists(tempPath);

  const db =
    await openDatabase(
      tempPath
    );

  try {
    await createSchema(db);

    const meta = {
      schemaVersion:
        report.schemaVersion,
      phase:
        report.phase,
      generatedAt:
        report.generatedAt,
      configuration:
        report.configuration,
      summary:
        report.summary,
      dataLineage:
        report.dataLineage,
      safeguards:
        report.safeguards
    };

    for (
      const [key, value] of
        Object.entries(meta)
    ) {
      await run(
        db,
        `
          INSERT INTO coverage_meta (
            key,
            value_json
          ) VALUES (?, ?)
        `,
        [
          key,
          JSON.stringify(value)
        ]
      );
    }

    await insertProfiles(
      db,
      report.profiles || []
    );
  } finally {
    await close(db);
  }

  removeIfExists(finalPath);
  fs.renameSync(
    tempPath,
    finalPath
  );

  return finalPath;
}

async function readCoverageMeta({
  dbPath = null
} = {}) {
  const resolved =
    resolveCoverageDbPath(
      dbPath
    );

  if (!fs.existsSync(resolved)) {
    const error = new Error(
      `No existe el índice local de cobertura en ${resolved}. Ejecuta npm run demo:coverage:desafio1.`
    );
    error.code =
      'COVERAGE_DB_NOT_FOUND';
    throw error;
  }

  const db =
    await openDatabase(
      resolved,
      sqlite3.OPEN_READONLY
    );

  try {
    const rows = {};

    for (
      const key of [
        'schemaVersion',
        'phase',
        'generatedAt',
        'configuration',
        'summary',
        'dataLineage',
        'safeguards'
      ]
    ) {
      const row =
        await get(
          db,
          `
            SELECT value_json AS valueJson
            FROM coverage_meta
            WHERE key = ?
          `,
          [key]
        );

      rows[key] = row
        ? JSON.parse(row.valueJson)
        : null;
    }

    const countRow =
      await get(
        db,
        `
          SELECT COUNT(*) AS total
          FROM coverage_profiles
        `
      );

    return {
      ...rows,
      storedProfiles:
        Number(countRow?.total || 0),
      dbPath: resolved
    };
  } finally {
    await close(db);
  }
}

module.exports = {
  DEFAULT_COVERAGE_DB_PATH,
  resolveCoverageDbPath,
  writeCoverageReport,
  readCoverageMeta
};
