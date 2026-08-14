const test = require('node:test');
const assert = require('node:assert/strict');

const {
  ASSERTION_STATUS,
  groupRawCharges,
  buildRawChargeChanges,
  auditFinancialExplanation,
  buildSafeFinancialResponseTrace,
  buildSafeCaseAudit,
  mergeAuditCases
} = require(
  '../services/desafio1FinancialAuditLogic'
);

function rawCharge({
  code,
  amount,
  net = amount,
  sourceRow,
  group = null,
  classification = null
}) {
  return {
    chargeCode: code,
    chargeTotalAmount: amount,
    chargeNetAmount: net,
    sourceRow,
    group,
    classification
  };
}

function invoice({
  number,
  total,
  netTotal = total,
  cycleDate,
  items,
  rawChargeRows = items.length
}) {
  return {
    invoiceNumber: number,
    billingArrangement: 'BA-1',
    cycleDate,
    total,
    netTotal,
    rawChargeRows,
    subscriberKeys: ['PRIVATE-SUBSCRIBER'],
    items
  };
}

function item({
  code,
  amount,
  netAmount = amount,
  sourceRows,
  group = null,
  classification = null
}) {
  return {
    chargeCode: code,
    amount,
    netAmount,
    sourceRows,
    group,
    groups: group ? [group] : [],
    classification,
    classifications:
      classification
        ? [classification]
        : []
  };
}

function baseFixture({
  currentTotal = 50,
  causeImpact = 10,
  safeguards = null
} = {}) {
  const rawCurrentCharges = [
    rawCharge({
      code: 'PLAN_A',
      amount: 60,
      sourceRow: 1
    }),
    rawCharge({
      code: 'DISC_A',
      amount: -10,
      sourceRow: 2
    })
  ];

  const rawPreviousCharges = [
    rawCharge({
      code: 'PLAN_A',
      amount: 50,
      sourceRow: 3
    }),
    rawCharge({
      code: 'DISC_A',
      amount: -10,
      sourceRow: 4
    })
  ];

  const currentBill = invoice({
    number: 'INV-2',
    total: currentTotal,
    cycleDate: '2026-07-31',
    rawChargeRows: 2,
    items: [
      item({
        code: 'PLAN_A',
        amount: 60,
        sourceRows: [1]
      }),
      item({
        code: 'DISC_A',
        amount: -10,
        sourceRows: [2]
      })
    ]
  });

  const previousBill = invoice({
    number: 'INV-1',
    total: 40,
    cycleDate: '2026-06-30',
    rawChargeRows: 2,
    items: [
      item({
        code: 'PLAN_A',
        amount: 50,
        sourceRows: [3]
      }),
      item({
        code: 'DISC_A',
        amount: -10,
        sourceRows: [4]
      })
    ]
  });

  const explanation = {
    currentBill,
    previousBill,
    comparison: {
      currentTotal,
      previousTotal: 40,
      difference: 10,
      reconciliationResidual: 0,
      chargeChanges: [
        {
          chargeCode: 'PLAN_A',
          previousAmount: 50,
          currentAmount: 60,
          delta: 10
        }
      ]
    },
    interpretation: {
      status: 'FULLY_EXPLAINED',
      explainedNetAmount:
        causeImpact,
      causes: [
        {
          code: 'RECONNECTION',
          impactAmount:
            causeImpact,
          claimedChargeCodes: [
            'PLAN_A'
          ],
          evidence: {
            brainyReconnections: [
              {
                sourceRows: [31],
                amount: 10
              }
            ]
          }
        }
      ],
      currentBillFindings: [
        {
          code: 'ACTIVE_DISCOUNT',
          discountAmount: 10,
          sourceRows: {
            facturacion: [2],
            brainy: [21]
          }
        }
      ]
    },
    safeguards:
      safeguards || {
        llmUsedForFinancialReasoning:
          false,
        causeAmountsDerivedFromChargeDeltas:
          true,
        notesAddedAsCausesAutomatically:
          false,
        suspensionCreditsAddedAsVariationCauses:
          false
      }
  };

  return {
    explanation,
    rawCurrentCharges,
    rawPreviousCharges,
    rawEvidence: {
      prorations: [],
      reconnections: [
        {
          sourceRow: 31,
          amount: 10
        }
      ],
      discounts: [
        {
          sourceRow: 21,
          discountAmount: 10
        }
      ],
      creditNotes: []
    },
    rawPreviousEvidence: {
      prorations: [],
      reconnections: [],
      discounts: [],
      creditNotes: []
    },
    rawOrders: []
  };
}

