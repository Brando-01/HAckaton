const test = require('node:test');
const assert = require('node:assert/strict');

const {
  REQUIRED_SOURCE_KEYS,
  FINAL_REQUIRED_CHECK_IDS
} = require(
  '../config/desafio1ChallengeManifest'
);

const {
  PREFLIGHT_STATUS,
  buildDatasetAudit,
  runHistoryGuardAudit,
  runCommercialGuardAudit,
  runExplorerAuthBoundaryAudit,
  expectedDemoCasesPass,
  dynamicB2CLimits,
  safeBenchmarkSnapshot,
  collectForbiddenReportKeys,
  buildChallengePreflightReport
} = require(
  '../services/desafio1ChallengePreflightLogic'
);

function lineage() {
  return REQUIRED_SOURCE_KEYS.map(
    (datasetKey, index) => ({
      datasetKey,
      fileName: `${datasetKey}.csv`,
      sha256: `hash-${index}`,
      importedRows: index + 1
    })
  );
}

function releaseReport() {
  return {
    status: 'READY',
    checks: [
      {
        id: 'DATA_LINEAGE',
        ok: true
      },
      {
        id: 'PUBLIC_PAYLOAD_PRIVACY',
        ok: true
      }
    ],
    profiles: [
      {
        customerId: 'CLI000001',
        scenario: 'RECONNECTION',
        evidenceLevel: 'HIGH',
        ready: true
      },
      {
        customerId: 'CLI000002',
        scenario: 'PRORATION',
        evidenceLevel: 'HIGH',
        ready: true
      }
    ]
  };
}

function financialReport() {
  return {
    status: 'PASS',
    selection: {
      population: 18450,
      evaluated: 300
    },
    metrics: {
      retrievalAccuracyPct: 100,
      groundingAccuracyPct: 100,
      policyCompliancePct: 100,
      detectableFinancialHallucinationRatePct: 0,
      financialClaimViolations: 0,
      totalViolations: 0,
      evaluatedAssertions: 11001
    },
    scenarioCoverage: {
      RECONNECTION: 11,
      PRORATION: 3
    },
    safeguards: {
      identifiersPrinted: false,
      subscriberKeyExposed: false,
      customerKeyExposed: false,
      rawFinancialAccountExposed: false,
      llmUsedForScoring: false,
      zeroHallucinationClaimScope:
        'DETECTABLE_STRUCTURED_FINANCIAL_CLAIMS_ONLY'
    },
    cases: [
      {
        caseRef: 'AUD000001',
        privateInjected: 'ignored'
      }
    ]
  };
}

function b2cReport(status = 'KNOWN_LIMITS') {
  return {
    status,
    scope: {
      population: 20000,
      scanned: 20000,
      limited: false
    },
    counts: {
      analysisErrors: 0,
      consultable: 18450
    },
    metrics: {
      business: {
        verifiedCells: 10
      }
    },
    scenarioSummary: [
      {
        scenarioCode: 'RECONNECTION',
        label: 'Reconexión',
        mappingStatus: 'MAPPED',
        observedCases: 964,
        verifiedCases: 958,
        unresolvedRentCases: 6,
        rentModesVerified: [
          'RA',
          'RV'
        ],
        businessTypesVerified: [
          'MOVIL',
          'FIJA'
        ]
      },
      {
        scenarioCode:
          'FINANCED_EQUIPMENT',
        label:
          'Equipo financiado',
        mappingStatus:
          'PENDING_MAPPING',
        observedCases: 0,
        verifiedCases: 0,
        unresolvedRentCases: 0,
        rentModesVerified: [],
        businessTypesVerified: [],
        limitation:
          'No existe mapeo inequívoco.'
      }
    ]
  };
}

function handoffReport() {
  return {
    status: 'PASS',
    totalCases: 14,
    correctCases: 14,
    decisionAccuracy: 100,
    transferPrecision: 100,
    transferRecall: 100,
    falsePositiveTransfers: 0,
    falseNegativeTransfers: 0,
    cases: []
  };
}

function omnichannelReport() {
  return {
    status: 'PASS',
    passed: 6,
    assertions: new Array(6)
      .fill(null)
      .map(
        (_, index) => ({
          code: `OMNI_${index}`,
          passed: true
        })
      ),
    journey: [
      {
        channel: 'MI_MOVISTAR',
        label: 'Mi Movistar'
      },
      {
        channel: 'LUCIA_WEB',
        label: 'Lucía web'
      },
      {
        channel: 'WHATSAPP',
        label: 'WhatsApp'
      },
      {
        channel: 'ADVISOR',
        label: 'Asesor'
      }
    ]
  };
}

