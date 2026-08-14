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

function parseJsonArray(value) {
  try {
    const parsed = JSON.parse(
      value || '[]'
    );

    return Array.isArray(parsed)
      ? parsed
      : [];
  } catch (error) {
    return [];
  }
}

function normalizePositiveInteger(
  value,
  fallback,
  max = null
) {
  const parsed =
    Number.parseInt(
      value,
      10
    );

  const normalized =
    Number.isInteger(parsed) &&
    parsed > 0
      ? parsed
      : fallback;

  return Number.isInteger(max)
    ? Math.min(normalized, max)
    : normalized;
}

function mapSafeCoverageProfile(
  row
) {
  if (!row) {
    return null;
  }

  const difference =
    Number(row.difference);

  return {
    demoId: row.demo_id,
    lobType: row.lob_type || null,
    businessType:
      row.business_type || null,
    invoiceCount:
      Number(row.invoice_count || 0),
    comparable:
      Boolean(row.comparable),
    explainable:
      Boolean(row.explainable),
    highConfidence:
      Boolean(row.high_confidence),
    fullyExplained:
      Boolean(row.fully_explained),
    demoPremium:
      Boolean(row.demo_premium),
    qualityTier:
      row.quality_tier || null,
    status:
      row.explanation_status || null,
    evidenceLevel:
      row.evidence_level || null,
    primaryScenario:
      row.primary_scenario || null,
    scenarioCodes:
      parseJsonArray(
        row.scenario_codes_json
      ),
    premiumScore:
      row.premium_score == null
        ? null
        : Number(row.premium_score),
    coveragePercent:
      row.coverage_percent == null
        ? null
        : Number(row.coverage_percent),
    currentCycleDate:
      row.current_cycle_date || null,
    previousCycleDate:
      row.previous_cycle_date || null,
    rentType:
      row.rent_type || null,
    integrityWarningCount:
      Number(
        row.integrity_warning_count || 0
      ),
    differenceDirection:
      !Number.isFinite(difference)
        ? null
        : difference > 0
          ? 'UP'
          : difference < 0
            ? 'DOWN'
            : 'SAME'
  };
}

function ensureCoverageDbExists(
  dbPath
) {
  if (fs.existsSync(dbPath)) {
    return;
  }

  const error = new Error(
    'No existe el índice local de cobertura. Ejecuta npm run demo:coverage:desafio1.'
  );
  error.code =
    'COVERAGE_DB_NOT_FOUND';
  throw error;
}

function buildExplorerWhere({
  search = '',
  capability = 'ALL',
  scenario = 'ALL',
  rentType = 'ALL',
  qualityTier = 'ALL'
} = {}) {
  const clauses = [
    'demo_id IS NOT NULL',
    'consultable = 1'
  ];
  const params = [];

  const cleanSearch =
    String(search || '')
      .trim()
      .toUpperCase();

  if (cleanSearch) {
    clauses.push(
      "(UPPER(demo_id) LIKE ? OR UPPER(COALESCE(lob_type, '')) LIKE ? OR UPPER(COALESCE(business_type, '')) LIKE ?)"
    );
    const token =
      `%${cleanSearch}%`;
    params.push(
      token,
      token,
      token
    );
  }

  const capabilityMap = {
    COMPARABLE: 'comparable = 1',
    EXPLAINABLE: 'explainable = 1',
    HIGH: 'high_confidence = 1',
    PREMIUM: 'demo_premium = 1',
    UNEXPLAINED: 'explainable = 0'
  };

  if (capabilityMap[capability]) {
    clauses.push(
      capabilityMap[capability]
    );
  }

  if (
    scenario &&
    scenario !== 'ALL'
  ) {
    clauses.push(
      'scenario_codes_json LIKE ?'
    );
    params.push(
      `%\"${scenario}\"%`
    );
  }

  if (
    rentType &&
    rentType !== 'ALL'
  ) {
    clauses.push(
      'rent_type = ?'
    );
    params.push(rentType);
  }

  if (
    qualityTier &&
    qualityTier !== 'ALL'
  ) {
    clauses.push(
      'quality_tier = ?'
    );
    params.push(qualityTier);
  }

  return {
    sql:
      clauses.join(' AND '),
    params
  };
}

