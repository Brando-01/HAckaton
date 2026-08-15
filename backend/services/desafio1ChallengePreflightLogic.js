const {
  CHALLENGE_MANIFEST_VERSION,
  REQUIRED_SOURCE_KEYS,
  FROZEN_DEMO_CASES,
  ARCHITECTURE_SNAPSHOT,
  STATIC_KNOWN_LIMITS,
  FINAL_REQUIRED_CHECK_IDS
} = require(
  '../config/desafio1ChallengeManifest'
);

const {
  MAX_HISTORY_BILLS,
  MAX_PREVIOUS_BILLS,
  buildBillingHistoryView,
  analyzeChargeRecurrence
} = require(
  './desafio1BillingHistoryLogic'
);

const {
  CROSS_SELL_STATUS,
  BENEFIT_STATUS,
  buildCommercialExperience
} = require(
  './desafio1CommercialPolicyLogic'
);

const CHECK_STATUS = Object.freeze({
  PASS: 'PASS',
  KNOWN_LIMITS: 'KNOWN_LIMITS',
  FAIL: 'FAIL'
});

const PREFLIGHT_STATUS = Object.freeze({
  READY: 'READY',
  READY_WITH_KNOWN_LIMITS:
    'READY_WITH_KNOWN_LIMITS',
  REVIEW_REQUIRED: 'REVIEW_REQUIRED'
});

const FORBIDDEN_REPORT_KEYS = new Set([
  'subscriberKey',
  'subscriberKeys',
  'customerKey',
  'billingArrangement',
  'financialAccount',
  'sourceRow',
  'sourceRows',
  'phone',
  'document',
  'dni',
  'cookie',
  'cookies'
]);

function clone(value) {
  return value == null
    ? value
    : JSON.parse(
        JSON.stringify(value)
      );
}

function toNumber(value) {
  if (
    value === null ||
    value === undefined ||
    (
      typeof value === 'string' &&
      value.trim() === ''
    )
  ) {
    return null;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric)
    ? numeric
    : null;
}

function sameSet(left, right) {
  const a = [...new Set(left || [])]
    .sort();
  const b = [...new Set(right || [])]
    .sort();

  return (
    a.length === b.length &&
    a.every(
      (item, index) =>
        item === b[index]
    )
  );
}

function buildCheck({
  id,
  label,
  status,
  detail,
  evidence = null
}) {
  return {
    id,
    label,
    status,
    ok:
      status !==
      CHECK_STATUS.FAIL,
    blocking:
      status ===
      CHECK_STATUS.FAIL,
    detail,
    evidence
  };
}

function buildDatasetAudit(
  lineage = []
) {
  const safeEntries = (
    Array.isArray(lineage)
      ? lineage
      : []
  ).map(
    (entry) => ({
      datasetKey:
        String(
          entry?.datasetKey || ''
        ).trim(),
      importedRows:
        Math.max(
          0,
          Number(
            entry?.importedRows || 0
          )
        ),
      hasFileName:
        Boolean(entry?.fileName),
      hasFingerprint:
        Boolean(entry?.sha256)
    })
  );

  const importedKeys =
    safeEntries
      .map(
        (entry) =>
          entry.datasetKey
      )
      .filter(Boolean);

  const missing =
    REQUIRED_SOURCE_KEYS.filter(
      (key) =>
        !importedKeys.includes(key)
    );

  const unexpected =
    importedKeys.filter(
      (key) =>
        !REQUIRED_SOURCE_KEYS
          .includes(key)
    );

  const completeRows =
    safeEntries.every(
      (entry) =>
        entry.importedRows > 0 &&
        entry.hasFileName &&
        entry.hasFingerprint
    );

  const pass =
    safeEntries.length ===
      REQUIRED_SOURCE_KEYS.length &&
    sameSet(
      importedKeys,
      REQUIRED_SOURCE_KEYS
    ) &&
    completeRows;

  return {
    status:
      pass ? 'PASS' : 'FAIL',
    expected:
      REQUIRED_SOURCE_KEYS.length,
    imported:
      safeEntries.length,
    missing,
    unexpected,
    sources:
      safeEntries.map(
        (entry) => ({
          datasetKey:
            entry.datasetKey,
          importedRows:
            entry.importedRows
        })
      )
  };
}

