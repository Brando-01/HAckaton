const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ensureInteraction,
  registerMessage,
  registerHandoff,
  endInteraction,
  registerSatisfaction,
  getInteraction,
  getInteractions,
  getDashboardSummary,
  resetMetrics
} = require('../services/metricsService');

test('crea una interacción y registra mensajes', () => {
  resetMetrics();

  registerMessage(
    'session-message',
    'user'
  );

  registerMessage(
    'session-message',
    'assistant'
  );

  const interaction =
    getInteraction(
      'session-message'
    );

  assert.ok(interaction);

  assert.equal(
    interaction.sessionId,
    'session-message'
  );

  assert.equal(
    interaction.status,
    'ACTIVE'
  );

  assert.equal(
    interaction.userMessages,
    1
  );

  assert.equal(
    interaction.assistantMessages,
    1
  );

  assert.equal(
    interaction.endedAt,
    null
  );
});

test('mantiene métricas independientes por sesión', () => {
  resetMetrics();

  registerMessage(
    'session-a',
    'user'
  );

  registerMessage(
    'session-a',
    'assistant'
  );

  registerMessage(
    'session-b',
    'user'
  );

  const sessionA =
    getInteraction(
      'session-a'
    );

  const sessionB =
    getInteraction(
      'session-b'
    );

  assert.equal(
    sessionA.userMessages,
    1
  );

  assert.equal(
    sessionA.assistantMessages,
    1
  );

  assert.equal(
    sessionB.userMessages,
    1
  );

  assert.equal(
    sessionB.assistantMessages,
    0
  );

  assert.equal(
    getInteractions().length,
    2
  );
});

test('registra una derivación a asesor', () => {
  resetMetrics();

  registerMessage(
    'handoff-session',
    'user'
  );

  registerHandoff(
    'handoff-session',
    'CASO-12345678'
  );

  const interaction =
    getInteraction(
      'handoff-session'
    );

  assert.equal(
    interaction.handoff,
    true
  );

  assert.equal(
    interaction.handoffCaseId,
    'CASO-12345678'
  );
});

test('registra satisfacción entre 1 y 5', () => {
  resetMetrics();

  registerSatisfaction(
    'rating-session',
    5,
    'Muy buena atención'
  );

  const interaction =
    getInteraction(
      'rating-session'
    );

  assert.ok(
    interaction.satisfaction
  );

  assert.equal(
    interaction.satisfaction.rating,
    5
  );

  assert.equal(
    interaction.satisfaction.comment,
    'Muy buena atención'
  );

  assert.ok(
    interaction.satisfaction.submittedAt
  );
});

test('rechaza una satisfacción fuera del rango permitido', () => {
  resetMetrics();

  assert.throws(
    () => {
      registerSatisfaction(
        'invalid-rating',
        0
      );
    },
    /entre 1 y 5/
  );

  assert.throws(
    () => {
      registerSatisfaction(
        'invalid-rating',
        6
      );
    },
    /entre 1 y 5/
  );

  assert.throws(
    () => {
      registerSatisfaction(
        'invalid-rating',
        3.5
      );
    },
    /entre 1 y 5/
  );
});

test('finaliza una interacción y calcula su duración', () => {
  resetMetrics();

  ensureInteraction(
    'end-session'
  );

  const ended =
    endInteraction(
      'end-session',
      'USER_ENDED'
    );

  assert.equal(
    ended.status,
    'ENDED'
  );

  assert.equal(
    ended.endReason,
    'USER_ENDED'
  );

  assert.ok(
    ended.endedAt
  );

  assert.equal(
    typeof ended.durationSeconds,
    'number'
  );

  assert.ok(
    ended.durationSeconds >= 0
  );
});

test('no vuelve a modificar una interacción ya finalizada', () => {
  resetMetrics();

  ensureInteraction(
    'idempotent-session'
  );

  const firstEnd =
    endInteraction(
      'idempotent-session',
      'USER_ENDED'
    );

  const secondEnd =
    endInteraction(
      'idempotent-session',
      'NEW_CHAT'
    );

  assert.equal(
    secondEnd.endedAt,
    firstEnd.endedAt
  );

  assert.equal(
    secondEnd.endReason,
    'USER_ENDED'
  );

  assert.equal(
    secondEnd.durationSeconds,
    firstEnd.durationSeconds
  );
});

test('calcula correctamente los indicadores del dashboard', () => {
  resetMetrics();

  // Sesión 1
  registerMessage(
    'summary-a',
    'user'
  );

  registerMessage(
    'summary-a',
    'assistant'
  );

  registerSatisfaction(
    'summary-a',
    5
  );

  endInteraction(
    'summary-a',
    'USER_ENDED'
  );

  // Sesión 2
  registerMessage(
    'summary-b',
    'user'
  );

  registerMessage(
    'summary-b',
    'assistant'
  );

  registerHandoff(
    'summary-b',
    'CASO-ABC12345'
  );

  registerSatisfaction(
    'summary-b',
    3
  );

  endInteraction(
    'summary-b',
    'HANDOFF'
  );

  // Sesión 3 permanece activa
  registerMessage(
    'summary-c',
    'user'
  );

  const summary =
    getDashboardSummary();

  assert.equal(
    summary.totalInteractions,
    3
  );

  assert.equal(
    summary.activeInteractions,
    1
  );

  assert.equal(
    summary.endedInteractions,
    2
  );

  assert.equal(
    summary.handoffInteractions,
    1
  );

  assert.equal(
    summary.handoffRate,
    33.3
  );

  assert.equal(
    summary.ratedInteractions,
    2
  );

  assert.equal(
    summary.averageSatisfaction,
    4
  );

  assert.equal(
    summary.totalUserMessages,
    3
  );

  assert.equal(
    summary.totalAssistantMessages,
    2
  );

  assert.equal(
    summary.recentInteractions.length,
    3
  );

  assert.equal(
    typeof summary.averageDurationSeconds,
    'number'
  );
});

test('resetMetrics elimina todas las métricas', () => {
  resetMetrics();

  registerMessage(
    'reset-metrics',
    'user'
  );

  assert.equal(
    getInteractions().length,
    1
  );

  resetMetrics();

  assert.equal(
    getInteractions().length,
    0
  );

  const summary =
    getDashboardSummary();

  assert.equal(
    summary.totalInteractions,
    0
  );

  assert.equal(
    summary.handoffRate,
    0
  );

  assert.equal(
    summary.averageSatisfaction,
    null
  );
});
test(
  'una interacción finalizada no acumula nuevos mensajes',
  () => {
    resetMetrics();

    registerMessage(
      'closed-session',
      'user'
    );

    registerMessage(
      'closed-session',
      'assistant'
    );

    endInteraction(
      'closed-session',
      'HANDOFF'
    );

    registerMessage(
      'closed-session',
      'user'
    );

    registerMessage(
      'closed-session',
      'assistant'
    );

    const interaction =
      getInteraction(
        'closed-session'
      );

    assert.equal(
      interaction.userMessages,
      1
    );

    assert.equal(
      interaction.assistantMessages,
      1
    );

    assert.equal(
      interaction.status,
      'ENDED'
    );
  }
);