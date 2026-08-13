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

function startServer() {
  const app = createApp();

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

function getCookie(response) {
  const setCookie =
    response.headers.get(
      'set-cookie'
    );

  return setCookie
    ? setCookie.split(';')[0]
    : null;
}

test(
  'un perfil extendido autenticado puede asociarse a una sesión de chat',
  async () => {
    clearAuthSessions();
    const server =
      await startServer();
    const { port } =
      server.address();

    try {
      const loginResponse =
        await fetch(
          `http://127.0.0.1:${port}/api/auth/demo-login`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: JSON.stringify({
              customerId:
                'CLI000004'
            })
          }
        );

      assert.equal(
        loginResponse.status,
        200
      );

      const cookie =
        getCookie(loginResponse);

      assert.ok(cookie);

      const bindResponse =
        await fetch(
          `http://127.0.0.1:${port}/api/session/phase8-maria-binding/customer`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
              Cookie: cookie
            },
            body: JSON.stringify({
              customerId:
                'CLI000004'
            })
          }
        );

      const data =
        await bindResponse.json();

      assert.equal(
        bindResponse.status,
        200
      );
      assert.equal(
        data.customerId,
        'CLI000004'
      );
      assert.equal(
        data.sessionId,
        'phase8-maria-binding'
      );
      assert.equal(
        data.identitySessionRotated,
        false
      );
    } finally {
      server.close();
      clearAuthSessions();
    }
  }
);
