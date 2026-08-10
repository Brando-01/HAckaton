const interactions = new Map();

const VALID_END_REASONS = new Set([
  'USER_ENDED',
  'NEW_CHAT',
  'TIMEOUT',
  'HANDOFF'
]);

const HANDOFF_REASONS = [
  'CLIENT_REQUEST',
  'CUSTOMER_DISAGREES',
  'NOT_RESOLVED'
];

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

      customerIdentifier: null,
      customerName: null,

      userMessages: 0,
      assistantMessages: 0,

      handoff: false,
      handoffCaseId: null,
      handoffReason: null,

      satisfaction: null
    };

    interactions.set(
      sessionId,
      interaction
    );
  }

  return interaction;
}

function registerInteractionContext(
  sessionId,
  context = {}
) {
  const interaction =
    ensureInteraction(sessionId);

  if (
    context.customerIdentifier &&
    typeof context.customerIdentifier === 'string'
  ) {
    interaction.customerIdentifier =
      context.customerIdentifier;
  }

  if (
    context.customerName &&
    typeof context.customerName === 'string'
  ) {
    interaction.customerName =
      context.customerName.trim() || null;
  }

  interaction.lastActivityAt =
    new Date().toISOString();

  return clone(interaction);
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
  caseId,
  reason = null
) {
  const interaction =
    ensureInteraction(sessionId);

  interaction.handoff = true;
  interaction.handoffCaseId =
    caseId || null;
  interaction.handoffReason =
    reason || null;

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

function percentage(
  numerator,
  denominator
) {
  if (!denominator) {
    return 0;
  }

  return round(
    (numerator / denominator) * 100,
    1
  );
}

function buildEndReasonBreakdown(
  endedInteractions
) {
  const labels = {
    USER_ENDED: 'Finalizada por cliente',
    HANDOFF: 'Derivada a asesor',
    NEW_CHAT: 'Nueva consulta',
    TIMEOUT: 'Tiempo agotado'
  };

  return Array.from(
    VALID_END_REASONS
  ).map((reason) => {
    const count =
      endedInteractions.filter(
        (item) =>
          item.endReason === reason
      ).length;

    return {
      reason,
      label: labels[reason],
      count,
      rate: percentage(
        count,
        endedInteractions.length
      )
    };
  });
}

function buildHandoffReasonBreakdown(
  all
) {
  const labels = {
    CLIENT_REQUEST:
      'Cliente solicita asesor',
    CUSTOMER_DISAGREES:
      'Cliente no está de acuerdo',
    NOT_RESOLVED:
      'Consulta no resuelta'
  };

  const handoffs =
    all.filter(
      (item) => item.handoff
    );

  return HANDOFF_REASONS.map(
    (reason) => {
      const count =
        handoffs.filter(
          (item) =>
            item.handoffReason === reason
        ).length;

      return {
        reason,
        label: labels[reason],
        count,
        rate: percentage(
          count,
          handoffs.length
        )
      };
    }
  );
}

function buildRepeatContactMetrics(all) {
  const identified =
    all.filter(
      (item) =>
        item.customerIdentifier
    );

  const counts =
    new Map();

  identified.forEach((item) => {
    const customerId =
      item.customerIdentifier;

    counts.set(
      customerId,
      (counts.get(customerId) || 0) + 1
    );
  });

  const repeatContactInteractions =
    Array.from(
      counts.values()
    ).reduce(
      (sum, count) =>
        sum + Math.max(0, count - 1),
      0
    );

  return {
    identifiedInteractions:
      identified.length,
    uniqueCustomers:
      counts.size,
    repeatContactInteractions,
    repeatContactRate:
      percentage(
        repeatContactInteractions,
        identified.length
      )
  };
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

  const ratedEndedInteractions =
    endedInteractions.filter(
      (item) =>
        item.satisfaction
    );

  const positiveSatisfactionInteractions =
    ratedInteractions.filter(
      (item) =>
        item.satisfaction.rating >= 4
    ).length;

  const digitalResolutionInteractions =
    endedInteractions.filter(
      (item) =>
        !item.handoff &&
        item.endReason === 'USER_ENDED'
    ).length;

  const unratedEndedInteractions =
    endedInteractions.filter(
      (item) =>
        !item.satisfaction
    ).length;

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

  const completionRate =
    percentage(
      endedInteractions.length,
      totalInteractions
    );

  const handoffRate =
    percentage(
      handoffInteractions,
      totalInteractions
    );

  const digitalResolutionRate =
    percentage(
      digitalResolutionInteractions,
      endedInteractions.length
    );

  const satisfactionResponseRate =
    percentage(
      ratedEndedInteractions.length,
      endedInteractions.length
    );

  const positiveSatisfactionRate =
    percentage(
      positiveSatisfactionInteractions,
      ratedInteractions.length
    );

  const unratedEndedRate =
    percentage(
      unratedEndedInteractions,
      endedInteractions.length
    );

  const averageUserMessages =
    totalInteractions
      ? round(
          totalUserMessages /
          totalInteractions,
          1
        )
      : 0;

  const repeatContacts =
    buildRepeatContactMetrics(all);

  return {
    totalInteractions,

    activeInteractions,

    endedInteractions:
      endedInteractions.length,

    completionRate,

    handoffInteractions,

    handoffRate,

    digitalResolutionInteractions,

    digitalResolutionRate,

    ratedInteractions:
      ratedInteractions.length,

    ratedEndedInteractions:
      ratedEndedInteractions.length,

    averageSatisfaction,

    satisfactionResponseRate,

    positiveSatisfactionInteractions,

    positiveSatisfactionRate,

    unratedEndedInteractions,

    unratedEndedRate,

    averageDurationSeconds,

    averageUserMessages,

    totalUserMessages,

    totalAssistantMessages,

    ...repeatContacts,

    endReasonBreakdown:
      buildEndReasonBreakdown(
        endedInteractions
      ),

    handoffReasonBreakdown:
      buildHandoffReasonBreakdown(all),

    recentInteractions:
      getInteractions().slice(0, 10)
  };
}

function resetMetrics() {
  interactions.clear();
}

module.exports = {
  ensureInteraction,
  registerInteractionContext,
  registerMessage,
  registerHandoff,
  endInteraction,
  registerSatisfaction,
  getInteraction,
  getInteractions,
  getDashboardSummary,
  resetMetrics
};