function runHistoryGuardAudit() {
  const bills = [
    ['2026-07-05', 70, true],
    ['2026-06-05', 60, true],
    ['2026-05-05', 55, false],
    ['2026-04-05', 50, false],
    ['2026-03-05', 45, false],
    ['2026-02-05', 40, false],
    ['2026-01-05', 35, true]
  ].map(
    ([cycleDate, total, hasPackage]) => ({
      cycleDate,
      period: `Ciclo ${cycleDate}`,
      total,
      items:
        hasPackage
          ? [
              {
                chargeCode:
                  'PKG_DEMO',
                label:
                  'Paquete demo',
                amount: 10
              }
            ]
          : []
    })
  );

  const history =
    buildBillingHistoryView(bills);

  const recurrence =
    analyzeChargeRecurrence(
      history,
      {
        chargeCode:
          'PKG_DEMO',
        label:
          'Paquete demo'
      }
    );

  const checks = {
    maxBills:
      MAX_HISTORY_BILLS === 6,
    maxPreviousBills:
      MAX_PREVIOUS_BILLS === 5,
    windowCapped:
      history.availableBills === 6 &&
      history.previousBills === 5 &&
      history.bills.length === 6,
    newestPreserved:
      history.bills[0]
        ?.cycleDate ===
      '2026-07-05',
    oldestOutsideWindowRemoved:
      !history.bills.some(
        (bill) =>
          bill.cycleDate ===
          '2026-01-05'
      ),
    recurrenceDeterministic:
      recurrence?.occurrenceCount === 2 &&
      recurrence?.recurring === true
  };

  return {
    status:
      Object.values(checks)
        .every(Boolean)
        ? 'PASS'
        : 'FAIL',
    checks,
    maxBills:
      MAX_HISTORY_BILLS,
    maxPreviousBills:
      MAX_PREVIOUS_BILLS,
    recurrence: {
      status:
        recurrence?.status || null,
      occurrenceCount:
        recurrence
          ?.occurrenceCount || 0
    }
  };
}

function runCommercialGuardAudit() {
  const financialExperience = {
    customer: {
      businessType: 'MOVIL'
    },
    findings: [],
    comparison: {
      causes: []
    },
    financialExplanation: {
      safeguards: {
        llmUsedForFinancialReasoning:
          false
      }
    }
  };

  const unresolved =
    buildCommercialExperience({
      resolution: {
        status: 'UNRESOLVED'
      },
      experience:
        financialExperience,
      commercialSnapshot: {
        profile: {},
        catalog: [],
        campaigns: []
      }
    });

  const resolvedNoRule =
    buildCommercialExperience({
      resolution: {
        status: 'RESOLVED'
      },
      experience:
        financialExperience,
      commercialSnapshot: {
        profile: {
          hasMobile: false,
          hasHome: false,
          eligibleMovistarTotal:
            false
        },
        catalog: [],
        campaigns: []
      }
    });

  const benefit =
    buildCommercialExperience({
      resolution: {
        status: 'RESOLVED'
      },
      experience: {
        ...financialExperience,
        findings: [
          {
            code:
              'ACTIVE_DISCOUNT',
            evidenceLevel: 'HIGH',
            description:
              'Descuento vigente verificado',
            amount: -10
          }
        ]
      },
      commercialSnapshot: {
        profile: {
          hasMobile: true
        },
        catalog: [],
        campaigns: []
      }
    });

  const checks = {
    unresolvedNeverSells:
      unresolved.crossSell.status ===
        CROSS_SELL_STATUS.SUPPRESSED &&
      unresolved.crossSell.offered ===
        false,
    noFallbackOffer:
      resolvedNoRule.crossSell.status ===
        CROSS_SELL_STATUS.NOT_ELIGIBLE &&
      resolvedNoRule.crossSell.offered ===
        false &&
      resolvedNoRule.safeguards
        .genericFallbackOfferAllowed ===
        false,
    benefitMustExist:
      benefit.existingBenefit.status ===
        BENEFIT_STATUS.AVAILABLE &&
      benefit.existingBenefit
        .existingBenefit === true &&
      benefit.existingBenefit
        .newAddition === false,
    benefitHasPriority:
      benefit.crossSell.status ===
        CROSS_SELL_STATUS.SUPPRESSED &&
      benefit.crossSell.reasonCode ===
        'EXISTING_BENEFIT_PRIORITY',
    llmNotCommercialDecision:
      benefit.safeguards
        .llmUsedForCommercialDecision ===
        false &&
      benefit.safeguards
        .commercialLayerAffectsFinancialReasoning ===
        false
  };

  return {
    status:
      Object.values(checks)
        .every(Boolean)
        ? 'PASS'
        : 'FAIL',
    checks
  };
}

