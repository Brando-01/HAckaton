const {
  sanitizeInternalTerms
} = require(
  './desafio1CustomerPresentation'
);

const SAFE_BILLING_INTENTS = new Set([
  'CURRENT_TOTAL',
  'PREVIOUS_BILL',
  'BILL_HISTORY',
  'HIGHEST_BILL',
  'LATEST_INCREASE',
  'CHARGE_RECURRENCE',
  'PRORATION',
  'DISCOUNT',
  'PACKAGE_CHARGE',
  'SUSPENSION_ADJUSTMENT',
  'RENT_TYPE',
  'EXPLANATION'
]);

const SAFE_PROFILE_INTENTS = new Set([
  'PROFILE_SUMMARY',
  'CUSTOMER_ID',
  'ACTIVATION_DATE',
  'BILLING_CYCLE',
  'SERVICE_TYPE',
  'BUSINESS_TYPE',
  'CURRENT_PLAN',
  'DEBT_STATUS',
  'CURRENT_CHARGES',
  'RECONNECTION_STATUS',
  'DATA_ORIGIN'
]);

const SAFE_DOMAINS = new Set([
  'BILLING',
  'PROFILE',
  'COMPOSITE',
  'GENERAL',
  'UNKNOWN'
]);

const CONVERSATIONAL_GROUNDING_POLICY =
  Object.freeze({
    financialReasoningAuthority:
      'STRUCTURED_DATA_AND_DETERMINISTIC_RULES',
    llmMayClassifyIntent: true,
    llmMayNaturalizeLanguage: true,
    llmMayCreateFinancialFacts: false,
    explicitInvoiceReferencesValidatedAgainstAuthenticatedHistory:
      true,
    explicitBillingPeriodsValidatedAgainstAuthenticatedHistory:
      true,
    groundedDetailFollowUpsReuseLastFinancialSubject:
      true,
    customerReferenceCannotSwitchAuthenticatedIdentity:
      true,
    deterministicFallbackRequired:
      true,
    benchmarkMayDisableLanguageLlm:
      true
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

function hasUsableGroqApiKey(value) {
  const key =
    String(value ?? '').trim();

  if (!key) {
    return false;
  }

  const lowered = key.toLowerCase();

  return !(
    lowered.includes('placeholder') ||
    lowered.includes('tu_clave') ||
    lowered.includes('your_key') ||
    lowered.includes('example') ||
    lowered === 'test' ||
    lowered.startsWith('gsk_test_')
  );
}

function parseJsonObject(value) {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value)
  ) {
    return value;
  }

  const raw = String(value ?? '').trim();

  if (!raw) {
    return null;
  }

  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(cleaned);
    return parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed)
      ? parsed
      : null;
  } catch (_) {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');

    if (
      start < 0 ||
      end <= start
    ) {
      return null;
    }

    try {
      const parsed = JSON.parse(
        cleaned.slice(start, end + 1)
      );
      return parsed &&
        typeof parsed === 'object' &&
        !Array.isArray(parsed)
        ? parsed
        : null;
    } catch (_) {
      return null;
    }
  }
}

function normalizeIntentList(
  values,
  allowed
) {
  return Array.from(
    new Set(
      (Array.isArray(values)
        ? values
        : [])
        .map(
          (value) =>
            String(value ?? '')
              .trim()
              .toUpperCase()
        )
        .filter(
          (value) =>
            allowed.has(value)
        )
    )
  );
}

function sanitizeSemanticInterpretation(
  raw
) {
  const parsed = parseJsonObject(raw);

  if (!parsed) {
    return null;
  }

  const billingIntents =
    normalizeIntentList(
      parsed.billingIntents,
      SAFE_BILLING_INTENTS
    );

  const profileIntents =
    normalizeIntentList(
      parsed.profileIntents,
      SAFE_PROFILE_INTENTS
    );

  const confidenceValue =
    Number(parsed.confidence);

  const confidence =
    Number.isFinite(confidenceValue)
      ? Math.min(
          1,
          Math.max(0, confidenceValue)
        )
      : 0;

  let domain =
    String(parsed.domain ?? '')
      .trim()
      .toUpperCase();

  if (!SAFE_DOMAINS.has(domain)) {
    domain = 'UNKNOWN';
  }

  if (
    billingIntents.length &&
    profileIntents.length
  ) {
    domain = 'COMPOSITE';
  } else if (billingIntents.length) {
    domain = 'BILLING';
  } else if (profileIntents.length) {
    domain = 'PROFILE';
  }

  return {
    domain,
    billingIntents,
    profileIntents,
    confidence
  };
}

function shouldAttemptSemanticInterpretation(
  message,
  deterministicPlan,
  {
    authenticated = false
  } = {}
) {
  if (
    deterministicPlan?.intentCount > 0 ||
    deterministicPlan?.repair
  ) {
    return false;
  }

  const text = normalizeText(message);

  if (!text || text.length < 4) {
    return false;
  }

  const conversationalSignals = [
    'mi ',
    'mis ',
    'me ',
    'pago',
    'pagando',
    'cobran',
    'cobrando',
    'recibo',
    'factura',
    'deuda',
    'saldo',
    'monto',
    'cargo',
    'plan',
    'servicio',
    'cliente',
    'cuenta',
    'renta',
    'descuento',
    'promocion'
  ];

  const hasSignal =
    conversationalSignals.some(
      (signal) =>
        text.includes(signal.trim())
    );

  if (!hasSignal) {
    return false;
  }

  const personalGrammar =
    /(^| )(yo|me|mi|mis|tengo|estoy)( |$)/
      .test(text);

  const personalQuestion =
    /(^| )(cuanto|cual|dime|revisa|explica|explicame|por que)( |$)/
      .test(text) &&
    [
      'recibo',
      'factura',
      'pago',
      'pagando',
      'cobran',
      'cobrando',
      'saldo',
      'deuda',
      'monto',
      'cargo'
    ].some(
      (signal) =>
        text.includes(signal)
    );

  return personalGrammar ||
    (authenticated && personalQuestion);
}

