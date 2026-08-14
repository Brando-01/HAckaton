const COMMERCIAL_SCHEMA_VERSION =
  'desafio1-commercial-policy-v1';

const COMMERCIAL_SCOPE =
  'SIMULATED_COMMERCIAL_LAYER';

const CROSS_SELL_STATUS = Object.freeze({
  OFFERED: 'OFFERED',
  SUPPRESSED: 'SUPPRESSED',
  NOT_ELIGIBLE: 'NOT_ELIGIBLE',
  DATA_UNAVAILABLE: 'DATA_UNAVAILABLE',
  NOT_EVALUATED: 'NOT_EVALUATED'
});

const BENEFIT_STATUS = Object.freeze({
  AVAILABLE: 'AVAILABLE',
  NONE: 'NONE',
  SUPPRESSED: 'SUPPRESSED'
});

// En estos momentos la prioridad es resolver/recuperar confianza,
// no introducir una propuesta comercial aunque la consulta ya esté resuelta.
const SENSITIVE_BILLING_SCENARIOS = new Set([
  'RECONNECTION',
  'SUSPENSION_ADJUSTMENT'
]);

const COMMERCIAL_FOLLOW_UP_PROMPT =
  'Cuéntame más sobre la opción comercial que me mostraste.';

function clone(value) {
  return value == null
    ? value
    : JSON.parse(JSON.stringify(value));
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function normalizeBool(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  return [
    'true',
    '1',
    'si',
    'yes'
  ].includes(normalizeText(value));
}

function roundMoney(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return 0;
  }

  const sign = number < 0 ? -1 : 1;
  return (
    sign *
    Math.round(
      (Math.abs(number) + Number.EPSILON) * 100
    ) /
    100
  );
}

function scenarioCodes(experience) {
  const result = new Set();

  for (const cause of experience?.comparison?.causes || []) {
    if (cause?.code) {
      result.add(String(cause.code).toUpperCase());
    }
  }

  for (const finding of experience?.findings || []) {
    if (finding?.code) {
      result.add(String(finding.code).toUpperCase());
    }
  }

  return result;
}

function publicOffer(offer) {
  if (!offer?.name) {
    return null;
  }

  const includedGb = Number(offer.includedGb);
  const savingsPct = Number(offer.savingsPct);

  return {
    name: String(offer.name),
    offerType: String(offer.offerType || ''),
    monthlyPrice: roundMoney(offer.monthlyPrice),
    includedGb:
      Number.isFinite(includedGb)
        ? includedGb
        : null,
    unlimitedData:
      Number.isFinite(includedGb) &&
      includedGb >= 9999,
    savingsPct:
      Number.isFinite(savingsPct) && savingsPct > 0
        ? savingsPct
        : null,
    simulatedCatalog: true
  };
}

function commercialGuards(extra = {}) {
  return {
    llmUsedForCommercialDecision: false,
    fallbackOfferInvented: false,
    benefitInvented: false,
    financialReasoningChanged: false,
    commercialDataScope:
      COMMERCIAL_SCOPE,
    ...extra
  };
}

function baseCrossSell(status, reasonCode) {
  return {
    status,
    reasonCode,
    offered: false,
    ruleId: null,
    offer: null,
    action: null,
    guards: commercialGuards()
  };
}

function baseBenefit(status, reasonCode) {
  return {
    status,
    reasonCode,
    available: false,
    existingBenefit: true,
    newAddition: false,
    title: null,
    description: null,
    amount: null,
    evidenceLevel: null,
    source: 'OFFICIAL_FINANCIAL_EXPERIENCE'
  };
}

