const test = require('node:test');
const assert = require('node:assert/strict');

const {
  normalizeText,
  moneyMatches,
  buildRentContext,
  matchProrationFindings,
  interpretBillingAnalysis
} = require(
  '../services/desafio1ExplanationLogic'
);

function item({
  code,
  description,
  amount,
  classification =
    'Cargo Recurrente De Plan',
  group =
    'CARGO FIJO VENCIDO',
  rentType = 'RV',
  components = null,
  ignoreForExplanation = false
}) {
  return {
    chargeCode: code,
    description,
    descriptions: [description],
    classification,
    classifications: [
      classification
    ],
    group,
    groups: [group],
    subgroup: group,
    subgroups: [group],
    amount,
    netAmount: amount,
    quantity:
      components
        ? components.length
        : 1,
    subscriberKeys: [
      'SUB-1'
    ],
    sourceRows:
      components
        ? components.map(
            (component) =>
              component.sourceRow
          )
        : [10],
    components:
      components || [
        {
          amount,
          netAmount: amount,
          description,
          classification,
          group,
          subgroup: group,
          subscriberKey:
            'SUB-1',
          periodStartDate:
            null,
          periodEndDate:
            null,
          sourceRow: 10
        }
      ],
    ignoreForExplanation,
    rentType,
    rentTypeSource:
      rentType
        ? 'CATALOGO_OFERTAS'
        : null,
    catalogRates: [],
    catalogSourceRows: []
  };
}

function invoice({
  number,
  cycle,
  total,
  items
}) {
  return {
    invoiceNumber: number,
    anchorSubscriberKey:
      'SUB-1',
    billingArrangement:
      'BA-1',
    customerKey: 'C-1',
    financialAccount:
      'FA-1',
    cycleDate: cycle,
    dueDate: null,
    debtStatuses: [
      'SIN DEUDA'
    ],
    subscriberKeys: [
      'SUB-1'
    ],
    total,
    netTotal: total,
    rawChargeRows:
      items.reduce(
        (
          sum,
          current
        ) =>
          sum +
          current.quantity,
        0
      ),
    items,
    integrityWarnings: []
  };
}

function evidence({
  invoiceNumber,
  cycleDate,
  proration = [],
  reconnection = [],
  discountsAndInstallments = [],
  creditDebitNotes = [],
  observedRentTypes = [
    'RV'
  ]
}) {
  return {
    invoiceNumber,
    cycleDate,
    proration,
    reconnection,
    discountsAndInstallments,
    creditDebitNotes,
    observedRentTypes,
    counts: {
      rawRows: {},
      uniqueRecords: {}
    }
  };
}

function analysis({
  currentBill,
  previousBill = null,
  comparison = null,
  currentEvidence = null,
  previousEvidence = null,
  orders = []
}) {
  return {
    schemaVersion:
      'desafio1-billing-analysis-v1',
    phase: 'PHASE_2',
    generatedAt:
      '2026-08-13T00:00:00.000Z',
    subscriber: {
      customerKey: 'C-1',
      financialAccount:
        'FA-1',
      subscriberKey:
        'SUB-1',
      activationDate:
        '2025-01-01 00:00:00',
      billingCycleDay: 17,
      lobType: 'WRLS',
      businessType: 'MOVIL',
      sourceRow: 2
    },
    currentBill,
    previousBill,
    comparison,
    evidence: {
      current:
        currentEvidence ||
        evidence({
          invoiceNumber:
            currentBill.invoiceNumber,
          cycleDate:
            currentBill.cycleDate
        }),
      previous:
        previousBill
          ? previousEvidence ||
            evidence({
              invoiceNumber:
                previousBill.invoiceNumber,
              cycleDate:
                previousBill.cycleDate
            })
          : null,
      ordersBetweenBills:
        orders
    },
    dataLineage: {
      sourceDatabase:
        'desafio1.db',
      datasets: []
    },
    safeguards: {
      financialExplanationGenerated:
        false,
      evidenceAmountsSummedAsCauses:
        false
    }
  };
}

function comparison({
  previousTotal,
  currentTotal,
  chargeChanges
}) {
  const difference =
    Math.round(
      (
        currentTotal -
        previousTotal
      ) * 100
    ) / 100;

  return {
    previousInvoiceNumber:
      'INV-OLD',
    currentInvoiceNumber:
      'INV-NEW',
    previousTotal,
    currentTotal,
    difference,
    percentage: null,
    direction:
      difference > 0
        ? 'UP'
        : difference < 0
          ? 'DOWN'
          : 'SAME',
    chargeChanges,
    summedChargeDeltas:
      chargeChanges.reduce(
        (sum, change) =>
          sum + change.delta,
        0
      ),
    reconciliationResidual: 0,
    reconciled: true
  };
}

function change({
  code,
  description,
  previousAmount,
  currentAmount,
  status,
  currentRentType = null,
  previousRentType = null,
  ignoreForExplanation = false
}) {
  return {
    chargeCode: code,
    description,
    previousAmount,
    currentAmount,
    delta:
      Math.round(
        (
          currentAmount -
          previousAmount
        ) * 100
      ) / 100,
    status,
    ignoreForExplanation,
    currentRentType,
    previousRentType,
    subscriberKeys: [
      'SUB-1'
    ]
  };
}

test(
  'normaliza texto para comparar descripciones sin depender de tildes o puntuación',
  () => {
    assert.equal(
      normalizeText(
        '  Reconexión — Móvil  '
      ),
      'reconexion movil'
    );
  }
);