function mergeConversationPlanWithAi(
  plan,
  interpretation,
  {
    minimumConfidence = 0.78
  } = {}
) {
  if (
    !plan ||
    plan.intentCount > 0 ||
    !interpretation ||
    Number(interpretation.confidence) <
      minimumConfidence
  ) {
    return {
      plan,
      applied: false
    };
  }

  const profileIntents =
    normalizeIntentList(
      interpretation.profileIntents,
      SAFE_PROFILE_INTENTS
    );

  const billingIntents =
    normalizeIntentList(
      interpretation.billingIntents,
      SAFE_BILLING_INTENTS
    );

  const intentCount =
    profileIntents.length +
    billingIntents.length;

  if (!intentCount) {
    return {
      plan,
      applied: false
    };
  }

  const domain =
    profileIntents.length &&
    billingIntents.length
      ? 'COMPOSITE'
      : profileIntents.length
        ? 'PROFILE'
        : 'BILLING';

  return {
    applied: true,
    plan: {
      ...plan,
      profileIntents,
      billingIntents,
      domain,
      intentCount,
      isComposite:
        intentCount > 1,
      needsProfile:
        profileIntents.length > 0,
      needsBilling:
        billingIntents.length > 0,
      semanticInterpretation: {
        source:
          'GROQ_INTENT_ONLY',
        confidence:
          interpretation.confidence
      }
    }
  };
}

function extractProtectedClaims(value) {
  const text = String(value ?? '');

  const money = Array.from(
    text.matchAll(
      /S\/\s*-?\s*\d+(?:[.,]\d{1,2})?/gi
    ),
    (match) =>
      match[0]
        .replace(/\s+/g, '')
        .replace(',', '.')
        .toUpperCase()
  );

  const percentages = Array.from(
    text.matchAll(
      /\b\d+(?:[.,]\d+)?\s*%/g
    ),
    (match) =>
      match[0]
        .replace(/\s+/g, '')
        .replace(',', '.')
  );

  const dates = Array.from(
    text.matchAll(
      /\b\d{1,2}\/\d{1,2}\/\d{4}\b/g
    ),
    (match) => match[0]
  );

  const invoiceReferences = Array.from(
    text.matchAll(
      /\b[A-Z0-9]{2,8}-\d{6,14}\b/gi
    ),
    (match) =>
      match[0].toUpperCase()
  );

  const numbers = Array.from(
    text.matchAll(
      /\b\d+(?:[.,]\d+)?\b/g
    ),
    (match) =>
      match[0].replace(',', '.')
  );

  return {
    money,
    percentages,
    dates,
    invoiceReferences,
    numbers
  };
}

function sameMultisetSubset(
  candidate = [],
  allowed = []
) {
  const counts = new Map();

  for (const value of allowed) {
    counts.set(
      value,
      (counts.get(value) || 0) + 1
    );
  }

  for (const value of candidate) {
    const remaining =
      counts.get(value) || 0;

    if (remaining <= 0) {
      return false;
    }

    counts.set(
      value,
      remaining - 1
    );
  }

  return true;
}

function allRequiredPresent(
  required = [],
  candidate = []
) {
  return new Set(required)
    .size === 0 ||
    Array.from(new Set(required))
      .every(
        (value) =>
          candidate.includes(value)
      );
}

function validateNaturalizedReply({
  baseReply,
  candidateReply
}) {
  const base =
    String(baseReply ?? '').trim();
  const candidate =
    sanitizeInternalTerms(
      String(candidateReply ?? '').trim()
    );

  if (
    !base ||
    !candidate ||
    candidate.length > 1600
  ) {
    return {
      ok: false,
      reasonCode:
        'EMPTY_OR_OVERSIZED_REPLY',
      reply: base
    };
  }

  const allowed =
    extractProtectedClaims(base);
  const observed =
    extractProtectedClaims(candidate);

  const categories = [
    'money',
    'percentages',
    'dates',
    'invoiceReferences',
    'numbers'
  ];

  for (const category of categories) {
    if (
      !sameMultisetSubset(
        observed[category],
        allowed[category]
      ) ||
      !allRequiredPresent(
        allowed[category],
        observed[category]
      )
    ) {
      return {
        ok: false,
        reasonCode:
          `PROTECTED_${category.toUpperCase()}_MISMATCH`,
        reply: base
      };
    }
  }

  return {
    ok: true,
    reasonCode: 'OK',
    reply: candidate
  };
}

function getConversationalGroundingPolicy() {
  return {
    ...CONVERSATIONAL_GROUNDING_POLICY
  };
}

module.exports = {
  SAFE_BILLING_INTENTS,
  SAFE_PROFILE_INTENTS,
  CONVERSATIONAL_GROUNDING_POLICY,
  normalizeText,
  hasUsableGroqApiKey,
  parseJsonObject,
  sanitizeSemanticInterpretation,
  shouldAttemptSemanticInterpretation,
  mergeConversationPlanWithAi,
  extractProtectedClaims,
  validateNaturalizedReply,
  getConversationalGroundingPolicy
};
