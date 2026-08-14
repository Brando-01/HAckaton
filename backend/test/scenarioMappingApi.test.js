process.env.GROQ_API_KEY =
  process.env.GROQ_API_KEY ||
  'gsk_test_placeholder';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createApp
} = require('../server');

function startServer(
  scenarioMappingService
) {
  const app = createApp({
    scenarioMappingService
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
  'expone el mapeo agregado sin autenticación ni identificadores privados',
  async () => {
    const service = {
      async buildReport() {
        return {
          schemaVersion:
            'desafio1-scenario-mapping-v1',
          phase: 'PHASE_12',
          summary: {
            targets: 5,
            mapped: 1,
            partial: 2,
            ambiguous: 1,
            semanticsPending: 1,
            promotableNow: 1
          },
          mappings: [
            {
              id: 'PACKAGES',
              label:
                'Paquetes adicionales',
              status: 'MAPPED',
              evidence: {
                billingRows: 11676
              }
            }
          ],
          safeguards: []
        };
      }
    };

    const server =
      await startServer(service);
    const { port } =
      server.address();

    try {
      const response = await fetch(
        `http://127.0.0.1:${port}/api/demo/scenario-mapping`
      );
      const data =
        await response.json();

      assert.equal(
        response.status,
        200
      );
      assert.equal(
        data.summary.targets,
        5
      );
      assert.doesNotMatch(
        JSON.stringify(data),
        /subscriberKey|customerKey|financialAccount|NUM_ANEXO.*\d{5}/
      );
    } finally {
      server.close();
    }
  }
);

test(
  'un error del mapeo no filtra rutas internas del backend',
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
        `http://127.0.0.1:${port}/api/demo/scenario-mapping`
      );
      const data =
        await response.json();

      assert.equal(
        response.status,
        503
      );
      assert.equal(
        data.status,
        'MAPPING_UNAVAILABLE'
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
