const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(
  __dirname,
  '..',
  '..'
);

function read(relativePath) {
  return fs.readFileSync(
    path.join(root, relativePath),
    'utf8'
  );
}

test(
  'Fase 16 publica un comando dedicado de auditoría financiera reproducible',
  () => {
    const pkg = JSON.parse(
      read('backend/package.json')
    );

    assert.equal(
      pkg.scripts['audit:financial:desafio1'],
      'node scripts/auditarPrecisionFinancieraDesafio1.js'
    );
  }
);

test(
  'el artefacto local de auditoría financiera queda fuera de Git',
  () => {
    const gitignore = read('.gitignore');

    assert.match(
      gitignore,
      /\/backend\/data\/phase16-financial-audit\.local\.json/
    );
  }
);

test(
  'el benchmark declara ground truth crudo, scoring determinista y alcance acotado de alucinación',
  () => {
    const logic = read(
      'backend/services/desafio1FinancialAuditLogic.js'
    );

    assert.match(
      logic,
      /RAW_SQLITE_ROWS_AND_DETERMINISTIC_INVARIANTS/
    );
    assert.match(
      logic,
      /DETECTABLE_STRUCTURED_FINANCIAL_CLAIMS_ONLY/
    );
    assert.match(
      logic,
      /llmUsedForScoring:\s*false/
    );
    assert.match(
      logic,
      /SYMMETRIC_HALF_AWAY_FROM_ZERO_TO_CENTS/
    );
    assert.match(
      logic,
      /structuralZeroAmountChangesIncluded:\s*true/
    );
  }
);

test(
  'la experiencia oficial incorpora únicamente una traza financiera segura',
  () => {
    const source = read(
      'backend/services/officialDemoExperienceService.js'
    );

    assert.match(
      source,
      /buildSafeFinancialResponseTrace/
    );
    assert.match(
      source,
      /financialTrace:\s*buildSafeFinancialResponseTrace/
    );
  }
);

test(
  'la API conserva financialTrace en sesión y la devuelve con el estado de resolución del turno',
  () => {
    const server = read(
      'backend/server.js'
    );

    assert.match(
      server,
      /function buildTurnFinancialTrace/
    );
    assert.match(
      server,
      /lastFinancialTrace:\s*financialTrace/
    );
    assert.match(
      server,
      /resolutionStatus:/
    );
    assert.match(
      server,
      /financialTrace,/
    );
  }
);

test(
  'la documentación limita 0% a claims comprobables y prohíbe ids privados en la traza',
  () => {
    const docs = read(
      'backend/docs/desafio1-fase16.md'
    );

    assert.match(
      docs,
      /0 violaciones financieras detectables/i
    );
    assert.match(
      docs,
      /DETECTABLE_STRUCTURED_FINANCIAL_CLAIMS_ONLY/
    );
    assert.match(
      docs,
      /SUBSCRIBER_KEY/
    );
    assert.match(
      docs,
      /no publica/i
    );
    assert.match(
      docs,
      /matriz RA\/RV × productos B2C × escenarios/i
    );
  }
);

test(
  'el CLI usa 300 casos por defecto y permite controlar muestra, concurrencia y salida segura',
  () => {
    const {
      parseArgs
    } = require(
      '../scripts/auditarPrecisionFinancieraDesafio1'
    );

    assert.deepEqual(
      {
        limit: parseArgs([]).limit,
        concurrency:
          parseArgs([]).concurrency
      },
      {
        limit: 300,
        concurrency: 4
      }
    );

    const custom = parseArgs([
      '--limit',
      '120',
      '--concurrency',
      '3',
      '--details',
      '--write',
      'tmp/audit.json'
    ]);

    assert.equal(custom.limit, 120);
    assert.equal(custom.concurrency, 3);
    assert.equal(custom.details, true);
    assert.equal(custom.write, true);
    assert.match(
      custom.outputPath,
      /tmp[\\/]audit\.json$/
    );
  }
);