function buildEffervescentReminder(
  experience,
  { alreadyShown = false } = {}
) {
  if (alreadyShown) {
    return baseBenefit(
      BENEFIT_STATUS.SUPPRESSED,
      'ALREADY_SHOWN_THIS_SESSION'
    );
  }

  const finding = (experience?.findings || [])
    .find(
      (candidate) =>
        candidate?.code === 'ACTIVE_DISCOUNT' &&
        candidate?.evidenceLevel === 'HIGH'
    );

  if (!finding) {
    return baseBenefit(
      BENEFIT_STATUS.NONE,
      'NO_VERIFIED_EXISTING_BENEFIT'
    );
  }

  const description = String(
    finding.description ||
    finding.title ||
    'Tienes un beneficio vigente aplicado en tu recibo.'
  ).trim();

  const amount = Number(
    finding.impact ?? finding.amount
  );

  return {
    ...baseBenefit(
      BENEFIT_STATUS.AVAILABLE,
      'VERIFIED_EXISTING_BENEFIT'
    ),
    available: true,
    title:
      'Ya cuentas con este beneficio',
    description,
    amount:
      Number.isFinite(amount)
        ? roundMoney(Math.abs(amount))
        : null,
    evidenceLevel: 'HIGH',
    ruleId:
      'EXISTING_ACTIVE_DISCOUNT_HIGH_ONLY'
  };
}

function isResolvedTurn(resolution) {
  return resolution?.status === 'RESOLVED';
}

function hasFinancialGuard(experience) {
  return (
    experience?.financialExplanation
      ?.safeguards
      ?.llmUsedForFinancialReasoning === false ||
    experience?.financialTrace
      ?.safeguards
      ?.llmUsedForFinancialReasoning === false
  );
}

function findOffer(catalog = [], offerId) {
  const id = String(offerId || '').trim();
  return catalog.find(
    (offer) => String(offer?.offerId || '') === id
  ) || null;
}

function sameOfferAlreadyContacted(
  campaigns = [],
  offerId
) {
  const id = String(offerId || '').trim();

  if (!id) {
    return null;
  }

  const match = campaigns.find(
    (campaign) =>
      String(campaign?.offerId || '').trim() === id &&
      [
        'aceptada',
        'rechazada',
        'pendiente'
      ].includes(normalizeText(campaign?.result))
  );

  if (!match) {
    return null;
  }

  return {
    result: normalizeText(match.result).toUpperCase(),
    date: match.date || null
  };
}

function selectMovistarTotalOffer(snapshot) {
  const profile = snapshot?.profile || {};

  if (
    !normalizeBool(profile.eligibleMovistarTotal) ||
    normalizeBool(profile.isMovistarTotal) ||
    !normalizeBool(profile.hasMobile) ||
    !normalizeBool(profile.hasHome)
  ) {
    return null;
  }

  const candidates = (snapshot.catalog || [])
    .filter(
      (offer) =>
        normalizeBool(offer.isMovistarTotal) ||
        normalizeText(offer.offerType) === 'movistar total'
    )
    .sort(
      (a, b) =>
        Number(a.monthlyPrice || 0) -
        Number(b.monthlyPrice || 0)
    );

  return candidates[0]
    ? {
        ruleId: 'MT_EXPLICIT_ELIGIBILITY',
        ruleScope: 'PROTOTYPE_EXPLICIT_DATA_RULE',
        offer: candidates[0],
        rationale:
          'El perfil comercial simulado marca elegibilidad explícita para Movistar Total y registra servicios móvil y hogar.'
      }
    : null;
}