test(
  'moneyMatches usa tolerancia monetaria sin aceptar diferencias materiales',
  () => {
    assert.equal(
      moneyMatches(
        4.58,
        4.5801
      ),
      true
    );

    assert.equal(
      moneyMatches(
        4.58,
        4.60
      ),
      false
    );
  }
);

test(
  'resuelve RA/RV solo cuando hay un único tipo observado',
  () => {
    const resolved =
      buildRentContext(
        {
          observedRentTypes: [
            'RA'
          ]
        },
        {
          items: []
        }
      );

    assert.equal(
      resolved.resolved,
      true
    );
    assert.equal(
      resolved.rentType,
      'RA'
    );

    const ambiguous =
      buildRentContext(
        {
          observedRentTypes: [
            'RA',
            'RV'
          ]
        },
        {
          items: []
        }
      );

    assert.equal(
      ambiguous.resolved,
      false
    );
    assert.equal(
      ambiguous.ambiguous,
      true
    );
  }
);

test(
  'prorrateo exige monto Brainy igual a un componente proporcional del recibo',
  () => {
    const plan =
      item({
        code: 'PLAN',
        description:
          'RA Plan Base',
        amount: 66.65,
        rentType: 'RA',
        components: [
          {
            amount: 39.99,
            netAmount: 39.99,
            description:
              'RA Plan Base',
            classification:
              'Cargo Recurrente De Plan',
            group:
              'CARGO FIJO',
            subgroup:
              'CARGO FIJO MOVIL',
            subscriberKey:
              'SUB-1',
            periodStartDate: null,
            periodEndDate: null,
            sourceRow: 10
          },
          {
            amount: 26.66,
            netAmount: 26.66,
            description:
              'RA Plan Base',
            classification:
              'Cargo Recurrente De Plan',
            group:
              'CARGO FIJO PROPORCIONAL',
            subgroup:
              'CARGO FIJO PROPORCIONAL MOVIL',
            subscriberKey:
              'SUB-1',
            periodStartDate: null,
            periodEndDate: null,
            sourceRow: 11
          }
        ]
      });

    const current =
      invoice({
        number: 'INV-NEW',
        cycle: '2026-06-30',
        total: 66.65,
        items: [plan]
      });

    const result =
      matchProrationFindings({
        invoice: current,
        invoiceEvidence:
          evidence({
            invoiceNumber:
              'INV-NEW',
            cycleDate:
              '2026-06-30',
            observedRentTypes: [
              'RA'
            ],
            proration: [
              {
                amount: 26.66,
                periodStartDate:
                  '2026-06-11 00:00:00',
                periodEndDate:
                  '2026-06-30 00:00:00',
                sourceRows: [100]
              }
            ]
          }),
        rentContext:
          buildRentContext(
            {
              observedRentTypes: [
                'RA'
              ]
            },
            current
          )
      });

    assert.equal(
      result.findings.length,
      1
    );
    assert.equal(
      result.findings[0].amount,
      26.66
    );
    assert.equal(
      result.findings[0].rentType,
      'RA'
    );
    assert.equal(
      result.unmatchedEvidence.length,
      0
    );
  }
);

test(
  'prorrateo no se presenta como verificado si Brainy no coincide con el cargo proporcional',
  () => {
    const current =
      invoice({
        number: 'INV-NEW',
        cycle: '2026-06-30',
        total: 20,
        items: [
          item({
            code: 'PLAN',
            description:
              'Plan Base',
            amount: 20,
            components: [
              {
                amount: 20,
                netAmount: 20,
                description:
                  'Plan Base',
                classification:
                  'Cargo Recurrente De Plan',
                group:
                  'CARGO FIJO PROPORCIONAL',
                subgroup:
                  'CARGO FIJO PROPORCIONAL',
                subscriberKey:
                  'SUB-1',
                sourceRow: 10
              }
            ]
          })
        ]
      });

    const result =
      matchProrationFindings({
        invoice: current,
        invoiceEvidence:
          evidence({
            invoiceNumber:
              'INV-NEW',
            cycleDate:
              '2026-06-30',
            proration: [
              {
                amount: 19.5,
                sourceRows: [100]
              }
            ]
          }),
        rentContext: null
      });

    assert.equal(
      result.findings.length,
      0
    );
    assert.equal(
      result.unmatchedEvidence.length,
      1
    );
  }
);

