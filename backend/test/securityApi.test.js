const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');

function startServer() {
  const server = createApp().listen(0, '127.0.0.1');
  return new Promise((resolve) => server.once('listening', () => resolve(server)));
}

test('no expone recomendaciones comerciales ni casos de asesor sin autorización', async () => {
  const server = await startServer();
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const nbo = await fetch(`${baseUrl}/api/nbo/recomendar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cliente_id: '115358834', resolution: 'RESOLVED' })
    });
    const advisor = await fetch(`${baseUrl}/api/advisor/cases`);
    assert.equal(nbo.status, 401);
    assert.equal(advisor.status, 403);
  } finally {
    server.close();
  }
});
