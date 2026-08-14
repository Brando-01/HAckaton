const {
  runHandoffPolicyBenchmark
} = require('./desafio1HandoffAuditLogic');

const interactions = new Map();

const VALID_END_REASONS = new Set([
  'USER_ENDED',
  'NEW_CHAT',
  'TIMEOUT',
  'HANDOFF'
]);

const RESOLUTION_STATUSES = new Set([
  'RESOLVED',
  'PARTIALLY_RESOLVED',
  'UNRESOLVED'
]);

const HANDOFF_REASONS = [
  'CLIENT_REQUEST',
  'CUSTOMER_DISAGREES',
  'NOT_RESOLVED',
  'OUT_OF_BILLING_SCOPE',
  'REPEATED_UNDERSTANDING_FAILURE'
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

      satisfaction: null,

      resolution: {
        measuredTurns: 0,
        resolvedTurns: 0,
        partiallyResolvedTurns: 0,
        unresolvedTurns: 0,
        lastStatus: null,
        lastReason: null,
        lastDomain: null,
        awaitingPostExplanationOutcome: false,
        followUpsAfterResolved: 0
      },

      repairs: {
        turns: 0,
        consecutive: 0,
        maxConsecutive: 0
      },

      handoffPolicy: {
        evaluations: 0,
        offers: 0,
        transferDecisions: 0,
        lastDecision: null,
        lastReasonCode: null,
        lastRuleId: null
      },

      closure: null
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
    if (
      interaction.resolution
        .awaitingPostExplanationOutcome
    ) {
      interaction.resolution
        .followUpsAfterResolved += 1;
      interaction.resolution
        .awaitingPostExplanationOutcome = false;
    }

    interaction.userMessages += 1;
  }

  if (role === 'assistant') {
    interaction.assistantMessages += 1;
  }

  interaction.lastActivityAt =
    new Date().toISOString();

  return clone(interaction);
}

function registerTurnSignal(
  sessionId,
  {
    repair = false
  } = {}
) {
  const interaction =
    ensureInteraction(sessionId);

  if (interaction.status === 'ENDED') {
    return clone(interaction);
  }

  if (repair) {
    interaction.repairs.turns += 1;
    interaction.repairs.consecutive += 1;
    interaction.repairs.maxConsecutive =
      Math.max(
        interaction.repairs.maxConsecutive,
        interaction.repairs.consecutive
      );
  } else {
    interaction.repairs.consecutive = 0;
  }

  interaction.lastActivityAt =
    new Date().toISOString();

  return clone(interaction);
}

function registerTurnOutcome(
  sessionId,
  {
    resolutionStatus = null,
    resolutionReason = null,
    domain = null
  } = {}
) {
  const interaction =
    ensureInteraction(sessionId);

  if (
    interaction.status === 'ENDED' ||
    !RESOLUTION_STATUSES.has(
      resolutionStatus
    )
  ) {
    return clone(interaction);
  }

  interaction.resolution.measuredTurns += 1;
  interaction.resolution.lastStatus =
    resolutionStatus;
  interaction.resolution.lastReason =
    resolutionReason || null;
  interaction.resolution.lastDomain =
    domain || null;

  if (resolutionStatus === 'RESOLVED') {
    interaction.resolution.resolvedTurns += 1;
    interaction.resolution
      .awaitingPostExplanationOutcome = true;
  } else {
    interaction.resolution
      .awaitingPostExplanationOutcome = false;

    if (
      resolutionStatus ===
      'PARTIALLY_RESOLVED'
    ) {
      interaction.resolution
        .partiallyResolvedTurns += 1;
    }

    if (
      resolutionStatus === 'UNRESOLVED'
    ) {
      interaction.resolution
        .unresolvedTurns += 1;
    }
  }

  interaction.lastActivityAt =
    new Date().toISOString();

  return clone(interaction);
}

