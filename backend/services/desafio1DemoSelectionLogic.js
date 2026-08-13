const {
  MONEY_EPSILON,
  roundMoney
} = require(
  './desafio1BillingLogic'
);

const PHASE4_SELECTION_VERSION =
  'desafio1-phase4-selection-v1';

const DEMO_SCENARIOS = Object.freeze({
  RECONNECTION: {
    code: 'RECONNECTION',
    label: 'Reconexión',
    source: 'CAUSE'
  },
  DISCOUNT_ENDED: {
    code: 'DISCOUNT_ENDED',
    label: 'Fin de descuento/promoción',
    source: 'CAUSE'
  },
  PLAN_CHANGE: {
    code: 'PLAN_CHANGE',
    label: 'Cambio de plan',
    source: 'CAUSE'
  },
  PRORATION: {
    code: 'PRORATION',
    label: 'Prorrateo',
    source: 'CAUSE_OR_FINDING'
  }
});

const DEFAULT_SCENARIO_ORDER =
  Object.freeze([
    'RECONNECTION',
    'DISCOUNT_ENDED',
    'PLAN_CHANGE',
    'PRORATION'
  ]);

function normalizeScenarioCode(value) {
  const normalized = String(
    value ?? ''
  )
    .trim()
    .toUpperCase()
    .replace(/[ -]+/g, '_');

  return DEMO_SCENARIOS[normalized]
    ? normalized
    : null;
}

function getVisibleChargeChanges(
  explanation
) {
  return (
    explanation?.comparison
      ?.chargeChanges || []
  ).filter(
    (change) =>
      !change.ignoreForExplanation
  );
}

function getScenarioMatches(
  explanation,
  scenarioCode
) {
  const scenario =
    normalizeScenarioCode(
      scenarioCode
    );

  if (!scenario) {
    return {
      scenario: null,
      causes: [],
      findings: [],
      matches: []
    };
  }

  const causes = (
    explanation?.interpretation
      ?.causes || []
  ).filter(
    (cause) =>
      cause.code === scenario
  );

  const findings =
    scenario === 'PRORATION'
      ? (
          explanation
            ?.interpretation
            ?.currentBillFindings || []
        ).filter(
          (finding) =>
            finding.code ===
            'PRORATION'
        )
      : [];

  return {
    scenario,
    causes,
    findings,
    matches: [
      ...causes.map(
        (item) => ({
          kind: 'CAUSE',
          item
        })
      ),
      ...findings.map(
        (item) => ({
          kind: 'FINDING',
          item
        })
      )
    ]
  };
}

function hasHighEvidence(
  matches
) {
  return matches.some(
    ({ item }) =>
      item?.evidenceLevel ===
      'HIGH'
  );
}

function getIntegrityWarningCount(
  explanation
) {
  const current =
    explanation?.currentBill
      ?.integrityWarnings || [];

  const previous =
    explanation?.previousBill
      ?.integrityWarnings || [];

  return (
    current.length +
    previous.length
  );
}

function getUnmatchedProrationCount(
  explanation
) {
  return (
    explanation?.interpretation
      ?.diagnostics
      ?.unmatchedProrationEvidence ||
    []
  ).length;
}

function daysBetweenDates(
  startValue,
  endValue
) {
  const start = String(
    startValue ?? ''
  ).match(
    /^(\d{4})-(\d{2})-(\d{2})/
  );

  const end = String(
    endValue ?? ''
  ).match(
    /^(\d{4})-(\d{2})-(\d{2})/
  );

  if (!start || !end) {
    return null;
  }

  const startMs = Date.UTC(
    Number(start[1]),
    Number(start[2]) - 1,
    Number(start[3])
  );

  const endMs = Date.UTC(
    Number(end[1]),
    Number(end[2]) - 1,
    Number(end[3])
  );

  if (endMs < startMs) {
    return null;
  }

  return Math.round(
    (endMs - startMs) /
    86400000
  ) + 1;
}

