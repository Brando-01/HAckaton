const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeCoverageSeed,
  getRecognizedItems,
  getHighestEvidenceLevel,
  buildCoverageProfile,
  assignDemoIds,
  buildCoverageSummary,
  percentage
} = require(
  '../services/datasetCoverageLogic'
);

function reconnectionExplanation({
  evidenceLevel = 'HIGH',
  status = 'FULLY_EXPLAINED',
  unexplainedAmount = 0
} = {}) {
  return {
    subscriber: {
      subscriberKey: 'SUB-1',
      customerKey: 'CUS-1',
      lobType: 'WRLS',
      businessType: 'MOVIL'
    },
    currentBill: {
      invoiceNumber: 'INV-2',
      cycleDate: '2026-07-15',
      total: 67.47,
      integrityWarnings: []
    },
    previousBill: {
      invoiceNumber: 'INV-1',
      cycleDate: '2026-06-15',
      total: 62.89,
      integrityWarnings: []
    },
    comparison: {
      difference: 4.58,
      chargeChanges: [
        {
          chargeCode: 'RECON',
          delta: 4.58,
          ignoreForExplanation: false
        }
      ]
    },
    interpretation: {
      status,
      coveragePercent:
        status === 'FULLY_EXPLAINED'
          ? 100
          : 60,
      unexplainedAmount,
      causes: [
        {
          code: 'RECONNECTION',
          label: 'Cargo por reconexión',
          impactAmount: 4.58,
          evidenceLevel,
          evidence: {
            orders: [
              { reason: 'Suspensión' },
              { reason: 'Reactivación' }
            ]
          }
        }
      ],
      currentBillFindings: [],
      rentContext: {
        current: {
          resolved: true,
          rentType: 'RV'
        }
      },
      diagnostics: {
        unmatchedProrationEvidence: []
      }
    },
    customerFacing: {
      headline: 'Tu recibo aumentó S/ 4.58',
      summary: 'Reconexión verificada'
    }
  };
}

function prorationExplanation() {
  return {
    subscriber: {
      subscriberKey: 'SUB-2',
      customerKey: 'CUS-2',
      lobType: 'WRLS',
      businessType: 'MOVIL'
    },
    currentBill: {
      invoiceNumber: 'INV-FIRST',
      cycleDate: '2026-06-30',
      total: 51.83,
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
          amount: 21.92,
          evidenceLevel: 'HIGH',
          periodStartDate: '2026-06-09',
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
      headline: 'Prorrateo',
      summary: 'Prorrateo verificado'
    }
  };
}

function seed(
  subscriberKey,
  invoiceCount
) {
  return {
    subscriberKey,
    customerKey:
      `CUS-${subscriberKey}`,
    lobType: 'WRLS',
    businessType: 'MOVIL',
    invoiceCount,
    latestCycleDate:
      '2026-07-15'
  };
}

test(
  'normaliza seeds sin inventar facturación',
  () => {
    const result =
      normalizeCoverageSeed({
        subscriberKey: ' X ',
        invoiceCount: '2'
      });

    assert.equal(
      result.subscriberKey,
      'X'
    );
    assert.equal(
      result.invoiceCount,
      2
    );
  }
);

test(
  'un suscriptor sin recibos queda fuera de los perfiles utilizables',
  () => {
    const profile =
      buildCoverageProfile({
        seed: seed('SUB-0', 0)
      });

    assert.equal(
      profile.hasInvoices,
      false
    );
    assert.equal(
      profile.consultable,
      false
    );
    assert.equal(
      profile.qualityTier,
      'NO_BILL'
    );
  }
);

test(
  'reconexión HIGH completamente conciliada queda consultable, comparable y premium',
  () => {
    const profile =
      buildCoverageProfile({
        seed: seed('SUB-1', 2),
        explanation:
          reconnectionExplanation()
      });

    assert.equal(profile.consultable, true);
    assert.equal(profile.comparable, true);
    assert.equal(profile.explainable, true);
    assert.equal(profile.highConfidence, true);
    assert.equal(profile.fullyExplained, true);
    assert.equal(profile.demoPremium, true);
    assert.equal(profile.primaryScenario, 'RECONNECTION');
    assert.equal(profile.premiumScore, 100);
    assert.equal(profile.qualityTier, 'DEMO_PREMIUM');
  }
);

test(
  'primer recibo con prorrateo puede ser premium aunque no sea comparable',
  () => {
    const profile =
      buildCoverageProfile({
        seed: seed('SUB-2', 1),
        explanation:
          prorationExplanation()
      });

    assert.equal(profile.consultable, true);
    assert.equal(profile.comparable, false);
    assert.equal(profile.explainable, true);
    assert.equal(profile.highConfidence, true);
    assert.equal(profile.demoPremium, true);
    assert.equal(profile.primaryScenario, 'PRORATION');
    assert.equal(profile.rentType, 'RA');
  }
);

