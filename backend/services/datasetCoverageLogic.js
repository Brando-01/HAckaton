const {
  MONEY_EPSILON
} = require(
  './desafio1BillingLogic'
);

const {
  DEFAULT_SCENARIO_ORDER,
  scoreDemoCandidate
} = require(
  './desafio1DemoSelectionLogic'
);

const COVERAGE_SCHEMA_VERSION =
  'desafio1-dataset-coverage-v1';

const COVERAGE_PHASE =
  'PHASE_9';

const EVIDENCE_RANK =
  Object.freeze({
    LOW: 1,
    MEDIUM: 2,
    HIGH: 3
  });

const CONTEXT_ONLY_FINDINGS =
  new Set([
    'ADJUSTMENT_NOTE_CONTEXT'
  ]);

function normalizeInteger(
  value,
  fallback = 0
) {
  const parsed =
    Number.parseInt(
      value,
      10
    );

  return Number.isInteger(parsed)
    ? parsed
    : fallback;
}

function normalizeCoverageSeed(
  seed = {}
) {
  return {
    subscriberKey:
      String(
        seed.subscriberKey ?? ''
      ).trim() || null,
    customerKey:
      String(
        seed.customerKey ?? ''
      ).trim() || null,
    lobType:
      String(
        seed.lobType ?? ''
      ).trim() || null,
    businessType:
      String(
        seed.businessType ?? ''
      ).trim() || null,
    invoiceCount:
      Math.max(
        normalizeInteger(
          seed.invoiceCount,
          0
        ),
        0
      ),
    latestCycleDate:
      String(
        seed.latestCycleDate ?? ''
      ).trim() || null
  };
}

function getRecognizedItems(
  explanation
) {
  const causes = (
    explanation?.interpretation
      ?.causes || []
  ).filter(Boolean);

  const findings = (
    explanation?.interpretation
      ?.currentBillFindings || []
  ).filter(
    (finding) =>
      finding &&
      !CONTEXT_ONLY_FINDINGS.has(
        finding.code
      )
  );

  return {
    causes,
    findings,
    items: [
      ...causes,
      ...findings
    ]
  };
}

function getHighestEvidenceLevel(
  items = []
) {
  let best = null;
  let bestRank = 0;

  for (const item of items) {
    const level =
      String(
        item?.evidenceLevel ?? ''
      ).trim().toUpperCase();

    const rank =
      EVIDENCE_RANK[level] || 0;

    if (rank > bestRank) {
      best = level;
      bestRank = rank;
    }
  }

  return best;
}

function getScenarioCodes(
  explanation
) {
  const {
    causes,
    findings
  } = getRecognizedItems(
    explanation
  );

  return Array.from(
    new Set(
      [
        ...causes,
        ...findings
      ]
        .map(
          (item) =>
            String(
              item?.code ?? ''
            ).trim().toUpperCase()
        )
        .filter(Boolean)
    )
  );
}

function evaluatePremiumCandidate(
  explanation
) {
  let best = null;

  for (
    const scenario of
      DEFAULT_SCENARIO_ORDER
  ) {
    const scoring =
      scoreDemoCandidate(
        explanation,
        scenario
      );

    if (!scoring.eligible) {
      continue;
    }

    if (
      !best ||
      scoring.score > best.score
    ) {
      best = {
        scenario,
        score:
          scoring.score
      };
    }
  }

  return best;
}

function countIntegrityWarnings(
  explanation
) {
  return (
    explanation?.currentBill
      ?.integrityWarnings?.length || 0
  ) + (
    explanation?.previousBill
      ?.integrityWarnings?.length || 0
  );
}

function hasZeroResidual(
  explanation
) {
  const unexplained =
    Number(
      explanation?.interpretation
        ?.unexplainedAmount
    );

  return (
    Number.isFinite(unexplained) &&
    Math.abs(unexplained) <
      MONEY_EPSILON
  );
}