function getRelevantSupportScore({
  scenario,
  matches,
  explanation
}) {
  if (!matches.length) {
    return {
      points: 0,
      notes: []
    };
  }

  const notes = [];
  let points = 0;

  if (scenario === 'RECONNECTION') {
    const cause =
      matches.find(
        (match) =>
          match.kind === 'CAUSE'
      )?.item;

    const orders =
      cause?.evidence?.orders || [];

    if (orders.length >= 2) {
      points += 5;
      notes.push(
        'La reconexión tiene al menos dos órdenes de soporte entre ciclos.'
      );
    } else if (orders.length === 1) {
      points += 3;
      notes.push(
        'La reconexión tiene una orden de soporte entre ciclos.'
      );
    }
  }

  if (scenario === 'DISCOUNT_ENDED') {
    const cause =
      matches.find(
        (match) =>
          match.kind === 'CAUSE'
      )?.item;

    if (
      cause?.evidence
        ?.finalInstallment ||
      cause?.evidence
        ?.endReached
    ) {
      points += 5;
      notes.push(
        'Brainy respalda que la promoción alcanzó su tramo final o fecha de término.'
      );
    }
  }

  if (scenario === 'PLAN_CHANGE') {
    const cause =
      matches.find(
        (match) =>
          match.kind === 'CAUSE'
      )?.item;

    const orders =
      cause?.evidence?.orders || [];
    const oldPlans =
      cause?.evidence?.oldPlans || [];
    const newPlans =
      cause?.evidence?.newPlans || [];

    if (
      orders.length &&
      oldPlans.length &&
      newPlans.length
    ) {
      points += 5;
      notes.push(
        'El cambio de plan conserva orden explícita y transición entre plan anterior y nuevo.'
      );
    }
  }

  if (scenario === 'PRORATION') {
    const finding =
      matches.find(
        (match) =>
          match.item?.code ===
            'PRORATION'
      )?.item;

    if (
      finding?.periodStartDate &&
      finding?.periodEndDate
    ) {
      points += 3;
      notes.push(
        'El prorrateo tiene inicio y fin de período disponibles.'
      );
    }

    if (finding?.rentType) {
      points += 2;
      notes.push(
        `El prorrateo tiene tipo de renta ${finding.rentType} respaldado.`
      );
    }
  }

  const rent =
    explanation?.interpretation
      ?.rentContext?.current;

  if (
    scenario !== 'PRORATION' &&
    rent?.resolved
  ) {
    points += 2;
    notes.push(
      `El recibo tiene tipo de renta ${rent.rentType} resuelto.`
    );
  }

  return {
    points: Math.min(points, 5),
    notes
  };
}