test(
  'agrupa filas crudas por charge code sin perder montos ni source rows',
  () => {
    const map = groupRawCharges([
      rawCharge({
        code: 'A',
        amount: 2.25,
        net: 2,
        sourceRow: 7
      }),
      rawCharge({
        code: 'A',
        amount: 1.75,
        net: 1.5,
        sourceRow: 8
      })
    ]);

    assert.equal(
      map.get('A').amount,
      4
    );
    assert.equal(
      map.get('A').netAmount,
      3.5
    );
    assert.deepEqual(
      map.get('A').sourceRows,
      [7, 8]
    );
  }
);

test(
  'reconstruye deltas crudos independientemente del objeto comparison',
  () => {
    const changes =
      buildRawChargeChanges(
        [
          rawCharge({
            code: 'A',
            amount: 12,
            sourceRow: 1
          })
        ],
        [
          rawCharge({
            code: 'A',
            amount: 9,
            sourceRow: 2
          }),
          rawCharge({
            code: 'B',
            amount: 4,
            sourceRow: 3
          })
        ]
      );

    assert.equal(
      changes.get('A').delta,
      3
    );
    assert.equal(
      changes.get('B').delta,
      -4
    );
  }
);

test(
  'Retrieval Accuracy considera un CHARGE_CODE agregado a S/ 0.00 como cambio estructural válido',
  () => {
    const fixture = baseFixture();

    fixture.rawCurrentCharges.push(
      rawCharge({
        code: 'ZERO_ADDED',
        amount: 0,
        net: 0,
        sourceRow: 95
      })
    );
    fixture.explanation.currentBill
      .items.push(
        item({
          code: 'ZERO_ADDED',
          amount: 0,
          netAmount: 0,
          sourceRows: [95]
        })
      );
    fixture.explanation.currentBill
      .rawChargeRows += 1;
    fixture.explanation.comparison
      .chargeChanges.push({
        chargeCode: 'ZERO_ADDED',
        previousAmount: 0,
        currentAmount: 0,
        delta: 0,
        status: 'ADDED'
      });

    const audit =
      auditFinancialExplanation(
        fixture
      );
    const assertion =
      audit.assertions.find(
        (candidate) =>
          candidate.id ===
            'COMPARISON_CHANGE_CODE_SET_EXACT'
      );

    assert.equal(
      assertion.status,
      ASSERTION_STATUS.PASS
    );
    assert.equal(audit.status, 'PASS');
  }
);


test(
  'una explicación completamente grounded logra 100% retrieval y 0 violaciones financieras detectables',
  () => {
    const fixture = baseFixture();
    const audit =
      auditFinancialExplanation(
        fixture
      );

    assert.equal(audit.status, 'PASS');
    assert.equal(
      audit.metrics
        .retrievalAccuracyPct,
      100
    );
    assert.equal(
      audit.metrics
        .groundingAccuracyPct,
      100
    );
    assert.equal(
      audit.metrics
        .detectableFinancialHallucinationRatePct,
      0
    );
    assert.equal(
      audit.metrics
        .financialClaimViolations,
      0
    );
  }
);

test(
  'un total estructurado distinto de la suma cruda se detecta como violación de retrieval y claim monetario',
  () => {
    const fixture = baseFixture({
      currentTotal: 51
    });
    const audit =
      auditFinancialExplanation(
        fixture
      );

    assert.equal(audit.status, 'FAIL');
    assert.ok(
      audit.metrics
        .retrievalAccuracyPct < 100
    );
    assert.ok(
      audit.metrics
        .financialClaimViolations >= 1
    );
    assert.ok(
      audit.assertions.some(
        (item) =>
          item.id ===
            'CURRENT_TOTAL_EXACT' &&
          item.status ===
            ASSERTION_STATUS.FAIL
      )
    );
  }
);

test(
  'una causa no puede declarar un impacto distinto del delta crudo que reclama',
  () => {
    const fixture = baseFixture({
      causeImpact: 9
    });
    const audit =
      auditFinancialExplanation(
        fixture
      );

    const assertion =
      audit.assertions.find(
        (item) =>
          item.id ===
          'CAUSE_RECONNECTION_IMPACT_GROUNDED'
      );

    assert.equal(
      assertion.status,
      ASSERTION_STATUS.FAIL
    );
    assert.equal(
      assertion.expected,
      10
    );
    assert.equal(
      assertion.actual,
      9
    );
  }
);

