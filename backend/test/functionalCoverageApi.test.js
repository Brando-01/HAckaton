process.env.GROQ_API_KEY =
  process.env.GROQ_API_KEY ||
  'gsk_test_placeholder';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createApp
} = require('../server');

function startServer(
  functionalCoverageService
) {
  const app = createApp({
    functionalCoverageService
  });

  return new Promise(
    (resolve) => {
      const server = app.listen(
        0,
        '127.0.0.1',
        () => resolve(server)
      );
    }
  );
}

test(
  'expone la cobertura funcional agregada sin autenticación ni identificadores privados',
  async () => {
    const service = {
      async buildReport() {
        return {
          schemaVersion:
            'desafio1-functional-coverage-v1',
          phase: 'PHASE_11',
          summary: {
            expectedSources: 8,
            importedSources: 8,
            allSourcesImported: true,
            readyScenarios: 7
          },
          sources: [
            {
              key:
                'planta_clientes',
              label:
                'PLANTA CLIENTES',
              imported: true,
              importedRows: 20000
            }
          ],
          scenarios: [],
          confirmedRules: [],
          diagnostics: {
            facturationSubscribers:
              18450
          }
        };
      }
    };

    const server =
      await startServer(service);
    const { port } =
      server.address();

    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/api/demo/data-coverage`
      );
      const data =
        await response.json();

      assert.equal(
        response.status,
        200
      );
      assert.equal(
        data.summary.importedSources,
        8
      );
      assert.doesNotMatch(
        JSON.stringify(data),
        /subscriberKey|customerKey|NUM_ANEXO.*\d{5}/
      );
    } finally {
      server.close();
    }
  }
);

test(
  'un error de cobertura no expone rutas ni detalles internos',
  async () => {
    const service = {
      async buildReport() {
        throw new Error(
          'C:/secret/desafio1.db'
        );
      }
    };

    const server =
      await startServer(service);
    const { port } =
      server.address();

    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/api/demo/data-coverage`
      );
      const data =
        await response.json();

      assert.equal(
        response.status,
        503
      );
      assert.equal(
        data.status,
        'COVERAGE_UNAVAILABLE'
      );
      assert.doesNotMatch(
        JSON.stringify(data),
        /C:\/secret|desafio1\.db/
      );
    } finally {
      server.close();
    }
  }
);