test(
  'reconexión exacta explica el aumento sin sumar ocurrencias duplicadas',
  () => {
    const oldBill =
      invoice({
        number: 'INV-OLD',
        cycle: '2026-06-27',
        total: 29.9,
        items: [
          item({
            code: 'PLAN',
            description:
              'RV Plan',
            amount: 29.9
          })
        ]
      });

    const newBill =
      invoice({
        number: 'INV-NEW',
        cycle: '2026-07-27',
        total: 34.48,
        items: [
          item({
            code: 'PLAN',
            description:
              'RV Plan',
            amount: 29.9
          }),
          item({
            code:
              'OC1_RECONEXION',
            description:
              'Cargo por Reconexión',
            amount: 4.58,
            classification:
              'Cargo Unico',
            group:
              'CARGO POR RECONEXION',
            rentType: null
          })
        ]
      });

    const reconnectChange =
      change({
        code:
          'OC1_RECONEXION',
        description:
          'Cargo por Reconexión',
        previousAmount: 0,
        currentAmount: 4.58,
        status: 'ADDED'
      });

    const result =
      interpretBillingAnalysis(
        analysis({
          currentBill: newBill,
          previousBill: oldBill,
          comparison:
            comparison({
              previousTotal: 29.9,
              currentTotal: 34.48,
              chargeChanges: [
                reconnectChange
              ]
            }),
          currentEvidence:
            evidence({
              invoiceNumber:
                'INV-NEW',
              cycleDate:
                '2026-07-27',
              reconnection: [
                {
                  code:
                    'OC1_RECONEXION',
                  amount: 4.58,
                  description:
                    'Cargo por Reconexión',
                  reconnectionDate:
                    '2026-07-03 00:00:00',
                  cutDate:
                    '2026-07-03 00:00:00',
                  occurrences: 5,
                  sourceRows: [
                    100,
                    101,
                    102,
                    103,
                    104
                  ]
                }
              ]
            }),
          orders: [
            {
              reason:
                'Cobranza - Suspensión Parcial',
              reasonId: 'AUTPL'
            },
            {
              reason:
                'Cobranza - Reactivación con Cargo',
              reasonId: 'FEERS'
            }
          ]
        })
      );

    assert.equal(
      result.interpretation.status,
      'FULLY_EXPLAINED'
    );
    assert.equal(
      result.interpretation.causes.length,
      1
    );
    assert.equal(
      result.interpretation.causes[0].code,
      'RECONNECTION'
    );
    assert.equal(
      result.interpretation.causes[0].impactAmount,
      4.58
    );
    assert.equal(
      result.interpretation.explainedNetAmount,
      4.58
    );
    assert.equal(
      result.interpretation.unexplainedAmount,
      0
    );
    assert.equal(
      result.interpretation.coveragePercent,
      100
    );
  }
);

test(
  'reconexión no se asigna si el monto Brainy no reconcilia con el cambio del cargo',
  () => {
    const oldBill =
      invoice({
        number: 'INV-OLD',
        cycle: '2026-06-27',
        total: 30,
        items: []
      });

    const newBill =
      invoice({
        number: 'INV-NEW',
        cycle: '2026-07-27',
        total: 35,
        items: []
      });

    const result =
      interpretBillingAnalysis(
        analysis({
          currentBill: newBill,
          previousBill: oldBill,
          comparison:
            comparison({
              previousTotal: 30,
              currentTotal: 35,
              chargeChanges: [
                change({
                  code:
                    'OC1_RECONEXION',
                  description:
                    'Cargo por Reconexión',
                  previousAmount: 0,
                  currentAmount: 5,
                  status: 'ADDED'
                })
              ]
            }),
          currentEvidence:
            evidence({
              invoiceNumber:
                'INV-NEW',
              cycleDate:
                '2026-07-27',
              reconnection: [
                {
                  code:
                    'OC1_RECONEXION',
                  amount: 4.58,
                  sourceRows: [100]
                }
              ]
            })
        })
      );

    assert.equal(
      result.interpretation.causes.length,
      0
    );
    assert.equal(
      result.interpretation.status,
      'UNEXPLAINED'
    );
    assert.equal(
      result.interpretation.unexplainedAmount,
      5
    );
  }
);

test(
  'fin de descuento exige un cargo negativo retirado y Brainy del ciclo anterior',
  () => {
    const discountDescription =
      'Dsct Fidelizacion 25% 3 Meses Mtotal I';

    const oldBill =
      invoice({
        number: 'INV-OLD',
        cycle: '2026-06-17',
        total: 39.67,
        items: [
          item({
            code: 'PLAN',
            description: 'RV Plan',
            amount: 52.9
          }),
          item({
            code: 'DISC',
            description:
              discountDescription,
            amount: -13.23,
            classification:
              'Descuento',
            group:
              'DESCUENTO CARGO RECURRENTE',
            rentType: null
          })
        ]
      });

    const newBill =
      invoice({
        number: 'INV-NEW',
        cycle: '2026-07-17',
        total: 52.9,
        items: [
          item({
            code: 'PLAN',
            description: 'RV Plan',
            amount: 52.9
          })
        ]
      });

    const result =
      interpretBillingAnalysis(
        analysis({
          currentBill: newBill,
          previousBill: oldBill,
          comparison:
            comparison({
              previousTotal: 39.67,
              currentTotal: 52.9,
              chargeChanges: [
                change({
                  code: 'DISC',
                  description:
                    discountDescription,
                  previousAmount:
                    -13.23,
                  currentAmount: 0,
                  status: 'REMOVED'
                })
              ]
            }),
          currentEvidence:
            evidence({
              invoiceNumber:
                'INV-NEW',
              cycleDate:
                '2026-07-17',
              discountsAndInstallments: []
            }),
          previousEvidence:
            evidence({
              invoiceNumber:
                'INV-OLD',
              cycleDate:
                '2026-06-17',
              discountsAndInstallments: [
                {
                  description:
                    discountDescription,
                  translation:
                    'Descuento por fidelización',
                  amount: 13.23,
                  rentType: 'RV',
                  startDate:
                    '2026-03-18 00:00:00',
                  endDate:
                    '2026-06-17 00:00:00',
                  promotionDuration: 3,
                  currentInstallment: 3,
                  chargeCode: '44896',
                  sourceRows: [
                    100,
                    101
                  ],
                  occurrences: 2
                }
              ]
            })
        })
      );

    assert.equal(
      result.interpretation.status,
      'FULLY_EXPLAINED'
    );
    assert.equal(
      result.interpretation.causes[0].code,
      'DISCOUNT_ENDED'
    );
    assert.equal(
      result.interpretation.causes[0].impactAmount,
      13.23
    );
    assert.equal(
      result.interpretation.causes[0].evidenceLevel,
      'HIGH'
    );
  }
);

