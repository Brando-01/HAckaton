const EXPLORER_SCHEMA_VERSION =
  'desafio1-dataset-explorer-v1';

const SCENARIO_LABELS =
  Object.freeze({
    RECONNECTION:
      'Reconexión',
    ACTIVE_DISCOUNT:
      'Descuento vigente',
    PRORATION:
      'Prorrateo',
    DISCOUNT_ENDED:
      'Fin de descuento/promoción',
    DISCOUNT_REMOVED:
      'Descuento retirado',
    PLAN_CHANGE:
      'Cambio de plan',
    PACKAGES:
      'Paquetes adicionales'
  });

const CAPABILITIES =
  new Set([
    'ALL',
    'COMPARABLE',
    'EXPLAINABLE',
    'HIGH',
    'PREMIUM',
    'UNEXPLAINED'
  ]);

const SORTS =
  new Set([
    'DEMO_ASC',
    'PREMIUM_FIRST',
    'COVERAGE_DESC',
    'INVOICES_DESC'
  ]);

const RENT_TYPES =
  new Set([
    'ALL',
    'RA',
    'RV'
  ]);

const QUALITY_TIERS =
  new Set([
    'ALL',
    'CONSULTABLE',
    'COMPARABLE',
    'EXPLAINABLE',
    'HIGH_CONFIDENCE',
    'DEMO_PREMIUM'
  ]);

function normalizeUpper(
  value,
  fallback
) {
  const normalized =
    String(value || '')
      .trim()
      .toUpperCase();

  return normalized || fallback;
}

