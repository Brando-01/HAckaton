const HANDOFF_DECISIONS = Object.freeze({
  NONE: 'NONE',
  OFFER_ADVISOR: 'OFFER_ADVISOR',
  TRANSFER_NOW: 'TRANSFER_NOW'
});

const REPAIR_TRANSFER_THRESHOLD = 2;

const HANDOFF_REASON_CODES = Object.freeze({
  CLIENT_REQUEST: 'CLIENT_REQUEST',
  CUSTOMER_DISAGREES: 'CUSTOMER_DISAGREES',
  NOT_RESOLVED: 'NOT_RESOLVED',
  OUT_OF_BILLING_SCOPE: 'OUT_OF_BILLING_SCOPE',
  REPEATED_UNDERSTANDING_FAILURE: 'REPEATED_UNDERSTANDING_FAILURE',
  RESOLUTION_GAP: 'RESOLUTION_GAP'
});

const HANDOFF_RULE_IDS = Object.freeze({
  EXPLICIT_CLIENT_REQUEST: 'HANDOFF_EXPLICIT_CLIENT_REQUEST',
  EXPLICIT_DISAGREEMENT: 'HANDOFF_EXPLICIT_DISAGREEMENT',
  EXPLICIT_NOT_RESOLVED: 'HANDOFF_EXPLICIT_NOT_RESOLVED',
  OUT_OF_BILLING_SCOPE: 'HANDOFF_OUT_OF_BILLING_SCOPE_EXPLICIT_PATTERN',
  REPEATED_REPAIR: 'HANDOFF_REPAIR_THRESHOLD_2',
  RESOLUTION_GAP: 'HANDOFF_RESOLUTION_GAP_OFFER',
  NONE: 'HANDOFF_NOT_REQUIRED'
});

const BILLING_OR_PROFILE_DOMAINS = new Set([
  'BILLING',
  'PROFILE',
  'COMPOSITE'
]);

