const {
  findHistoryChargeByText,
  analyzeChargeRecurrence
} = require(
  './desafio1BillingHistoryLogic'
);

const RESOLUTION_STATUS = Object.freeze({
  RESOLVED: 'RESOLVED',
  PARTIALLY_RESOLVED:
    'PARTIALLY_RESOLVED',
  UNRESOLVED: 'UNRESOLVED'
});

const ACTION_TYPE = Object.freeze({
  CHAT: 'CHAT',
  NAVIGATE: 'NAVIGATE'
});

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function hasAny(text, values) {
  return values.some(
    (value) => text.includes(value)
  );
}

function clone(value) {
  return JSON.parse(
    JSON.stringify(value)
  );
}

function currentHistory(experience) {
  return experience?.billingHistory || null;
}

function findCause(
  experience,
  code
) {
  return (
    experience?.comparison
      ?.causes || []
  ).find(
    (cause) =>
      cause.code === code
  ) || null;
}

function findFinding(
  experience,
  code
) {
  return (
    experience?.findings || []
  ).find(
    (finding) =>
      finding.code === code
  ) || null;
}

function hasVerifiedBillFinding(
  experience
) {
  return (
    experience?.findings || []
  ).some(
    (finding) =>
      finding &&
      finding.code &&
      [
        'HIGH',
        'MEDIUM'
      ].includes(
        finding.evidenceLevel
      )
  );
}

function isDebtBalanceQuestion(
  message
) {
  const text = normalizeText(message);

  return hasAny(
    text,
    [
      'cuanto debo',
      'deuda pendiente',
      'saldo pendiente',
      'cuanto me falta pagar'
    ]
  );
}

function asksForVariation(
  message
) {
  const text = normalizeText(message);

  return hasAny(
    text,
    [
      'por que cambio',
      'por que subio',
      'por que aumento',
      'por que bajo',
      'por que disminuyo',
      'variacion',
      'diferencia',
      'cambio mi recibo',
      'subio mi recibo',
      'aumento mi recibo'
    ]
  );
}

function action({
  id,
  label,
  type,
  prompt = null,
  href = null,
  reason = null
}) {
  return {
    id,
    label,
    type,
    ...(prompt
      ? { prompt }
      : {}),
    ...(href
      ? { href }
      : {}),
    ...(reason
      ? { reason }
      : {})
  };
}

function reviewBillAction() {
  return action({
    id: 'REVIEW_BILL_DETAIL',
    label:
      'Revisar detalle del recibo',
    type: ACTION_TYPE.NAVIGATE,
    href: '/app',
    reason:
      'El detalle del recibo está disponible en Mi Movistar.'
  });
}

function advisorAction() {
  return action({
    id: 'CONTACT_ADVISOR',
    label:
      'Hablar con un asesor',
    type: ACTION_TYPE.CHAT,
    prompt:
      'Quiero hablar con un asesor',
    reason:
      'Se ofrece atención humana cuando la evidencia disponible no resuelve por completo la consulta.'
  });
}

function historyAction() {
  return action({
    id: 'REVIEW_BILL_HISTORY',
    label:
      'Revisar últimos recibos',
    type: ACTION_TYPE.CHAT,
    prompt:
      '¿Cómo ha cambiado mi recibo en los últimos meses?',
    reason:
      'Existe histórico estructurado disponible para comparar ciclos.'
  });
}

function explainVariationAction() {
  return action({
    id: 'EXPLAIN_VARIATION',
    label:
      'Entender la variación',
    type: ACTION_TYPE.CHAT,
    prompt:
      'Explícame por qué cambió mi recibo',
    reason:
      'Existe un recibo anterior comparable.'
  });
}

function highestBillAction() {
  return action({
    id: 'CHECK_HIGHEST_BILL',
    label:
      'Ver recibo más alto',
    type: ACTION_TYPE.CHAT,
    prompt:
      '¿Cuál fue mi recibo más caro?',
    reason:
      'El histórico disponible permite calcular el máximo de forma determinista.'
  });
}

function latestIncreaseAction() {
  return action({
    id: 'CHECK_LATEST_INCREASE',
    label:
      'Ver último aumento',
    type: ACTION_TYPE.CHAT,
    prompt:
      '¿Desde cuándo estoy pagando más?',
    reason:
      'Hay al menos dos recibos disponibles para comparar aumentos.'
  });
}

