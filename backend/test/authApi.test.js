const test = require('node:test');
const assert = require('node:assert/strict');

const { createApp } = require('../server');

test('permite registrar, iniciar sesión y obtener los datos del usuario autenticado', async (t) => {
  const app = createApp();
  const server = app.listen(0);

  await new Promise((resolve) => {
    server.once('listening', resolve);
  });

  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
      })
  );

  const port = server.address().port;
  const testUserId = '115358834';
  const testPassword = 'Password123!';

  // 1. Registro exitoso
  const regResp = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: testUserId,
      password: testPassword
    })
  });

  assert.equal(regResp.status, 201);
  const regData = await regResp.json();
  assert.equal(regData.ok, true);
  assert.equal(regData.user.userId, testUserId);

  // 2. Intento de registro duplicado
  const dupResp = await fetch(`http://127.0.0.1:${port}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: testUserId,
      password: testPassword
    })
  });
  assert.equal(dupResp.status, 409);

  // 3. Login exitoso con usuario recién creado
  const loginResp = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: testUserId,
      password: testPassword
    })
  });

  assert.equal(loginResp.status, 200);
  const loginData = await loginResp.json();
  assert.equal(loginData.ok, true);
  assert.ok(loginData.token);

  // 4. Login exitoso con usuario Demo precargado (Carlos Mendoza)
  const demoLoginResp = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: 'CLI000001',
      password: 'Demo1234!'
    })
  });

  assert.equal(demoLoginResp.status, 200);
  const demoLoginData = await demoLoginResp.json();
  assert.equal(demoLoginData.ok, true);
  assert.equal(demoLoginData.user.customerId, 'CLI000001');

  // 5. Consulta a /api/auth/me
  const meResp = await fetch(`http://127.0.0.1:${port}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${loginData.token}`
    }
  });

  assert.equal(meResp.status, 200);
  const meData = await meResp.json();
  assert.equal(meData.ok, true);
  assert.equal(meData.user.userId, testUserId);
  assert.equal(meData.user.customerId, testUserId);
});

test('responde las recomendaciones NBO correctamente', async (t) => {
  const app = createApp();
  const server = app.listen(0);

  await new Promise((resolve) => {
    server.once('listening', resolve);
  });

  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
      })
  );

  const port = server.address().port;

  const loginResp = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: 'CLI000001', password: 'Demo1234!' })
  });
  assert.equal(loginResp.status, 200);
  const loginData = await loginResp.json();
  const nboResp = await fetch(`http://127.0.0.1:${port}/api/nbo/recomendar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${loginData.token}` },
    body: JSON.stringify({
      cliente_id: 'CLI000001',
      consumo_datos_gb_prom: 25,
      es_movistar_total: 'NO',
      resolution: 'RESOLVED'
    })
  });

  assert.equal(nboResp.status, 200);
  const nboData = await nboResp.json();
  assert.equal(nboData.cliente_id, 'CLI000001');
  assert.ok(nboData.recomendacion);
});
