const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RESOLUTION_STATUS,
  resolvePersonalBillingIntent,
  resolveCustomerProfileIntent,
  aggregateBillingResolutions,
  aggregateCustomerResolutions,
  buildAppNextActions
} = require(
  '../services/desafio1ResolutionLogic'
);

const {
  buildBillingHistoryView
} = require(
  '../services/desafio1BillingHistoryLogic'
);

function bill({
  total,
  cycleDate,
  items = []
}) {
  return {
    total,
    cycleDate,
    period:
      `Ciclo ${cycleDate}`,
    status:
      'Estado no disponible',
    items
  };
}

function baseExperience({
  explanationStatus =
    'FULLY_EXPLAINED',
  previous = true,
  findings = [],
  causes = [],
  historyBills = null,
  rentResolved = true
} = {}) {
  const currentBill =
    bill({
      total: 62.89,
      cycleDate:
        '2026-06-30',
      items: [
        {
          chargeCode:
            'PLAN_X',
          label:
            'Plan Demo',
          amount: 52.9
        },
        {
          chargeCode:
            'PAQ_X',
          label:
            'Paquete 3GB',
          amount: 9.99
        }
      ]
    });

  const previousBill =
    previous
      ? bill({
          total: 52.9,
          cycleDate:
            '2026-05-31',
          items: [
            {
              chargeCode:
                'PLAN_X',
              label:
                'Plan Demo',
              amount: 52.9
            }
          ]
        })
      : null;

  const history =
    buildBillingHistoryView(
      historyBills ||
      [
        currentBill,
        ...(previousBill
          ? [previousBill]
          : [])
      ]
    );

  return {
    customer: {
      plan: 'Plan Demo'
    },
    currentBill,
    previousBill,
    billingHistory: history,
    comparison: {
      difference:
        previousBill ? 9.99 : null,
      percentage:
        previousBill ? 18.88 : null,
      causes
    },
    findings,
    financialExplanation: {
      status:
        explanationStatus,
      coveragePercent:
        explanationStatus ===
          'FULLY_EXPLAINED'
          ? 100
          : explanationStatus ===
              'PARTIALLY_EXPLAINED'
            ? 60
            : null,
      unexplainedAmount:
        explanationStatus ===
          'PARTIALLY_EXPLAINED'
          ? 4
          : explanationStatus ===
              'UNEXPLAINED'
            ? 9.99
            : 0,
      rentContext: {
        current: {
          resolved:
            rentResolved,
          rentType:
            rentResolved
              ? 'RA'
              : null,
          label:
            rentResolved
              ? 'Renta adelantada'
              : null
        }
      }
    }
  };
}

function profile() {
  return {
    visibleId: 'DEMO000001',
    customerCode: 'ANON001',
    activationDate:
      '2025-10-01',
    billingCycleDay: 30,
    lobType: 'WRLS',
    businessType: 'MOVIL'
  };
}

function ids(resolution) {
  return (
    resolution?.nextActions || []
  ).map((item) => item.id);
}

test(
  'Fase 15 resuelve el total verificable sin ofrecer pago ni asesor por defecto',
  () => {
    const result =
      resolvePersonalBillingIntent({
        experience:
          baseExperience(),
        intent: 'CURRENT_TOTAL',
        message:
          '¿Cuál es el total de mi recibo?'
      });

    assert.equal(
      result.status,
      RESOLUTION_STATUS.RESOLVED
    );
    assert.equal(
      result.reasonCode,
      'CURRENT_TOTAL_VERIFIED'
    );
    assert.equal(
      result.guards
        .paymentActionOffered,
      false
    );
    assert.equal(
      ids(result).includes(
        'CONTACT_ADVISOR'
      ),
      false
    );
    assert.equal(
      ids(result).includes(
        'PAY_BILL'
      ),
      false
    );
  }
);

