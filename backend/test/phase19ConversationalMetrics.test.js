const test = require('node:test');
const assert = require('node:assert/strict');

const {
  registerMessage,
  registerTurnSignal,
  registerTurnOutcome,
  registerHandoffPolicyDecision,
  registerHandoff,
  endInteraction,
  getInteraction,
  getDashboardSummary,
  resetMetrics
} = require('../services/metricsService');

test('cierre inmediato tras RESOLVED registra silencio post-explicación real', () => {
  resetMetrics();

  registerMessage('silence-a', 'user');
  registerMessage('silence-a', 'assistant');
  registerTurnOutcome('silence-a', {
    resolutionStatus: 'RESOLVED',
    resolutionReason: 'CURRENT_TOTAL_VERIFIED',
    domain: 'BILLING'
  });

  const ended = endInteraction('silence-a', 'USER_ENDED');

  assert.equal(ended.closure.postExplanationSilence, true);
  assert.equal(ended.closure.classification, 'RESOLVED_POST_EXPLANATION_SILENCE');
});

test('una nueva pregunta después de RESOLVED cancela el silencio post-explicación', () => {
  resetMetrics();

  registerMessage('silence-b', 'user');
  registerMessage('silence-b', 'assistant');
  registerTurnOutcome('silence-b', {
    resolutionStatus: 'RESOLVED',
    domain: 'BILLING'
  });
  registerMessage('silence-b', 'user');
  registerTurnOutcome('silence-b', {
    resolutionStatus: 'UNRESOLVED',
    domain: 'BILLING'
  });

  const ended = endInteraction('silence-b', 'USER_ENDED');

  assert.equal(ended.closure.postExplanationSilence, false);
  assert.equal(ended.resolution.followUpsAfterResolved, 1);
  assert.equal(ended.closure.classification, 'UNRESOLVED_EXIT');
});

test('métricas registran reformulaciones consecutivas y máximo alcanzado', () => {
  resetMetrics();

  registerTurnSignal('repair-a', { repair: true });
  registerTurnSignal('repair-a', { repair: true });

  const interaction = getInteraction('repair-a');

  assert.equal(interaction.repairs.turns, 2);
  assert.equal(interaction.repairs.maxConsecutive, 2);
});

test('un turno normal reinicia la racha de reformulaciones métricas', () => {
  resetMetrics();

  registerTurnSignal('repair-b', { repair: true });
  registerTurnSignal('repair-b', { repair: false });

  assert.equal(getInteraction('repair-b').repairs.consecutive, 0);
});

test('dashboard separa resolución verificada del antiguo proxy sin handoff', () => {
  resetMetrics();

  registerMessage('resolved-close', 'user');
  registerTurnOutcome('resolved-close', {
    resolutionStatus: 'RESOLVED',
    domain: 'BILLING'
  });
  endInteraction('resolved-close', 'USER_ENDED');

  registerMessage('unresolved-close', 'user');
  registerTurnOutcome('unresolved-close', {
    resolutionStatus: 'UNRESOLVED',
    domain: 'BILLING'
  });
  endInteraction('unresolved-close', 'USER_ENDED');

  const summary = getDashboardSummary();

  assert.equal(summary.digitalResolutionRate, 100);
  assert.equal(summary.verifiedResolutionRate, 50);
  assert.equal(summary.unresolvedExitInteractions, 1);
});

test('dashboard incluye benchmark de precisión de handoff y reformulaciones', () => {
  resetMetrics();

  registerTurnSignal('repair-summary', { repair: true });
  registerHandoffPolicyDecision('repair-summary', {
    decision: 'OFFER_ADVISOR',
    reasonCode: 'RESOLUTION_GAP',
    ruleId: 'RULE'
  });

  const summary = getDashboardSummary();

  assert.equal(summary.handoffAccuracyBenchmark.decisionAccuracy, 100);
  assert.equal(summary.repairInteractions, 1);
  assert.equal(summary.repairInteractionRate, 100);
});

test('nuevos motivos automáticos de handoff aparecen en el breakdown', () => {
  resetMetrics();

  registerMessage('handoff-auto', 'user');
  registerHandoff(
    'handoff-auto',
    'CASO-AUTO',
    'OUT_OF_BILLING_SCOPE'
  );
  endInteraction('handoff-auto', 'HANDOFF');

  const summary = getDashboardSummary();
  const item = summary.handoffReasonBreakdown.find(
    (entry) => entry.reason === 'OUT_OF_BILLING_SCOPE'
  );

  assert.equal(item.count, 1);
  assert.equal(item.rate, 100);
});