test(
  'una causa de reconexión exige source rows existentes en la fuente de respaldo',
  () => {
    const fixture = baseFixture();
    fixture.rawEvidence
      .reconnections = [];

    const audit =
      auditFinancialExplanation(
        fixture
      );

    assert.ok(
      audit.assertions.some(
        (item) =>
          item.id ===
            'CAUSE_RECONNECTION_EVIDENCE_ROWS' &&
          item.status ===
            ASSERTION_STATUS.FAIL
      )
    );
  }
);

test(
  'un prorrateo se valida contra la fila facturada y la fila Brainy declaradas',
  () => {
    const fixture = baseFixture();
    fixture.explanation.interpretation
      .currentBillFindings = [
        {
          code: 'PRORATION',
          amount: 7.5,
          sourceRows: {
            facturacion: [51],
            brainy: [61]
          }
        }
      ];
    fixture.rawCurrentCharges.push(
      rawCharge({
        code: 'PRO_A',
        amount: 7.5,
        sourceRow: 51
      })
    );
    fixture.explanation.currentBill
      .items.push(
        item({
          code: 'PRO_A',
          amount: 7.5,
          sourceRows: [51]
        })
      );
    fixture.explanation.currentBill
      .rawChargeRows += 1;
    fixture.explanation.currentBill
      .total += 7.5;
    fixture.explanation.currentBill
      .netTotal += 7.5;
    fixture.explanation.comparison
      .currentTotal += 7.5;
    fixture.explanation.comparison
      .difference += 7.5;
    fixture.explanation.comparison
      .chargeChanges.push({
        chargeCode: 'PRO_A',
        previousAmount: 0,
        currentAmount: 7.5,
        delta: 7.5
      });
    fixture.explanation.interpretation
      .causes.push({
        code: 'PRORATION',
        impactAmount: 7.5,
        claimedChargeCodes: ['PRO_A'],
        evidence: {}
      });
    fixture.explanation.interpretation
      .explainedNetAmount += 7.5;
    fixture.rawEvidence.prorations = [
      {
        sourceRow: 61,
        proratedAmount: 7.5
      }
    ];

    const audit =
      auditFinancialExplanation(
        fixture
      );

    assert.equal(
      audit.assertions.find(
        (item) =>
          item.id ===
            'FINDING_PRORATION_FACT_AMOUNT'
      ).status,
      ASSERTION_STATUS.PASS
    );
    assert.equal(
      audit.assertions.find(
        (item) =>
          item.id ===
            'FINDING_PRORATION_BRAINY_AMOUNT'
      ).status,
      ASSERTION_STATUS.PASS
    );
  }
);

test(
  'un ajuste por suspensión se contrasta con nota cruda y timeline de reconexión',
  () => {
    const fixture = baseFixture();
    fixture.explanation.interpretation
      .currentBillFindings = [
        {
          code:
            'SUSPENSION_ADJUSTMENT',
          amount: 5.64,
          cutDate: '2026-06-30',
          reconnectionDate:
            '2026-07-04',
          sourceRows: {
            note: [71],
            reconnection: [72],
            facturacion: [1]
          }
        }
      ];
    fixture.rawEvidence.creditNotes = [
      {
        sourceRow: 71,
        amount: -5.64
      }
    ];
    fixture.rawEvidence.reconnections = [
      {
        sourceRow: 72,
        cutDate: '2026-06-30',
        reconnectionDate:
          '2026-07-04'
      }
    ];
    fixture.explanation.interpretation
      .causes[0].evidence
      .brainyReconnections = [
        {
          sourceRows: [72],
          amount: 10
        }
      ];

    const audit =
      auditFinancialExplanation(
        fixture
      );

    assert.equal(
      audit.assertions.find(
        (item) =>
          item.id ===
            'FINDING_SUSPENSION_NOTE_AMOUNT'
      ).status,
      ASSERTION_STATUS.PASS
    );
    assert.equal(
      audit.assertions.find(
        (item) =>
          item.id ===
            'FINDING_SUSPENSION_TIMELINE'
      ).status,
      ASSERTION_STATUS.PASS
    );
  }
);