function scoreDemoCandidate(
  explanation,
  scenarioCode
) {
  const scenario =
    normalizeScenarioCode(
      scenarioCode
    );

  if (!scenario) {
    return {
      eligible: false,
      scenario: null,
      score: 0,
      reasons: [],
      disqualifiers: [
        'Escenario de demo no reconocido.'
      ],
      breakdown: {}
    };
  }

  const {
    causes,
    findings,
    matches
  } = getScenarioMatches(
    explanation,
    scenario
  );

  const status =
    explanation?.interpretation
      ?.status || null;

  const coverage = Number(
    explanation?.interpretation
      ?.coveragePercent
  );

  const unexplainedAmount =
    explanation?.interpretation
      ?.unexplainedAmount;

  const visibleChanges =
    getVisibleChargeChanges(
      explanation
    );

  const allCauses =
    explanation?.interpretation
      ?.causes || [];

  const allFindings =
    explanation?.interpretation
      ?.currentBillFindings || [];

  const highEvidence =
    hasHighEvidence(matches);

  const prorationWithoutPrevious =
    scenario === 'PRORATION' &&
    status === 'NO_PREVIOUS_BILL' &&
    findings.some(
      (finding) =>
        finding.evidenceLevel ===
        'HIGH'
    );

  const fullyExplainedScenario =
    status === 'FULLY_EXPLAINED' &&
    causes.some(
      (cause) =>
        cause.code === scenario &&
        cause.evidenceLevel ===
          'HIGH'
    ) &&
    (
      !Number.isFinite(
        Number(unexplainedAmount)
      ) ||
      Math.abs(
        Number(unexplainedAmount)
      ) < MONEY_EPSILON
    );

  const currentTotal = Number(
    explanation?.currentBill
      ?.total
  );

  const financiallyPresentable =
    Number.isFinite(currentTotal) &&
    currentTotal > MONEY_EPSILON;

  const eligible =
    highEvidence &&
    (
      fullyExplainedScenario ||
      prorationWithoutPrevious
    ) &&
    financiallyPresentable;

  const disqualifiers = [];

  if (!matches.length) {
    disqualifiers.push(
      `La explicación no contiene el escenario ${scenario}.`
    );
  }

  if (
    matches.length &&
    !highEvidence
  ) {
    disqualifiers.push(
      'El escenario no alcanza evidencia HIGH.'
    );
  }

  if (
    matches.length &&
    !(
      fullyExplainedScenario ||
      prorationWithoutPrevious
    )
  ) {
    disqualifiers.push(
      'El caso no queda completamente conciliado para demo, salvo el caso especial de primer recibo con prorrateo.'
    );
  }

  if (!financiallyPresentable) {
    disqualifiers.push(
      'El total del recibo actual no es positivo; se evita recomendarlo para una demo principal aunque la evidencia técnica sea válida.'
    );
  }

  const reasons = [];

  let grounding = 0;
  if (highEvidence) {
    grounding = 35;
    reasons.push(
      'La causa/hallazgo objetivo tiene evidencia HIGH.'
    );
  } else if (matches.length) {
    grounding = 15;
  }

  let financialConsistency = 0;

  if (fullyExplainedScenario) {
    financialConsistency = 25;
    reasons.push(
      'La variación queda completamente explicada sin residual financiero.'
    );
  } else if (
    prorationWithoutPrevious
  ) {
    financialConsistency = 25;
    reasons.push(
      'Es un primer recibo: el prorrateo se verifica sin inventar una comparación mensual.'
    );
  } else if (
    status ===
      'PARTIALLY_EXPLAINED' &&
    Number.isFinite(coverage)
  ) {
    financialConsistency =
      Math.round(
        Math.max(
          0,
          Math.min(
            20,
            coverage / 5
          )
        )
      );
  }

  let clarity = 0;

  if (scenario === 'PRORATION') {
    const primaryProration =
      findings[0] || null;

    if (
      findings.length === 1 &&
      allFindings.length <= 2
    ) {
      clarity += 10;
      reasons.push(
        'El prorrateo aparece como hallazgo principal y el recibo tiene poco ruido explicativo.'
      );
    } else if (findings.length) {
      clarity += 6;
    }

    const periodDays =
      daysBetweenDates(
        primaryProration
          ?.periodStartDate,
        primaryProration
          ?.periodEndDate
      );

    if (
      periodDays !== null &&
      periodDays >= 2 &&
      periodDays <= 25
    ) {
      clarity += 5;
      reasons.push(
        `El período prorrateado es claramente parcial (${periodDays} días).`
      );
    } else if (
      periodDays !== null &&
      periodDays > 0 &&
      periodDays <= 27
    ) {
      clarity += 3;
    } else if (periodDays !== null) {
      clarity += 1;
    }

    const prorationAmount =
      Number(
        primaryProration?.amount
      );

    const prorationRatio =
      financiallyPresentable &&
      Number.isFinite(
        prorationAmount
      )
        ? prorationAmount /
          currentTotal
        : null;

    if (
      prorationRatio !== null &&
      prorationRatio >= 0.1 &&
      prorationRatio <= 0.8
    ) {
      clarity += 5;
      reasons.push(
        'El prorrateo representa una parte material pero no dominante del total del recibo.'
      );
    } else if (
      prorationRatio !== null &&
      prorationRatio > 0 &&
      prorationRatio < 1
    ) {
      clarity += 2;
    }

    clarity = Math.min(
      20,
      clarity
    );
  } else if (
    allCauses.length === 1 &&
    visibleChanges.length <= 2
  ) {
    clarity = 20;
    reasons.push(
      'El caso tiene una causa principal y pocos movimientos visibles.'
    );
  } else if (
    allCauses.length <= 2 &&
    visibleChanges.length <= 4
  ) {
    clarity = 14;
  } else if (matches.length) {
    clarity = 8;
  }

  const support =
    getRelevantSupportScore({
      scenario,
      matches,
      explanation
    });

  reasons.push(
    ...support.notes
  );

  const rent =
    explanation?.interpretation
      ?.rentContext?.current;

  let contextCompleteness =
    support.points;

  if (rent?.resolved) {
    contextCompleteness += 5;
  }

  contextCompleteness =
    Math.min(
      10,
      contextCompleteness
    );

  const warningCount =
    getIntegrityWarningCount(
      explanation
    );

  const unmatchedProration =
    getUnmatchedProrationCount(
      explanation
    );

  let dataQuality = 10;

  if (warningCount) {
    dataQuality -= Math.min(
      6,
      warningCount * 2
    );
  }

  if (unmatchedProration) {
    dataQuality -= Math.min(
      4,
      unmatchedProration
    );
  }

  dataQuality = Math.max(
    0,
    dataQuality
  );

  if (dataQuality === 10) {
    reasons.push(
      'No hay advertencias de integridad ni evidencia de prorrateo sin emparejar.'
    );
  }

  const score =
    Math.max(
      0,
      Math.min(
        100,
        grounding +
        financialConsistency +
        clarity +
        contextCompleteness +
        dataQuality
      )
    );

  return {
    eligible,
    scenario,
    score,
    reasons,
    disqualifiers,
    breakdown: {
      grounding,
      financialConsistency,
      clarity,
      contextCompleteness,
      dataQuality
    },
    diagnostics: {
      status,
      coveragePercent:
        Number.isFinite(coverage)
          ? coverage
          : null,
      unexplainedAmount:
        unexplainedAmount ===
          undefined
          ? null
          : unexplainedAmount,
      visibleChargeChanges:
        visibleChanges.length,
      totalCauses:
        allCauses.length,
      totalFindings:
        allFindings.length,
      scenarioCauses:
        causes.length,
      scenarioFindings:
        findings.length,
      warningCount,
      unmatchedProration
    }
  };
}