function registerHandoffPolicyDecision(
  sessionId,
  policy = null
) {
  const interaction =
    ensureInteraction(sessionId);

  if (!policy || !policy.decision) {
    return clone(interaction);
  }

  interaction.handoffPolicy.evaluations += 1;
  interaction.handoffPolicy.lastDecision =
    policy.decision;
  interaction.handoffPolicy.lastReasonCode =
    policy.reasonCode || null;
  interaction.handoffPolicy.lastRuleId =
    policy.ruleId || null;

  if (
    policy.decision === 'OFFER_ADVISOR'
  ) {
    interaction.handoffPolicy.offers += 1;
  }

  if (
    policy.decision === 'TRANSFER_NOW'
  ) {
    interaction.handoffPolicy
      .transferDecisions += 1;
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

  interaction.resolution
    .awaitingPostExplanationOutcome = false;

  interaction.lastActivityAt =
    new Date().toISOString();

  return clone(interaction);
}

function buildClosure(
  interaction,
  reason
) {
  const resolutionStatus =
    interaction.resolution.lastStatus;

  const postExplanationSilence =
    reason === 'USER_ENDED' &&
    !interaction.handoff &&
    resolutionStatus === 'RESOLVED' &&
    interaction.resolution
      .awaitingPostExplanationOutcome;

  let classification =
    'UNCLASSIFIED_EXIT';

  if (reason === 'HANDOFF') {
    classification = 'HANDOFF';
  } else if (postExplanationSilence) {
    classification =
      'RESOLVED_POST_EXPLANATION_SILENCE';
  } else if (
    reason === 'USER_ENDED' &&
    resolutionStatus === 'RESOLVED'
  ) {
    classification = 'RESOLVED_EXIT';
  } else if (
    reason === 'USER_ENDED' &&
    [
      'PARTIALLY_RESOLVED',
      'UNRESOLVED'
    ].includes(resolutionStatus)
  ) {
    classification = 'UNRESOLVED_EXIT';
  } else if (
    reason === 'NEW_CHAT' &&
    resolutionStatus === 'RESOLVED'
  ) {
    classification =
      'NEW_CHAT_AFTER_RESOLUTION';
  }

  return {
    classification,
    resolutionStatusAtClose:
      resolutionStatus || null,
    resolutionReasonAtClose:
      interaction.resolution.lastReason ||
      null,
    postExplanationSilence,
    followUpsAfterResolved:
      interaction.resolution
        .followUpsAfterResolved,
    measured:
      RESOLUTION_STATUSES.has(
        resolutionStatus
      )
  };
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

  interaction.closure =
    buildClosure(
      interaction,
      reason
    );

  interaction.resolution
    .awaitingPostExplanationOutcome = false;

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
      'Cliente declara no resuelto',
    OUT_OF_BILLING_SCOPE:
      'Fuera del alcance de facturación',
    REPEATED_UNDERSTANDING_FAILURE:
      'Umbral de incomprensión alcanzado'
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

  const measurableEndedWithoutHandoff =
    endedInteractions.filter(
      (item) =>
        !item.handoff &&
        item.closure?.measured
    );

  const verifiedResolutionInteractions =
    measurableEndedWithoutHandoff.filter(
      (item) =>
        item.closure
          ?.resolutionStatusAtClose ===
        'RESOLVED'
    ).length;

  const unresolvedExitInteractions =
    measurableEndedWithoutHandoff.filter(
      (item) =>
        [
          'PARTIALLY_RESOLVED',
          'UNRESOLVED'
        ].includes(
          item.closure
            ?.resolutionStatusAtClose
        )
    ).length;

  const postExplanationSilenceInteractions =
    endedInteractions.filter(
      (item) =>
        item.closure
          ?.postExplanationSilence === true
    ).length;

  const repairInteractions =
    all.filter(
      (item) =>
        item.repairs?.turns > 0
    ).length;

  const repeatedRepairInteractions =
    all.filter(
      (item) =>
        item.repairs?.maxConsecutive >= 2
    ).length;

  const totalRepairTurns =
    all.reduce(
      (sum, item) =>
        sum + (item.repairs?.turns || 0),
      0
    );

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

  const verifiedResolutionRate =
    percentage(
      verifiedResolutionInteractions,
      measurableEndedWithoutHandoff.length
    );

  const postExplanationSilenceRate =
    percentage(
      postExplanationSilenceInteractions,
      measurableEndedWithoutHandoff.length
    );

  const repairInteractionRate =
    percentage(
      repairInteractions,
      totalInteractions
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

  const handoffBenchmark =
    runHandoffPolicyBenchmark();

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

    measurableResolutionInteractions:
      measurableEndedWithoutHandoff.length,
    verifiedResolutionInteractions,
    verifiedResolutionRate,
    unresolvedExitInteractions,

    postExplanationSilenceInteractions,
    postExplanationSilenceRate,

    repairInteractions,
    repeatedRepairInteractions,
    repairInteractionRate,
    totalRepairTurns,

    handoffAccuracyBenchmark: {
      status:
        handoffBenchmark.status,
      totalCases:
        handoffBenchmark.totalCases,
      correctCases:
        handoffBenchmark.correctCases,
      decisionAccuracy:
        handoffBenchmark.decisionAccuracy,
      transferPrecision:
        handoffBenchmark.transferPrecision,
      transferRecall:
        handoffBenchmark.transferRecall,
      falsePositiveTransfers:
        handoffBenchmark.falsePositiveTransfers,
      falseNegativeTransfers:
        handoffBenchmark.falseNegativeTransfers,
      scope:
        handoffBenchmark.scope
    },

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
  registerTurnSignal,
  registerTurnOutcome,
  registerHandoffPolicyDecision,
  registerHandoff,
  endInteraction,
  registerSatisfaction,
  getInteraction,
  getInteractions,
  getDashboardSummary,
  resetMetrics
};