test(
  'no llama fin de descuento a una promoción que sigue presente en Brainy',
  () => {
    const description =
      'Descuento 20% por 3 meses';

    const oldBill =
      invoice({
        number: 'INV-OLD',
        cycle: '2026-06-17',
        total: 40,
        items: []
      });

    const newBill =
      invoice({
        number: 'INV-NEW',
        cycle: '2026-07-17',
        total: 50,
        items: []
      });

    const previousDiscount = {
      description,
      amount: 10,
      rentType: 'RV',
      startDate:
        '2026-05-18 00:00:00',
      endDate:
        '2026-08-18 00:00:00',
      promotionDuration: 3,
      currentInstallment: 1,
      chargeCode: '42404',
      sourceRows: [100]
    };

    const result =
      interpretBillingAnalysis(
        analysis({
          currentBill: newBill,
          previousBill: oldBill,
          comparison:
            comparison({
              previousTotal: 40,
              currentTotal: 50,
              chargeChanges: [
                change({
                  code: 'DISC',
                  description,
                  previousAmount: -10,
                  currentAmount: 0,
                  status: 'REMOVED'
                })
              ]
            }),
          currentEvidence:
            evidence({
              invoiceNumber:
                'INV-NEW',
              cycleDate:
                '2026-07-17',
              discountsAndInstallments: [
                {
                  ...previousDiscount,
                  currentInstallment: 2
                }
              ]
            }),
          previousEvidence:
            evidence({
              invoiceNumber:
                'INV-OLD',
              cycleDate:
                '2026-06-17',
              discountsAndInstallments: [
                previousDiscount
              ]
            })
        })
      );

    assert.equal(
      result.interpretation.causes.length,
      0
    );
  }
);

test(
  'cambio de plan requiere una orden explícita y transición de cargos de plan',
  () => {
    const oldPlan =
      item({
        code: 'PLAN-OLD',
        description:
          'RV Plan Adicional S/39.9',
        amount: 39.9,
        rentType: 'RV'
      });

    const newPlan =
      item({
        code: 'PLAN-NEW',
        description:
          'Plan Ahorro Mi Movistar S/25.9',
        amount: 25.9,
        rentType: 'RA'
      });

    const oldBill =
      invoice({
        number: 'INV-OLD',
        cycle: '2026-05-17',
        total: 39.9,
        items: [oldPlan]
      });

    const newBill =
      invoice({
        number: 'INV-NEW',
        cycle: '2026-06-17',
        total: 25.9,
        items: [newPlan]
      });

    const result =
      interpretBillingAnalysis(
        analysis({
          currentBill: newBill,
          previousBill: oldBill,
          comparison:
            comparison({
              previousTotal: 39.9,
              currentTotal: 25.9,
              chargeChanges: [
                change({
                  code: 'PLAN-OLD',
                  description:
                    oldPlan.description,
                  previousAmount: 39.9,
                  currentAmount: 0,
                  status: 'REMOVED',
                  previousRentType: 'RV'
                }),
                change({
                  code: 'PLAN-NEW',
                  description:
                    newPlan.description,
                  previousAmount: 0,
                  currentAmount: 25.9,
                  status: 'ADDED',
                  currentRentType: 'RA'
                })
              ]
            }),
          orders: [
            {
              reason:
                'Cambio de Plan',
              reasonId: 'CHCYM',
              completionDate:
                '2026-05-18 00:34:37'
            }
          ]
        })
      );

    assert.equal(
      result.interpretation.status,
      'FULLY_EXPLAINED'
    );
    assert.equal(
      result.interpretation.causes[0].code,
      'PLAN_CHANGE'
    );
    assert.equal(
      result.interpretation.causes[0].impactAmount,
      -14
    );
    assert.deepEqual(
      result.interpretation.causes[0].claimedChargeCodes.sort(),
      [
        'PLAN-NEW',
        'PLAN-OLD'
      ]
    );
  }
);

test(
  'una orden genérica Cambiar no basta para inferir cambio de plan',
  () => {
    const oldPlan =
      item({
        code: 'PLAN-OLD',
        description:
          'Plan anterior',
        amount: 39.9
      });

    const newPlan =
      item({
        code: 'PLAN-NEW',
        description:
          'Plan nuevo',
        amount: 25.9
      });

    const result =
      interpretBillingAnalysis(
        analysis({
          currentBill:
            invoice({
              number: 'INV-NEW',
              cycle: '2026-06-17',
              total: 25.9,
              items: [newPlan]
            }),
          previousBill:
            invoice({
              number: 'INV-OLD',
              cycle: '2026-05-17',
              total: 39.9,
              items: [oldPlan]
            }),
          comparison:
            comparison({
              previousTotal: 39.9,
              currentTotal: 25.9,
              chargeChanges: [
                change({
                  code: 'PLAN-OLD',
                  description:
                    'Plan anterior',
                  previousAmount: 39.9,
                  currentAmount: 0,
                  status: 'REMOVED'
                }),
                change({
                  code: 'PLAN-NEW',
                  description:
                    'Plan nuevo',
                  previousAmount: 0,
                  currentAmount: 25.9,
                  status: 'ADDED'
                })
              ]
            }),
          orders: [
            {
              reason:
                'Pedido de Cliente',
              itemType:
                'Cambiar'
            }
          ]
        })
      );

    assert.equal(
      result.interpretation.causes.length,
      0
    );
  }
);