const EXPLORER_SORTS =
  Object.freeze({
    DEMO_ASC:
      'demo_id ASC',
    PREMIUM_FIRST:
      'demo_premium DESC, high_confidence DESC, COALESCE(premium_score, -1) DESC, demo_id ASC',
    COVERAGE_DESC:
      'COALESCE(coverage_percent, -1) DESC, high_confidence DESC, demo_id ASC',
    INVOICES_DESC:
      'invoice_count DESC, demo_id ASC'
  });

async function queryCoverageProfiles({
  dbPath = null,
  search = '',
  capability = 'ALL',
  scenario = 'ALL',
  rentType = 'ALL',
  qualityTier = 'ALL',
  sort = 'DEMO_ASC',
  page = 1,
  pageSize = 24
} = {}) {
  const resolved =
    resolveCoverageDbPath(dbPath);

  ensureCoverageDbExists(resolved);

  const safePage =
    normalizePositiveInteger(
      page,
      1
    );
  const safePageSize =
    normalizePositiveInteger(
      pageSize,
      24,
      60
    );

  const where =
    buildExplorerWhere({
      search,
      capability,
      scenario,
      rentType,
      qualityTier
    });

  const orderBy =
    EXPLORER_SORTS[sort] ||
    EXPLORER_SORTS.DEMO_ASC;

  const db =
    await openDatabase(
      resolved,
      sqlite3.OPEN_READONLY
    );

  try {
    const countRow =
      await get(
        db,
        `
          SELECT COUNT(*) AS total
          FROM coverage_profiles
          WHERE ${where.sql}
        `,
        where.params
      );

    const total =
      Number(countRow?.total || 0);
    const totalPages =
      Math.max(
        Math.ceil(
          total / safePageSize
        ),
        1
      );
    const boundedPage =
      Math.min(
        safePage,
        totalPages
      );
    const offset =
      (boundedPage - 1) *
      safePageSize;

    const rows =
      await new Promise(
        (resolve, reject) => {
          db.all(
            `
              SELECT
                demo_id,
                lob_type,
                business_type,
                invoice_count,
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
                difference,
                current_cycle_date,
                previous_cycle_date,
                rent_type,
                integrity_warning_count
              FROM coverage_profiles
              WHERE ${where.sql}
              ORDER BY ${orderBy}
              LIMIT ? OFFSET ?
            `,
            [
              ...where.params,
              safePageSize,
              offset
            ],
            (error, resultRows) => {
              if (error) {
                reject(error);
                return;
              }
              resolve(resultRows || []);
            }
          );
        }
      );

    return {
      items:
        rows.map(
          mapSafeCoverageProfile
        ),
      pagination: {
        page: boundedPage,
        pageSize: safePageSize,
        total,
        totalPages
      }
    };
  } finally {
    await close(db);
  }
}

async function readPrivateCoverageProfileByDemoId(
  demoId,
  {
    dbPath = null
  } = {}
) {
  const cleanDemoId =
    String(demoId || '')
      .trim()
      .toUpperCase();

  if (!/^DEMO\d{6}$/.test(cleanDemoId)) {
    return null;
  }

  const resolved =
    resolveCoverageDbPath(dbPath);

  ensureCoverageDbExists(resolved);

  const db =
    await openDatabase(
      resolved,
      sqlite3.OPEN_READONLY
    );

  try {
    const row =
      await get(
        db,
        `
          SELECT *
          FROM coverage_profiles
          WHERE demo_id = ?
            AND consultable = 1
          LIMIT 1
        `,
        [cleanDemoId]
      );

    if (!row) {
      return null;
    }

    return {
      ...mapSafeCoverageProfile(row),
      subscriberKey:
        row.subscriber_key,
      customerKey:
        row.customer_key || null
    };
  } finally {
    await close(db);
  }
}

module.exports = {
  DEFAULT_COVERAGE_DB_PATH,
  resolveCoverageDbPath,
  writeCoverageReport,
  readCoverageMeta,
  queryCoverageProfiles,
  readPrivateCoverageProfileByDemoId,
  mapSafeCoverageProfile,
  buildExplorerWhere
};