function dedupeActions(
  actions = [],
  maxActions = 3
) {
  const seen = new Set();
  const result = [];

  for (const item of actions) {
    if (!item?.id || seen.has(item.id)) {
      continue;
    }

    seen.add(item.id);
    result.push(clone(item));

    if (result.length >= maxActions) {
      break;
    }
  }

  return result;
}

function resolveHistoryChargeSubject(
  experience,
  message,
  {
    lastBillingIntent = null
  } = {}
) {
  const history =
    currentHistory(experience);

  if (!history?.availableBills) {
    return null;
  }

  const direct =
    findHistoryChargeByText(
      history,
      message
    );

  if (direct) {
    return direct;
  }

  const causes =
    experience?.comparison
      ?.causes || [];

  if (
    lastBillingIntent ===
      'PACKAGE_CHARGE'
  ) {
    const packageSubject =
      causes.find(
        (cause) =>
          cause.code ===
            'PACKAGES' &&
          cause.subject
      )?.subject;

    if (packageSubject) {
      return packageSubject;
    }
  }

  const withSubject =
    causes
      .filter(
        (cause) =>
          cause.subject
      )
      .map(
        (cause) =>
          cause.subject
      );

  if (withSubject.length === 1) {
    return withSubject[0];
  }

  const currentItems =
    experience?.currentBill
      ?.items || [];

  if (currentItems.length === 1) {
    return {
      chargeCode:
        currentItems[0]
          .chargeCode || null,
      label:
        currentItems[0]
          .label || null
    };
  }

  return null;
}

function buildResolutionGuards() {
  return {
    financialReasoningByLlm:
      false,
    paymentActionOffered:
      false,
    paymentActionReason:
      'DEBT_STATUS_NOT_AVAILABLE_IN_FACTURACION_V2',
    commercialActionOffered:
      false,
    commercialActionReason:
      'DEFERRED_TO_RESTRICTIVE_COMMERCIAL_POLICY'
  };
}

function buildResolutionItem({
  intent,
  status,
  reasonCode,
  nextActions = [],
  details = null
}) {
  return {
    intent,
    status,
    reasonCode,
    ...(details
      ? { details: clone(details) }
      : {}),
    nextActions:
      dedupeActions(
        nextActions
      ),
    guards:
      buildResolutionGuards()
  };
}

function resolvedActionsForIntent(
  experience,
  intent
) {
  const history =
    currentHistory(experience);
  const hasPrevious =
    Boolean(experience?.previousBill);
  const hasHistory =
    Number(history?.availableBills) >= 2;

  switch (intent) {
    case 'CURRENT_TOTAL':
      return dedupeActions([
        hasPrevious
          ? explainVariationAction()
          : null,
        hasHistory
          ? historyAction()
          : null,
        reviewBillAction()
      ].filter(Boolean));

    case 'BILL_HISTORY':
      return dedupeActions([
        highestBillAction(),
        latestIncreaseAction(),
        reviewBillAction()
      ]);

    case 'HIGHEST_BILL':
    case 'LATEST_INCREASE':
      return dedupeActions([
        historyAction(),
        reviewBillAction()
      ]);

    case 'CHARGE_RECURRENCE':
    case 'PRORATION':
    case 'DISCOUNT':
    case 'PACKAGE_CHARGE':
    case 'SUSPENSION_ADJUSTMENT':
      return dedupeActions([
        reviewBillAction(),
        hasHistory
          ? historyAction()
          : null
      ].filter(Boolean));

    case 'RENT_TYPE':
      return dedupeActions([
        hasPrevious
          ? explainVariationAction()
          : reviewBillAction(),
        hasHistory
          ? historyAction()
          : null
      ].filter(Boolean));

    case 'EXPLANATION':
      return dedupeActions([
        reviewBillAction(),
        hasHistory
          ? historyAction()
          : null
      ].filter(Boolean));

    case 'PREVIOUS_BILL':
      return dedupeActions([
        hasPrevious
          ? explainVariationAction()
          : reviewBillAction(),
        hasHistory
          ? historyAction()
          : null
      ].filter(Boolean));

    default:
      return dedupeActions([
        reviewBillAction()
      ]);
  }
}