function resolveQualityTier({
  hasInvoices,
  consultable,
  comparable,
  explainable,
  highConfidence,
  demoPremium,
  analysisError
}) {
  if (!hasInvoices) {
    return 'NO_BILL';
  }

  if (analysisError) {
    return 'ANALYSIS_ERROR';
  }

  if (demoPremium) {
    return 'DEMO_PREMIUM';
  }

  if (highConfidence) {
    return 'HIGH_CONFIDENCE';
  }

  if (explainable) {
    return 'EXPLAINABLE';
  }

  if (comparable) {
    return 'COMPARABLE';
  }

  if (consultable) {
    return 'CONSULTABLE';
  }

  return 'ANALYSIS_ERROR';
}

function buildCoverageProfile({
  seed,
  explanation = null,
  error = null
}) {
  const normalizedSeed =
    normalizeCoverageSeed(seed);

  const hasInvoices =
    normalizedSeed.invoiceCount > 0;

  const analysisError =
    hasInvoices && Boolean(error);

  const currentTotal =
    Number(
      explanation?.currentBill?.total
    );

  const consultable = Boolean(
    hasInvoices &&
    explanation &&
    Number.isFinite(currentTotal)
  );

  const comparable = Boolean(
    consultable &&
    explanation?.previousBill &&
    explanation?.comparison
  );

  const recognized =
    getRecognizedItems(
      explanation
    );

  const explainable = Boolean(
    consultable &&
    recognized.items.length
  );

  const evidenceLevel =
    getHighestEvidenceLevel(
      recognized.items
    );

  const highConfidence = Boolean(
    explainable &&
    evidenceLevel === 'HIGH'
  );

  const premium =
    consultable
      ? evaluatePremiumCandidate(
          explanation
        )
      : null;

  const demoPremium =
    Boolean(premium);

  const status =
    explanation?.interpretation
      ?.status || null;

  const fullyExplained = Boolean(
    status === 'FULLY_EXPLAINED' &&
    hasZeroResidual(explanation)
  );

  const rentContext =
    explanation?.interpretation
      ?.rentContext?.current;

  const rentType =
    rentContext?.resolved
      ? rentContext.rentType || null
      : null;

  const scenarioCodes =
    getScenarioCodes(explanation);

  const primaryScenario =
    premium?.scenario ||
    scenarioCodes[0] ||
    null;

  const comparisonDifference =
    explanation?.comparison
      ?.difference;

  const previousTotal =
    explanation?.previousBill
      ?.total;

  const profile = {
    demoId: null,
    subscriberKey:
      normalizedSeed.subscriberKey,
    customerKey:
      normalizedSeed.customerKey,
    lobType:
      explanation?.subscriber
        ?.lobType ||
      normalizedSeed.lobType,
    businessType:
      explanation?.subscriber
        ?.businessType ||
      normalizedSeed.businessType,
    invoiceCount:
      normalizedSeed.invoiceCount,
    hasInvoices,
    consultable,
    comparable,
    explainable,
    highConfidence,
    fullyExplained,
    demoPremium,
    qualityTier: null,
    status,
    evidenceLevel,
    primaryScenario,
    scenarioCodes,
    premiumScore:
      premium?.score ?? null,
    coveragePercent:
      explanation?.interpretation
        ?.coveragePercent ?? null,
    currentTotal:
      Number.isFinite(currentTotal)
        ? currentTotal
        : null,
    previousTotal:
      Number.isFinite(
        Number(previousTotal)
      )
        ? Number(previousTotal)
        : null,
    difference:
      Number.isFinite(
        Number(comparisonDifference)
      )
        ? Number(comparisonDifference)
        : null,
    currentCycleDate:
      explanation?.currentBill
        ?.cycleDate ||
      normalizedSeed.latestCycleDate,
    previousCycleDate:
      explanation?.previousBill
        ?.cycleDate || null,
    rentType,
    integrityWarningCount:
      countIntegrityWarnings(
        explanation
      ),
    errorCode:
      error?.code ||
      (error ? 'ANALYSIS_ERROR' : null)
  };

  profile.qualityTier =
    resolveQualityTier({
      hasInvoices,
      consultable,
      comparable,
      explainable,
      highConfidence,
      demoPremium,
      analysisError
    });

  return profile;
}

