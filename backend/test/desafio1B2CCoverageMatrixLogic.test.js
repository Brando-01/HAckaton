const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CRITICAL_SCENARIOS,
  normalizeProduct,
  collectRentTypesDeep,
  resolveScenarioRentType,
  buildSubscriberMatrixObservation,
  buildDimensions,
  buildB2CCoverageMatrixReport
} = require(
  '../services/desafio1B2CCoverageMatrixLogic'
);

function baseExplanation({
  businessType = 'MOVIL',
  lobType = 'WRLS',
  rentType = 'RA',
  causes = [],
  findings = [],
  llmUsed = false,
  items = [
    {
      chargeCode: 'PLAN',
      rentType: 'RA',
      amount: 60
    }
  ]
} = {}) {
  return {
    subscriber: {
      subscriberKey: 'PRIVATE-SUB',
      customerKey: 'PRIVATE-CUSTOMER',
      businessType,
      lobType
    },
    currentBill: {
      invoiceNumber: 'PRIVATE-INV',
      total: 60,
      items
    },
    previousBill: {
      invoiceNumber: 'PRIVATE-PREV',
      total: 50,
      items: []
    },
    interpretation: {
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
      causes,
      currentBillFindings:
        findings
    },
    safeguards: {
      llmUsedForFinancialReasoning:
        llmUsed
    }
  };
}

function seed(overrides = {}) {
  return {
    subscriberKey: 'PRIVATE-SUB',
    customerKey: 'PRIVATE-CUSTOMER',
    businessType: 'MOVIL',
    lobType: 'WRLS',
    invoiceCount: 2,
    ...overrides
  };
}

function scenarioCause({
  code = 'RECONNECTION',
  evidenceLevel = 'HIGH',
  rentType = null,
  claimedChargeCodes = ['PLAN']
} = {}) {
  return {
    code,
    evidenceLevel,
    ruleId: `${code}_RULE`,
    claimedChargeCodes,
    evidence: rentType
      ? {
          detail: {
            rentType
          }
        }
      : {}
  };
}

test(
  'normaliza negocio y lob_type sin inventar productos ausentes de PLANTA',
  () => {
    assert.deepEqual(
      normalizeProduct({
        businessType: ' Movil ',
        lobType: 'ShEq'
      }),
      {
        businessType: 'MOVIL',
        lobType: 'SHEQ',
        businessKey: 'MOVIL',
        productKey: 'MOVIL|SHEQ',
        label: 'MOVIL · SHEQ'
      }
    );
  }
);

test(
  'collectRentTypesDeep recupera renta solo desde campos rentType estructurados',
  () => {
    const rents =
      collectRentTypesDeep({
        description:
          'texto RA que no debe bastar',
        evidence: [
          {
            rentType: 'RA'
          },
          {
            nested: {
              rentType: 'RV'
            }
          }
        ]
      });

    assert.deepEqual(
      rents,
      ['RA', 'RV']
    );
  }
);

test(
  'resuelve la renta del escenario desde evidencia directa antes del contexto global',
  () => {
    const result =
      resolveScenarioRentType({
        items: [
          {
            rentType: 'RV'
          }
        ],
        explanation:
          baseExplanation({
            rentType: 'RA'
          })
      });

    assert.equal(
      result.resolved,
      true
    );
    assert.equal(
      result.rentType,
      'RV'
    );
    assert.equal(
      result.source,
      'SCENARIO_EVIDENCE'
    );
  }
);

test(
  'una evidencia que mezcla RA y RV queda ambigua y no hereda una renta arbitraria',
  () => {
    const result =
      resolveScenarioRentType({
        items: [
          {
            evidence: {
              oldPlan: {
                rentType: 'RA'
              },
              newPlan: {
                rentType: 'RV'
              }
            }
          }
        ],
        explanation:
          baseExplanation({
            rentType: 'RA'
          })
      });

    assert.equal(
      result.resolved,
      false
    );
    assert.equal(
      result.reason,
      'SCENARIO_RENT_AMBIGUOUS'
    );
  }
);

