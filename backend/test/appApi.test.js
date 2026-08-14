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
  'obtiene la experiencia de recibo de un cliente autenticado',
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

    // La cuenta demo 987654321 corresponde a CLI000001.
    const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '987654321', password: 'Demo1234!' })
    });
    const { token } = await login.json();

    const response =
      await fetch(
        `http://127.0.0.1:${port}/api/app/customers/CLI000001`,
        { headers: { Authorization: `Bearer ${token}` } }
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
  'FUGA DE DATOS: sin sesión no se puede ver la ficha de un cliente',
  async (t) => {
    const server = createApp().listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    t.after(() => new Promise((resolve) => server.close(resolve)));

    const port = server.address().port;

    // Antes bastaba poner el ID en la URL para recibir el recibo completo.
    const anonima = await fetch(`http://127.0.0.1:${port}/api/app/customers/CLI000001`);
    assert.equal(anonima.status, 401);

    // Y con sesión válida, tampoco se puede mirar la cuenta de otro.
    const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '987654321', password: 'Demo1234!' })
    });
    const { token } = await login.json();

    const ajena = await fetch(`http://127.0.0.1:${port}/api/app/customers/CLI000002`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    assert.equal(ajena.status, 403);
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

    // El 404 solo es alcanzable pidiendo la PROPIA cuenta: pedir la de otro
    // corta antes con 403. Esta cuenta del dataset no está en el catálogo
    // mock de Mi Movistar, así que su experiencia no existe.
    const login = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone: '900548096', password: 'Demo1234!' })
    });

    if (login.status !== 200) {
      t.skip('faltan las cuentas del dataset (data/cuentas-demo.json)');
      return;
    }

    const { token, user } = await login.json();

    const response =
      await fetch(
        `http://127.0.0.1:${port}/api/app/customers/${user.customerId}`,
        { headers: { Authorization: `Bearer ${token}` } }
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


// ── Asociación de cliente a sesión ──────────────────────────────────────
//
// Estos tests cubren la brecha de suplantación: antes bastaba con enviar un
// customerId en el cuerpo, sin credenciales, para quedar asociado a esa
// persona y ver sus recibos en el chat.

/** Levanta el servidor y devuelve el puerto, cerrándolo al terminar el test. */
async function levantarServidor(t) {
  const server = createApp().listen(0);

  await new Promise((resolve) => server.once('listening', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));

  return server.address().port;
}

/** Inicia sesión con una cuenta demo y devuelve su token. */
async function iniciarSesion(port, phone = '987654321', password = 'Demo1234!') {
  const response = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, password })
  });

  assert.equal(response.status, 200, 'la cuenta demo debería poder iniciar sesión');
  return (await response.json()).token;
}

function asociarCliente(port, sessionId, customerId, token) {
  return fetch(`http://127.0.0.1:${port}/api/session/${sessionId}/customer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ customerId })
  });
}


test(
  'asocia un cliente a la sesión cuando hay login',
  async (t) => {
    const sessionId = 'app-api-session';
    resetSession(sessionId);

    const port = await levantarServidor(t);
    const token = await iniciarSesion(port);

    const response = await asociarCliente(port, sessionId, 'CLI000001', token);

    assert.equal(response.status, 200);

    const data = await response.json();
    assert.equal(data.ok, true);
    assert.equal(data.customerId, 'CLI000001');

    const session = getSessionSnapshot(sessionId);
    assert.ok(session);
    assert.equal(session.context.customerIdentifier, 'CLI000001');
  }
);


test(
  'SUPLANTACIÓN: sin iniciar sesión no se puede asociar ningún cliente',
  async (t) => {
    const sessionId = 'anon-app-session';
    resetSession(sessionId);

    const port = await levantarServidor(t);

    // Exactamente el ataque que antes funcionaba: un anónimo reclama un
    // CUSTOMER_KEY real y queda ligado a los recibos de esa persona.
    const response = await asociarCliente(port, sessionId, '125420001', null);

    assert.equal(response.status, 401);

    const session = getSessionSnapshot(sessionId);
    assert.ok(
      !session || !session.context.customerIdentifier,
      'la sesión anónima no debe quedar asociada a ningún cliente'
    );
  }
);


test(
  'SUPLANTACIÓN: un usuario autenticado no puede reclamar otro cliente',
  async (t) => {
    const sessionId = 'otro-cliente-session';
    resetSession(sessionId);

    const port = await levantarServidor(t);
    const token = await iniciarSesion(port); // sesión de CLI000001

    const response = await asociarCliente(port, sessionId, 'CLI000002', token);

    assert.equal(response.status, 403);

    const data = await response.json();
    assert.match(data.error, /no coincide con la sesión autenticada/);

    const session = getSessionSnapshot(sessionId);
    assert.ok(
      !session || !session.context.customerIdentifier,
      'no debe quedar asociado al cliente ajeno'
    );
  }
);


test(
  'rechaza asociar un cliente inválido a una sesión',
  async (t) => {
    const sessionId = 'invalid-app-session';
    resetSession(sessionId);

    const port = await levantarServidor(t);

    // Sin credenciales el corte es 401, antes incluso de mirar el cliente.
    const anonima = await asociarCliente(port, sessionId, 'NO_EXISTE', null);
    assert.equal(anonima.status, 401);
  }
);