function assignDemoIds(
  profiles
) {
  let sequence = 0;

  return (
    profiles || []
  ).map(
    (profile) => {
      if (!profile.consultable) {
        return {
          ...profile,
          demoId: null
        };
      }

      sequence += 1;

      return {
        ...profile,
        demoId:
          `DEMO${String(sequence)
            .padStart(6, '0')}`
      };
    }
  );
}

function percentage(
  numerator,
  denominator
) {
  if (!denominator) {
    return 0;
  }

  return Number(
    (
      (numerator / denominator) *
      100
    ).toFixed(2)
  );
}

function incrementCounter(
  target,
  key
) {
  if (!key) {
    return;
  }

  target[key] =
    (target[key] || 0) + 1;
}

function buildCoverageSummary(
  profiles,
  {
    totalAvailable = null,
    generatedAt = null
  } = {}
) {
  const rows =
    profiles || [];

  const counts = {
    scanned: rows.length,
    hasInvoices: 0,
    consultable: 0,
    comparable: 0,
    explainable: 0,
    highConfidence: 0,
    fullyExplained: 0,
    demoPremium: 0,
    noBills: 0,
    analysisErrors: 0,
    rentResolved: 0
  };

  const statuses = {};
  const scenarios = {};
  const tiers = {};

  for (const profile of rows) {
    if (profile.hasInvoices) {
      counts.hasInvoices += 1;
    } else {
      counts.noBills += 1;
    }

    if (profile.consultable) {
      counts.consultable += 1;
    }

    if (profile.comparable) {
      counts.comparable += 1;
    }

    if (profile.explainable) {
      counts.explainable += 1;
    }

    if (profile.highConfidence) {
      counts.highConfidence += 1;
    }

    if (profile.fullyExplained) {
      counts.fullyExplained += 1;
    }

    if (profile.demoPremium) {
      counts.demoPremium += 1;
    }

    if (profile.errorCode) {
      counts.analysisErrors += 1;
    }

    if (profile.rentType) {
      counts.rentResolved += 1;
    }

    incrementCounter(
      statuses,
      profile.status
    );

    incrementCounter(
      tiers,
      profile.qualityTier
    );

    for (
      const scenario of
        profile.scenarioCodes || []
    ) {
      incrementCounter(
        scenarios,
        scenario
      );
    }
  }

  const available =
    Number.isInteger(totalAvailable)
      ? totalAvailable
      : rows.length;

  return {
    schemaVersion:
      COVERAGE_SCHEMA_VERSION,
    phase:
      COVERAGE_PHASE,
    generatedAt:
      generatedAt ||
      new Date().toISOString(),
    scope: {
      totalAvailable: available,
      scanned: rows.length,
      limited:
        rows.length < available
    },
    counts,
    percentages: {
      hasInvoicesOfScanned:
        percentage(
          counts.hasInvoices,
          rows.length
        ),
      consultableOfScanned:
        percentage(
          counts.consultable,
          rows.length
        ),
      comparableOfConsultable:
        percentage(
          counts.comparable,
          counts.consultable
        ),
      explainableOfConsultable:
        percentage(
          counts.explainable,
          counts.consultable
        ),
      highConfidenceOfConsultable:
        percentage(
          counts.highConfidence,
          counts.consultable
        ),
      premiumOfConsultable:
        percentage(
          counts.demoPremium,
          counts.consultable
        )
    },
    statuses,
    scenarios,
    tiers
  };
}

module.exports = {
  COVERAGE_SCHEMA_VERSION,
  COVERAGE_PHASE,
  normalizeCoverageSeed,
  getRecognizedItems,
  getHighestEvidenceLevel,
  getScenarioCodes,
  evaluatePremiumCandidate,
  resolveQualityTier,
  buildCoverageProfile,
  assignDemoIds,
  buildCoverageSummary,
  percentage
};