test(
  'si el escenario no trae renta propia puede usar el contexto actual resuelto',
  () => {
    const result =
      resolveScenarioRentType({
        items: [
          {
            code: 'RECONNECTION'
          }
        ],
        explanation:
          baseExplanation({
            rentType: 'RV',
            items: []
          })
      });

    assert.equal(
      result.rentType,
      'RV'
    );
    assert.equal(
      result.source,
      'CURRENT_BILL_RENT_CONTEXT'
    );
  }
);

test(
  'un suscriptor sin facturas aporta población pero nunca escenarios inventados',
  () => {
    const observation =
      buildSubscriberMatrixObservation({
        seed: seed({
          invoiceCount: 0
        })
      });

    assert.equal(
      observation.hasInvoices,
      false
    );
    assert.equal(
      observation.consultable,
      false
    );
    assert.deepEqual(
      observation.scenarios,
      []
    );
  }
);

test(
  'un escenario HIGH con renta resuelta y guardia determinista queda verificado',
  () => {
    const observation =
      buildSubscriberMatrixObservation({
        seed: seed(),
        explanation:
          baseExplanation({
            causes: [
              scenarioCause()
            ]
          })
      });

    const scenario =
      observation.scenarios.find(
        (item) =>
          item.code ===
          'RECONNECTION'
      );

    assert.equal(
      scenario.verified,
      true
    );
    assert.equal(
      scenario.rentType,
      'RA'
    );
  }
);

test(
  'evidencia MEDIUM puede observarse pero no convierte la celda en VERIFIED',
  () => {
    const observation =
      buildSubscriberMatrixObservation({
        seed: seed(),
        explanation:
          baseExplanation({
            causes: [
              scenarioCause({
                evidenceLevel:
                  'MEDIUM'
              })
            ]
          })
      });

    const scenario =
      observation.scenarios.find(
        (item) =>
          item.code ===
          'RECONNECTION'
      );

    assert.equal(
      scenario.evidenceLevel,
      'MEDIUM'
    );
    assert.equal(
      scenario.verified,
      false
    );
  }
);

test(
  'si el LLM participara en razonamiento financiero ningún caso HIGH recibe verificación',
  () => {
    const observation =
      buildSubscriberMatrixObservation({
        seed: seed(),
        explanation:
          baseExplanation({
            causes: [
              scenarioCause()
            ],
            llmUsed: true
          })
      });

    assert.equal(
      observation.scenarios[0]
        .verified,
      false
    );
  }
);

test(
  'prorrateo puede resolver RA/RV desde el hallazgo estructurado del propio escenario',
  () => {
    const observation =
      buildSubscriberMatrixObservation({
        seed: seed({
          businessType: 'FIJA',
          lobType: 'BB'
        }),
        explanation:
          baseExplanation({
            businessType: 'FIJA',
            lobType: 'BB',
            rentType: null,
            items: [],
            findings: [
              {
                code: 'PRORATION',
                evidenceLevel: 'HIGH',
                ruleId: 'PRORATION_RULE',
                rentType: 'RV'
              }
            ]
          })
      });

    const scenario =
      observation.scenarios.find(
        (item) =>
          item.code === 'PRORATION'
      );

    assert.equal(
      scenario.verified,
      true
    );
    assert.equal(
      scenario.rentType,
      'RV'
    );
  }
);

test(
  'cambio de plan usa la renta anidada de planes viejo/nuevo cuando es consistente',
  () => {
    const observation =
      buildSubscriberMatrixObservation({
        seed: seed(),
        explanation:
          baseExplanation({
            rentType: null,
            items: [],
            causes: [
              {
                code: 'PLAN_CHANGE',
                evidenceLevel: 'HIGH',
                ruleId: 'PLAN_CHANGE_RULE',
                evidence: {
                  oldPlans: [
                    {
                      rentType: 'RV'
                    }
                  ],
                  newPlans: [
                    {
                      rentType: 'RV'
                    }
                  ]
                }
              }
            ]
          })
      });

    assert.equal(
      observation.scenarios[0]
        .rentType,
      'RV'
    );
    assert.equal(
      observation.scenarios[0]
        .verified,
      true
    );
  }
);

