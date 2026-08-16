process.env.GROQ_API_KEY = process.env.GROQ_API_KEY || 'gsk_test_placeholder';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');
const authService = require('../services/authService');

function listen(app) {
  const server = app.listen(0);
  return new Promise((resolve) => server.once('listening', () => resolve(server)));
}

test('el resumen del panel exige sesión y usa únicamente el cliente autenticado', async (t) => {
  const app = createApp();
  const server = await listen(app);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const port = server.address().port;

  const anonymous = await fetch(`http://127.0.0.1:${port}/api/billing/summary`);
  assert.equal(anonymous.status, 401);

  let session;
  try {
    session = authService.registerUser({ userId: '48728116', password: 'PanelSeguro4872!' });
  } catch (error) {
    assert.notEqual(error.code, 'unknown_customer');
    session = authService.loginUser({ userId: '48728116', password: 'PruebaSegura4872!' });
  }

  const response = await fetch(`http://127.0.0.1:${port}/api/billing/summary?customerId=100548096`, {
    headers: { Authorization: `Bearer ${session.token}` }
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.ok(data.services.length >= 1);
  assert.equal(data.services[0].total, 39.9);
  assert.equal(data.services[0].dueDate, '20260717');
  assert.equal(data.services[0].variation, 39.57);
  assert.equal(data.services[0].exactPendingBalanceAvailable, false);
  assert.doesNotMatch(JSON.stringify(data), /100548096/);
});