function unresolvedActions({
  reasonCode
}) {
  if (
    reasonCode ===
      'CHARGE_NEEDS_CLARIFICATION'
  ) {
    return dedupeActions([
      reviewBillAction()
    ]);
  }

  if (
    reasonCode ===
      'HISTORY_INSUFFICIENT'
  ) {
    return dedupeActions([
      reviewBillAction()
    ]);
  }

  return dedupeActions([
    reviewBillAction(),
    advisorAction()
  ]);
}

function resolveExplanationIntent(
  experience,
  message
) {
  const explanationStatus =
    experience
      ?.financialExplanation
      ?.status || null;

  if (
    explanationStatus ===
      'FULLY_EXPLAINED'
  ) {
    return buildResolutionItem({
      intent: 'EXPLANATION',
      status:
        RESOLUTION_STATUS.RESOLVED,
      reasonCode:
        'VARIATION_FULLY_EXPLAINED',
      nextActions:
        resolvedActionsForIntent(
          experience,
          'EXPLANATION'
        ),
      details: {
        explanationStatus,
        coveragePercent:
          experience
            ?.financialExplanation
            ?.coveragePercent ?? null
      }
    });
  }

  if (
    explanationStatus ===
      'NO_VARIATION'
  ) {
    return buildResolutionItem({
      intent: 'EXPLANATION',
      status:
        RESOLUTION_STATUS.RESOLVED,
      reasonCode:
        'NO_VARIATION_TO_EXPLAIN',
      nextActions:
        resolvedActionsForIntent(
          experience,
          'EXPLANATION'
        ),
      details: {
        explanationStatus
      }
    });
  }

  if (
    explanationStatus ===
      'PARTIALLY_EXPLAINED'
  ) {
    return buildResolutionItem({
      intent: 'EXPLANATION',
      status:
        RESOLUTION_STATUS
          .PARTIALLY_RESOLVED,
      reasonCode:
        'VARIATION_PARTIALLY_EXPLAINED',
      nextActions:
        unresolvedActions({
          reasonCode:
            'VARIATION_PARTIALLY_EXPLAINED'
        }),
      details: {
        explanationStatus,
        coveragePercent:
          experience
            ?.financialExplanation
            ?.coveragePercent ?? null,
        unexplainedAmount:
          experience
            ?.financialExplanation
            ?.unexplainedAmount ?? null
      }
    });
  }

  if (
    explanationStatus ===
      'NO_PREVIOUS_BILL'
  ) {
    const hasFinding =
      hasVerifiedBillFinding(
        experience
      );
    const variationRequested =
      asksForVariation(message);

    if (
      hasFinding &&
      !variationRequested
    ) {
      return buildResolutionItem({
        intent: 'EXPLANATION',
        status:
          RESOLUTION_STATUS.RESOLVED,
        reasonCode:
          'CURRENT_BILL_EXPLAINED_WITH_VERIFIED_FINDING',
        nextActions:
          resolvedActionsForIntent(
            experience,
            'EXPLANATION'
          ),
        details: {
          explanationStatus,
          comparisonAvailable: false
        }
      });
    }

    return buildResolutionItem({
      intent: 'EXPLANATION',
      status:
        hasFinding
          ? RESOLUTION_STATUS
              .PARTIALLY_RESOLVED
          : RESOLUTION_STATUS
              .UNRESOLVED,
      reasonCode:
        hasFinding
          ? 'NO_PREVIOUS_BILL_WITH_CURRENT_FINDING'
          : 'NO_PREVIOUS_BILL',
      nextActions:
        unresolvedActions({
          reasonCode:
            'NO_PREVIOUS_BILL'
        }),
      details: {
        explanationStatus,
        comparisonAvailable: false
      }
    });
  }

  return buildResolutionItem({
    intent: 'EXPLANATION',
    status:
      RESOLUTION_STATUS.UNRESOLVED,
    reasonCode:
      'VARIATION_NOT_VERIFIED',
    nextActions:
      unresolvedActions({
        reasonCode:
          'VARIATION_NOT_VERIFIED'
      }),
    details: {
      explanationStatus
    }
  });
}