test(
  'las dimensiones se descubren de las combinaciones negocio/lob_type realmente observadas',
  () => {
    const observations = [
      buildSubscriberMatrixObservation({
        seed: seed({
          businessType: 'MOVIL',
          lobType: 'WRLS',
          invoiceCount: 0
        })
      }),
      buildSubscriberMatrixObservation({
        seed: seed({
          businessType: 'FIJA',
          lobType: 'TV',
          invoiceCount: 0
        })
      })
    ];

    const dimensions =
      buildDimensions(
        observations
      );

    assert.deepEqual(
      dimensions.businessTypes.map(
        (item) =>
          item.businessType
      ),
      ['MOVIL', 'FIJA']
    );
    assert.deepEqual(
      dimensions.products.map(
        (item) =>
          item.productKey
      ),
      ['MOVIL|WRLS', 'FIJA|TV']
    );
  }
);

test(
  'la matriz marca VERIFIED únicamente en la combinación negocio/renta que tiene caso HIGH real',
  () => {
    const observation =
      buildSubscriberMatrixObservation({
        seed: seed(),
        explanation:
          baseExplanation({
            causes: [
              scenarioCause()
            ]
          })
      });

    const report =
      buildB2CCoverageMatrixReport(
        [observation],
        {
          totalAvailable: 1
        }
      );

    const row =
      report.businessMatrix.rows.find(
        (item) =>
          item.scenarioCode ===
          'RECONNECTION'
      );

    assert.equal(
      row.cells.find(
        (cell) =>
          cell.columnKey ===
          'MOVIL|RA'
      ).status,
      'VERIFIED'
    );
    assert.equal(
      row.cells.find(
        (cell) =>
          cell.columnKey ===
          'MOVIL|RV'
      ).status,
      'NO_RESOLVED_RENT_POPULATION'
    );
  }
);

test(
  'cuota de equipo financiado permanece PENDING_MAPPING en todas las celdas',
  () => {
    const observation =
      buildSubscriberMatrixObservation({
        seed: seed(),
        explanation:
          baseExplanation()
      });

    const report =
      buildB2CCoverageMatrixReport(
        [observation],
        {
          totalAvailable: 1
        }
      );

    const equipment =
      report.businessMatrix.rows.find(
        (item) =>
          item.scenarioCode ===
          'FINANCED_EQUIPMENT'
      );

    assert.ok(
      equipment.cells.every(
        (cell) =>
          cell.status ===
          'PENDING_MAPPING'
      )
    );
  }
);

test(
  'una ejecución limitada queda SAMPLE_ONLY y no puede presentarse como cobertura completa',
  () => {
    const report =
      buildB2CCoverageMatrixReport(
        [
          buildSubscriberMatrixObservation({
            seed: seed({
              invoiceCount: 0
            })
          })
        ],
        {
          totalAvailable: 20000,
          requestedLimit: 1
        }
      );

    assert.equal(
      report.status,
      'SAMPLE_ONLY'
    );
    assert.equal(
      report.scope.limited,
      true
    );
    assert.equal(
      report.safeguards
        .sampleCanClaimFullCoverage,
      false
    );
  }
);

test(
  'el reporte agregado nunca serializa subscriberKey, customerKey ni facturas privadas',
  () => {
    const observation =
      buildSubscriberMatrixObservation({
        seed: seed(),
        explanation:
          baseExplanation({
            causes: [
              scenarioCause()
            ]
          })
      });

    const report =
      buildB2CCoverageMatrixReport(
        [observation],
        {
          totalAvailable: 1
        }
      );

    const serialized =
      JSON.stringify(report);

    assert.equal(
      serialized.includes(
        'PRIVATE-SUB'
      ),
      false
    );
    assert.equal(
      serialized.includes(
        'PRIVATE-CUSTOMER'
      ),
      false
    );
    assert.equal(
      serialized.includes(
        'PRIVATE-INV'
      ),
      false
    );

    assert.equal(
      CRITICAL_SCENARIOS.length,
      5
    );
  }
);