test(
  'cuánto debo queda parcialmente resuelto porque FACTURACION v2 no trae saldo pendiente',
  () => {
    const result =
      resolvePersonalBillingIntent({
        experience:
          baseExperience(),
        intent: 'CURRENT_TOTAL',
        message: '¿Cuánto debo?'
      });

    assert.equal(
      result.status,
      RESOLUTION_STATUS
        .PARTIALLY_RESOLVED
    );
    assert.equal(
      result.reasonCode,
      'DEBT_STATUS_NOT_AVAILABLE'
    );
    assert.equal(
      ids(result).includes(
        'CONTACT_ADVISOR'
      ),
      true
    );
    assert.equal(
      ids(result).includes(
        'PAY_BILL'
      ),
      false
    );
  }
);

test(
  'una variación FULLY_EXPLAINED se considera RESOLVED sin confundir estados financieros con resolución',
  () => {
    const result =
      resolvePersonalBillingIntent({
        experience:
          baseExperience(),
        intent: 'EXPLANATION',
        message:
          '¿Por qué subió mi recibo?'
      });

    assert.equal(
      result.status,
      RESOLUTION_STATUS.RESOLVED
    );
    assert.equal(
      result.reasonCode,
      'VARIATION_FULLY_EXPLAINED'
    );
    assert.equal(
      result.details
        .explanationStatus,
      'FULLY_EXPLAINED'
    );
  }
);

test(
  'una variación parcialmente explicada ofrece detalle y asesor con estado PARTIALLY_RESOLVED',
  () => {
    const result =
      resolvePersonalBillingIntent({
        experience:
          baseExperience({
            explanationStatus:
              'PARTIALLY_EXPLAINED'
          }),
        intent: 'EXPLANATION',
        message:
          '¿Por qué cambió mi recibo?'
      });

    assert.equal(
      result.status,
      RESOLUTION_STATUS
        .PARTIALLY_RESOLVED
    );
    assert.equal(
      result.reasonCode,
      'VARIATION_PARTIALLY_EXPLAINED'
    );
    assert.deepEqual(
      ids(result),
      [
        'REVIEW_BILL_DETAIL',
        'CONTACT_ADVISOR'
      ]
    );
  }
);

test(
  'una variación sin evidencia queda UNRESOLVED y nunca inventa una acción de pago',
  () => {
    const result =
      resolvePersonalBillingIntent({
        experience:
          baseExperience({
            explanationStatus:
              'UNEXPLAINED'
          }),
        intent: 'EXPLANATION',
        message:
          '¿Por qué subió mi recibo?'
      });

    assert.equal(
      result.status,
      RESOLUTION_STATUS.UNRESOLVED
    );
    assert.equal(
      ids(result).includes(
        'CONTACT_ADVISOR'
      ),
      true
    );
    assert.equal(
      result.nextActions.some(
        (item) =>
          /pagar/i.test(item.label)
      ),
      false
    );
  }
);

test(
  'NO_VARIATION resuelve correctamente la pregunta porque no hay una causa que buscar',
  () => {
    const result =
      resolvePersonalBillingIntent({
        experience:
          baseExperience({
            explanationStatus:
              'NO_VARIATION'
          }),
        intent: 'EXPLANATION',
        message:
          '¿Por qué cambió mi recibo?'
      });

    assert.equal(
      result.status,
      RESOLUTION_STATUS.RESOLVED
    );
    assert.equal(
      result.reasonCode,
      'NO_VARIATION_TO_EXPLAIN'
    );
  }
);

test(
  'primer recibo con hallazgo verificado resuelve explicar el recibo pero no una comparación inexistente',
  () => {
    const experience =
      baseExperience({
        explanationStatus:
          'NO_PREVIOUS_BILL',
        previous: false,
        findings: [
          {
            code: 'PRORATION',
            evidenceLevel: 'HIGH'
          }
        ]
      });

    const receipt =
      resolvePersonalBillingIntent({
        experience,
        intent: 'EXPLANATION',
        message:
          'Explícame mi recibo'
      });

    const variation =
      resolvePersonalBillingIntent({
        experience,
        intent: 'EXPLANATION',
        message:
          '¿Por qué subió mi recibo?'
      });

    assert.equal(
      receipt.status,
      RESOLUTION_STATUS.RESOLVED
    );
    assert.equal(
      variation.status,
      RESOLUTION_STATUS
        .PARTIALLY_RESOLVED
    );
    assert.equal(
      variation.reasonCode,
      'NO_PREVIOUS_BILL_WITH_CURRENT_FINDING'
    );
  }
);