function selectMobileUsageOffer(snapshot, experience) {
  const profile = snapshot?.profile || {};

  if (
    String(experience?.customer?.businessType || '')
      .trim()
      .toUpperCase() !== 'MOVIL' ||
    !normalizeBool(profile.hasMobile)
  ) {
    return null;
  }

  const current = findOffer(
    snapshot.catalog,
    profile.currentOfferId
  );

  if (
    !current ||
    normalizeText(current.offerType) !== 'plan movil'
  ) {
    return null;
  }

  const included = Number(current.includedGb);
  const usage = Number(profile.averageDataGb);

  if (
    !Number.isFinite(included) ||
    included <= 0 ||
    included >= 9999 ||
    !Number.isFinite(usage) ||
    usage < included * 0.9
  ) {
    return null;
  }

  const candidates = (snapshot.catalog || [])
    .filter((offer) => {
      if (normalizeText(offer.offerType) !== 'plan movil') {
        return false;
      }

      const candidateGb = Number(offer.includedGb);
      return (
        Number.isFinite(candidateGb) &&
        candidateGb > included
      );
    })
    .sort((a, b) => {
      const gbDiff = Number(a.includedGb) - Number(b.includedGb);
      return gbDiff ||
        Number(a.monthlyPrice || 0) -
        Number(b.monthlyPrice || 0);
    });

  return candidates[0]
    ? {
        ruleId: 'MOBILE_USAGE_NEAR_ALLOWANCE',
        ruleScope: 'PROTOTYPE_SIMPLIFIED_BUSINESS_RULE',
        offer: candidates[0],
        rationale:
          'El consumo promedio simulado alcanza al menos el 90% de los GB incluidos en el plan móvil comercial simulado.'
      }
    : null;
}

function evaluateCrossSell({
  resolution,
  experience,
  commercialSnapshot,
  alreadyShown = false,
  existingBenefitAvailable = false
} = {}) {
  if (!isResolvedTurn(resolution)) {
    return baseCrossSell(
      CROSS_SELL_STATUS.SUPPRESSED,
      'QUERY_NOT_RESOLVED'
    );
  }

  if (!hasFinancialGuard(experience)) {
    return baseCrossSell(
      CROSS_SELL_STATUS.SUPPRESSED,
      'FINANCIAL_GUARD_NOT_CONFIRMED'
    );
  }

  if (alreadyShown) {
    return baseCrossSell(
      CROSS_SELL_STATUS.SUPPRESSED,
      'ALREADY_SHOWN_THIS_SESSION'
    );
  }

  if (existingBenefitAvailable) {
    return baseCrossSell(
      CROSS_SELL_STATUS.SUPPRESSED,
      'EXISTING_BENEFIT_PRIORITY'
    );
  }

  const sensitive = [...scenarioCodes(experience)]
    .find(
      (code) =>
        SENSITIVE_BILLING_SCENARIOS.has(code)
    );

  if (sensitive) {
    return baseCrossSell(
      CROSS_SELL_STATUS.SUPPRESSED,
      `SENSITIVE_BILLING_MOMENT_${sensitive}`
    );
  }

  if (!commercialSnapshot?.profile) {
    return baseCrossSell(
      CROSS_SELL_STATUS.DATA_UNAVAILABLE,
      'COMMERCIAL_PROFILE_NOT_AVAILABLE'
    );
  }

  const candidate =
    selectMovistarTotalOffer(commercialSnapshot) ||
    selectMobileUsageOffer(
      commercialSnapshot,
      experience
    );

  if (!candidate?.offer) {
    return baseCrossSell(
      CROSS_SELL_STATUS.NOT_ELIGIBLE,
      'NO_EXPLICIT_COMPATIBLE_RULE'
    );
  }

  const priorContact =
    sameOfferAlreadyContacted(
      commercialSnapshot.campaigns,
      candidate.offer.offerId
    );

  if (priorContact) {
    return {
      ...baseCrossSell(
        CROSS_SELL_STATUS.SUPPRESSED,
        `SAME_OFFER_ALREADY_${priorContact.result}`
      ),
      ruleId: candidate.ruleId,
      guards: commercialGuards({
        previousCampaignDate:
          priorContact.date
      })
    };
  }

  const offer = publicOffer(candidate.offer);

  if (!offer) {
    return baseCrossSell(
      CROSS_SELL_STATUS.DATA_UNAVAILABLE,
      'CATALOG_OFFER_INVALID'
    );
  }

  return {
    status: CROSS_SELL_STATUS.OFFERED,
    reasonCode: 'EXPLICIT_RULE_MATCH',
    offered: true,
    ruleId: candidate.ruleId,
    ruleScope: candidate.ruleScope,
    rationale: candidate.rationale,
    offer,
    action: {
      id: 'LEARN_COMMERCIAL_OPTION',
      type: 'CHAT',
      label: 'Conocer esta opción',
      prompt: COMMERCIAL_FOLLOW_UP_PROMPT
    },
    guards: commercialGuards({
      eligibilityDerivedFrom:
        COMMERCIAL_SCOPE,
      officialBillingUsedOnlyForContext: true
    })
  };
}