test(
  'un crédito crudo de -5.635 se audita como S/ 5.64 y no pierde un centavo por el signo',
  () => {
    const fixture = baseFixture();
    fixture.explanation.interpretation
      .currentBillFindings = [
        {
          code:
            'SUSPENSION_ADJUSTMENT',
          amount: 5.64,
          cutDate: '2026-06-30',
          reconnectionDate:
            '2026-07-04',
          sourceRows: {
            note: [73],
            reconnection: [74],
            facturacion: [1]
          }
        }
      ];
    fixture.rawEvidence.creditNotes = [
      {
        sourceRow: 73,
        amount: -5.635
      }
    ];
    fixture.rawEvidence.reconnections = [
      {
        sourceRow: 74,
        cutDate: '2026-06-30',
        reconnectionDate:
          '2026-07-04'
      }
    ];
    fixture.explanation.interpretation
      .causes[0].evidence
      .brainyReconnections = [
        {
          sourceRows: [74],
          amount: 10
        }
      ];

    const audit =
      auditFinancialExplanation(
        fixture
      );
    const assertion =
      audit.assertions.find(
        (candidate) =>
          candidate.id ===
            'FINDING_SUSPENSION_NOTE_AMOUNT'
      );

    assert.equal(
      assertion.status,
      ASSERTION_STATUS.PASS
    );
    assert.equal(
      assertion.expected,
      5.64
    );
    assert.equal(
      assertion.actual,
      5.64
    );
  }
);


test(
  'un hallazgo de nota contextual conserva trazabilidad sin convertirse en causa',
  () => {
    const fixture = baseFixture();
    fixture.explanation.interpretation
      .currentBillFindings = [
        {
          code:
            'ADJUSTMENT_NOTE_CONTEXT',
          amount: -3.2,
          sourceRows: [81]
        }
      ];
    fixture.rawEvidence.creditNotes = [
      {
        sourceRow: 81,
        amount: -3.2
      }
    ];

    const audit =
      auditFinancialExplanation(
        fixture
      );

    assert.equal(
      audit.assertions.find(
        (item) =>
          item.id ===
            'FINDING_NOTE_CONTEXT_AMOUNT'
      ).status,
      ASSERTION_STATUS.PASS
    );
  }
);

test(
  'la auditoría falla si desaparece la salvaguarda explícita que prohíbe razonamiento financiero por LLM',
  () => {
    const fixture = baseFixture();
    delete fixture.explanation
      .safeguards
      .llmUsedForFinancialReasoning;

    const audit =
      auditFinancialExplanation(
        fixture
      );

    assert.ok(
      audit.assertions.some(
        (item) =>
          item.id ===
            'POLICY_NO_LLM_FINANCIAL_REASONING' &&
          item.status ===
            ASSERTION_STATUS.FAIL
      )
    );
  }
);

test(
  'buildSafeCaseAudit no expone subscriberKey ni invoiceNumber aunque la explicación interna los contenga',
  () => {
    const fixture = baseFixture();
    const audit =
      auditFinancialExplanation(
        fixture
      );
    const safe =
      buildSafeCaseAudit(
        audit,
        {
          caseRef: 'AUD000007',
          explanation:
            fixture.explanation
        }
      );

    const serialized =
      JSON.stringify(safe);

    assert.equal(
      safe.caseRef,
      'AUD000007'
    );
    assert.equal(
      serialized.includes(
        'PRIVATE-SUBSCRIBER'
      ),
      false
    );
    assert.equal(
      serialized.includes('INV-2'),
      false
    );
  }
);

test(
  'mergeAuditCases calcula métricas agregadas y elimina campos privados auxiliares del benchmark',
  () => {
    const fixture = baseFixture();
    const audit =
      auditFinancialExplanation(
        fixture
      );
    const safe =
      buildSafeCaseAudit(
        audit,
        {
          caseRef: 'AUD000001',
          explanation:
            fixture.explanation
        }
      );

    const report = mergeAuditCases([
      {
        ...safe,
        _categorySummary:
          audit.assertionSummary
            .byCategory,
        _monetaryEvaluable:
          audit.assertionSummary
            .monetaryEvaluable,
        _monetaryFailed:
          audit.assertionSummary
            .monetaryFailed
      }
    ], {
      requested: 1,
      population: 18450,
      generatedAt:
        '2026-08-14T00:00:00.000Z'
    });

    assert.equal(report.status, 'PASS');
    assert.equal(
      report.metrics
        .retrievalAccuracyPct,
      100
    );
    assert.equal(
      report.metrics
        .groundingAccuracyPct,
      100
    );
    assert.equal(
      report.metrics
        .policyCompliancePct,
      100
    );
    assert.equal(
      report.metrics
        .detectableFinancialHallucinationRatePct,
      0
    );
    assert.equal(
      report.cases[0]
        ._categorySummary,
      undefined
    );
    assert.equal(
      report.safeguards
        .subscriberKeyExposed,
      false
    );
  }
);