test(
  'prorrateo, paquete y suspensión solo se resuelven cuando el hallazgo o causa correspondiente existe',
  () => {
    const experience =
      baseExperience({
        findings: [
          {
            code:
              'PRORATION',
            evidenceLevel: 'HIGH'
          },
          {
            code:
              'SUSPENSION_ADJUSTMENT',
            evidenceLevel: 'HIGH'
          }
        ],
        causes: [
          {
            code: 'PACKAGES',
            evidenceLevel: 'HIGH'
          }
        ]
      });

    for (const intent of [
      'PRORATION',
      'PACKAGE_CHARGE',
      'SUSPENSION_ADJUSTMENT'
    ]) {
      assert.equal(
        resolvePersonalBillingIntent({
          experience,
          intent
        }).status,
        RESOLUTION_STATUS.RESOLVED
      );
    }

    assert.equal(
      resolvePersonalBillingIntent({
        experience:
          baseExperience(),
        intent:
          'SUSPENSION_ADJUSTMENT'
      }).status,
      RESOLUTION_STATUS.UNRESOLVED
    );
  }
);

test(
  'histórico con un solo recibo es parcial y con dos permite resolver la tendencia',
  () => {
    const single =
      baseExperience({
        previous: false,
        historyBills: [
          bill({
            total: 20,
            cycleDate:
              '2026-06-30'
          })
        ]
      });

    const multiple =
      baseExperience();

    assert.equal(
      resolvePersonalBillingIntent({
        experience: single,
        intent: 'BILL_HISTORY'
      }).status,
      RESOLUTION_STATUS
        .PARTIALLY_RESOLVED
    );

    assert.equal(
      resolvePersonalBillingIntent({
        experience: multiple,
        intent: 'BILL_HISTORY'
      }).status,
      RESOLUTION_STATUS.RESOLVED
    );
  }
);

test(
  'LATEST_INCREASE queda resuelto con dos recibos incluso si la conclusión es que no hubo aumento',
  () => {
    const historyBills = [
      bill({
        total: 50,
        cycleDate:
          '2026-06-30'
      }),
      bill({
        total: 60,
        cycleDate:
          '2026-05-31'
      })
    ];

    const result =
      resolvePersonalBillingIntent({
        experience:
          baseExperience({
            historyBills
          }),
        intent:
          'LATEST_INCREASE'
      });

    assert.equal(
      result.status,
      RESOLUTION_STATUS.RESOLVED
    );
    assert.equal(
      result.details.increaseFound,
      false
    );
  }
);

test(
  'recurrencia ambigua pide revisar conceptos y no deriva automáticamente',
  () => {
    const result =
      resolvePersonalBillingIntent({
        experience:
          baseExperience(),
        intent:
          'CHARGE_RECURRENCE',
        message:
          '¿Este cobro fue único o recurrente?'
      });

    assert.equal(
      result.status,
      RESOLUTION_STATUS.UNRESOLVED
    );
    assert.equal(
      result.reasonCode,
      'CHARGE_NEEDS_CLARIFICATION'
    );
    assert.deepEqual(
      ids(result),
      ['REVIEW_BILL_DETAIL']
    );
  }
);

test(
  'seguimiento de paquete puede resolver recurrencia usando el contexto del cargo verificado',
  () => {
    const current =
      bill({
        total: 62.89,
        cycleDate:
          '2026-06-30',
        items: [
          {
            chargeCode: 'PAQ_X',
            label: 'Paquete 3GB',
            amount: 9.99
          }
        ]
      });
    const previous =
      bill({
        total: 52.9,
        cycleDate:
          '2026-05-31',
        items: []
      });

    const experience =
      baseExperience({
        historyBills: [
          current,
          previous
        ],
        causes: [
          {
            code: 'PACKAGES',
            evidenceLevel: 'HIGH',
            subject: {
              chargeCode: 'PAQ_X',
              label: 'Paquete 3GB'
            }
          }
        ]
      });

    const result =
      resolvePersonalBillingIntent({
        experience,
        intent:
          'CHARGE_RECURRENCE',
        message:
          '¿Este cobro fue único o recurrente?',
        lastBillingIntent:
          'PACKAGE_CHARGE'
      });

    assert.equal(
      result.status,
      RESOLUTION_STATUS.RESOLVED
    );
    assert.equal(
      result.details
        .recurrenceStatus,
      'ONE_TIME_IN_WINDOW'
    );
  }
);