function toCandidateSummary({
  explanation,
  scenarioCode,
  scoring
}) {
  const scenario =
    normalizeScenarioCode(
      scenarioCode
    );

  const {
    causes,
    findings
  } = getScenarioMatches(
    explanation,
    scenario
  );

  const primary =
    causes[0] ||
    findings[0] ||
    null;

  const difference =
    explanation?.comparison
      ?.difference ?? null;

  return {
    scenario,
    scenarioLabel:
      DEMO_SCENARIOS[scenario]
        ?.label || scenario,
    eligible:
      scoring.eligible,
    score:
      scoring.score,
    scoreBreakdown:
      scoring.breakdown,
    subscriberKey:
      explanation?.subscriber
        ?.subscriberKey || null,
    customerKey:
      explanation?.subscriber
        ?.customerKey || null,
    lobType:
      explanation?.subscriber
        ?.lobType || null,
    businessType:
      explanation?.subscriber
        ?.businessType || null,
    currentInvoiceNumber:
      explanation?.currentBill
        ?.invoiceNumber || null,
    previousInvoiceNumber:
      explanation?.previousBill
        ?.invoiceNumber || null,
    currentCycleDate:
      explanation?.currentBill
        ?.cycleDate || null,
    previousCycleDate:
      explanation?.previousBill
        ?.cycleDate || null,
    currentTotal:
      explanation?.currentBill
        ?.total ?? null,
    previousTotal:
      explanation?.previousBill
        ?.total ?? null,
    difference,
    status:
      explanation?.interpretation
        ?.status || null,
    coveragePercent:
      explanation?.interpretation
        ?.coveragePercent ?? null,
    unexplainedAmount:
      explanation?.interpretation
        ?.unexplainedAmount ?? null,
    evidenceLevel:
      primary?.evidenceLevel || null,
    primaryLabel:
      primary?.label || null,
    primaryAmount:
      primary?.impactAmount ??
      primary?.amount ??
      null,
    rentType:
      explanation?.interpretation
        ?.rentContext?.current
        ?.resolved
          ? explanation
              .interpretation
              .rentContext
              .current
              .rentType
          : null,
    safeHeadline:
      explanation?.customerFacing
        ?.headline || null,
    safeSummary:
      explanation?.customerFacing
        ?.summary || null,
    reasons:
      scoring.reasons,
    disqualifiers:
      scoring.disqualifiers,
    diagnostics:
      scoring.diagnostics
  };
}