function performanceReport() {
  return {
    status: 'PASS',
    profile: {
      baselineJourneys: 8,
      targetJourneys: 24,
      baselineConcurrency: 4,
      targetConcurrency: 12,
      loadMultiplier: 3,
      requestTimeoutMs: 8000
    },
    baseline: {
      journeySuccessRate: 100,
      totalRequests: 56,
      successfulRequests: 56,
      timeoutRequests: 0,
      latency: {
        p50Ms: 131.41,
        p95Ms: 281.02
      },
      throughput: {
        journeysPerSecond: 7.95,
        requestsPerSecond: 55.68
      }
    },
    target: {
      journeySuccessRate: 100,
      totalRequests: 168,
      successfulRequests: 168,
      timeoutRequests: 0,
      latency: {
        p50Ms: 249.85,
        p95Ms: 478.56
      },
      throughput: {
        journeysPerSecond: 12.64,
        requestsPerSecond: 88.48
      }
    },
    evaluation: {
      passedChecks: 8,
      totalChecks: 8
    },
    privateJourneys: [
      {
        customerId: 'SHOULD_NOT_COPY'
      }
    ]
  };
}

function healthyInput() {
  return {
    generatedAt:
      '2026-08-15T00:00:00.000Z',
    testReport: {
      status: 'PASS',
      exitCode: 0,
      tests: 600,
      pass: 600,
      fail: 0
    },
    smokeReport: {
      status: 'PASS',
      exitCode: 0,
      passed: 10,
      total: 10
    },
    lineage: lineage(),
    releaseReport:
      releaseReport(),
    financialReport:
      financialReport(),
    b2cReport:
      b2cReport(),
    handoffReport:
      handoffReport(),
    omnichannelReport:
      omnichannelReport(),
    performanceReport:
      performanceReport(),
    historyReport:
      runHistoryGuardAudit(),
    commercialReport:
      runCommercialGuardAudit()
  };
}

test(
  'dataset audit exige exactamente las ocho fuentes congeladas con lineage completo',
  () => {
    const report =
      buildDatasetAudit(
        lineage()
      );

    assert.equal(
      report.status,
      'PASS'
    );
    assert.equal(
      report.imported,
      8
    );
    assert.deepEqual(
      report.missing,
      []
    );
  }
);

test(
  'dataset audit falla si una fuente desaparece aunque sigan existiendo filas en las otras',
  () => {
    const report =
      buildDatasetAudit(
        lineage().slice(0, 7)
      );

    assert.equal(
      report.status,
      'FAIL'
    );
    assert.equal(
      report.missing.length,
      1
    );
  }
);

test(
  'guarda F22 del histórico conserva actual más cinco previos y recurrencia estructurada',
  () => {
    const report =
      runHistoryGuardAudit();

    assert.equal(
      report.status,
      'PASS'
    );
    assert.equal(
      report.maxBills,
      6
    );
    assert.equal(
      report.maxPreviousBills,
      5
    );
    assert.equal(
      report.recurrence
        .occurrenceCount,
      2
    );
  }
);

test(
  'guarda F22 comercial mantiene RESOLVED más regla explícita y beneficio existente',
  () => {
    const report =
      runCommercialGuardAudit();

    assert.equal(
      report.status,
      'PASS'
    );
    assert.equal(
      report.checks
        .unresolvedNeverSells,
      true
    );
    assert.equal(
      report.checks
        .noFallbackOffer,
      true
    );
    assert.equal(
      report.checks
        .benefitHasPriority,
      true
    );
  }
);

test(
  'frontera F22 exige Explorer solo lectura sin creación de sesión',
  () => {
    const report =
      runExplorerAuthBoundaryAudit();

    assert.equal(
      report.status,
      'PASS'
    );
    assert.equal(
      report.checks.noImpersonation,
      true
    );
    assert.equal(
      report.checks.noAuthSessionFromExplorer,
      true
    );
    assert.equal(
      report.checks.personalDataNeedsAuth,
      true
    );
  }
);

test(
  'frontera F22 falla si el Explorador vuelve a permitir suplantación',
  () => {
    const report =
      runExplorerAuthBoundaryAudit({
        mode: 'READ_ONLY_COVERAGE',
        publicMetadataOnly: true,
        accountImpersonationAllowed: true,
        explorerCreatesAuthSession: true,
        financialDetailsRequireAuthenticatedDemoProfile: false,
        authenticatedEntryPoint: '/login'
      });

    assert.equal(
      report.status,
      'FAIL'
    );
  }
);

test(
  'casos congelados exigen Carlos reconexión y Ana prorrateo HIGH',
  () => {
    const result =
      expectedDemoCasesPass(
        releaseReport()
      );

    assert.equal(
      result.pass,
      true
    );
    assert.equal(
      result.cases.length,
      2
    );
  }
);

test(
  'cambio del escenario congelado bloquea el chequeo de causas críticas',
  () => {
    const release =
      releaseReport();
    release.profiles[0].scenario =
      'PACKAGES';

    assert.equal(
      expectedDemoCasesPass(
        release
      ).pass,
      false
    );
  }
);

test(
  'limitaciones B2C dinámicas conservan pending mapping y rentas no resueltas',
  () => {
    const limits =
      dynamicB2CLimits(
        b2cReport()
      );

    assert.equal(
      limits.some(
        (item) =>
          item.code ===
          'FINANCED_EQUIPMENT_MAPPING_PENDING'
      ),
      true
    );
    assert.equal(
      limits.some(
        (item) =>
          item.code ===
          'RECONNECTION_UNRESOLVED_RENT'
      ),
      true
    );
  }
);

