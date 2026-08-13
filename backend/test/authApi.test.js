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
      const server =
        app.listen(
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
  'Mi Movistar redirige al login sin autenticación',
  async () => {
    clearAuthSessions();
    const server =
      await startServer();
    const { port } =
      server.address();

    try {
      const response =
        await fetch(
          `http://127.0.0.1:${port}/app`,
          {
            redirect: 'manual'
          }
        );

      assert.equal(
        response.status,
        302
      );
      assert.equal(
        response.headers.get(
          'location'
        ),
        '/login'
      );
    } finally {
      server.close();
    }
  }
);

test(
  'login local crea una sesión y expone el cliente autenticado',
  async () => {
    clearAuthSessions();
    const server =
      await startServer();
    const { port } =
      server.address();

    try {
      const loginResponse =
        await fetch(
          `http://127.0.0.1:${port}/api/auth/login`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json'
            },
            body: JSON.stringify({
              email:
                'carlos.demo@movistar.pe',
              password:
                'Demo1234!'
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

      const meResponse =
        await fetch(
          `http://127.0.0.1:${port}/api/auth/me`,
          {
            headers: {
              Cookie: cookie
            }
          }
        );

      assert.equal(
        meResponse.status,
        200
      );

      const me =
        await meResponse.json();

      assert.equal(
        me.user.customerId,
        'CLI000001'
      );

      const appResponse =
        await fetch(
          `http://127.0.0.1:${port}/api/app/me`,
          {
            headers: {
              Cookie: cookie
            }
          }
        );

      assert.equal(
        appResponse.status,
        200
      );

      const experience =
        await appResponse.json();

      assert.equal(
        experience.customer.name,
        'Carlos Mendoza'
      );
    } finally {
      server.close();
    }
  }
);

test(
  'modo demo permite entrar como Ana sin contraseña',
  async () => {
    clearAuthSessions();
    const server =
      await startServer();
    const { port } =
      server.address();

    try {
      const response =
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
                'CLI000002'
            })
          }
        );

      assert.equal(
        response.status,
        200
      );

      const data =
        await response.json();

      assert.equal(
        data.user.customerId,
        'CLI000002'
      );
      assert.equal(
        data.user.mode,
        'DEMO'
      );
      assert.ok(
        getCookie(response)
      );
    } finally {
      server.close();
    }
  }
);

test(
  'una sesión autenticada no puede cambiar a otro customerId',
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
                'CLI000001'
            })
          }
        );

      const cookie =
        getCookie(loginResponse);

      const response =
        await fetch(
          `http://127.0.0.1:${port}/api/session/auth-test/customer`,
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
              Cookie: cookie
            },
            body: JSON.stringify({
              customerId:
                'CLI000002'
            })
          }
        );

      assert.equal(
        response.status,
        403
      );
    } finally {
      server.close();
    }
  }
);

test(
  'logout invalida la sesión',
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
                'CLI000001'
            })
          }
        );

      const cookie =
        getCookie(loginResponse);

      const logoutResponse =
        await fetch(
          `http://127.0.0.1:${port}/api/auth/logout`,
          {
            method: 'POST',
            headers: {
              Cookie: cookie
            }
          }
        );

      assert.equal(
        logoutResponse.status,
        200
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

      assert.equal(
        meResponse.status,
        401
      );
    } finally {
      server.close();
    }
  }
);

test(
  'Fase 8 publica N perfiles demo y mantiene identificados los dos del pitch',
  async () => {
    clearAuthSessions();
    const server =
      await startServer();
    const { port } =
      server.address();

    try {
      const response =
        await fetch(
          `http://127.0.0.1:${port}/api/auth/demo-profiles`
        );

      assert.equal(
        response.status,
        200
      );

      const data =
        await response.json();

      assert.equal(
        data.availableProfileCount,
        6
      );
      assert.equal(
        data.profiles.length,
        6
      );
      assert.deepEqual(
        data.profiles
          .filter(
            (profile) =>
              profile.release1Pitch
          )
          .map(
            (profile) =>
              profile.customerId
          ),
        [
          'CLI000001',
          'CLI000002'
        ]
      );
      assert.equal(
        data.profiles[2].name,
        'Luis Ramírez'
      );
    } finally {
      server.close();
    }
  }
);

test(
  'un perfil extendido puede iniciar sesión demo sin introducir contraseña',
  async () => {
    clearAuthSessions();
    const server =
      await startServer();
    const { port } =
      server.address();

    try {
      const response =
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
        response.status,
        200
      );

      const data =
        await response.json();

      assert.equal(
        data.user.customerId,
        'CLI000004'
      );
      assert.equal(
        data.user.name,
        'María López'
      );
      assert.equal(
        data.user.mode,
        'DEMO'
      );
    } finally {
      server.close();
    }
  }
);