test(
  'prorrateo puede explicar una variación solo si coincide con el delta del mismo cargo',
  () => {
    const oldPlan =
      item({
        code: 'PLAN',
        description:
          'RA Plan Base',
        amount: 40,
        rentType: 'RA'
      });

    const newPlan =
      item({
        code: 'PLAN',
        description:
          'RA Plan Base',
        amount: 50,
        rentType: 'RA',
        components: [
          {
            amount: 40,
            netAmount: 40,
            description:
              'RA Plan Base',
            classification:
              'Cargo Recurrente De Plan',
            group:
              'CARGO FIJO',
            subgroup:
              'CARGO FIJO MOVIL',
            subscriberKey:
              'SUB-1',
            sourceRow: 10
          },
          {
            amount: 10,
            netAmount: 10,
            description:
              'RA Plan Base',
            classification:
              'Cargo Recurrente De Plan',
            group:
              'CARGO FIJO PROPORCIONAL',
            subgroup:
              'CARGO FIJO PROPORCIONAL MOVIL',
            subscriberKey:
              'SUB-1',
            sourceRow: 11
          }
        ]
      });

    const result =
      interpretBillingAnalysis(
        analysis({
          currentBill:
            invoice({
              number: 'INV-NEW',
              cycle: '2026-07-17',
              total: 50,
              items: [newPlan]
            }),
          previousBill:
            invoice({
              number: 'INV-OLD',
              cycle: '2026-06-17',
              total: 40,
              items: [oldPlan]
            }),
          comparison:
            comparison({
              previousTotal: 40,
              currentTotal: 50,
              chargeChanges: [
                change({
                  code: 'PLAN',
                  description:
                    'RA Plan Base',
                  previousAmount: 40,
                  currentAmount: 50,
                  status: 'CHANGED',
                  currentRentType: 'RA',
                  previousRentType: 'RA'
                })
              ]
            }),
          currentEvidence:
            evidence({
              invoiceNumber:
                'INV-NEW',
              cycleDate:
                '2026-07-17',
              observedRentTypes: [
                'RA'
              ],
              proration: [
                {
                  amount: 10,
                  periodStartDate:
                    '2026-07-08 00:00:00',
                  periodEndDate:
                    '2026-07-17 00:00:00',
                  sourceRows: [100]
                }
              ]
            })
        })
      );

    assert.equal(
      result.interpretation.causes.length,
      1
    );
    assert.equal(
      result.interpretation.causes[0].code,
      'PRORATION'
    );
    assert.equal(
      result.interpretation.unexplainedAmount,
      0
    );
  }
);

test(
  'primer recibo puede explicar prorrateo sin inventar una comparación mensual',
  () => {
    const current =
      invoice({
        number: 'INV-NEW',
        cycle: '2026-06-30',
        total: 66.65,
        items: [
          item({
            code: 'PLAN',
            description:
              'RA Plan Base',
            amount: 66.65,
            rentType: 'RA',
            components: [
              {
                amount: 39.99,
                netAmount: 39.99,
                description:
                  'RA Plan Base',
                classification:
                  'Cargo Recurrente De Plan',
                group:
                  'CARGO FIJO',
                subgroup:
                  'CARGO FIJO MOVIL',
                subscriberKey:
                  'SUB-1',
                sourceRow: 10
              },
              {
                amount: 26.66,
                netAmount: 26.66,
                description:
                  'RA Plan Base',
                classification:
                  'Cargo Recurrente De Plan',
                group:
                  'CARGO FIJO PROPORCIONAL',
                subgroup:
                  'CARGO FIJO PROPORCIONAL MOVIL',
                subscriberKey:
                  'SUB-1',
                sourceRow: 11
              }
            ]
          })
        ]
      });

    const result =
      interpretBillingAnalysis(
        analysis({
          currentBill: current,
          currentEvidence:
            evidence({
              invoiceNumber:
                'INV-NEW',
              cycleDate:
                '2026-06-30',
              observedRentTypes: [
                'RA'
              ],
              proration: [
                {
                  amount: 26.66,
                  periodStartDate:
                    '2026-06-11 00:00:00',
                  periodEndDate:
                    '2026-06-30 00:00:00',
                  sourceRows: [100]
                }
              ]
            })
        })
      );

    assert.equal(
      result.interpretation.status,
      'NO_PREVIOUS_BILL'
    );
    assert.equal(
      result.interpretation.causes.length,
      0
    );
    assert.equal(
      result.interpretation.currentBillFindings[0].code,
      'PRORATION'
    );
    assert.match(
      result.customerFacing.headline,
      /prorrateo/i
    );
  }
);

test(
  'nota de crédito o débito queda como contexto y no se suma automáticamente como causa',
  () => {
    const current =
      invoice({
        number: 'INV-NEW',
        cycle: '2026-07-27',
        total: 50,
        items: []
      });

    const oldBill =
      invoice({
        number: 'INV-OLD',
        cycle: '2026-06-27',
        total: 40,
        items: []
      });

    const result =
      interpretBillingAnalysis(
        analysis({
          currentBill: current,
          previousBill: oldBill,
          comparison:
            comparison({
              previousTotal: 40,
              currentTotal: 50,
              chargeChanges: [
                change({
                  code: 'X',
                  description:
                    'Cargo X',
                  previousAmount: 0,
                  currentAmount: 10,
                  status: 'ADDED'
                })
              ]
            }),
          currentEvidence:
            evidence({
              invoiceNumber:
                'INV-NEW',
              cycleDate:
                '2026-07-27',
              creditDebitNotes: [
                {
                  chargeCode: 'X',
                  cancelChargeType:
                    'CRD',
                  amount: -7.2,
                  matchedChargeCode:
                    true,
                  sourceRows: [100]
                }
              ]
            })
        })
      );

    assert.equal(
      result.interpretation.causes.length,
      0
    );
    assert.equal(
      result.interpretation.currentBillFindings[0].code,
      'ADJUSTMENT_NOTE_CONTEXT'
    );
    assert.equal(
      result.interpretation.unexplainedAmount,
      10
    );
    assert.equal(
      result.safeguards.notesAddedAsCausesAutomatically,
      false
    );
  }
);