function resolvePersonalBillingIntent({
  experience,
  intent,
  message = '',
  lastBillingIntent = null
}) {
  const normalizedIntent =
    intent || 'SUMMARY';

  if (!experience?.currentBill) {
    return buildResolutionItem({
      intent: normalizedIntent,
      status:
        RESOLUTION_STATUS.UNRESOLVED,
      reasonCode:
        'CURRENT_BILL_NOT_AVAILABLE',
      nextActions:
        unresolvedActions({
          reasonCode:
            'CURRENT_BILL_NOT_AVAILABLE'
        })
    });
  }

  if (
    normalizedIntent ===
      'CURRENT_TOTAL'
  ) {
    if (
      isDebtBalanceQuestion(message)
    ) {
      return buildResolutionItem({
        intent: normalizedIntent,
        status:
          RESOLUTION_STATUS
            .PARTIALLY_RESOLVED,
        reasonCode:
          'DEBT_STATUS_NOT_AVAILABLE',
        nextActions:
          unresolvedActions({
            reasonCode:
              'DEBT_STATUS_NOT_AVAILABLE'
          }),
        details: {
          billTotalAvailable: true,
          outstandingBalanceAvailable:
            false
        }
      });
    }

    return buildResolutionItem({
      intent: normalizedIntent,
      status:
        RESOLUTION_STATUS.RESOLVED,
      reasonCode:
        'CURRENT_TOTAL_VERIFIED',
      nextActions:
        resolvedActionsForIntent(
          experience,
          normalizedIntent
        )
    });
  }

  if (
    normalizedIntent ===
      'PREVIOUS_BILL'
  ) {
    if (experience.previousBill) {
      return buildResolutionItem({
        intent: normalizedIntent,
        status:
          RESOLUTION_STATUS.RESOLVED,
        reasonCode:
          'PREVIOUS_BILL_VERIFIED',
        nextActions:
          resolvedActionsForIntent(
            experience,
            normalizedIntent
          )
      });
    }

    return buildResolutionItem({
      intent: normalizedIntent,
      status:
        RESOLUTION_STATUS.UNRESOLVED,
      reasonCode:
        'PREVIOUS_BILL_NOT_AVAILABLE',
      nextActions:
        unresolvedActions({
          reasonCode:
            'PREVIOUS_BILL_NOT_AVAILABLE'
        })
    });
  }

  if (
    normalizedIntent ===
      'EXPLANATION'
  ) {
    return resolveExplanationIntent(
      experience,
      message
    );
  }

  if (
    normalizedIntent ===
      'PRORATION'
  ) {
    const verified =
      findCause(
        experience,
        'PRORATION'
      ) ||
      findFinding(
        experience,
        'PRORATION'
      );

    return buildResolutionItem({
      intent: normalizedIntent,
      status: verified
        ? RESOLUTION_STATUS.RESOLVED
        : RESOLUTION_STATUS.UNRESOLVED,
      reasonCode: verified
        ? 'PRORATION_VERIFIED'
        : 'PRORATION_NOT_VERIFIED',
      nextActions: verified
        ? resolvedActionsForIntent(
            experience,
            normalizedIntent
          )
        : unresolvedActions({
            reasonCode:
              'PRORATION_NOT_VERIFIED'
          })
    });
  }

  if (
    normalizedIntent ===
      'DISCOUNT'
  ) {
    const verified =
      findCause(
        experience,
        'DISCOUNT_ENDED'
      ) ||
      findFinding(
        experience,
        'ACTIVE_DISCOUNT'
      );

    return buildResolutionItem({
      intent: normalizedIntent,
      status: verified
        ? RESOLUTION_STATUS.RESOLVED
        : RESOLUTION_STATUS.UNRESOLVED,
      reasonCode: verified
        ? 'DISCOUNT_STATUS_VERIFIED'
        : 'DISCOUNT_NOT_VERIFIED',
      nextActions: verified
        ? resolvedActionsForIntent(
            experience,
            normalizedIntent
          )
        : unresolvedActions({
            reasonCode:
              'DISCOUNT_NOT_VERIFIED'
          })
    });
  }

  if (
    normalizedIntent ===
      'PACKAGE_CHARGE'
  ) {
    const verified =
      findCause(
        experience,
        'PACKAGES'
      );

    return buildResolutionItem({
      intent: normalizedIntent,
      status: verified
        ? RESOLUTION_STATUS.RESOLVED
        : RESOLUTION_STATUS.UNRESOLVED,
      reasonCode: verified
        ? 'PACKAGE_CHARGE_VERIFIED'
        : 'PACKAGE_CHARGE_NOT_VERIFIED',
      nextActions: verified
        ? resolvedActionsForIntent(
            experience,
            normalizedIntent
          )
        : unresolvedActions({
            reasonCode:
              'PACKAGE_CHARGE_NOT_VERIFIED'
          })
    });
  }

  if (
    normalizedIntent ===
      'SUSPENSION_ADJUSTMENT'
  ) {
    const verified =
      findFinding(
        experience,
        'SUSPENSION_ADJUSTMENT'
      );

    return buildResolutionItem({
      intent: normalizedIntent,
      status: verified
        ? RESOLUTION_STATUS.RESOLVED
        : RESOLUTION_STATUS.UNRESOLVED,
      reasonCode: verified
        ? 'SUSPENSION_ADJUSTMENT_VERIFIED'
        : 'SUSPENSION_ADJUSTMENT_NOT_VERIFIED',
      nextActions: verified
        ? resolvedActionsForIntent(
            experience,
            normalizedIntent
          )
        : unresolvedActions({
            reasonCode:
              'SUSPENSION_ADJUSTMENT_NOT_VERIFIED'
          })
    });
  }

  if (
    normalizedIntent ===
      'RENT_TYPE'
  ) {
    const rent =
      experience
        ?.financialExplanation
        ?.rentContext
        ?.current;
    const verified =
      Boolean(
        rent?.resolved &&
        rent?.rentType
      );

    return buildResolutionItem({
      intent: normalizedIntent,
      status: verified
        ? RESOLUTION_STATUS.RESOLVED
        : RESOLUTION_STATUS.UNRESOLVED,
      reasonCode: verified
        ? 'RENT_TYPE_VERIFIED'
        : 'RENT_TYPE_NOT_RESOLVED',
      nextActions: verified
        ? resolvedActionsForIntent(
            experience,
            normalizedIntent
          )
        : unresolvedActions({
            reasonCode:
              'RENT_TYPE_NOT_RESOLVED'
          })
    });
  }

  if (
    normalizedIntent ===
      'BILL_HISTORY'
  ) {
    const history =
      currentHistory(experience);
    const count =
      Number(
        history?.availableBills
      ) || 0;

    const status =
      count >= 2
        ? RESOLUTION_STATUS.RESOLVED
        : count === 1
          ? RESOLUTION_STATUS
              .PARTIALLY_RESOLVED
          : RESOLUTION_STATUS
              .UNRESOLVED;

    return buildResolutionItem({
      intent: normalizedIntent,
      status,
      reasonCode:
        count >= 2
          ? 'HISTORY_COMPARISON_AVAILABLE'
          : count === 1
            ? 'HISTORY_ONLY_CURRENT_BILL'
            : 'HISTORY_NOT_AVAILABLE',
      nextActions:
        count >= 2
          ? resolvedActionsForIntent(
              experience,
              normalizedIntent
            )
          : unresolvedActions({
              reasonCode:
                'HISTORY_INSUFFICIENT'
            }),
      details: {
        availableBills: count
      }
    });
  }

  if (
    normalizedIntent ===
      'HIGHEST_BILL'
  ) {
    const highest =
      currentHistory(experience)
        ?.summary
        ?.highestBill;

    return buildResolutionItem({
      intent: normalizedIntent,
      status: highest
        ? RESOLUTION_STATUS.RESOLVED
        : RESOLUTION_STATUS.UNRESOLVED,
      reasonCode: highest
        ? 'HIGHEST_BILL_VERIFIED'
        : 'HISTORY_NOT_AVAILABLE',
      nextActions: highest
        ? resolvedActionsForIntent(
            experience,
            normalizedIntent
          )
        : unresolvedActions({
            reasonCode:
              'HISTORY_INSUFFICIENT'
          })
    });
  }

  if (
    normalizedIntent ===
      'LATEST_INCREASE'
  ) {
    const history =
      currentHistory(experience);
    const count =
      Number(
        history?.availableBills
      ) || 0;

    return buildResolutionItem({
      intent: normalizedIntent,
      status:
        count >= 2
          ? RESOLUTION_STATUS.RESOLVED
          : RESOLUTION_STATUS.UNRESOLVED,
      reasonCode:
        count >= 2
          ? 'LATEST_INCREASE_EVALUATED'
          : 'HISTORY_INSUFFICIENT',
      nextActions:
        count >= 2
          ? resolvedActionsForIntent(
              experience,
              normalizedIntent
            )
          : unresolvedActions({
              reasonCode:
                'HISTORY_INSUFFICIENT'
            }),
      details: {
        availableBills: count,
        increaseFound:
          Boolean(
            history?.summary
              ?.mostRecentIncrease
          )
      }
    });
  }

  if (
    normalizedIntent ===
      'CHARGE_RECURRENCE'
  ) {
    const history =
      currentHistory(experience);

    if (!history?.availableBills) {
      return buildResolutionItem({
        intent: normalizedIntent,
        status:
          RESOLUTION_STATUS.UNRESOLVED,
        reasonCode:
          'HISTORY_NOT_AVAILABLE',
        nextActions:
          unresolvedActions({
            reasonCode:
              'HISTORY_INSUFFICIENT'
          })
      });
    }

    const subject =
      resolveHistoryChargeSubject(
        experience,
        message,
        { lastBillingIntent }
      );

    if (!subject) {
      return buildResolutionItem({
        intent: normalizedIntent,
        status:
          RESOLUTION_STATUS.UNRESOLVED,
        reasonCode:
          'CHARGE_NEEDS_CLARIFICATION',
        nextActions:
          unresolvedActions({
            reasonCode:
              'CHARGE_NEEDS_CLARIFICATION'
          })
      });
    }

    const recurrence =
      analyzeChargeRecurrence(
        history,
        subject
      );

    const verified =
      recurrence &&
      recurrence.status !==
        'NOT_FOUND';

    return buildResolutionItem({
      intent: normalizedIntent,
      status: verified
        ? RESOLUTION_STATUS.RESOLVED
        : RESOLUTION_STATUS.UNRESOLVED,
      reasonCode: verified
        ? 'CHARGE_RECURRENCE_EVALUATED'
        : 'CHARGE_NOT_FOUND_IN_HISTORY',
      nextActions: verified
        ? resolvedActionsForIntent(
            experience,
            normalizedIntent
          )
        : unresolvedActions({
            reasonCode:
              'CHARGE_NOT_FOUND_IN_HISTORY'
          }),
      details: verified
        ? {
            recurrenceStatus:
              recurrence.status,
            occurrenceCount:
              recurrence
                .occurrenceCount,
            billCount:
              recurrence.billCount
          }
        : null
    });
  }

  return buildResolutionItem({
    intent: normalizedIntent,
    status:
      RESOLUTION_STATUS.UNRESOLVED,
    reasonCode:
      'INTENT_NOT_RESOLVED_BY_POLICY',
    nextActions:
      unresolvedActions({
        reasonCode:
          'INTENT_NOT_RESOLVED_BY_POLICY'
      })
  });
}