function normalizePositiveInteger(
  value,
  fallback,
  max
) {
  const parsed =
    Number.parseInt(
      value,
      10
    );

  if (
    !Number.isInteger(parsed) ||
    parsed <= 0
  ) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function normalizeExplorerQuery(
  raw = {}
) {
  const capability =
    normalizeUpper(
      raw.capability,
      'ALL'
    );

  const sort =
    normalizeUpper(
      raw.sort,
      'DEMO_ASC'
    );

  const rentType =
    normalizeUpper(
      raw.rentType,
      'ALL'
    );

  const qualityTier =
    normalizeUpper(
      raw.qualityTier,
      'ALL'
    );

  const scenario =
    normalizeUpper(
      raw.scenario,
      'ALL'
    );

  return {
    search:
      String(raw.search || '')
        .trim()
        .slice(0, 60),
    capability:
      CAPABILITIES.has(capability)
        ? capability
        : 'ALL',
    scenario:
      scenario === 'ALL' ||
      Object.hasOwn(
        SCENARIO_LABELS,
        scenario
      )
        ? scenario
        : 'ALL',
    rentType:
      RENT_TYPES.has(rentType)
        ? rentType
        : 'ALL',
    qualityTier:
      QUALITY_TIERS.has(qualityTier)
        ? qualityTier
        : 'ALL',
    sort:
      SORTS.has(sort)
        ? sort
        : 'DEMO_ASC',
    page:
      normalizePositiveInteger(
        raw.page,
        1,
        100000
      ),
    pageSize:
      normalizePositiveInteger(
        raw.pageSize,
        24,
        60
      )
  };
}

function getScenarioLabel(
  scenario
) {
  if (!scenario) {
    return 'Sin causa reconocida';
  }

  return (
    SCENARIO_LABELS[scenario] ||
    scenario
  );
}

function buildExplorerAuthUser(
  profile
) {
  const demoId =
    String(
      profile?.demoId || ''
    ).trim().toUpperCase();

  if (!/^DEMO\d{6}$/.test(demoId)) {
    throw new Error(
      'El perfil del explorador no tiene un alias DEMO válido.'
    );
  }

  return {
    userId:
      `EXP_${demoId}`,
    customerId:
      `EXP_${demoId}`,
    name:
      `Cliente ${demoId}`,
    email: null,
    mode: 'EXPLORER',
    explorerDemoId:
      demoId
  };
}

function buildExplorerBinding(
  profile
) {
  const scenario =
    profile?.primaryScenario ||
    null;

  return {
    scenario,
    scenarioLabel:
      getScenarioLabel(scenario)
  };
}

function toSafeExplorerProfile(
  profile
) {
  if (!profile) {
    return null;
  }

  return {
    demoId:
      profile.demoId,
    lobType:
      profile.lobType || null,
    businessType:
      profile.businessType || null,
    invoiceCount:
      Number(profile.invoiceCount || 0),
    comparable:
      Boolean(profile.comparable),
    explainable:
      Boolean(profile.explainable),
    highConfidence:
      Boolean(profile.highConfidence),
    fullyExplained:
      Boolean(profile.fullyExplained),
    demoPremium:
      Boolean(profile.demoPremium),
    qualityTier:
      profile.qualityTier || null,
    status:
      profile.status || null,
    evidenceLevel:
      profile.evidenceLevel || null,
    primaryScenario:
      profile.primaryScenario || null,
    primaryScenarioLabel:
      getScenarioLabel(
        profile.primaryScenario
      ),
    scenarioCodes:
      Array.isArray(
        profile.scenarioCodes
      )
        ? [...profile.scenarioCodes]
        : [],
    premiumScore:
      profile.premiumScore ?? null,
    coveragePercent:
      profile.coveragePercent ?? null,
    currentCycleDate:
      profile.currentCycleDate || null,
    previousCycleDate:
      profile.previousCycleDate || null,
    rentType:
      profile.rentType || null,
    integrityWarningCount:
      Number(
        profile.integrityWarningCount || 0
      ),
    differenceDirection:
      profile.differenceDirection || null
  };
}

function buildExplorerSummary(
  meta
) {
  const summary =
    meta?.summary || {};

  return {
    schemaVersion:
      EXPLORER_SCHEMA_VERSION,
    generatedAt:
      meta?.generatedAt || null,
    fullDataset:
      summary?.scope?.limited === false,
    scope: {
      totalAvailable:
        Number(
          summary?.scope
            ?.totalAvailable || 0
        ),
      scanned:
        Number(
          summary?.scope?.scanned || 0
        )
    },
    counts: {
      consultable:
        Number(
          summary?.counts
            ?.consultable || 0
        ),
      comparable:
        Number(
          summary?.counts
            ?.comparable || 0
        ),
      explainable:
        Number(
          summary?.counts
            ?.explainable || 0
        ),
      highConfidence:
        Number(
          summary?.counts
            ?.highConfidence || 0
        ),
      demoPremium:
        Number(
          summary?.counts
            ?.demoPremium || 0
        ),
      noBills:
        Number(
          summary?.counts
            ?.noBills || 0
        ),
      analysisErrors:
        Number(
          summary?.counts
            ?.analysisErrors || 0
        )
    },
    percentages: {
      consultableOfScanned:
        Number(
          summary?.percentages
            ?.consultableOfScanned || 0
        ),
      comparableOfConsultable:
        Number(
          summary?.percentages
            ?.comparableOfConsultable || 0
        ),
      explainableOfConsultable:
        Number(
          summary?.percentages
            ?.explainableOfConsultable || 0
        ),
      highConfidenceOfConsultable:
        Number(
          summary?.percentages
            ?.highConfidenceOfConsultable || 0
        ),
      premiumOfConsultable:
        Number(
          summary?.percentages
            ?.premiumOfConsultable || 0
        )
    },
    scenarios: {
      ...(summary.scenarios || {})
    },
    safeguards: {
      publicListUsesSyntheticAliasesOnly:
        true,
      officialIdentifiersExposed:
        false,
      explorerCreatesPermanentAccounts:
        false,
      financialDetailsRequireTemporarySession:
        true
    }
  };
}

module.exports = {
  EXPLORER_SCHEMA_VERSION,
  SCENARIO_LABELS,
  normalizeExplorerQuery,
  getScenarioLabel,
  buildExplorerAuthUser,
  buildExplorerBinding,
  toSafeExplorerProfile,
  buildExplorerSummary
};