function expectedDemoCasesPass(
  releaseReport
) {
  const profiles =
    releaseReport?.profiles || [];

  const results =
    FROZEN_DEMO_CASES.map(
      (expected) => {
        const actual =
          profiles.find(
            (profile) =>
              profile.customerId ===
              expected.customerId
          );

        const pass = Boolean(
          actual?.ready === true &&
          actual?.scenario ===
            expected.scenario &&
          actual?.evidenceLevel ===
            expected.minimumEvidence
        );

        return {
          customerId:
            expected.customerId,
          expectedScenario:
            expected.scenario,
          actualScenario:
            actual?.scenario || null,
          evidenceLevel:
            actual
              ?.evidenceLevel || null,
          ready:
            actual?.ready === true,
          pass
        };
      }
    );

  return {
    pass:
      results.every(
        (item) => item.pass
      ),
    cases: results
  };
}

function dynamicB2CLimits(
  report
) {
  if (!report) {
    return [];
  }

  const result = [];

  for (
    const scenario of
      report.scenarioSummary || []
  ) {
    const unresolved =
      Number(
        scenario.unresolvedRentCases || 0
      );

    if (
      scenario.mappingStatus ===
        'PENDING_MAPPING'
    ) {
      result.push({
        code:
          `${scenario.scenarioCode}_MAPPING_PENDING`,
        area: 'B2C_MATRIX',
        detail:
          scenario.limitation ||
          `${scenario.label} permanece pendiente de mapeo inequívoco.`
      });
      continue;
    }

    if (unresolved > 0) {
      result.push({
        code:
          `${scenario.scenarioCode}_UNRESOLVED_RENT`,
        area: 'B2C_MATRIX',
        detail:
          `${scenario.label}: ${unresolved} caso(s) observado(s) no pudieron asignarse inequívocamente a RA/RV.`
      });
    }
  }

  return result;
}

function safeBenchmarkSnapshot({
  financialReport,
  b2cReport,
  handoffReport,
  omnichannelReport,
  performanceReport
}) {
  return {
    financial: {
      status:
        financialReport?.status || null,
      selection:
        clone(
          financialReport
            ?.selection || null
        ),
      metrics:
        clone(
          financialReport
            ?.metrics || null
        ),
      scenarioCoverage:
        clone(
          financialReport
            ?.scenarioCoverage || {}
        ),
      safeguards:
        clone(
          financialReport
            ?.safeguards || null
        )
    },
    b2c: {
      status:
        b2cReport?.status || null,
      scope: {
        population:
          b2cReport?.scope
            ?.population || 0,
        scanned:
          b2cReport?.scope
            ?.scanned || 0,
        limited:
          b2cReport?.scope
            ?.limited === true
      },
      counts:
        clone(
          b2cReport?.counts || null
        ),
      metrics:
        clone(
          b2cReport?.metrics || null
        ),
      scenarioSummary:
        (b2cReport
          ?.scenarioSummary || [])
          .map(
            (item) => ({
              scenarioCode:
                item.scenarioCode,
              label: item.label,
              mappingStatus:
                item.mappingStatus,
              observedCases:
                item.observedCases,
              verifiedCases:
                item.verifiedCases,
              unresolvedRentCases:
                item.unresolvedRentCases,
              rentModesVerified:
                clone(
                  item.rentModesVerified || []
                ),
              businessTypesVerified:
                clone(
                  item.businessTypesVerified || []
                )
            })
          )
    },
    handoff: {
      status:
        handoffReport?.status || null,
      totalCases:
        handoffReport
          ?.totalCases || 0,
      decisionAccuracy:
        handoffReport
          ?.decisionAccuracy ?? null,
      transferPrecision:
        handoffReport
          ?.transferPrecision ?? null,
      transferRecall:
        handoffReport
          ?.transferRecall ?? null,
      falsePositiveTransfers:
        handoffReport
          ?.falsePositiveTransfers || 0,
      falseNegativeTransfers:
        handoffReport
          ?.falseNegativeTransfers || 0
    },
    omnichannel: {
      status:
        omnichannelReport
          ?.status || null,
      passed:
        omnichannelReport
          ?.passed || 0,
      total:
        omnichannelReport
          ?.assertions?.length || 0,
      journey:
        (omnichannelReport
          ?.journey || [])
          .map(
            (item) => ({
              channel:
                item.channel,
              label:
                item.label
            })
          )
    },
    performance: {
      status:
        performanceReport
          ?.status || null,
      profile:
        clone(
          performanceReport
            ?.profile || null
        ),
      baseline:
        performanceReport
          ? {
              journeySuccessRate:
                performanceReport
                  .baseline
                  .journeySuccessRate,
              totalRequests:
                performanceReport
                  .baseline
                  .totalRequests,
              successfulRequests:
                performanceReport
                  .baseline
                  .successfulRequests,
              timeoutRequests:
                performanceReport
                  .baseline
                  .timeoutRequests,
              latency:
                clone(
                  performanceReport
                    .baseline.latency
                ),
              throughput:
                clone(
                  performanceReport
                    .baseline.throughput
                )
            }
          : null,
      target:
        performanceReport
          ? {
              journeySuccessRate:
                performanceReport
                  .target
                  .journeySuccessRate,
              totalRequests:
                performanceReport
                  .target
                  .totalRequests,
              successfulRequests:
                performanceReport
                  .target
                  .successfulRequests,
              timeoutRequests:
                performanceReport
                  .target
                  .timeoutRequests,
              latency:
                clone(
                  performanceReport
                    .target.latency
                ),
              throughput:
                clone(
                  performanceReport
                    .target.throughput
                )
            }
          : null,
      evaluation:
        performanceReport
          ? {
              passedChecks:
                performanceReport
                  .evaluation
                  .passedChecks,
              totalChecks:
                performanceReport
                  .evaluation
                  .totalChecks
            }
          : null
    }
  };
}