function profileResolvedActions(
  experience,
  intent
) {
  const hasPrevious =
    Boolean(experience?.previousBill);
  const history =
    currentHistory(experience);

  if (
    intent === 'CURRENT_CHARGES' ||
    intent === 'CURRENT_PLAN' ||
    intent === 'RECONNECTION_STATUS'
  ) {
    return dedupeActions([
      hasPrevious
        ? explainVariationAction()
        : reviewBillAction(),
      Number(history?.availableBills) >= 2
        ? historyAction()
        : null
    ].filter(Boolean));
  }

  return dedupeActions([
    reviewBillAction()
  ]);
}

function resolveCustomerProfileIntent({
  profile,
  experience,
  intent
}) {
  const normalizedIntent =
    intent || 'PROFILE_SUMMARY';

  if (!profile) {
    return buildResolutionItem({
      intent: normalizedIntent,
      status:
        RESOLUTION_STATUS.UNRESOLVED,
      reasonCode:
        'PROFILE_NOT_AVAILABLE',
      nextActions:
        unresolvedActions({
          reasonCode:
            'PROFILE_NOT_AVAILABLE'
        })
    });
  }

  let available = false;
  let reasonCode =
    'PROFILE_VALUE_VERIFIED';

  switch (normalizedIntent) {
    case 'PROFILE_SUMMARY':
      available = true;
      reasonCode =
        'PROFILE_SUMMARY_AVAILABLE';
      break;

    case 'CUSTOMER_ID':
      available = Boolean(
        profile.visibleId ||
        profile.customerCode
      );
      reasonCode = available
        ? 'CUSTOMER_ID_AVAILABLE'
        : 'CUSTOMER_ID_NOT_AVAILABLE';
      break;

    case 'ACTIVATION_DATE':
      available = Boolean(
        profile.activationDate
      );
      reasonCode = available
        ? 'ACTIVATION_DATE_AVAILABLE'
        : 'ACTIVATION_DATE_NOT_AVAILABLE';
      break;

    case 'BILLING_CYCLE':
      available =
        profile.billingCycleDay !==
          null &&
        profile.billingCycleDay !==
          undefined;
      reasonCode = available
        ? 'BILLING_CYCLE_AVAILABLE'
        : 'BILLING_CYCLE_NOT_AVAILABLE';
      break;

    case 'SERVICE_TYPE':
      available = Boolean(
        profile.lobType
      );
      reasonCode = available
        ? 'SERVICE_TYPE_AVAILABLE'
        : 'SERVICE_TYPE_NOT_AVAILABLE';
      break;

    case 'BUSINESS_TYPE':
      available = Boolean(
        profile.businessType
      );
      reasonCode = available
        ? 'BUSINESS_TYPE_AVAILABLE'
        : 'BUSINESS_TYPE_NOT_AVAILABLE';
      break;

    case 'CURRENT_PLAN': {
      const plan = String(
        experience?.customer?.plan || ''
      ).trim();
      const itemLabels =
        (
          experience?.currentBill
            ?.items || []
        ).map(
          (item) =>
            String(
              item?.label || ''
            ).trim()
        );

      available = Boolean(
        plan &&
        itemLabels.includes(plan)
      );
      reasonCode = available
        ? 'CURRENT_PLAN_AVAILABLE'
        : 'CURRENT_PLAN_NOT_VERIFIED';
      break;
    }

    case 'DEBT_STATUS': {
      const status = String(
        experience?.currentBill
          ?.status || ''
      ).trim();
      available = Boolean(
        status &&
        status !==
          'Estado no disponible'
      );
      reasonCode = available
        ? 'DEBT_STATUS_VERIFIED'
        : 'DEBT_STATUS_NOT_AVAILABLE';
      break;
    }

    case 'CURRENT_CHARGES':
      available = Boolean(
        experience?.currentBill
          ?.items?.length
      );
      reasonCode = available
        ? 'CURRENT_CHARGES_AVAILABLE'
        : 'CURRENT_CHARGES_NOT_AVAILABLE';
      break;

    case 'RECONNECTION_STATUS':
      available = Boolean(
        findCause(
          experience,
          'RECONNECTION'
        )
      );
      reasonCode = available
        ? 'RECONNECTION_VERIFIED'
        : 'RECONNECTION_NOT_VERIFIED';
      break;

    case 'DATA_ORIGIN':
      available = true;
      reasonCode =
        'DATA_ORIGIN_EXPLAINED';
      break;

    default:
      available = false;
      reasonCode =
        'PROFILE_INTENT_NOT_RESOLVED_BY_POLICY';
  }

  return buildResolutionItem({
    intent: normalizedIntent,
    status: available
      ? RESOLUTION_STATUS.RESOLVED
      : RESOLUTION_STATUS.UNRESOLVED,
    reasonCode,
    nextActions: available
      ? profileResolvedActions(
          experience,
          normalizedIntent
        )
      : unresolvedActions({
          reasonCode
        })
  });
}

