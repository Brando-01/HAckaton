const test = require('node:test');
const assert = require('node:assert/strict');

const {
  roundMoney,
  aggregateInvoice,
  compareInvoices,
  collapseDuplicateRows,
  buildInvoiceEvidence
} = require(
  '../services/desafio1BillingLogic'
);

function charge(
  overrides = {}
) {
  return {
    invoiceNumber:
      'INV-1',

    financialAccount:
      'FA-1',

    customerKey:
      'C-1',

    billingArrangement:
      'BA-1',

    chargeNetAmount:
      10,

    chargeTotalAmount:
      10,

    chargeCode:
      'PLAN',

    description:
      'RV Plan Base',

    classification:
      'Cargo Recurrente',

    subscriberKey:
      'SUB-1',

    cycleDate:
      '2026-07-27',

    group:
      'CARGO FIJO VENCIDO',

    subgroup:
      'CARGO FIJO VENCIDO MOVIL',

    dueDate:
      '2026-08-13',

    debtStatus:
      'SIN DEUDA',

    sourceRow:
      10,

    ...overrides
  };
}

test(
  'roundMoney evita residuos binarios en montos',
  () => {
    assert.equal(
      roundMoney(
        10.1 + 0.2
      ),
      10.3
    );
  }
);

test(
  'reconstruye una factura completa aunque tenga más de un suscriptor',
  () => {
    const invoice =
      aggregateInvoice({
        header: {
          invoiceNumber:
            'INV-1',

          anchorSubscriberKey:
            'SUB-1'
        },

        charges: [
          charge({
            chargeTotalAmount:
              29.9,

            chargeNetAmount:
              25.34,

            sourceRow: 10
          }),

          charge({
            subscriberKey:
              'SUB-2',

            chargeCode:
              'VOICE',

            description:
              'Movistar Voz',

            chargeTotalAmount:
              10,

            chargeNetAmount:
              8.47,

            group:
              'CARGO FIJO',

            subgroup:
              'CARGO FIJO VOZ',

            sourceRow: 11
          })
        ],

        catalogEntries: []
      });

    assert.equal(
      invoice.total,
      39.9
    );

    assert.deepEqual(
      invoice.subscriberKeys,
      [
        'SUB-1',
        'SUB-2'
      ]
    );

    assert.equal(
      invoice.items.length,
      2
    );
  }
);

test(
  'agrupa filas del mismo charge code sin perder trazabilidad',
  () => {
    const invoice =
      aggregateInvoice({
        header: {
          invoiceNumber:
            'INV-1'
        },

        charges: [
          charge({
            chargeTotalAmount: 5,
            sourceRow: 20
          }),

          charge({
            chargeTotalAmount: 7,
            sourceRow: 21
          })
        ],

        catalogEntries: []
      });

    assert.equal(
      invoice.items.length,
      1
    );

    assert.equal(
      invoice.items[0].amount,
      12
    );

    assert.equal(
      invoice.items[0].quantity,
      2
    );

    assert.deepEqual(
      invoice.items[0].sourceRows,
      [20, 21]
    );

    assert.equal(
      invoice.items[0].components.length,
      2
    );

    assert.deepEqual(
      invoice.items[0].components.map(
        (component) =>
          component.amount
      ),
      [5, 7]
    );
  }
);

test(
  'prioriza el tipo de renta del catálogo y conserva tarifas múltiples',
  () => {
    const invoice =
      aggregateInvoice({
        header: {
          invoiceNumber:
            'INV-1'
        },

        charges: [
          charge({
            description:
              'Plan sin prefijo de renta'
          })
        ],

        catalogEntries: [
          {
            chargeCode:
              'PLAN',

            rateFinal: 29.9,
            rentType: 'RV',
            sourceRow: 2
          },

          {
            chargeCode:
              'PLAN',

            rateFinal: 39.9,
            rentType: 'RV',
            sourceRow: 3
          }
        ]
      });

    assert.equal(
      invoice.items[0].rentType,
      'RV'
    );

    assert.equal(
      invoice.items[0].rentTypeSource,
      'CATALOGO_OFERTAS'
    );

    assert.deepEqual(
      invoice.items[0].catalogRates,
      [29.9, 39.9]
    );
  }
);


test(
  'no inventa tipo de renta si el catálogo no trae RA o RV válidos',
  () => {
    const invoice =
      aggregateInvoice({
        header: {
          invoiceNumber:
            'INV-1'
        },

        charges: [
          charge({
            description:
              'Plan Base'
          })
        ],

        catalogEntries: [
          {
            chargeCode:
              'PLAN',
            rateFinal: 29.9,
            rentType:
              'DESCONOCIDO',
            sourceRow: 2
          }
        ]
      });

    assert.equal(
      invoice.items[0].rentType,
      null
    );

    assert.equal(
      invoice.items[0].rentTypeSource,
      null
    );
  }
);

test(
  'marca NO CONSIDERAR sin excluirlo del total del recibo',
  () => {
    const invoice =
      aggregateInvoice({
        header: {
          invoiceNumber:
            'INV-1'
        },

        charges: [
          charge({
            chargeCode: 'BONO',
            chargeTotalAmount: 29.9,
            group:
              'NO CONSIDERAR'
          }),

          charge({
            chargeCode: 'DESC',
            chargeTotalAmount: -29.9,
            group:
              'NO CONSIDERAR'
          }),

          charge({
            chargeCode: 'PLAN',
            chargeTotalAmount: 60
          })
        ],

        catalogEntries: []
      });

    assert.equal(
      invoice.total,
      60
    );

    assert.equal(
      invoice.items
        .find(
          (item) =>
            item.chargeCode ===
            'BONO'
        )
        .ignoreForExplanation,
      true
    );
  }
);