test(
  'financialTrace conserva reglas y montos auditables sin exponer ids privados ni filas fuente',
  () => {
    const fixture = baseFixture();
    fixture.explanation.dataLineage = {
      datasets: [
        {
          datasetKey: 'FACTURACION_CLIENTES',
          subscriberKey: 'PRIVATE-SUBSCRIBER',
          customerKey: 'PRIVATE-CUSTOMER',
          sourceRows: [1, 2]
        },
        {
          datasetKey: 'BRAINY_RECONEXIONES',
          sourceRows: [31]
        }
      ]
    };
    fixture.explanation.interpretation.ruleVersion =
      'rules-test-v1';
    fixture.explanation.interpretation.causes[0].ruleId =
      'RULE-RECONNECTION-TEST';
    fixture.explanation.interpretation.causes[0].evidenceLevel =
      'HIGH';

    const trace =
      buildSafeFinancialResponseTrace(
        fixture.explanation
      );
    const serialized =
      JSON.stringify(trace);

    assert.equal(
      trace.schemaVersion,
      'desafio1-phase16-response-trace-v1'
    );
    assert.equal(
      trace.financialReasoning,
      'DETERMINISTIC'
    );
    assert.equal(
      trace.retrieval.current.total,
      50
    );
    assert.equal(
      trace.interpretation.ruleVersion,
      'rules-test-v1'
    );
    assert.equal(
      trace.rulesApplied[0].ruleId,
      'RULE-RECONNECTION-TEST'
    );
    assert.deepEqual(
      trace.datasets,
      [
        'FACTURACION_CLIENTES',
        'BRAINY_RECONEXIONES'
      ]
    );
    assert.equal(
      trace.safeguards.privateIdentifiersIncluded,
      false
    );
    assert.equal(
      trace.safeguards.sourceRowsIncluded,
      false
    );
    assert.equal(
      trace.safeguards.invoiceNumbersIncluded,
      false
    );
    assert.equal(
      serialized.includes('PRIVATE-SUBSCRIBER'),
      false
    );
    assert.equal(
      serialized.includes('PRIVATE-CUSTOMER'),
      false
    );
    assert.equal(
      serialized.includes('INV-2'),
      false
    );
    assert.equal(
      serialized.includes('\"sourceRows\":'),
      false
    );
  }
);


test(
  'Retrieval Accuracy detecta un CHARGE_CODE crudo omitido aunque el total agregado siga coincidiendo',
  () => {
    const fixture = baseFixture();

    fixture.rawCurrentCharges.push(
      rawCharge({
        code: 'EXTRA_POS',
        amount: 5,
        sourceRow: 91
      }),
      rawCharge({
        code: 'EXTRA_NEG',
        amount: -5,
        sourceRow: 92
      })
    );
    fixture.explanation.currentBill.rawChargeRows = 4;

    const audit =
      auditFinancialExplanation(
        fixture
      );

    assert.ok(
      audit.assertions.some(
        (assertion) =>
          assertion.id ===
            'CURRENT_CHARGE_CODE_SET_EXACT' &&
          assertion.status ===
            ASSERTION_STATUS.FAIL
      )
    );
    assert.ok(
      audit.metrics.retrievalAccuracyPct < 100
    );
  }
);


test(
  'Retrieval Accuracy detecta incluso una diferencia de un centavo después de redondear',
  () => {
    const fixture = baseFixture({
      currentTotal: 50.01
    });
    const audit =
      auditFinancialExplanation(
        fixture
      );

    assert.ok(
      audit.assertions.some(
        (assertion) =>
          assertion.id ===
            'CURRENT_TOTAL_EXACT' &&
          assertion.status ===
            ASSERTION_STATUS.FAIL
      )
    );
  }
);