function aggregateResolutionItems(
  items = []
) {
  const safeItems =
    (items || []).filter(Boolean);

  if (!safeItems.length) {
    return null;
  }

  const resolvedCount =
    safeItems.filter(
      (item) =>
        item.status ===
          RESOLUTION_STATUS.RESOLVED
    ).length;

  const unresolvedCount =
    safeItems.filter(
      (item) =>
        item.status ===
          RESOLUTION_STATUS.UNRESOLVED
    ).length;

  let status =
    RESOLUTION_STATUS
      .PARTIALLY_RESOLVED;
  let reasonCode =
    'MIXED_INTENT_RESOLUTION';

  if (
    resolvedCount === safeItems.length
  ) {
    status =
      RESOLUTION_STATUS.RESOLVED;
    reasonCode =
      'ALL_INTENTS_RESOLVED';
  } else if (
    unresolvedCount === safeItems.length
  ) {
    status =
      RESOLUTION_STATUS.UNRESOLVED;
    reasonCode =
      'ALL_INTENTS_UNRESOLVED';
  }

  const orderedItems = [
    ...safeItems.filter(
      (item) =>
        item.status !==
          RESOLUTION_STATUS.RESOLVED
    ),
    ...safeItems.filter(
      (item) =>
        item.status ===
          RESOLUTION_STATUS.RESOLVED
    )
  ];

  const actionSourceItems =
    status ===
      RESOLUTION_STATUS.RESOLVED
      ? orderedItems
      : orderedItems.filter(
          (item) =>
            item.status !==
              RESOLUTION_STATUS.RESOLVED
        );

  return {
    schemaVersion:
      'desafio1-resolution-v1',
    status,
    reasonCode,
    intentCount:
      safeItems.length,
    resolvedCount,
    partiallyResolvedCount:
      safeItems.filter(
        (item) =>
          item.status ===
            RESOLUTION_STATUS
              .PARTIALLY_RESOLVED
      ).length,
    unresolvedCount,
    items: safeItems,
    nextActions:
      dedupeActions(
        actionSourceItems.flatMap(
          (item) =>
            item.nextActions || []
        )
      ),
    guards:
      buildResolutionGuards()
  };
}

