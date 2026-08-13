const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeScenarioCode,
  scoreDemoCandidate,
  toCandidateSummary,
  rankCandidateSummaries,
  createSelectionReport
} = require(
  '../services/desafio1DemoSelectionLogic'
);

function baseExplanation({
  scenario = 'RECONNECTION',
  status = 'FULLY_EXPLAINED',
  evidenceLevel = 'HIGH',
  difference = 4.58,
  coveragePercent = 100,
  unexplainedAmount = 0,
  causeCount = 1,
  visibleChanges = 1,
  warnings = [],
  rentType = 'RV'
} = {}) {
  const primaryCause = {
    code: scenario,
    label: scenario,
    impactAmount: difference,
    evidenceLevel,
    evidence: {}
  };

  if (scenario === 'RECONNECTION') {
    primaryCause.evidence.orders = [
      { reason: 'Suspensión' },
      { reason: 'Reactivación' }
    ];
  }

  if (scenario === 'DISCOUNT_ENDED') {
    primaryCause.evidence.finalInstallment = true;
  }

  if (scenario === 'PLAN_CHANGE') {
    primaryCause.evidence.orders = [
      { reason: 'Cambio de Plan' }
    ];
    primaryCause.evidence.oldPlans = [
      { amount: 39.9 }
    ];
    primaryCause.evidence.newPlans = [
      { amount: 25.9 }
    ];
  }

  const causes = [primaryCause];

  while (causes.length < causeCount) {
    causes.push({
      code: 'OTHER',
      label: 'Otra causa',
      impactAmount: 1,
      evidenceLevel: 'HIGH'
    });
  }

  return {
    subscriber: {
      subscriberKey: 'demo-sub-1',
      customerKey: 'demo-customer-1',
      lobType: 'WRLS',
      businessType: 'MOVIL'
    },
    currentBill: {
      invoiceNumber: 'INV-CURRENT',
      cycleDate: '2026-07-27',
      total: 34.48,
      integrityWarnings: warnings
    },
    previousBill: {
      invoiceNumber: 'INV-PREVIOUS',
      cycleDate: '2026-06-27',
      total: 29.9,
      integrityWarnings: []
    },
    comparison: {
      difference,
      chargeChanges:
        Array.from(
          { length: visibleChanges },
          (_, index) => ({
            chargeCode: `C${index}`,
            delta:
              index === 0
                ? difference
                : 1,
            ignoreForExplanation: false
          })
        )
    },
    interpretation: {
      status,
      coveragePercent,
      unexplainedAmount,
      causes,
      currentBillFindings: [],
      rentContext: {
        current: rentType
          ? {
              resolved: true,
              rentType
            }
          : {
              resolved: false,
              rentType: null
            }
      },
      diagnostics: {
        unmatchedProrationEvidence: []
      }
    },
    customerFacing: {
      headline: 'Caso demo',
      summary: 'Resumen seguro'
    }
  };
}

function prorationExplanation() {
  return {
    subscriber: {
      subscriberKey: 'demo-proration',
      customerKey: 'demo-customer-2',
      lobType: 'WRLS',
      businessType: 'MOVIL'
    },
    currentBill: {
      invoiceNumber: 'INV-FIRST',
      cycleDate: '2026-06-30',
      total: 66.65,
      integrityWarnings: []
    },
    previousBill: null,
    comparison: null,
    interpretation: {
      status: 'NO_PREVIOUS_BILL',
      coveragePercent: null,
      unexplainedAmount: null,
      causes: [],
      currentBillFindings: [
        {
          code: 'PRORATION',
          label: 'Prorrateo',
          amount: 26.66,
          evidenceLevel: 'HIGH',
          periodStartDate: '2026-06-11',
          periodEndDate: '2026-06-30',
          rentType: 'RA'
        }
      ],
      rentContext: {
        current: {
          resolved: true,
          rentType: 'RA'
        }
      },
      diagnostics: {
        unmatchedProrationEvidence: []
      }
    },
    customerFacing: {
      headline: 'Tu recibo incluye un prorrateo',
      summary: 'Prorrateo verificado'
    }
  };
}

test('normaliza únicamente los cuatro escenarios publicados para Fase 4', () => {
  assert.equal(
    normalizeScenarioCode('reconnection'),
    'RECONNECTION'
  );
  assert.equal(
    normalizeScenarioCode('discount ended'),
    'DISCOUNT_ENDED'
  );
  assert.equal(
    normalizeScenarioCode('plan-change'),
    'PLAN_CHANGE'
  );
  assert.equal(
    normalizeScenarioCode('proration'),
    'PRORATION'
  );
  assert.equal(
    normalizeScenarioCode('otro'),
    null
  );
});

test('reconexión completamente conciliada con órdenes obtiene score máximo', () => {
  const scoring = scoreDemoCandidate(
    baseExplanation(),
    'RECONNECTION'
  );

  assert.equal(scoring.eligible, true);
  assert.equal(scoring.score, 100);
  assert.equal(
    scoring.breakdown.grounding,
    35
  );
  assert.equal(
    scoring.breakdown.financialConsistency,
    25
  );
});

