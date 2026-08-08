const test = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../server');

function startServer() {
  const app = createApp();
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('sirve la landing page en la raíz', async () => {
  const server = await startServer();
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/`);
    const body = await response.text();

    assert.equal(response.status, 200);
    assert.match(body, /Asistente Virtual/);
  } finally {
    server.close();
  }
});

test('responde el chat aunque no haya API externa', async () => {
  const server = await startServer();
  const { port } = server.address();

  try {
    const response = await fetch(`http://127.0.0.1:${port}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Quiero saber por qué subió mi recibo', sessionId: 'test' })
    });
    const data = await response.json();

    assert.equal(response.status, 200);
    assert.ok(data.reply && data.reply.length > 0);
  } finally {
    server.close();
  }
});