function aggregateBillingResolutions({
  experience,
  intents = [],
  message = '',
  lastBillingIntent = null
}) {
  const uniqueIntents =
    Array.from(
      new Set(
        (intents || [])
          .filter(Boolean)
      )
    );

  if (!uniqueIntents.length) {
    return null;
  }

  const items =
    uniqueIntents.map(
      (intent) =>
        resolvePersonalBillingIntent({
          experience,
          intent,
          message,
          lastBillingIntent
        })
    );

  return aggregateResolutionItems(
    items
  );

}


function aggregateCustomerResolutions({
  profile,
  experience,
  profileIntents = [],
  billingIntents = [],
  message = '',
  lastBillingIntent = null
}) {
  const profileItems =
    Array.from(
      new Set(
        (profileIntents || [])
          .filter(Boolean)
      )
    ).map(
      (intent) =>
        resolveCustomerProfileIntent({
          profile,
          experience,
          intent
        })
    );

  const billingItems =
    Array.from(
      new Set(
        (billingIntents || [])
          .filter(Boolean)
      )
    ).map(
      (intent) =>
        resolvePersonalBillingIntent({
          experience,
          intent,
          message,
          lastBillingIntent
        })
    );

  return aggregateResolutionItems([
    ...profileItems,
    ...billingItems
  ]);
}