test('fin de descuento HIGH y completamente explicado es elegible', () => {
  const scoring = scoreDemoCandidate(
    baseExplanation({
      scenario: 'DISCOUNT_ENDED',
      difference: 13.23
    }),
    'DISCOUNT_ENDED'
  );

  assert.equal(scoring.eligible, true);
  assert.equal(scoring.score, 100);
});

test('cambio de plan exige el escenario exacto y puede alcanzar score máximo', () => {
  const scoring = scoreDemoCandidate(
    baseExplanation({
      scenario: 'PLAN_CHANGE',
      difference: -14
    }),
    'PLAN_CHANGE'
  );

  assert.equal(scoring.eligible, true);
  assert.equal(scoring.score, 100);
});

test('primer recibo con prorrateo HIGH es elegible sin inventar recibo anterior', () => {
  const scoring = scoreDemoCandidate(
    prorationExplanation(),
    'PRORATION'
  );

  assert.equal(scoring.eligible, true);
  assert.equal(scoring.score, 100);
  assert.equal(
    scoring.diagnostics.status,
    'NO_PREVIOUS_BILL'
  );
});


test('prorrateo con total de recibo no positivo no se recomienda como demo principal', () => {
  const explanation = prorationExplanation();
  explanation.currentBill.total = -17.07;

  const scoring = scoreDemoCandidate(
    explanation,
    'PRORATION'
  );

  assert.equal(scoring.eligible, false);
  assert.ok(
    scoring.disqualifiers.some(
      (value) =>
        value.includes('no es positivo')
    )
  );
});

test('un escenario distinto no se acepta aunque la explicación sea FULLY_EXPLAINED', () => {
  const scoring = scoreDemoCandidate(
    baseExplanation(),
    'PLAN_CHANGE'
  );

  assert.equal(scoring.eligible, false);
  assert.equal(
    scoring.diagnostics.scenarioCauses,
    0
  );
});

test('una causa parcial no se recomienda como caso demo estricto', () => {
  const scoring = scoreDemoCandidate(
    baseExplanation({
      status: 'PARTIALLY_EXPLAINED',
      coveragePercent: 80,
      unexplainedAmount: 3
    }),
    'RECONNECTION'
  );

  assert.equal(scoring.eligible, false);
  assert.ok(scoring.score < 100);
});

test('evidencia MEDIUM no es suficiente para el shortlist', () => {
  const scoring = scoreDemoCandidate(
    baseExplanation({
      evidenceLevel: 'MEDIUM'
    }),
    'RECONNECTION'
  );

  assert.equal(scoring.eligible, false);
});

test('advertencias de integridad reducen el componente de calidad sin alterar la causa', () => {
  const scoring = scoreDemoCandidate(
    baseExplanation({
      warnings: ['warning']
    }),
    'RECONNECTION'
  );

  assert.equal(scoring.eligible, true);
  assert.equal(
    scoring.breakdown.dataQuality,
    8
  );
  assert.equal(scoring.score, 98);
});

test('toCandidateSummary conserva solo el resumen necesario para comparar casos', () => {
  const explanation =
    baseExplanation();
  const scoring =
    scoreDemoCandidate(
      explanation,
      'RECONNECTION'
    );

  const summary =
    toCandidateSummary({
      explanation,
      scenarioCode:
        'RECONNECTION',
      scoring
    });

  assert.equal(
    summary.subscriberKey,
    'demo-sub-1'
  );
  assert.equal(summary.score, 100);
  assert.equal(
    summary.safeSummary,
    'Resumen seguro'
  );
  assert.equal(
    summary.rentType,
    'RV'
  );
});

test('ranking prioriza score y limita la cantidad de resultados', () => {
  const ranked =
    rankCandidateSummaries([
      {
        eligible: true,
        score: 90,
        coveragePercent: 100,
        subscriberKey: 'B',
        diagnostics: {
          visibleChargeChanges: 1
        }
      },
      {
        eligible: true,
        score: 100,
        coveragePercent: 100,
        subscriberKey: 'A',
        diagnostics: {
          visibleChargeChanges: 1
        }
      },
      {
        eligible: false,
        score: 100,
        subscriberKey: 'X',
        diagnostics: {}
      }
    ], {
      limit: 1
    });

  assert.equal(ranked.length, 1);
  assert.equal(
    ranked[0].subscriberKey,
    'A'
  );
});

test('reporte declara que ranking no usa LLM ni crea logins', () => {
  const report =
    createSelectionReport({
      scenarioResults: {
        RECONNECTION: {
          top: []
        }
      },
      prefilterLimit: 300,
      topLimit: 5,
      dataLineage: []
    });

  assert.equal(
    report.phase,
    'PHASE_4'
  );
  assert.equal(
    report.safeguards
      .llmUsedForRanking,
    false
  );
  assert.equal(
    report.safeguards
      .selectionDoesNotCreateLogins,
    true
  );
});