function collectForbiddenReportKeys(
  value,
  path = [],
  findings = []
) {
  if (
    value === null ||
    value === undefined
  ) {
    return findings;
  }

  if (Array.isArray(value)) {
    value.forEach(
      (item, index) =>
        collectForbiddenReportKeys(
          item,
          [...path, String(index)],
          findings
        )
    );
    return findings;
  }

  if (typeof value !== 'object') {
    return findings;
  }

  Object.entries(value).forEach(
    ([key, child]) => {
      if (
        FORBIDDEN_REPORT_KEYS.has(key)
      ) {
        findings.push(
          [...path, key].join('.')
        );
      }

      collectForbiddenReportKeys(
        child,
        [...path, key],
        findings
      );
    }
  );

  return findings;
}

function buildChallengePreflightReport({
  generatedAt = null,
  testReport,
  smokeReport,
  lineage,
  releaseReport,
  financialReport,
  b2cReport,
  handoffReport,
  omnichannelReport,
  performanceReport,
  historyReport,
  commercialReport,
  stageFailures = []
} = {}) {
  const datasetAudit =
    buildDatasetAudit(lineage);

  const demoAudit =
    expectedDemoCasesPass(
      releaseReport
    );

  const releaseChecks =
    new Map(
      (releaseReport?.checks || [])
        .map(
          (check) => [
            check.id,
            check
          ]
        )
    );

  const financialMetrics =
    financialReport?.metrics || {};
  const financialSafeguards =
    financialReport?.safeguards || {};

  const checks = [];

  checks.push(
    buildCheck({
      id: 'DATASETS_8_OF_8',
      label: 'Datasets oficiales',
      status:
        datasetAudit.status === 'PASS' &&
        releaseChecks.get('DATA_LINEAGE')
          ?.ok === true
          ? CHECK_STATUS.PASS
          : CHECK_STATUS.FAIL,
      detail:
        `${datasetAudit.imported}/${datasetAudit.expected} fuentes oficiales importadas con lineage completo.`,
      evidence: {
        missing:
          datasetAudit.missing,
        unexpected:
          datasetAudit.unexpected
      }
    })
  );

  checks.push(
    buildCheck({
      id: 'TEST_SUITE',
      label: 'Suite automatizada',
      status:
        testReport?.status === 'PASS'
          ? CHECK_STATUS.PASS
          : CHECK_STATUS.FAIL,
      detail:
        testReport?.status === 'PASS'
          ? `${testReport.tests ?? 'N/D'} tests · ${testReport.fail ?? 0} fallos.`
          : 'La suite automatizada no terminó completamente en verde.',
      evidence: {
        tests:
          testReport?.tests ?? null,
        pass:
          testReport?.pass ?? null,
        fail:
          testReport?.fail ?? null,
        exitCode:
          testReport?.exitCode ?? null
      }
    })
  );

  checks.push(
    buildCheck({
      id: 'CRITICAL_DEMO_CAUSES',
      label: 'Causas críticas demo',
      status:
        releaseReport?.status ===
          'READY' &&
        demoAudit.pass
          ? CHECK_STATUS.PASS
          : CHECK_STATUS.FAIL,
      detail:
        demoAudit.pass
          ? 'Carlos/RECONNECTION y Ana/PRORATION permanecen congelados con evidencia HIGH y grounding determinista.'
          : 'Alguno de los dos casos representativos dejó de coincidir con el escenario/evidencia congelados.',
      evidence: {
        cases:
          demoAudit.cases
      }
    })
  );

  const privacyPass =
    releaseChecks.get(
      'PUBLIC_PAYLOAD_PRIVACY'
    )?.ok === true &&
    financialSafeguards
      .identifiersPrinted === false &&
    financialSafeguards
      .subscriberKeyExposed === false &&
    financialSafeguards
      .customerKeyExposed === false &&
    financialSafeguards
      .rawFinancialAccountExposed === false;

  checks.push(
    buildCheck({
      id: 'PRIVACY',
      label: 'Privacidad',
      status:
        privacyPass
          ? CHECK_STATUS.PASS
          : CHECK_STATUS.FAIL,
      detail:
        privacyPass
          ? 'Payload demo y benchmarks mantienen fuera identificadores oficiales/financieros privados.'
          : 'Alguna salvaguarda de privacidad dejó de cumplirse.'
    })
  );

  const retrievalPass =
    financialReport?.status ===
      'PASS' &&
    toNumber(
      financialMetrics
        .retrievalAccuracyPct
    ) === 100 &&
    toNumber(
      financialMetrics
        .groundingAccuracyPct
    ) === 100 &&
    Number(
      financialMetrics
        .totalViolations || 0
    ) === 0;

  checks.push(
    buildCheck({
      id: 'RETRIEVAL_ACCURACY',
      label: 'Retrieval / grounding financiero',
      status:
        retrievalPass
          ? CHECK_STATUS.PASS
          : CHECK_STATUS.FAIL,
      detail:
        retrievalPass
          ? `Retrieval ${financialMetrics.retrievalAccuracyPct.toFixed(2)}% · grounding ${financialMetrics.groundingAccuracyPct.toFixed(2)}% · 0 violaciones.`
          : 'La auditoría financiera no conserva 100% de Retrieval/grounding o reporta violaciones.'
    })
  );

  const hallucinationPass =
    financialReport?.status ===
      'PASS' &&
    toNumber(
      financialMetrics
        .detectableFinancialHallucinationRatePct
    ) === 0 &&
    Number(
      financialMetrics
        .financialClaimViolations || 0
    ) === 0 &&
    toNumber(
      financialMetrics
        .policyCompliancePct
    ) === 100 &&
    financialSafeguards
      .llmUsedForScoring === false &&
    financialSafeguards
      .zeroHallucinationClaimScope ===
      'DETECTABLE_STRUCTURED_FINANCIAL_CLAIMS_ONLY';

  checks.push(
    buildCheck({
      id: 'HALLUCINATION_GUARD',
      label: 'Guardia de alucinación financiera',
      status:
        hallucinationPass
          ? CHECK_STATUS.PASS
          : CHECK_STATUS.FAIL,
      detail:
        hallucinationPass
          ? '0.00% de alucinación financiera detectable en claims estructurados evaluables; el LLM no puntúa el benchmark.'
          : 'La guardia financiera o el alcance declarado de la métrica dejó de cumplirse.'
    })
  );

  const handoffPass =
    handoffReport?.status === 'PASS' &&
    handoffReport
      ?.falsePositiveTransfers === 0 &&
    handoffReport
      ?.falseNegativeTransfers === 0 &&
    toNumber(
      handoffReport
        ?.decisionAccuracy
    ) === 100;

  checks.push(
    buildCheck({
      id: 'HANDOFF_POLICY',
      label: 'Handoff inteligente',
      status:
        handoffPass
          ? CHECK_STATUS.PASS
          : CHECK_STATUS.FAIL,
      detail:
        handoffPass
          ? `${handoffReport.correctCases}/${handoffReport.totalCases} casos etiquetados correctos · 0 FP · 0 FN.`
          : 'El benchmark determinista de handoff presenta discrepancias.'
    })
  );

  checks.push(
    buildCheck({
      id: 'BILLING_HISTORY',
      label: 'Historial de recibos',
      status:
        historyReport?.status ===
          'PASS'
          ? CHECK_STATUS.PASS
          : CHECK_STATUS.FAIL,
      detail:
        historyReport?.status ===
          'PASS'
          ? 'Ventana congelada en recibo actual + hasta cinco previos; recurrencia calculada por datos estructurados.'
          : 'La guarda determinista del histórico dejó de cumplir el contrato F14.'
    })
  );

  checks.push(
    buildCheck({
      id: 'CROSS_SELLING_GUARD',
      label: 'Cross-selling restrictivo',
      status:
        commercialReport?.status ===
          'PASS'
          ? CHECK_STATUS.PASS
          : CHECK_STATUS.FAIL,
      detail:
        commercialReport?.status ===
          'PASS'
          ? 'No existe oferta genérica; solo se evalúa cross-selling tras RESOLVED + regla explícita y el beneficio existente tiene prioridad.'
          : 'Alguna salvaguarda comercial F18 dejó de cumplirse.'
    })
  );

  const b2cComplete =
    b2cReport &&
    b2cReport.scope?.limited !== true &&
    Number(
      b2cReport.counts
        ?.analysisErrors || 0
    ) === 0;
  const b2cAllowed =
    b2cComplete &&
    [
      'PASS',
      'KNOWN_LIMITS'
    ].includes(
      b2cReport?.status
    );

  checks.push(
    buildCheck({
      id: 'B2C_MATRIX',
      label: 'Matriz B2C RA/RV',
      status:
        !b2cAllowed
          ? CHECK_STATUS.FAIL
          : b2cReport.status ===
              'KNOWN_LIMITS'
            ? CHECK_STATUS.KNOWN_LIMITS
            : CHECK_STATUS.PASS,
      detail:
        !b2cAllowed
          ? 'La matriz no proviene de un barrido completo válido o presenta errores de análisis.'
          : b2cReport.status ===
              'KNOWN_LIMITS'
            ? 'Barrido completo sin errores; las combinaciones no demostradas permanecen explícitamente como limitaciones conocidas.'
            : 'Barrido completo B2C sin limitaciones pendientes.'
    })
  );

  const omnichannelPass =
    omnichannelReport?.status ===
      'PASS' &&
    omnichannelReport?.passed ===
      omnichannelReport
        ?.assertions?.length;

  checks.push(
    buildCheck({
      id: 'OMNICHANNEL_CONTINUITY',
      label: 'Continuidad omnicanal',
      status:
        omnichannelPass
          ? CHECK_STATUS.PASS
          : CHECK_STATUS.FAIL,
      detail:
        omnichannelPass
          ? `${omnichannelReport.passed}/${omnichannelReport.assertions.length} controles · Mi Movistar → Lucía web → WhatsApp → Asesor.`
          : 'La auditoría contractual F20 presenta una regresión.'
    })
  );

  const performancePass =
    performanceReport?.status ===
      'PASS' &&
    Number(
      performanceReport
        ?.profile?.loadMultiplier
    ) === 3 &&
    Number(
      performanceReport
        ?.profile?.targetJourneys
    ) ===
      Number(
        performanceReport
          ?.profile?.baselineJourneys
      ) * 3 &&
    Number(
      performanceReport
        ?.profile?.targetConcurrency
    ) ===
      Number(
        performanceReport
          ?.profile?.baselineConcurrency
      ) * 3 &&
    toNumber(
      performanceReport
        ?.target?.journeySuccessRate
    ) === 100 &&
    Number(
      performanceReport
        ?.target?.timeoutRequests || 0
    ) === 0 &&
    performanceReport
      ?.evaluation?.passedChecks ===
      performanceReport
        ?.evaluation?.totalChecks;

  checks.push(
    buildCheck({
      id: 'PERFORMANCE_3X',
      label: 'Escalabilidad / latencia 3×',
      status:
        performancePass
          ? CHECK_STATUS.PASS
          : CHECK_STATUS.FAIL,
      detail:
        performancePass
          ? `${performanceReport.profile.baselineJourneys}→${performanceReport.profile.targetJourneys} journeys · concurrencia ${performanceReport.profile.baselineConcurrency}→${performanceReport.profile.targetConcurrency} · p95 core ${performanceReport.target.latency.p95Ms} ms · 0 timeout.`
          : 'El benchmark local no conserva el perfil 3×, la corrección o las guardas de F21.'
    })
  );

  checks.push(
    buildCheck({
      id: 'RELEASE_SMOKE',
      label: 'Release 1 smoke',
      status:
        smokeReport?.status === 'PASS' &&
        smokeReport?.passed ===
          smokeReport?.total
          ? CHECK_STATUS.PASS
          : CHECK_STATUS.FAIL,
      detail:
        smokeReport?.status === 'PASS'
          ? `${smokeReport.passed}/${smokeReport.total} controles end-to-end OK.`
          : 'El smoke test del Release 1 no terminó completamente en verde.'
    })
  );

  const missingCheckIds =
    FINAL_REQUIRED_CHECK_IDS
      .filter(
        (id) =>
          !checks.some(
            (check) =>
              check.id === id
          )
      );

  const blockingFailures =
    checks.filter(
      (check) =>
        check.status ===
        CHECK_STATUS.FAIL
    );

  const knownLimitMap =
    new Map();

  [
    ...STATIC_KNOWN_LIMITS.map(clone),
    ...dynamicB2CLimits(
      b2cReport
    )
  ].forEach(
    (item) => {
      if (item?.code) {
        knownLimitMap.set(
          item.code,
          item
        );
      }
    }
  );

  const knownLimits =
    [...knownLimitMap.values()];

  const hasKnownLimits =
    knownLimits.length > 0 ||
    checks.some(
      (check) =>
        check.status ===
        CHECK_STATUS.KNOWN_LIMITS
    );

  const status =
    blockingFailures.length ||
    missingCheckIds.length
      ? PREFLIGHT_STATUS
          .REVIEW_REQUIRED
      : hasKnownLimits
        ? PREFLIGHT_STATUS
            .READY_WITH_KNOWN_LIMITS
        : PREFLIGHT_STATUS.READY;

  const report = {
    schemaVersion:
      'desafio1-phase22-challenge-preflight-v1',
    phase: 'PHASE_22',
    manifestVersion:
      CHALLENGE_MANIFEST_VERSION,
    generatedAt:
      generatedAt ||
      new Date().toISOString(),
    status,
    ready:
      status !==
      PREFLIGHT_STATUS
        .REVIEW_REQUIRED,
    summary: {
      checks:
        checks.length,
      passed:
        checks.filter(
          (item) =>
            item.status ===
            CHECK_STATUS.PASS
        ).length,
      knownLimits:
        checks.filter(
          (item) =>
            item.status ===
            CHECK_STATUS.KNOWN_LIMITS
        ).length,
      failed:
        blockingFailures.length,
      missingCheckIds,
      staticAndDynamicKnownLimits:
        knownLimits.length,
      stageFailures:
        Array.isArray(stageFailures)
          ? stageFailures.length
          : 0
    },
    checks,
    datasets:
      clone(datasetAudit),
    frozenDemoCases:
      FROZEN_DEMO_CASES.map(clone),
    architecture:
      clone(
        ARCHITECTURE_SNAPSHOT
      ),
    benchmarks:
      safeBenchmarkSnapshot({
        financialReport,
        b2cReport,
        handoffReport,
        omnichannelReport,
        performanceReport
      }),
    knownLimits,
    execution: {
      stageFailures:
        Array.isArray(stageFailures)
          ? clone(stageFailures)
          : []
    }
  };

  const forbiddenReportKeys =
    collectForbiddenReportKeys(
      report
    );

  report.reportPrivacy = {
    status:
      forbiddenReportKeys.length
        ? 'FAIL'
        : 'PASS',
    forbiddenKeysFound:
      forbiddenReportKeys
  };

  if (
    forbiddenReportKeys.length ||
    report.execution.stageFailures.length
  ) {
    report.status =
      PREFLIGHT_STATUS
        .REVIEW_REQUIRED;
    report.ready = false;
  }

  return report;
}

module.exports = {
  CHECK_STATUS,
  PREFLIGHT_STATUS,
  FORBIDDEN_REPORT_KEYS,
  sameSet,
  buildCheck,
  buildDatasetAudit,
  runHistoryGuardAudit,
  runCommercialGuardAudit,
  expectedDemoCasesPass,
  dynamicB2CLimits,
  safeBenchmarkSnapshot,
  collectForbiddenReportKeys,
  buildChallengePreflightReport
};