test(
  'múltiples causas conciliadas se suman por deltas de factura sin doble conteo',
  () => {
    const discount =
      'Descuento Fidelización por 3 meses';

    const oldBill =
      invoice({
        number: 'INV-OLD',
        cycle: '2026-06-17',
        total: 90,
        items: [
          item({
            code: 'DISC',
            description: discount,
            amount: -10,
            classification:
              'Descuento',
            group:
              'DESCUENTO',
            rentType: null
          })
        ]
      });

    const newBill =
      invoice({
        number: 'INV-NEW',
        cycle: '2026-07-17',
        total: 104.58,
        items: [
          item({
            code:
              'OC1_RECONEXION',
            description:
              'Cargo por Reconexión',
            amount: 4.58,
            classification:
              'Cargo Unico',
            group:
              'CARGO POR RECONEXION',
            rentType: null
          })
        ]
      });

    const result =
      interpretBillingAnalysis(
        analysis({
          currentBill: newBill,
          previousBill: oldBill,
          comparison:
            comparison({
              previousTotal: 90,
              currentTotal: 104.58,
              chargeChanges: [
                change({
                  code: 'DISC',
                  description: discount,
                  previousAmount: -10,
                  currentAmount: 0,
                  status: 'REMOVED'
                }),
                change({
                  code:
                    'OC1_RECONEXION',
                  description:
                    'Cargo por Reconexión',
                  previousAmount: 0,
                  currentAmount: 4.58,
                  status: 'ADDED'
                })
              ]
            }),
          currentEvidence:
            evidence({
              invoiceNumber:
                'INV-NEW',
              cycleDate:
                '2026-07-17',
              reconnection: [
                {
                  code:
                    'OC1_RECONEXION',
                  amount: 4.58,
                  sourceRows: [200]
                }
              ]
            }),
          previousEvidence:
            evidence({
              invoiceNumber:
                'INV-OLD',
              cycleDate:
                '2026-06-17',
              discountsAndInstallments: [
                {
                  description: discount,
                  amount: 10,
                  startDate:
                    '2026-04-18 00:00:00',
                  endDate:
                    '2026-06-17 00:00:00',
                  promotionDuration: 3,
                  currentInstallment: 3,
                  chargeCode: 'X',
                  sourceRows: [100]
                }
              ]
            })
        })
      );

    assert.equal(
      result.interpretation.causes.length,
      2
    );
    assert.equal(
      result.interpretation.explainedNetAmount,
      14.58
    );
    assert.equal(
      result.interpretation.unexplainedAmount,
      0
    );
  }
);

test(
  'deja residual explícito cuando solo una parte de la variación está respaldada',
  () => {
    const oldBill =
      invoice({
        number: 'INV-OLD',
        cycle: '2026-06-27',
        total: 30,
        items: []
      });

    const newBill =
      invoice({
        number: 'INV-NEW',
        cycle: '2026-07-27',
        total: 40,
        items: []
      });

    const result =
      interpretBillingAnalysis(
        analysis({
          currentBill: newBill,
          previousBill: oldBill,
          comparison:
            comparison({
              previousTotal: 30,
              currentTotal: 40,
              chargeChanges: [
                change({
                  code:
                    'OC1_RECONEXION',
                  description:
                    'Cargo por Reconexión',
                  previousAmount: 0,
                  currentAmount: 4.58,
                  status: 'ADDED'
                }),
                change({
                  code: 'OTHER',
                  description:
                    'Otro cargo',
                  previousAmount: 0,
                  currentAmount: 5.42,
                  status: 'ADDED'
                })
              ]
            }),
          currentEvidence:
            evidence({
              invoiceNumber:
                'INV-NEW',
              cycleDate:
                '2026-07-27',
              reconnection: [
                {
                  code:
                    'OC1_RECONEXION',
                  amount: 4.58,
                  sourceRows: [100]
                }
              ]
            })
        })
      );

    assert.equal(
      result.interpretation.status,
      'PARTIALLY_EXPLAINED'
    );
    assert.equal(
      result.interpretation.explainedNetAmount,
      4.58
    );
    assert.equal(
      result.interpretation.unexplainedAmount,
      5.42
    );
    assert.equal(
      result.interpretation.coveragePercent,
      45.8
    );
  }
);

test(
  'NO CONSIDERAR no se fuerza a una causa y permanece trazable como cambio no explicado',
  () => {
    const oldBill =
      invoice({
        number: 'INV-OLD',
        cycle: '2026-06-27',
        total: 0,
        items: []
      });

    const newBill =
      invoice({
        number: 'INV-NEW',
        cycle: '2026-07-27',
        total: 5,
        items: []
      });

    const result =
      interpretBillingAnalysis(
        analysis({
          currentBill: newBill,
          previousBill: oldBill,
          comparison:
            comparison({
              previousTotal: 0,
              currentTotal: 5,
              chargeChanges: [
                change({
                  code: 'BONO',
                  description:
                    'Bono técnico',
                  previousAmount: 0,
                  currentAmount: 5,
                  status: 'ADDED',
                  ignoreForExplanation:
                    true
                })
              ]
            })
        })
      );

    assert.equal(
      result.interpretation.causes.length,
      0
    );
    assert.equal(
      result.interpretation.unexplainedChanges[0].ignoredForExplanation,
      true
    );
  }
);