test(
  'preflight sano con matriz KNOWN_LIMITS termina READY_WITH_KNOWN_LIMITS',
  () => {
    const report =
      buildChallengePreflightReport(
        healthyInput()
      );

    assert.equal(
      report.status,
      PREFLIGHT_STATUS
        .READY_WITH_KNOWN_LIMITS
    );
    assert.equal(
      report.ready,
      true
    );
    assert.equal(
      report.summary.failed,
      0
    );
    assert.equal(
      report.reportPrivacy.status,
      'PASS'
    );
  }
);

test(
  'preflight contiene todos los ids de control finales exactamente una vez',
  () => {
    const report =
      buildChallengePreflightReport(
        healthyInput()
      );
    const ids =
      report.checks.map(
        (item) => item.id
      );

    assert.equal(
      ids.length,
      FINAL_REQUIRED_CHECK_IDS.length
    );
    assert.deepEqual(
      [...ids].sort(),
      [...FINAL_REQUIRED_CHECK_IDS]
        .sort()
    );
  }
);

test(
  'suite fallida fuerza REVIEW_REQUIRED aunque los benchmarks estén verdes',
  () => {
    const input =
      healthyInput();
    input.testReport = {
      status: 'FAIL',
      exitCode: 1,
      tests: 600,
      pass: 599,
      fail: 1
    };

    const report =
      buildChallengePreflightReport(
        input
      );

    assert.equal(
      report.status,
      PREFLIGHT_STATUS
        .REVIEW_REQUIRED
    );
    assert.equal(
      report.ready,
      false
    );
  }
);

test(
  'Retrieval menor a 100 bloquea el cierre final',
  () => {
    const input =
      healthyInput();
    input.financialReport.metrics
      .retrievalAccuracyPct = 99.9;

    const report =
      buildChallengePreflightReport(
        input
      );
    const check =
      report.checks.find(
        (item) =>
          item.id ===
          'RETRIEVAL_ACCURACY'
      );

    assert.equal(
      check.status,
      'FAIL'
    );
    assert.equal(
      report.ready,
      false
    );
  }
);

test(
  'una violación financiera detectable bloquea hallucination guard',
  () => {
    const input =
      healthyInput();
    input.financialReport.metrics
      .detectableFinancialHallucinationRatePct = 0.1;
    input.financialReport.metrics
      .financialClaimViolations = 1;

    const report =
      buildChallengePreflightReport(
        input
      );
    const check =
      report.checks.find(
        (item) =>
          item.id ===
          'HALLUCINATION_GUARD'
      );

    assert.equal(
      check.status,
      'FAIL'
    );
    assert.equal(
      report.ready,
      false
    );
  }
);

test(
  'B2C SAMPLE_ONLY nunca autoriza el preflight final',
  () => {
    const input =
      healthyInput();
    input.b2cReport.status =
      'SAMPLE_ONLY';
    input.b2cReport.scope.limited =
      true;

    const report =
      buildChallengePreflightReport(
        input
      );

    assert.equal(
      report.checks.find(
        (item) =>
          item.id === 'B2C_MATRIX'
      ).status,
      'FAIL'
    );
    assert.equal(
      report.ready,
      false
    );
  }
);

test(
  'performance que no usa 3x bloquea F22 aunque diga PASS',
  () => {
    const input =
      healthyInput();
    input.performanceReport.profile
      .loadMultiplier = 2;
    input.performanceReport.profile
      .targetJourneys = 16;
    input.performanceReport.profile
      .targetConcurrency = 8;

    const report =
      buildChallengePreflightReport(
        input
      );

    assert.equal(
      report.checks.find(
        (item) =>
          item.id ===
          'PERFORMANCE_3X'
      ).status,
      'FAIL'
    );
  }
);

test(
  'snapshot de benchmarks descarta casos por suscriptor y journeys privados',
  () => {
    const snapshot =
      safeBenchmarkSnapshot({
        financialReport:
          financialReport(),
        b2cReport:
          b2cReport(),
        handoffReport:
          handoffReport(),
        omnichannelReport:
          omnichannelReport(),
        performanceReport:
          performanceReport()
      });

    const serialized =
      JSON.stringify(snapshot);

    assert.equal(
      serialized.includes(
        'privateJourneys'
      ),
      false
    );
    assert.equal(
      serialized.includes(
        'AUD000001'
      ),
      false
    );
    assert.equal(
      collectForbiddenReportKeys(
        snapshot
      ).length,
      0
    );
  }
);

test(
  'detector de privacidad encuentra claves privadas anidadas',
  () => {
    const findings =
      collectForbiddenReportKeys({
        ok: true,
        nested: {
          subscriberKey:
            'PRIVATE',
          sourceRows: [1, 2]
        }
      });

    assert.deepEqual(
      findings,
      [
        'nested.subscriberKey',
        'nested.sourceRows'
      ]
    );
  }
);
