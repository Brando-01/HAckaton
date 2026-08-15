process.env.GROQ_API_KEY =
  process.env.GROQ_API_KEY ||
  'gsk_test_placeholder';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createApp
} = require('../server');

const {
  clearAuthSessions
} = require('../services/authService');

function getCookie(response) {
  const value =
    response.headers.get(
      'set-cookie'
    );

  return value
    ? value.split(';')[0]
    : null;
}

function fakeDatasetAuth() {
  return {
    async authenticate({
      customerCode,
      serviceNumber
    }) {
      if (
        customerCode !== '100000001' ||
        serviceNumber !== '200000002'
      ) {
        return {
          ok: false,
          code:
            'DATASET_ACCOUNT_NOT_FOUND'
        };
      }

      return {
        ok: true,
        user: {
          userId: 'D1U-TEST',
          customerId: 'D1A-TEST',
          customerCode:
            '100000001',
          name:
            'Cliente 100000001',
          email: null,
          mode: 'DATASET',
          serviceNumberMasked:
            '•••••0002',
          datasetSubscriberKey:
            '200000002'
        }
      };
    }
  };
}

function startServer() {
  const app = createApp({
    datasetAccountAuthService:
      fakeDatasetAuth()
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
  'dataset-login crea cookie pero no expone NUM_ANEXO interno',
  async () => {
    clearAuthSessions();
    const server =
      await startServer();
    const { port } =
      server.address();

    try {
      const response =
        await fetch(
          `http://127.0.0.1:${port}/api/auth/dataset-login`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: JSON.stringify({
              customerCode:
                '100000001',
              serviceNumber:
                '200000002'
            })
          }
        );

      assert.equal(
        response.status,
        200
      );
      const cookie =
        getCookie(response);
      assert.ok(cookie);

      const data =
        await response.json();

      assert.equal(
        data.user.customerCode,
        '100000001'
      );
      assert.equal(
        data.user.serviceNumberMasked,
        '•••••0002'
      );
      assert.equal(
        data.user.mode,
        'DATASET'
      );
      assert.doesNotMatch(
        JSON.stringify(data),
        /datasetSubscriberKey|200000002/
      );

      const meResponse =
        await fetch(
          `http://127.0.0.1:${port}/api/auth/me`,
          {
            headers: {
              Cookie: cookie
            }
          }
        );

      const me =
        await meResponse.json();
      assert.equal(
        me.user.customerCode,
        '100000001'
      );
      assert.doesNotMatch(
        JSON.stringify(me),
        /datasetSubscriberKey|200000002/
      );
    } finally {
      server.close();
      clearAuthSessions();
    }
  }
);

test(
  'pareja incorrecta no crea una sesión autenticada',
  async () => {
    clearAuthSessions();
    const server =
      await startServer();
    const { port } =
      server.address();

    try {
      const response =
        await fetch(
          `http://127.0.0.1:${port}/api/auth/dataset-login`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: JSON.stringify({
              customerCode:
                '100000001',
              serviceNumber:
                '999999999'
            })
          }
        );

      assert.equal(
        response.status,
        401
      );
      assert.equal(
        getCookie(response),
        null
      );
    } finally {
      server.close();
      clearAuthSessions();
    }
  }
);

test(
  'una cuenta DATASET puede asociarse al chat y otra identidad no puede reemplazarla',
  async () => {
    clearAuthSessions();
    const server =
      await startServer();
    const { port } =
      server.address();

    try {
      const login =
        await fetch(
          `http://127.0.0.1:${port}/api/auth/dataset-login`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: JSON.stringify({
              customerCode:
                '100000001',
              serviceNumber:
                '200000002'
            })
          }
        );
      const cookie =
        getCookie(login);
      const loginData =
        await login.json();

      const association =
        await fetch(
          `http://127.0.0.1:${port}/api/session/dataset-auth-test/customer`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
              Cookie: cookie
            },
            body: JSON.stringify({
              customerId:
                loginData.user.customerId
            })
          }
        );

      assert.equal(
        association.status,
        200
      );

      const switchAttempt =
        await fetch(
          `http://127.0.0.1:${port}/api/session/dataset-auth-test/customer`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
              Cookie: cookie
            },
            body: JSON.stringify({
              customerId:
                'D1A-OTHER'
            })
          }
        );

      assert.equal(
        switchAttempt.status,
        403
      );
    } finally {
      server.close();
      clearAuthSessions();
    }
  }
);