function buildAppResolution(
  experience
) {
  const item =
    resolvePersonalBillingIntent({
      experience,
      intent: 'EXPLANATION',
      message:
        'Explícame mi recibo'
    });

  return {
    schemaVersion:
      'desafio1-resolution-v1',
    status: item.status,
    reasonCode: item.reasonCode,
    intent: 'EXPLANATION',
    guards: item.guards
  };
}

function buildAppNextActions(
  experience
) {
  const resolution =
    buildAppResolution(
      experience
    );
  const history =
    currentHistory(experience);
  const previous =
    Boolean(
      experience?.previousBill
    );

  const explain = action({
    id: 'EXPLAIN_BILL',
    label: previous
      ? 'Entender mi variación'
      : 'Entender mi recibo',
    type: ACTION_TYPE.CHAT,
    prompt: previous
      ? 'Explícame por qué cambió mi recibo'
      : 'Explícame mi recibo',
    reason:
      'La explicación usa el motor financiero determinista del desafío.'
  });

  const actions = [explain];

  if (
    Number(
      history?.availableBills
    ) >= 2
  ) {
    actions.push(
      historyAction()
    );
  }

  if (
    resolution.status !==
      RESOLUTION_STATUS.RESOLVED
  ) {
    actions.push(
      advisorAction()
    );
  }

  return {
    resolution,
    nextActions:
      dedupeActions(actions)
  };
}

module.exports = {
  RESOLUTION_STATUS,
  ACTION_TYPE,
  isDebtBalanceQuestion,
  asksForVariation,
  resolveHistoryChargeSubject,
  resolvePersonalBillingIntent,
  resolveCustomerProfileIntent,
  aggregateResolutionItems,
  aggregateBillingResolutions,
  aggregateCustomerResolutions,
  buildAppResolution,
  buildAppNextActions,
  dedupeActions
};
