const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createBillingExplanationService
} = require(
  '../services/billingExplanationService'
);

function phase2Analysis() {
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
      lobType: 'WRLS',
      businessType: 'MOVIL'
    },
    currentBill: {
      invoiceNumber:
        'INV-NEW',
      billingArrangement:
        'BA-1',
      cycleDate:
        '2026-07-27',
      total: 34.48,
      items: [
        {
          chargeCode:
            'OC1_RECONEXION',
          description:
            'Cargo por Reconexión',
          descriptions: [
            'Cargo por Reconexión'
          ],
          classification:
            'Cargo Unico',
          classifications: [
            'Cargo Unico'
          ],
          group:
            'CARGO POR RECONEXION',
          groups: [
            'CARGO POR RECONEXION'
          ],
          subgroup:
            'CARGO POR RECONEXION',
          subgroups: [
            'CARGO POR RECONEXION'
          ],
          amount: 4.58,
          netAmount: 3.88,
          quantity: 1,
          subscriberKeys: [
            'SUB-1'
          ],
          sourceRows: [10],
          components: [
            {
              amount: 4.58,
              netAmount: 3.88,
              description:
                'Cargo por Reconexión',
              classification:
                'Cargo Unico',
              group:
                'CARGO POR RECONEXION',
              subgroup:
                'CARGO POR RECONEXION',
              subscriberKey:
                'SUB-1',
              sourceRow: 10
            }
          ],
          ignoreForExplanation:
            false,
          rentType: null,
          rentTypeSource: null
        }
      ]
    },
    previousBill: {
      invoiceNumber:
        'INV-OLD',
      billingArrangement:
        'BA-1',
      cycleDate:
        '2026-06-27',
      total: 29.9,
      items: []
    },
    comparison: {
      previousInvoiceNumber:
        'INV-OLD',
      currentInvoiceNumber:
        'INV-NEW',
      previousTotal: 29.9,
      currentTotal: 34.48,
      difference: 4.58,
      direction: 'UP',
      chargeChanges: [
        {
          chargeCode:
            'OC1_RECONEXION',
          description:
            'Cargo por Reconexión',
          previousAmount: 0,
          currentAmount: 4.58,
          delta: 4.58,
          status: 'ADDED',
          ignoreForExplanation:
            false,
          currentRentType: null,
          previousRentType: null,
          subscriberKeys: [
            'SUB-1'
          ]
        }
      ],
      summedChargeDeltas: 4.58,
      reconciliationResidual: 0,
      reconciled: true
    },
    evidence: {
      current: {
        invoiceNumber:
          'INV-NEW',
        cycleDate:
          '2026-07-27',
        proration: [],
        reconnection: [
          {
            code:
              'OC1_RECONEXION',
            amount: 4.58,
            description:
              'Cargo por Reconexión',
            sourceRows: [100],
            occurrences: 1
          }
        ],
        discountsAndInstallments: [],
        creditDebitNotes: [],
        observedRentTypes: []
      },
      previous: {
        invoiceNumber:
          'INV-OLD',
        cycleDate:
          '2026-06-27',
        proration: [],
        reconnection: [],
        discountsAndInstallments: [],
        creditDebitNotes: [],
        observedRentTypes: []
      },
      ordersBetweenBills: []
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

test(
  'orquesta Fase 2 y devuelve una explicación Fase 3 sin alterar el servicio inyectado',
  async () => {
    const fake = {
      opened: 0,
      closed: 0,
      calls: [],

      async open() {
        this.opened += 1;
      },

      async close() {
        this.closed += 1;
      },

      async analyzeSubscriber(
        subscriberKey
      ) {
        this.calls.push(
          subscriberKey
        );

        return phase2Analysis();
      }
    };

    const service =
      createBillingExplanationService({
        analysisService: fake
      });

    const result =
      await service
        .explainSubscriber(
          'SUB-1'
        );

    assert.equal(
      fake.opened,
      1
    );
    assert.deepEqual(
      fake.calls,
      ['SUB-1']
    );
    assert.equal(
      result.phase,
      'PHASE_3'
    );
    assert.equal(
      result.interpretation.causes[0].code,
      'RECONNECTION'
    );

    await service.close();

    assert.equal(
      fake.closed,
      0,
      'un servicio de análisis inyectado no debe ser cerrado por el wrapper'
    );
  }
);

test(
  'propaga errores de Fase 2 sin convertirlos en explicaciones inventadas',
  async () => {
    const expected =
      Object.assign(
        new Error(
          'suscriptor inexistente'
        ),
        {
          code:
            'SUBSCRIBER_NOT_FOUND'
        }
      );

    const fake = {
      async open() {},

      async analyzeSubscriber() {
        throw expected;
      }
    };

    const service =
      createBillingExplanationService({
        analysisService: fake
      });

    await assert.rejects(
      () =>
        service.explainSubscriber(
          'NO-EXISTE'
        ),
      (error) =>
        error === expected &&
        error.code ===
          'SUBSCRIBER_NOT_FOUND'
    );
  }
);