test(
  'la comparación por charge code reconcilia exactamente la variación total',
  () => {
    const previous =
      aggregateInvoice({
        header: {
          invoiceNumber:
            'INV-0'
        },

        charges: [
          charge({
            invoiceNumber:
              'INV-0',

            chargeCode:
              'PLAN',

            chargeTotalAmount:
              50,

            sourceRow: 2
          }),

          charge({
            invoiceNumber:
              'INV-0',

            chargeCode:
              'DESC',

            description:
              'Descuento',

            chargeTotalAmount:
              -20,

            group:
              'DESCUENTO',

            sourceRow: 3
          })
        ],

        catalogEntries: []
      });

    const current =
      aggregateInvoice({
        header: {
          invoiceNumber:
            'INV-1'
        },

        charges: [
          charge({
            chargeCode:
              'PLAN',

            chargeTotalAmount:
              50,

            sourceRow: 4
          }),

          charge({
            chargeCode:
              'RECO',

            description:
              'Cargo por Reconexión',

            chargeTotalAmount:
              10,

            group:
              'OTROS CARGOS',

            sourceRow: 5
          })
        ],

        catalogEntries: []
      });

    const comparison =
      compareInvoices(
        current,
        previous
      );

    assert.equal(
      comparison.previousTotal,
      30
    );

    assert.equal(
      comparison.currentTotal,
      60
    );

    assert.equal(
      comparison.difference,
      30
    );

    assert.equal(
      comparison.summedChargeDeltas,
      30
    );

    assert.equal(
      comparison.reconciliationResidual,
      0
    );

    assert.equal(
      comparison.reconciled,
      true
    );

    assert.deepEqual(
      comparison
        .chargeChanges
        .map(
          (change) => [
            change.chargeCode,
            change.delta,
            change.status
          ]
        ),
      [
        [
          'DESC',
          20,
          'REMOVED'
        ],
        [
          'RECO',
          10,
          'ADDED'
        ]
      ]
    );
  }
);

test(
  'no inventa porcentaje cuando el recibo anterior vale cero',
  () => {
    const previous = {
      invoiceNumber: 'INV-0',
      total: 0,
      items: []
    };

    const current = {
      invoiceNumber: 'INV-1',
      total: 10,
      items: [
        {
          chargeCode: 'X',
          description: 'X',
          amount: 10,
          ignoreForExplanation: false,
          subscriberKeys: []
        }
      ]
    };

    const comparison =
      compareInvoices(
        current,
        previous
      );

    assert.equal(
      comparison.percentage,
      null
    );
  }
);

test(
  'colapsa duplicados Brainy sin multiplicar el monto',
  () => {
    const rows = [
      {
        invoiceNumber:
          'INV-1',

        amount: 4.58,
        sourceRow: 10
      },

      {
        invoiceNumber:
          'INV-1',

        amount: 4.58,
        sourceRow: 11
      }
    ];

    const collapsed =
      collapseDuplicateRows(
        rows,
        {
          keyFields: [
            'invoiceNumber',
            'amount'
          ],

          mapRow:
            (row) => ({
              invoiceNumber:
                row.invoiceNumber,

              amount:
                row.amount
            })
        }
      );

    assert.equal(
      collapsed.length,
      1
    );

    assert.equal(
      collapsed[0].amount,
      4.58
    );

    assert.equal(
      collapsed[0].occurrences,
      2
    );

    assert.deepEqual(
      collapsed[0].sourceRows,
      [10, 11]
    );
  }
);

test(
  'el modelo de evidencia conserva filas físicas y registros únicos por separado',
  () => {
    const invoice =
      aggregateInvoice({
        header: {
          invoiceNumber:
            'INV-1'
        },

        charges: [
          charge({
            chargeCode:
              'OC1_RECONEXION',

            description:
              'Cargo por Reconexión',

            chargeTotalAmount:
              4.58
          })
        ],

        catalogEntries: []
      });

    const evidence =
      buildInvoiceEvidence({
        invoice,

        reconnections: [
          {
            billingArrangement:
              'BA-1',

            financialAccount:
              'FA-1',

            numberValue:
              'N-1',

            code:
              'OC1_RECONEXION',

            invoiceNumber:
              'INV-1',

            description:
              'Cargo por Reconexión',

            reconnectionDate:
              '2026-07-03 00:00:00',

            amount: 4.58,

            cycleDate:
              '2026-07-27',

            cutDate:
              '2026-07-03 00:00:00',

            sourceRow: 100
          },

          {
            billingArrangement:
              'BA-1',

            financialAccount:
              'FA-1',

            numberValue:
              'N-1',

            code:
              'OC1_RECONEXION',

            invoiceNumber:
              'INV-1',

            description:
              'Cargo por Reconexión',

            reconnectionDate:
              '2026-07-03 00:00:00',

            amount: 4.58,

            cycleDate:
              '2026-07-27',

            cutDate:
              '2026-07-03 00:00:00',

            sourceRow: 101
          }
        ],

        prorations: [],
        discounts: [],
        creditNotes: []
      });

    assert.equal(
      evidence.counts
        .rawRows
        .reconnection,
      2
    );

    assert.equal(
      evidence.counts
        .uniqueRecords
        .reconnection,
      1
    );

    assert.equal(
      evidence.reconnection[0]
        .occurrences,
      2
    );

    assert.equal(
      evidence.reconnection[0]
        .amount,
      4.58
    );

    assert.equal(
      evidence.reconnection[0]
        .matchedChargeCode,
      true
    );
  }
);