test(
  'salvaguardas declaran que el LLM no participó en el razonamiento financiero',
  () => {
    const current =
      invoice({
        number: 'INV-NEW',
        cycle: '2026-07-27',
        total: 30,
        items: []
      });

    const result =
      interpretBillingAnalysis(
        analysis({
          currentBill: current
        })
      );

    assert.equal(
      result.phase,
      'PHASE_3'
    );
    assert.equal(
      result.safeguards.llmUsedForFinancialReasoning,
      false
    );
    assert.equal(
      result.safeguards.causeAmountsDerivedFromChargeDeltas,
      true
    );
    assert.equal(
      result.safeguards.cycleDateAssumedAsIssueDate,
      false
    );
  }
);

test(
  'descuento vigente solo se muestra cuando Brainy coincide con un cargo negativo real',
  () => {
    const current =
      invoice({
        number: 'INV-NEW',
        cycle: '2026-07-05',
        total: 46.13,
        items: [
          item({
            code: 'DISC',
            description:
              'Descuento 30% por 6 meses RET',
            amount: -19.77,
            classification:
              'Descuento',
            group:
              'DESCUENTO CARGO RECURRENTE',
            rentType: null
          })
        ]
      });

    const result =
      interpretBillingAnalysis(
        analysis({
          currentBill: current,
          currentEvidence:
            evidence({
              invoiceNumber:
                'INV-NEW',
              cycleDate:
                '2026-07-05',
              discountsAndInstallments: [
                {
                  description:
                    'Descuento 30% por 6 meses RET',
                  translation:
                    'Otros Descuentos',
                  amount: 19.77,
                  rentType: 'RV',
                  startDate:
                    '2026-05-06 00:00:00',
                  endDate:
                    '2026-10-06 00:00:00',
                  promotionDuration: 6,
                  currentInstallment: 3,
                  sourceRows: [100]
                }
              ]
            })
        })
      );

    const finding =
      result.interpretation
        .currentBillFindings
        .find(
          (entry) =>
            entry.code ===
            'ACTIVE_DISCOUNT'
        );

    assert.ok(finding);
    assert.equal(
      finding.discountAmount,
      19.77
    );
    assert.equal(
      finding.impactOnBill,
      -19.77
    );
  }
);

test(
  'cobertura mide movimientos de cargos y no se distorsiona cuando causas se compensan entre sí',
  () => {
    const oldBill =
      invoice({
        number: 'INV-OLD',
        cycle: '2026-06-17',
        total: 100,
        items: []
      });

    const newBill =
      invoice({
        number: 'INV-NEW',
        cycle: '2026-07-17',
        total: 105,
        items: []
      });

    const result =
      interpretBillingAnalysis(
        analysis({
          currentBill: newBill,
          previousBill: oldBill,
          comparison:
            comparison({
              previousTotal: 100,
              currentTotal: 105,
              chargeChanges: [
                change({
                  code:
                    'OC1_RECONEXION',
                  description:
                    'Cargo por Reconexión',
                  previousAmount: 0,
                  currentAmount: 30,
                  status: 'ADDED'
                }),
                change({
                  code: 'OTHER',
                  description:
                    'Reducción no clasificada',
                  previousAmount: 25,
                  currentAmount: 0,
                  status: 'REMOVED'
                })
              ]
            }),
          currentEvidence:
            evidence({
              invoiceNumber:
                'INV-NEW',
              cycleDate:
                '2026-07-17',
              reconnection: [
                {
                  code:
                    'OC1_RECONEXION',
                  amount: 30,
                  sourceRows: [100]
                }
              ]
            })
        })
      );

    assert.equal(
      result.interpretation.explainedNetAmount,
      30
    );
    assert.equal(
      result.interpretation.unexplainedAmount,
      -25
    );
    assert.equal(
      result.interpretation.coveragePercent,
      54.5
    );
  }
);

test(
  'paquete estructurado explica exactamente el delta del cargo sin requerir una orden para afirmar una compra',
  () => {
    const oldBill =
      invoice({
        number: 'INV-OLD',
        cycle: '2026-06-15',
        total: 39.9,
        items: [
          item({
            code: 'PLAN',
            description: 'RV Plan Base',
            amount: 39.9
          })
        ]
      });

    const packageItem =
      item({
        code: 'OC_PAQRE33',
        description:
          'Paquete 3GB de Internet 10dias x S/10',
        amount: 9.99,
        classification:
          'Cargo Unico Paquete',
        group: 'PAQUETES',
        rentType: null
      });

    const newBill =
      invoice({
        number: 'INV-NEW',
        cycle: '2026-07-15',
        total: 49.89,
        items: [
          item({
            code: 'PLAN',
            description: 'RV Plan Base',
            amount: 39.9
          }),
          packageItem
        ]
      });

    const result =
      interpretBillingAnalysis(
        analysis({
          currentBill: newBill,
          previousBill: oldBill,
          comparison:
            comparison({
              previousTotal: 39.9,
              currentTotal: 49.89,
              chargeChanges: [
                change({
                  code: 'OC_PAQRE33',
                  description:
                    'Paquete 3GB de Internet 10dias x S/10',
                  previousAmount: 0,
                  currentAmount: 9.99,
                  status: 'ADDED'
                })
              ]
            })
        })
      );

    assert.equal(
      result.interpretation.status,
      'FULLY_EXPLAINED'
    );
    assert.equal(
      result.interpretation.causes.length,
      1
    );

    const cause =
      result.interpretation.causes[0];

    assert.equal(cause.code, 'PACKAGES');
    assert.equal(cause.impactAmount, 9.99);
    assert.equal(cause.evidenceLevel, 'HIGH');
    assert.equal(
      cause.ruleId,
      'PACKAGE_STRUCTURED_CHARGE_DELTA'
    );
    assert.equal(cause.packageEvent, 'ADDED');
    assert.equal(
      cause.evidence.orders.length,
      0
    );
    assert.equal(
      result.interpretation.unexplainedAmount,
      0
    );
    assert.equal(
      result.interpretation.coveragePercent,
      100
    );
  }
);

