const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getOrCreateSession,
  addMessage,
  getHistory,
  updateContext,
  getSessionSnapshot,
  resetSession
} = require('../services/sessionService');

test('crea sesiones independientes', () => {
  resetSession('sesion-a');
  resetSession('sesion-b');

  addMessage(
    'sesion-a',
    'user',
    'Mensaje de A'
  );

  addMessage(
    'sesion-b',
    'user',
    'Mensaje de B'
  );

  const historyA =
    getHistory('sesion-a');

  const historyB =
    getHistory('sesion-b');

  assert.equal(
    historyA.length,
    1
  );

  assert.equal(
    historyB.length,
    1
  );

  assert.equal(
    historyA[0].content,
    'Mensaje de A'
  );

  assert.equal(
    historyB[0].content,
    'Mensaje de B'
  );
});

test('mantiene el cliente activo en la sesión', () => {
  resetSession('cliente-test');

  updateContext(
    'cliente-test',
    {
      customerIdentifier: '72819345'
    }
  );

  const session =
    getSessionSnapshot(
      'cliente-test'
    );

  assert.equal(
    session.context.customerIdentifier,
    '72819345'
  );
});

test('mantiene el historial de conversación', () => {
  resetSession('history-test');

  addMessage(
    'history-test',
    'user',
    '¿Por qué aumentó mi recibo?'
  );

  addMessage(
    'history-test',
    'assistant',
    'Se detectó una variación.'
  );

  addMessage(
    'history-test',
    'user',
    '¿Y el mes anterior?'
  );

  const history =
    getHistory('history-test');

  assert.equal(
    history.length,
    3
  );

  assert.equal(
    history[0].role,
    'user'
  );

  assert.equal(
    history[1].role,
    'assistant'
  );

  assert.equal(
    history[2].content,
    '¿Y el mes anterior?'
  );
});

test('una sesión nueva no hereda el contexto anterior', () => {
  resetSession('old-session');
  resetSession('new-session');

  updateContext(
    'old-session',
    {
      customerIdentifier: '72819345'
    }
  );

  const nueva =
    getOrCreateSession(
      'new-session'
    );

  assert.equal(
    nueva.context.customerIdentifier,
    null
  );

  assert.equal(
    nueva.history.length,
    0
  );
});

test('reset elimina el contexto y el historial', () => {
  resetSession('reset-test');

  updateContext(
    'reset-test',
    {
      customerIdentifier: '72819345'
    }
  );

  addMessage(
    'reset-test',
    'user',
    'Hola'
  );

  resetSession('reset-test');

  const nueva =
    getOrCreateSession(
      'reset-test'
    );

  assert.equal(
    nueva.context.customerIdentifier,
    null
  );

  assert.equal(
    nueva.history.length,
    0
  );
});

test('solo conserva los últimos 12 mensajes', () => {
  resetSession('limit-test');

  for (let i = 1; i <= 15; i++) {
    addMessage(
      'limit-test',
      'user',
      `Mensaje ${i}`
    );
  }

  const history =
    getHistory('limit-test');

  assert.equal(
    history.length,
    12
  );

  assert.equal(
    history[0].content,
    'Mensaje 4'
  );

  assert.equal(
    history[11].content,
    'Mensaje 15'
  );
});
test('Fase 20 registra canal actual e infiere canal en el transcript sin alterar getHistory', () => {
  const {
    touchChannel,
    getContinuitySnapshot
  } = require('../services/sessionService');

  resetSession('phase20-channel-history');

  touchChannel(
    'phase20-channel-history',
    'MI_MOVISTAR',
    { at: '2026-08-14T18:00:00.000Z' }
  );
  touchChannel(
    'phase20-channel-history',
    'LUCIA_WEB',
    { at: '2026-08-14T18:00:01.000Z' }
  );

  addMessage(
    'phase20-channel-history',
    'user',
    '¿Por qué subió?'
  );

  const snapshot =
    getSessionSnapshot(
      'phase20-channel-history'
    );

  assert.equal(
    snapshot.history[0].channel,
    'LUCIA_WEB'
  );

  assert.deepEqual(
    getHistory('phase20-channel-history'),
    [
      {
        role: 'user',
        content: '¿Por qué subió?'
      }
    ]
  );

  const continuity =
    getContinuitySnapshot(
      'phase20-channel-history'
    );

  assert.deepEqual(
    continuity.visitedChannels,
    ['MI_MOVISTAR', 'LUCIA_WEB']
  );
});