function compareCandidates(a, b) {
  if (b.score !== a.score) {
    return b.score - a.score;
  }

  const aCoverage =
    Number(a.coveragePercent) || 0;
  const bCoverage =
    Number(b.coveragePercent) || 0;

  if (bCoverage !== aCoverage) {
    return bCoverage - aCoverage;
  }

  const aChanges =
    a.diagnostics
      ?.visibleChargeChanges ??
    Number.MAX_SAFE_INTEGER;

  const bChanges =
    b.diagnostics
      ?.visibleChargeChanges ??
    Number.MAX_SAFE_INTEGER;

  if (aChanges !== bChanges) {
    return aChanges - bChanges;
  }

  return String(
    a.subscriberKey || ''
  ).localeCompare(
    String(
      b.subscriberKey || ''
    )
  );
}

function rankCandidateSummaries(
  candidates,
  {
    limit = 5
  } = {}
) {
  const safeLimit =
    Math.min(
      Math.max(
        Number.parseInt(
          limit,
          10
        ) || 5,
        1
      ),
      50
    );

  return (
    candidates || []
  )
    .filter(
      (candidate) =>
        candidate?.eligible
    )
    .sort(compareCandidates)
    .slice(0, safeLimit);
}

function createSelectionReport({
  scenarioResults,
  prefilterLimit,
  topLimit,
  dataLineage = []
}) {
  return {
    schemaVersion:
      'desafio1-demo-case-selection-v1',
    phase: 'PHASE_4',
    selectionVersion:
      PHASE4_SELECTION_VERSION,
    generatedAt:
      new Date().toISOString(),
    configuration: {
      prefilterLimit,
      topLimit,
      scenarios:
        Object.keys(
          scenarioResults || {}
        )
    },
    scenarios:
      scenarioResults || {},
    dataLineage: (
      dataLineage || []
    ).map(
      (dataset) => ({
        datasetKey:
          dataset.datasetKey,
        fileName:
          dataset.fileName,
        sha256:
          dataset.sha256,
        importedRows:
          dataset.importedRows,
        importedAt:
          dataset.importedAt
      })
    ),
    safeguards: {
      llmUsedForRanking: false,
      financialReasoningRecomputed:
        false,
      officialIdentifiersHardcoded:
        false,
      selectionDoesNotCreateLogins:
        true,
      selectionDoesNotModifyApp:
        true,
      note:
        'Fase 4 usa la explicación determinista de Fase 3 para rankear casos locales. No crea usuarios, no modifica Carlos/Ana y no cambia el frontend.'
    }
  };
}

module.exports = {
  PHASE4_SELECTION_VERSION,
  DEMO_SCENARIOS,
  DEFAULT_SCENARIO_ORDER,
  normalizeScenarioCode,
  getVisibleChargeChanges,
  daysBetweenDates,
  getScenarioMatches,
  scoreDemoCandidate,
  toCandidateSummary,
  compareCandidates,
  rankCandidateSummaries,
  createSelectionReport
};