test(
  'una orden explícita de paquete refuerza la evidencia pero el monto causal sigue saliendo del delta de facturación',
  () => {
    const oldBill =
      invoice({
        number: 'INV-OLD',
        cycle: '2026-06-15',
        total: 50,
        items: []
      });

    const newBill =
      invoice({
        number: 'INV-NEW',
        cycle: '2026-07-15',
        total: 60,
        items: [
          item({
            code: 'PKG10',
            description: 'Paquete Datos',
            amount: 10,
            classification:
              'Cargo Unico Paquete',
            group: 'PAQUETES',
            rentType: null
          })
        ]
      });

    const result =
      interpretBillingAnalysis(
        analysis({
          currentBill: newBill,
          previousBill: oldBill,
          comparison:
            comparison({
              previousTotal: 50,
              currentTotal: 60,
              chargeChanges: [
                change({
                  code: 'PKG10',
                  description: 'Paquete Datos',
                  previousAmount: 0,
                  currentAmount: 10,
                  status: 'ADDED'
                })
              ]
            }),
          orders: [
            {
              subscriberKey: 'SUB-1',
              reason:
                'Activacion de Paquetes Datos OneShot',
              itemType: 'Cambiar',
              status: 'Terminado'
            }
          ]
        })
      );

    const cause =
      result.interpretation.causes[0];

    assert.equal(cause.code, 'PACKAGES');
    assert.equal(cause.impactAmount, 10);
    assert.equal(
      cause.ruleId,
      'PACKAGE_STRUCTURED_CHARGE_DELTA_WITH_ORDER'
    );
    assert.equal(
      cause.evidence.orders.length,
      1
    );
  }
);

test(
  'una descripción que solo menciona paquete no se convierte en causa sin marcador estructurado',
  () => {
    const oldBill =
      invoice({
        number: 'INV-OLD',
        cycle: '2026-06-15',
        total: 40,
        items: []
      });

    const newBill =
      invoice({
        number: 'INV-NEW',
        cycle: '2026-07-15',
        total: 50,
        items: [
          item({
            code: 'GENERIC',
            description:
              'Paquete descrito manualmente',
            amount: 10,
            classification: 'Cargo Unico',
            group: 'OTROS',
            rentType: null
          })
        ]
      });

    const result =
      interpretBillingAnalysis(
        analysis({
          currentBill: newBill,
          previousBill: oldBill,
          comparison:
            comparison({
              previousTotal: 40,
              currentTotal: 50,
              chargeChanges: [
                change({
                  code: 'GENERIC',
                  description:
                    'Paquete descrito manualmente',
                  previousAmount: 0,
                  currentAmount: 10,
                  status: 'ADDED'
                })
              ]
            })
        })
      );

    assert.equal(
      result.interpretation.causes.length,
      0
    );
    assert.equal(
      result.interpretation.status,
      'UNEXPLAINED'
    );
  }
);

test(
  'prorrateo verificado conserva prioridad sobre la etiqueta de paquete para no duplicar una misma variación',
  () => {
    const oldBill =
      invoice({
        number: 'INV-OLD',
        cycle: '2026-06-15',
        total: 0,
        items: []
      });

    const packageProportional =
      item({
        code: 'PKG_PROP',
        description:
          'Paquete proporcional',
        amount: 5,
        classification:
          'Cargo Unico Paquete',
        group: 'PAQUETES',
        rentType: 'RA',
        components: [
          {
            amount: 5,
            netAmount: 5,
            description:
              'Paquete proporcional',
            classification:
              'Cargo Unico Paquete',
            group:
              'PAQUETES PROPORCIONAL',
            subgroup:
              'PAQUETES PROPORCIONAL',
            subscriberKey: 'SUB-1',
            sourceRow: 22
          }
        ]
      });

    const newBill =
      invoice({
        number: 'INV-NEW',
        cycle: '2026-07-15',
        total: 5,
        items: [packageProportional]
      });

    const result =
      interpretBillingAnalysis(
        analysis({
          currentBill: newBill,
          previousBill: oldBill,
          comparison:
            comparison({
              previousTotal: 0,
              currentTotal: 5,
              chargeChanges: [
                change({
                  code: 'PKG_PROP',
                  description:
                    'Paquete proporcional',
                  previousAmount: 0,
                  currentAmount: 5,
                  status: 'ADDED'
                })
              ]
            }),
          currentEvidence:
            evidence({
              invoiceNumber: 'INV-NEW',
              cycleDate: '2026-07-15',
              observedRentTypes: ['RA'],
              proration: [
                {
                  amount: 5,
                  periodStartDate:
                    '2026-07-10 00:00:00',
                  periodEndDate:
                    '2026-07-15 00:00:00',
                  sourceRows: [300]
                }
              ]
            })
        })
      );

    assert.deepEqual(
      result.interpretation.causes.map(
        (cause) => cause.code
      ),
      ['PRORATION']
    );
    assert.equal(
      result.interpretation.unexplainedAmount,
      0
    );
  }
);