function buildCommercialExperience({
  resolution,
  experience,
  commercialSnapshot = null,
  commercialOfferShown = false,
  effervescentBenefitShown = false,
  evaluateCrossSellNow = true,
  allowBenefitWithoutResolvedTurn = false
} = {}) {
  const existingBenefit =
    (
      allowBenefitWithoutResolvedTurn ||
      isResolvedTurn(resolution)
    )
      ? buildEffervescentReminder(
          experience,
          {
            alreadyShown:
              effervescentBenefitShown
          }
        )
      : baseBenefit(
          BENEFIT_STATUS.SUPPRESSED,
          'QUERY_NOT_RESOLVED'
        );

  const crossSell = evaluateCrossSellNow
    ? evaluateCrossSell({
        resolution,
        experience,
        commercialSnapshot,
        alreadyShown:
          commercialOfferShown,
        existingBenefitAvailable:
          existingBenefit.available
      })
    : baseCrossSell(
        CROSS_SELL_STATUS.NOT_EVALUATED,
        'REQUIRES_RESOLVED_CONVERSATION'
      );

  return {
    schemaVersion:
      COMMERCIAL_SCHEMA_VERSION,
    phase: 'PHASE_18',
    existingBenefit,
    crossSell,
    safeguards: {
      existingBenefitMustAlreadyExist: true,
      crossSellRequiresResolvedTurn: true,
      explicitRuleRequired: true,
      genericFallbackOfferAllowed: false,
      commercialLayerAffectsFinancialReasoning: false,
      llmUsedForCommercialDecision: false,
      commercialDataScope:
        COMMERCIAL_SCOPE
    }
  };
}

function isCommercialFollowUp(message) {
  const text = normalizeText(message);

  return (
    text === normalizeText(COMMERCIAL_FOLLOW_UP_PROMPT) ||
    text === 'cuentame mas sobre esa opcion' ||
    text === 'cuentame mas sobre la opcion comercial'
  );
}

function formatMoney(value) {
  return `S/ ${roundMoney(value).toFixed(2)}`;
}

function buildCommercialOfferReply(offer) {
  const safe = publicOffer(offer);

  if (!safe) {
    return (
      'La opción comercial anterior ya no está disponible en el contexto de esta sesión. ' +
      'Puedo seguir ayudándote con tu recibo.'
    );
  }

  const details = [];

  if (safe.unlimitedData) {
    details.push('datos ilimitados según el catálogo simulado');
  } else if (safe.includedGb > 0) {
    details.push(`${safe.includedGb} GB incluidos`);
  }

  if (safe.savingsPct) {
    details.push(`${safe.savingsPct}% de ahorro indicado en el catálogo simulado`);
  }

  return (
    `${safe.name} figura en el catálogo comercial simulado con un precio referencial de ${formatMoney(safe.monthlyPrice)} al mes` +
    `${details.length ? ` y ${details.join(', ')}` : ''}. ` +
    'Esta sugerencia no cambia tu servicio ni tu recibo. La disponibilidad y contratación deben confirmarse por un canal comercial antes de cualquier cambio.'
  );
}

module.exports = {
  COMMERCIAL_SCHEMA_VERSION,
  COMMERCIAL_SCOPE,
  CROSS_SELL_STATUS,
  BENEFIT_STATUS,
  SENSITIVE_BILLING_SCENARIOS,
  COMMERCIAL_FOLLOW_UP_PROMPT,
  normalizeBool,
  roundMoney,
  publicOffer,
  buildEffervescentReminder,
  evaluateCrossSell,
  buildCommercialExperience,
  isCommercialFollowUp,
  buildCommercialOfferReply
};
