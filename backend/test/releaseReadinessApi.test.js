process.env.GROQ_API_KEY =
  process.env.GROQ_API_KEY ||
  'gsk_test_placeholder';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createApp
} = require('../server');

function startServer(
  release1ReadinessService
) {
  const app =
    createApp({
      release1ReadinessService
    });

  return new Promise(
    (resolve) => {
      const server =
        app.listen(
          0,
          '127.0.0.1',
          () => resolve(server)
        );
    }
  );
}

test(
  'expone un preflight seguro del Release 1 sin autenticación',
  async () => {
    const release = {
      async buildReport() {
        return {
          schemaVersion:
            'desafio1-release1-readiness-v1',
          release: 'R1',
          ready: true,
          status: 'READY',
          summary: {
            expectedProfiles: 2,
            readyProfiles: 2,
            distinctScenarios: 2,
            scenarios: [
              'RECONNECTION',
              'PRORATION'
            ],
            lineageSources: 8,
            expectedLineageSources: 8
          },
          checks: [],
          profiles: [
            {
              customerId:
                'CLI000001',
              name:
                'Carlos Mendoza',
              scenario:
                'RECONNECTION',
              ready: true
            },
            {
              customerId:
                'CLI000002',
              name:
                'Ana Torres',
              scenario:
                'PRORATION',
              ready: true
            }
          ]
        };
      }
    };

    const server =
      await startServer(release);
    const { port } =
      server.address();

    try {
      const response =
        await fetch(
          `http://127.0.0.1:${port}/api/demo/release/readiness`
        );

      const data =
        await response.json();

      assert.equal(
        response.status,
        200
      );
      assert.equal(
        data.ready,
        true
      );
      assert.equal(
        data.summary.readyProfiles,
        2
      );
      assert.doesNotMatch(
        JSON.stringify(data),
        /subscriberKey|customerKey|sha256/
      );
    } finally {
      server.close();
    }
  }
);

test(
  'un preflight no listo sigue respondiendo 200 para que la UI pueda mostrar qué revisar',
  async () => {
    const release = {
      async buildReport() {
        return {
          schemaVersion:
            'desafio1-release1-readiness-v1',
          release: 'R1',
          ready: false,
          status:
            'REVIEW_REQUIRED',
          summary: {
            expectedProfiles: 2,
            readyProfiles: 0
          },
          checks: [
            {
              id:
                'LOCAL_MAPPING',
              ok: false,
              detail:
                'Falta configuración local.'
            }
          ],
          profiles: []
        };
      }
    };

    const server =
      await startServer(release);
    const { port } =
      server.address();

    try {
      const response =
        await fetch(
          `http://127.0.0.1:${port}/api/demo/release/readiness`
        );

      const data =
        await response.json();

      assert.equal(
        response.status,
        200
      );
      assert.equal(
        data.ready,
        false
      );
      assert.equal(
        data.status,
        'REVIEW_REQUIRED'
      );
    } finally {
      server.close();
    }
  }
);

test(
  'si el preflight lanza una excepción el endpoint falla sin exponer detalles internos',
  async () => {
    const release = {
      async buildReport() {
        throw new Error(
          'ruta privada C:/secret/data.db'
        );
      }
    };

    const server =
      await startServer(release);
    const { port } =
      server.address();

    try {
      const response =
        await fetch(
          `http://127.0.0.1:${port}/api/demo/release/readiness`
        );

      const data =
        await response.json();

      assert.equal(
        response.status,
        500
      );
      assert.equal(
        data.ready,
        false
      );
      assert.equal(
        data.status,
        'PREFLIGHT_ERROR'
      );
      assert.doesNotMatch(
        JSON.stringify(data),
        /C:\/secret|data\.db/
      );
    } finally {
      server.close();
    }
  }
);