function normalizeText(value = '') {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function detectExplicitHandoffReason(message) {
  const text = normalizeText(message);

  if (!text) {
    return null;
  }

  if (/\bno estoy de acuerdo\b/.test(text)) {
    return {
      reasonCode: HANDOFF_REASON_CODES.CUSTOMER_DISAGREES,
      ruleId: HANDOFF_RULE_IDS.EXPLICIT_DISAGREEMENT,
      trigger: 'EXPLICIT_DISAGREEMENT'
    };
  }

  if (
    /\bno resolvio mi problema\b/.test(text) ||
    /\bno resolvio mi duda\b/.test(text) ||
    /\besto no me ayudo\b/.test(text)
  ) {
    return {
      reasonCode: HANDOFF_REASON_CODES.NOT_RESOLVED,
      ruleId: HANDOFF_RULE_IDS.EXPLICIT_NOT_RESOLVED,
      trigger: 'EXPLICIT_NOT_RESOLVED'
    };
  }

  if (
    /\basesor\b/.test(text) ||
    /\bhumano\b/.test(text) ||
    /\bpersona real\b/.test(text) ||
    /\batencion humana\b/.test(text) ||
    /\bhablar con alguien\b/.test(text)
  ) {
    return {
      reasonCode: HANDOFF_REASON_CODES.CLIENT_REQUEST,
      ruleId: HANDOFF_RULE_IDS.EXPLICIT_CLIENT_REQUEST,
      trigger: 'EXPLICIT_CLIENT_REQUEST'
    };
  }

  return null;
}

function containsBillingScopeSignal(message) {
  const text = normalizeText(message);

  return [
    /\brecibo\b/,
    /\bfactura(?:cion)?\b/,
    /\bcobro\b/,
    /\bmonto\b/,
    /\bdeuda\b/,
    /\bpagar\b/,
    /\bdescuento\b/,
    /\bprorrateo\b/,
    /\breconexion\b/,
    /\bsuspension\b/,
    /\bcargo\b/,
    /\bplan\b/,
    /\bpaquete\b/
  ].some((pattern) => pattern.test(text));
}

function isClearlyOutOfBillingScope(message) {
  const text = normalizeText(message);

  if (!text || containsBillingScopeSignal(text)) {
    return false;
  }

  const patterns = [
    /\binternet (?:esta )?(?:lento|caido|inestable)\b/,
    /\b(?:no tengo|sin) internet\b/,
    /\b(?:no tengo|sin) senal\b/,
    /\bwifi\b/,
    /\bwi-fi\b/,
    /\brouter\b/,
    /\bmodem\b/,
    /\baveria\b/,
    /\bsoporte tecnico\b/,
    /\b(?:chip|sim)\b/,
    /\broaming\b/,
    /\bportabilidad\b/,
    /\b(?:no puedo|no me deja) llamar\b/,
    /\b(?:llamadas|datos moviles) no funcionan\b/
  ];

  return patterns.some((pattern) => pattern.test(text));
}

function buildRepairState({
  repair = false,
  previousRepairCount = 0,
  lastConversationDomain = null
} = {}) {
  const eligibleDomain =
    BILLING_OR_PROFILE_DOMAINS.has(
      lastConversationDomain
    );

  const safePrevious = Number.isInteger(previousRepairCount)
    ? Math.max(0, previousRepairCount)
    : 0;

  const currentRepairCount =
    repair && eligibleDomain
      ? safePrevious + 1
      : 0;

  return {
    repair: Boolean(repair),
    eligibleDomain,
    previousRepairCount: safePrevious,
    currentRepairCount,
    threshold: REPAIR_TRANSFER_THRESHOLD,
    thresholdReached:
      currentRepairCount >= REPAIR_TRANSFER_THRESHOLD
  };
}

function noHandoffDecision(extra = {}) {
  return {
    decision: HANDOFF_DECISIONS.NONE,
    reasonCode: null,
    ruleId: HANDOFF_RULE_IDS.NONE,
    trigger: 'NONE',
    threshold: null,
    observedRepairCount: 0,
    ...extra
  };
}

function evaluatePreTurnHandoffPolicy({
  message = '',
  repair = false,
  previousRepairCount = 0,
  lastConversationDomain = null
} = {}) {
  const explicit =
    detectExplicitHandoffReason(message);

  if (explicit) {
    return {
      decision: HANDOFF_DECISIONS.TRANSFER_NOW,
      ...explicit,
      threshold: null,
      observedRepairCount: 0
    };
  }

  if (isClearlyOutOfBillingScope(message)) {
    return {
      decision: HANDOFF_DECISIONS.TRANSFER_NOW,
      reasonCode:
        HANDOFF_REASON_CODES.OUT_OF_BILLING_SCOPE,
      ruleId:
        HANDOFF_RULE_IDS.OUT_OF_BILLING_SCOPE,
      trigger: 'OUT_OF_BILLING_SCOPE',
      threshold: null,
      observedRepairCount: 0
    };
  }

  const repairState = buildRepairState({
    repair,
    previousRepairCount,
    lastConversationDomain
  });

  if (repairState.thresholdReached) {
    return {
      decision: HANDOFF_DECISIONS.TRANSFER_NOW,
      reasonCode:
        HANDOFF_REASON_CODES.REPEATED_UNDERSTANDING_FAILURE,
      ruleId:
        HANDOFF_RULE_IDS.REPEATED_REPAIR,
      trigger: 'REPEATED_REPAIR',
      threshold:
        REPAIR_TRANSFER_THRESHOLD,
      observedRepairCount:
        repairState.currentRepairCount
    };
  }

  return noHandoffDecision({
    threshold:
      repairState.eligibleDomain
        ? REPAIR_TRANSFER_THRESHOLD
        : null,
    observedRepairCount:
      repairState.currentRepairCount
  });
}

function evaluatePostTurnHandoffPolicy({
  resolutionStatus = null
} = {}) {
  if (
    resolutionStatus === 'PARTIALLY_RESOLVED' ||
    resolutionStatus === 'UNRESOLVED'
  ) {
    return {
      decision:
        HANDOFF_DECISIONS.OFFER_ADVISOR,
      reasonCode:
        HANDOFF_REASON_CODES.RESOLUTION_GAP,
      ruleId:
        HANDOFF_RULE_IDS.RESOLUTION_GAP,
      trigger: 'RESOLUTION_STATUS',
      threshold: null,
      observedRepairCount: 0,
      resolutionStatus
    };
  }

  return noHandoffDecision({
    resolutionStatus:
      resolutionStatus || null
  });
}

function buildSafeHandoffPolicySnapshot(
  policy,
  {
    resolutionStatusAtDecision = null
  } = {}
) {
  if (!policy) {
    return null;
  }

  return {
    decision:
      policy.decision ||
      HANDOFF_DECISIONS.NONE,
    reasonCode:
      policy.reasonCode || null,
    ruleId:
      policy.ruleId || null,
    trigger:
      policy.trigger || null,
    threshold:
      Number.isInteger(policy.threshold)
        ? policy.threshold
        : null,
    observedRepairCount:
      Number.isInteger(
        policy.observedRepairCount
      )
        ? policy.observedRepairCount
        : 0,
    resolutionStatusAtDecision:
      resolutionStatusAtDecision ||
      policy.resolutionStatus ||
      null
  };
}

module.exports = {
  HANDOFF_DECISIONS,
  HANDOFF_REASON_CODES,
  HANDOFF_RULE_IDS,
  REPAIR_TRANSFER_THRESHOLD,
  normalizeText,
  detectExplicitHandoffReason,
  containsBillingScopeSignal,
  isClearlyOutOfBillingScope,
  buildRepairState,
  evaluatePreTurnHandoffPolicy,
  evaluatePostTurnHandoffPolicy,
  buildSafeHandoffPolicySnapshot
};