test(
  'una nota de ajuste usada solo como contexto no cuenta como explicación',
  () => {
    const explanation =
      prorationExplanation();

    explanation.interpretation
      .currentBillFindings = [
        {
          code: 'ADJUSTMENT_NOTE_CONTEXT',
          evidenceLevel: 'HIGH'
        }
      ];

    const recognized =
      getRecognizedItems(
        explanation
      );

    assert.equal(
      recognized.items.length,
      0
    );

    const profile =
      buildCoverageProfile({
        seed: seed('SUB-3', 1),
        explanation
      });

    assert.equal(
      profile.explainable,
      false
    );
  }
);

test(
  'evidencia MEDIUM se reconoce como explicación pero no como HIGH',
  () => {
    const profile =
      buildCoverageProfile({
        seed: seed('SUB-4', 2),
        explanation:
          reconnectionExplanation({
            evidenceLevel: 'MEDIUM'
          })
      });

    assert.equal(profile.explainable, true);
    assert.equal(profile.highConfidence, false);
    assert.equal(profile.demoPremium, false);
    assert.equal(profile.evidenceLevel, 'MEDIUM');
  }
);

test(
  'un análisis que falla no se marca como consultable aunque PLANTA tenga facturación',
  () => {
    const error =
      new Error('fixture');
    error.code =
      'INVOICE_WITHOUT_CHARGES';

    const profile =
      buildCoverageProfile({
        seed: seed('SUB-5', 2),
        error
      });

    assert.equal(profile.hasInvoices, true);
    assert.equal(profile.consultable, false);
    assert.equal(
      profile.qualityTier,
      'ANALYSIS_ERROR'
    );
    assert.equal(
      profile.errorCode,
      'INVOICE_WITHOUT_CHARGES'
    );
  }
);

test(
  'selecciona el mayor nivel de evidencia entre causas y hallazgos',
  () => {
    assert.equal(
      getHighestEvidenceLevel([
        { evidenceLevel: 'LOW' },
        { evidenceLevel: 'HIGH' },
        { evidenceLevel: 'MEDIUM' }
      ]),
      'HIGH'
    );
  }
);

test(
  'los alias DEMO se asignan solo a consultables y son deterministas',
  () => {
    const rows =
      assignDemoIds([
        { consultable: false },
        { consultable: true },
        { consultable: true },
        { consultable: false }
      ]);

    assert.equal(rows[0].demoId, null);
    assert.equal(rows[1].demoId, 'DEMO000001');
    assert.equal(rows[2].demoId, 'DEMO000002');
    assert.equal(rows[3].demoId, null);
  }
);

test(
  'el resumen calcula capacidades independientes y no fuerza comparabilidad en primer recibo',
  () => {
    const profiles =
      assignDemoIds([
        buildCoverageProfile({
          seed: seed('SUB-0', 0)
        }),
        buildCoverageProfile({
          seed: seed('SUB-1', 2),
          explanation:
            reconnectionExplanation()
        }),
        buildCoverageProfile({
          seed: seed('SUB-2', 1),
          explanation:
            prorationExplanation()
        })
      ]);

    const summary =
      buildCoverageSummary(
        profiles,
        { totalAvailable: 20 }
      );

    assert.equal(summary.scope.scanned, 3);
    assert.equal(summary.scope.totalAvailable, 20);
    assert.equal(summary.scope.limited, true);
    assert.equal(summary.counts.consultable, 2);
    assert.equal(summary.counts.comparable, 1);
    assert.equal(summary.counts.explainable, 2);
    assert.equal(summary.counts.highConfidence, 2);
    assert.equal(summary.counts.demoPremium, 2);
    assert.equal(summary.scenarios.RECONNECTION, 1);
    assert.equal(summary.scenarios.PRORATION, 1);
  }
);

test(
  'percentage evita división entre cero',
  () => {
    assert.equal(percentage(2, 4), 50);
    assert.equal(percentage(2, 0), 0);
  }
);

test(
  'una causa PACKAGES HIGH entra a cobertura masiva sin convertirse artificialmente en demo premium de Fase 4',
  () => {
    const explanation =
      reconnectionExplanation();

    explanation.interpretation.causes = [
      {
        code: 'PACKAGES',
        label: 'Paquete adicional',
        impactAmount: 9.99,
        evidenceLevel: 'HIGH'
      }
    ];
    explanation.interpretation.status =
      'FULLY_EXPLAINED';
    explanation.interpretation
      .unexplainedAmount = 0;
    explanation.comparison.difference =
      9.99;
    explanation.currentBill.total =
      72.88;
    explanation.previousBill.total =
      62.89;

    const profile =
      buildCoverageProfile({
        seed: seed('SUB-PKG', 2),
        explanation
      });

    assert.equal(
      profile.explainable,
      true
    );
    assert.equal(
      profile.highConfidence,
      true
    );
    assert.deepEqual(
      profile.scenarioCodes,
      ['PACKAGES']
    );
    assert.equal(
      profile.primaryScenario,
      'PACKAGES'
    );
    assert.equal(
      profile.demoPremium,
      false
    );
  }
);
