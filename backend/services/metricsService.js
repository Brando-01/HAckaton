const interactions = new Map();

const VALID_END_REASONS = new Set([
  'USER_ENDED',
  'NEW_CHAT',
  'TIMEOUT',
  'HANDOFF'
]);

function clone(value) {
  return JSON.parse(
    JSON.stringify(value)
  );
}

function ensureInteraction(sessionId) {
  if (
    !sessionId ||
    typeof sessionId !== 'string'
  ) {
    throw new Error(
      'sessionId es obligatorio'
    );
  }

  let interaction =
    interactions.get(sessionId);

  if (!interaction) {
    const now =
      new Date().toISOString();

    interaction = {
      sessionId,

      startedAt: now,
      lastActivityAt: now,

      endedAt: null,
      durationSeconds: null,

      status: 'ACTIVE',
      endReason: null,

      userMessages: 0,
      assistantMessages: 0,

      handoff: false,
      handoffCaseId: null,

      satisfaction: null
    };

    interactions.set(
      sessionId,
      interaction
    );
  }

  return interaction;
}

function registerMessage(
  sessionId,
  role
) {
  if (
    role !== 'user' &&
    role !== 'assistant'
  ) {
    throw new Error(
      `Rol inválido: ${role}`
    );
  }

  const interaction =
    ensureInteraction(sessionId);

  // Una interacción finalizada ya no
  // debe acumular nuevos mensajes.
  if (
    interaction.status === 'ENDED'
  ) {
    return clone(interaction);
  }

  if (role === 'user') {
    interaction.userMessages += 1;
  }

  if (role === 'assistant') {
    interaction.assistantMessages += 1;
  }

  interaction.lastActivityAt =
    new Date().toISOString();

  return clone(interaction);
}

function registerHandoff(
  sessionId,
  caseId
) {
  const interaction =
    ensureInteraction(sessionId);

  interaction.handoff = true;
  interaction.handoffCaseId =
    caseId || null;

  interaction.lastActivityAt =
    new Date().toISOString();

  return clone(interaction);
}

function endInteraction(
  sessionId,
  reason = 'USER_ENDED'
) {
  if (!VALID_END_REASONS.has(reason)) {
    throw new Error(
      `Motivo de cierre inválido: ${reason}`
    );
  }

  const interaction =
    ensureInteraction(sessionId);

  // Si ya terminó, no recalculamos
  // el cierre.
  if (interaction.status === 'ENDED') {
    return clone(interaction);
  }

  const endDate =
    new Date();

  interaction.endedAt =
    endDate.toISOString();

  interaction.status =
    'ENDED';

  interaction.endReason =
    reason;

  const startDate =
    new Date(
      interaction.startedAt
    );

  interaction.durationSeconds =
    Math.max(
      0,
      Math.round(
        (
          endDate.getTime() -
          startDate.getTime()
        ) / 1000
      )
    );

  return clone(interaction);
}

function registerSatisfaction(
  sessionId,
  rating,
  comment = ''
) {
  const numericRating =
    Number(rating);

  if (
    !Number.isInteger(
      numericRating
    ) ||
    numericRating < 1 ||
    numericRating > 5
  ) {
    throw new Error(
      'La satisfacción debe estar entre 1 y 5'
    );
  }

  const interaction =
    ensureInteraction(sessionId);

  interaction.satisfaction = {
    rating: numericRating,

    comment:
      typeof comment === 'string'
        ? comment.trim()
        : '',

    submittedAt:
      new Date().toISOString()
  };

  interaction.lastActivityAt =
    new Date().toISOString();

  return clone(interaction);
}

function getInteraction(
  sessionId
) {
  const interaction =
    interactions.get(sessionId);

  return interaction
    ? clone(interaction)
    : null;
}

function getInteractions() {
  return Array.from(
    interactions.values()
  )
    .sort(
      (a, b) =>
        new Date(b.startedAt) -
        new Date(a.startedAt)
    )
    .map(clone);
}

function round(
  value,
  decimals = 1
) {
  const factor =
    10 ** decimals;

  return (
    Math.round(
      value * factor
    ) / factor
  );
}

function getDashboardSummary() {
  const all =
    Array.from(
      interactions.values()
    );

  const totalInteractions =
    all.length;

  const activeInteractions =
    all.filter(
      (item) =>
        item.status === 'ACTIVE'
    ).length;

  const endedInteractions =
    all.filter(
      (item) =>
        item.status === 'ENDED'
    );

  const handoffInteractions =
    all.filter(
      (item) =>
        item.handoff
    ).length;

  const ratedInteractions =
    all.filter(
      (item) =>
        item.satisfaction
    );

  const totalUserMessages =
    all.reduce(
      (sum, item) =>
        sum + item.userMessages,
      0
    );

  const totalAssistantMessages =
    all.reduce(
      (sum, item) =>
        sum +
        item.assistantMessages,
      0
    );

  const averageSatisfaction =
    ratedInteractions.length
      ? round(
          ratedInteractions.reduce(
            (sum, item) =>
              sum +
              item.satisfaction.rating,
            0
          ) /
            ratedInteractions.length,
          2
        )
      : null;

  const finishedWithDuration =
    endedInteractions.filter(
      (item) =>
        Number.isFinite(
          item.durationSeconds
        )
    );

  const averageDurationSeconds =
    finishedWithDuration.length
      ? round(
          finishedWithDuration.reduce(
            (sum, item) =>
              sum +
              item.durationSeconds,
            0
          ) /
            finishedWithDuration.length,
          1
        )
      : null;

  const handoffRate =
    totalInteractions
      ? round(
          (
            handoffInteractions /
            totalInteractions
          ) * 100,
          1
        )
      : 0;

  return {
    totalInteractions,

    activeInteractions,

    endedInteractions:
      endedInteractions.length,

    handoffInteractions,

    handoffRate,

    ratedInteractions:
      ratedInteractions.length,

    averageSatisfaction,

    averageDurationSeconds,

    totalUserMessages,

    totalAssistantMessages,

    recentInteractions:
      getInteractions().slice(0, 10)
  };
}

function resetMetrics() {
  interactions.clear();
}

module.exports = {
  ensureInteraction,
  registerMessage,
  registerHandoff,
  endInteraction,
  registerSatisfaction,
  getInteraction,
  getInteractions,
  getDashboardSummary,
  resetMetrics
};