test(
  'estado de deuda del perfil queda UNRESOLVED cuando FACTURACION v2 no aporta ese dato',
  () => {
    const result =
      resolveCustomerProfileIntent({
        profile: profile(),
        experience:
          baseExperience(),
        intent: 'DEBT_STATUS'
      });

    assert.equal(
      result.status,
      RESOLUTION_STATUS.UNRESOLVED
    );
    assert.equal(
      result.reasonCode,
      'DEBT_STATUS_NOT_AVAILABLE'
    );
    assert.equal(
      ids(result).includes(
        'CONTACT_ADVISOR'
      ),
      true
    );
  }
);

test(
  'un turno multi-intent mezcla resultados en PARTIALLY_RESOLVED sin perder lo que sí se respondió',
  () => {
    const resolution =
      aggregateCustomerResolutions({
        profile: profile(),
        experience:
          baseExperience(),
        profileIntents: [
          'CURRENT_PLAN',
          'DEBT_STATUS'
        ],
        billingIntents: [
          'CURRENT_TOTAL'
        ],
        message:
          '¿Cuál es mi plan, tengo deuda y cuál es el total de mi recibo?'
      });

    assert.equal(
      resolution.status,
      RESOLUTION_STATUS
        .PARTIALLY_RESOLVED
    );
    assert.equal(
      resolution.intentCount,
      3
    );
    assert.equal(
      resolution.resolvedCount,
      2
    );
    assert.equal(
      resolution.unresolvedCount,
      1
    );
    assert.equal(
      ids(resolution).includes(
        'CONTACT_ADVISOR'
      ),
      true
    );

    const fallbackOnly =
      baseExperience();
    fallbackOnly.customer.plan =
      'MOVIL · WRLS';

    const planResolution =
      resolveCustomerProfileIntent({
        profile: profile(),
        experience: fallbackOnly,
        intent: 'CURRENT_PLAN'
      });

    assert.equal(
      planResolution.status,
      RESOLUTION_STATUS.UNRESOLVED
    );
    assert.equal(
      planResolution.reasonCode,
      'CURRENT_PLAN_NOT_VERIFIED'
    );
  }
);

test(
  'un turno parcialmente resuelto no mezcla acciones exploratorias de intenciones que ya quedaron resueltas',
  () => {
    const resolution =
      aggregateCustomerResolutions({
        profile: profile(),
        experience:
          baseExperience(),
        profileIntents: [
          'CURRENT_PLAN',
          'DEBT_STATUS'
        ],
        billingIntents: [
          'CURRENT_TOTAL'
        ],
        message:
          '¿Cuál es mi plan, tengo deuda y cuál es el total de mi recibo?'
      });

    assert.equal(
      resolution.status,
      RESOLUTION_STATUS
        .PARTIALLY_RESOLVED
    );
    assert.deepEqual(
      ids(resolution),
      [
        'REVIEW_BILL_DETAIL',
        'CONTACT_ADVISOR'
      ]
    );
    assert.equal(
      ids(resolution).includes(
        'EXPLAIN_VARIATION'
      ),
      false
    );
  }
);

test(
  'Mi Movistar deriva sus siguientes acciones del estado real y no ofrece asesor si la explicación ya está resuelta',
  () => {
    const policy =
      buildAppNextActions(
        baseExperience()
      );

    assert.equal(
      policy.resolution.status,
      RESOLUTION_STATUS.RESOLVED
    );
    assert.equal(
      ids(policy).includes(
        'EXPLAIN_BILL'
      ),
      true
    );
    assert.equal(
      ids(policy).includes(
        'CONTACT_ADVISOR'
      ),
      false
    );
  }
);
