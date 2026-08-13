process.env.GROQ_API_KEY =
  process.env.GROQ_API_KEY ||
  'gsk_test_placeholder';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createApp
} = require('../server');

const {
  resetSession,
  getSessionSnapshot
} = require('../services/sessionService');



async function loginDemo(port, customerId = 'CLI000001') {
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
          customerId
        })
      }
    );

  const setCookie =
    response.headers.get(
      'set-cookie'
    );

  return setCookie
    ? setCookie.split(';')[0]
    : null;
}

test(
  'lista los perfiles disponibles de Mi Movistar',
  async (t) => {
    const app =
      createApp();

    const server =
      app.listen(0);

    await new Promise(
      (resolve) => {
        server.once(
          'listening',
          resolve
        );
      }
    );

    t.after(
      () =>
        new Promise(
          (resolve) => {
            server.close(resolve);
          }
        )
    );

    const port =
      server.address().port;

    const response =
      await fetch(
        `http://127.0.0.1:${port}/api/app/customers`
      );

    assert.equal(
      response.status,
      200
    );

    const data =
      await response.json();

    assert.ok(
      Array.isArray(
        data.customers
      )
    );

    assert.ok(
      data.customers.length >= 2
    );

    assert.equal(
      data.customers[0].customerId,
      'CLI000001'
    );
  }
);


test(
  'obtiene la experiencia de recibo de un cliente',
  async (t) => {
    const app =
      createApp();

    const server =
      app.listen(0);

    await new Promise(
      (resolve) => {
        server.once(
          'listening',
          resolve
        );
      }
    );

    t.after(
      () =>
        new Promise(
          (resolve) => {
            server.close(resolve);
          }
        )
    );

    const port =
      server.address().port;

    const response =
      await fetch(
        `http://127.0.0.1:${port}/api/app/customers/CLI000001`
      );

    assert.equal(
      response.status,
      200
    );

    const data =
      await response.json();

    assert.equal(
      data.customer.customerId,
      'CLI000001'
    );

    assert.equal(
      data.customer.name,
      'Carlos Mendoza'
    );

    assert.equal(
      data.currentBill.total,
      125
    );

    assert.equal(
      data.previousBill.total,
      95
    );

    assert.equal(
      data.comparison.difference,
      30
    );

    assert.ok(
      data.comparison.causes.length >= 1
    );

    assert.ok(
      data.nextActions.length >= 2
    );
  }
);


test(
  'devuelve 404 para un cliente inexistente',
  async (t) => {
    const app =
      createApp();

    const server =
      app.listen(0);

    await new Promise(
      (resolve) => {
        server.once(
          'listening',
          resolve
        );
      }
    );

    t.after(
      () =>
        new Promise(
          (resolve) => {
            server.close(resolve);
          }
        )
    );

    const port =
      server.address().port;

    const response =
      await fetch(
        `http://127.0.0.1:${port}/api/app/customers/NO_EXISTE`
      );

    assert.equal(
      response.status,
      404
    );

    const data =
      await response.json();

    assert.equal(
      data.error,
      'Cliente no encontrado'
    );
  }
);


test(
  'asocia un cliente autenticado a una sesión',
  async (t) => {
    const sessionId =
      'app-api-session';

    resetSession(
      sessionId
    );

    const app =
      createApp();

    const server =
      app.listen(0);

    await new Promise(
      (resolve) => {
        server.once(
          'listening',
          resolve
        );
      }
    );

    t.after(
      () =>
        new Promise(
          (resolve) => {
            server.close(resolve);
          }
        )
    );

    const port =
      server.address().port;

    const cookie =
      await loginDemo(
        port,
        'CLI000001'
      );

    const response =
      await fetch(
        `http://127.0.0.1:${port}/api/session/${sessionId}/customer`,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json',
            Cookie: cookie
          },

          body: JSON.stringify({
            customerId:
              'CLI000001'
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
      data.ok,
      true
    );

    assert.equal(
      data.customerId,
      'CLI000001'
    );

    const session =
      getSessionSnapshot(
        sessionId
      );

    assert.ok(session);

    assert.equal(
      session.context.customerIdentifier,
      'CLI000001'
    );
  }
);


test(
  'rechaza asociar un cliente a una sesión sin autenticación',
  async (t) => {
    const sessionId =
      'invalid-app-session';

    resetSession(
      sessionId
    );

    const app =
      createApp();

    const server =
      app.listen(0);

    await new Promise(
      (resolve) => {
        server.once(
          'listening',
          resolve
        );
      }
    );

    t.after(
      () =>
        new Promise(
          (resolve) => {
            server.close(resolve);
          }
        )
    );

    const port =
      server.address().port;

    const response =
      await fetch(
        `http://127.0.0.1:${port}/api/session/${sessionId}/customer`,
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            customerId:
              'NO_EXISTE'
          })
        }
      );

    assert.equal(
      response.status,
      401
    );

    const data =
      await response.json();

    assert.match(
      data.error,
      /iniciar sesión/i
    );
  }
);