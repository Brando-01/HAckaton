const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createBillingAnalysisService,
  BillingAnalysisError
} = require(
  '../services/billingAnalysisService'
);

function makeCharge({
  invoiceNumber,
  cycleDate,
  code,
  description,
  total,
  sourceRow,
  subscriberKey = 'SUB-1',
  group =
    'CARGO FIJO VENCIDO'
}) {
  return {
    invoiceNumber,
    financialAccount: 'FA-1',
    customerKey: 'C-1',
    billingArrangement: 'BA-1',
    billingCycleKey: 27,
    chargeNetAmount: total,
    chargeTotalAmount: total,
    chargeCode: code,
    description,
    classification:
      'Cargo Recurrente',
    subscriberKey,
    periodStartDate: null,
    periodEndDate: null,
    cycleDate,
    group,
    subgroup: group,
    dueDate: null,
    debtStatus:
      'SIN DEUDA',
    sourceRow
  };
}

function createFakeRepository() {
  const charges = {
    'INV-NEW': [
      makeCharge({
        invoiceNumber:
          'INV-NEW',
        cycleDate:
          '2026-07-27',
        code:
          'PLAN',
        description:
          'RV Plan',
        total: 50,
        sourceRow: 10
      }),
      makeCharge({
        invoiceNumber:
          'INV-NEW',
        cycleDate:
          '2026-07-27',
        code:
          'OC1_RECONEXION',
        description:
          'Cargo por Reconexión',
        total: 4.58,
        sourceRow: 11
      })
    ],

    'INV-OLD': [
      makeCharge({
        invoiceNumber:
          'INV-OLD',
        cycleDate:
          '2026-06-27',
        code:
          'PLAN',
        description:
          'RV Plan',
        total: 50,
        sourceRow: 20
      })
    ]
  };

  return {
    opened: false,

    async open() {
      this.opened = true;
      return this;
    },

    async getSubscriber(
      subscriberKey
    ) {
      if (
        subscriberKey !==
        'SUB-1'
      ) {
        return null;
      }

      return {
        customerKey: 'C-1',
        financialAccount: 'FA-1',
        subscriberKey: 'SUB-1',
        activationDate:
          '2025-01-01 00:00:00',
        billingCycleDay: 27,
        lobType: 'WRLS',
        businessType:
          'MOVIL',
        sourceRow: 2
      };
    },

    async listInvoiceHeadersForSubscriber(
      subscriberKey
    ) {
      if (
        subscriberKey !==
        'SUB-1'
      ) {
        return [];
      }

      return [
        {
          invoiceNumber:
            'INV-NEW',
          billingArrangement:
            'BA-1',
          customerKey:
            'C-1',
          financialAccount:
            'FA-1',
          cycleDate:
            '2026-07-27',
          dueDate: null
        },
        {
          invoiceNumber:
            'INV-OLD',
          billingArrangement:
            'BA-1',
          customerKey:
            'C-1',
          financialAccount:
            'FA-1',
          cycleDate:
            '2026-06-27',
          dueDate: null
        }
      ];
    },

    async getInvoiceCharges(
      invoiceNumber
    ) {
      return charges[
        invoiceNumber
      ] || [];
    },

    async getCatalogEntries() {
      return [
        {
          chargeCode:
            'PLAN',
          rateFinal: 50,
          rentType: 'RV',
          sourceRow: 2
        }
      ];
    },

    async getProrationsForInvoice() {
      return [];
    },

    async getReconnectionsForInvoice({
      invoiceNumber
    }) {
      if (
        invoiceNumber !==
        'INV-NEW'
      ) {
        return [];
      }

      return [
        {
          billingArrangement:
            'BA-1',
          financialAccount:
            'FA-1',
          numberValue:
            'X',
          code:
            'OC1_RECONEXION',
          invoiceNumber:
            'INV-NEW',
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
            'X',
          code:
            'OC1_RECONEXION',
          invoiceNumber:
            'INV-NEW',
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
      ];
    },

    async getDiscountsForCycle() {
      return [];
    },

    async getCreditNotesForCycle() {
      return [];
    },

    async getOrdersBetweenBills() {
      return [
        {
          customerKey: 'C-1',
          subscriberKey:
            'SUB-1',
          completionDate:
            '2026-07-03 10:00:00',
          startDate:
            '2026-07-03 09:00:00',
          reason:
            'Cobranza - Reactivación con Cargo',
          reasonId: 'FEERS',
          itemType:
            'Cambiar Cobranza',
          status:
            'Terminado',
          sourceRow: 200
        }
      ];
    },

    async getImportMetadata() {
      return [
        {
          datasetKey:
            'facturacion_clientes',
          fileName:
            'FACTURACION-CLIENTES_.csv',
          sha256:
            'abc',
          importedRows:
            297002,
          importedAt:
            '2026-08-12T00:00:00.000Z'
        }
      ];
    }
  };
}

test(
  'analiza dos recibos sin convertir evidencia en causas',
  async () => {
    const repository =
      createFakeRepository();

    const service =
      createBillingAnalysisService({
        repository
      });

    const analysis =
      await service
        .analyzeSubscriber(
          'SUB-1'
        );

    assert.equal(
      repository.opened,
      true
    );

    assert.equal(
      analysis.currentBill.total,
      54.58
    );

    assert.equal(
      analysis.previousBill.total,
      50
    );

    assert.equal(
      analysis.comparison.difference,
      4.58
    );

    assert.equal(
      analysis.comparison.reconciled,
      true
    );

    assert.equal(
      analysis.evidence.current
        .counts
        .rawRows
        .reconnection,
      2
    );

    assert.equal(
      analysis.evidence.current
        .counts
        .uniqueRecords
        .reconnection,
      1
    );

    assert.equal(
      analysis.evidence
        .ordersBetweenBills
        .length,
      1
    );

    assert.equal(
      analysis.safeguards
        .financialExplanationGenerated,
      false
    );

    assert.equal(
      analysis.safeguards
        .evidenceAmountsSummedAsCauses,
      false
    );
  }
);

test(
  'rechaza un suscriptor inexistente con un código explícito',
  async () => {
    const service =
      createBillingAnalysisService({
        repository:
          createFakeRepository()
      });

    await assert.rejects(
      () =>
        service
          .analyzeSubscriber(
            'NO-EXISTE'
          ),
      (error) =>
        error instanceof
          BillingAnalysisError &&
        error.code ===
          'SUBSCRIBER_NOT_FOUND'
    );
  }
);

test(
  'Fase 14 recupera como máximo seis recibos históricos sin cargar evidencia causal',
  async () => {
    const requested = {
      headerLimit: null,
      invoices: []
    };

    const repository = {
      async open() {},
      async getSubscriber(key) {
        return {
          subscriberKey: key
        };
      },
      async listInvoiceHeadersForSubscriber(
        key,
        options
      ) {
        assert.equal(
          key,
          'SUB_HISTORY'
        );
        requested.headerLimit =
          options.limit;
        return [
          {
            invoiceNumber: 'INV3',
            billingArrangement: 'BA',
            cycleDate: '2026-07-15'
          },
          {
            invoiceNumber: 'INV2',
            billingArrangement: 'BA',
            cycleDate: '2026-06-15'
          },
          {
            invoiceNumber: 'INV1',
            billingArrangement: 'BA',
            cycleDate: '2026-05-15'
          }
        ];
      },
      async getInvoiceCharges(
        invoiceNumber
      ) {
        requested.invoices.push(
          invoiceNumber
        );
        return [
          {
            invoiceNumber,
            chargeCode: 'PLAN',
            chargeTotalAmount: 49.9,
            chargeNetAmount: 42.29,
            description: 'Plan',
            classification:
              'Cargo Recurrente De Plan',
            group: 'CARGO FIJO',
            subgroup: null,
            subscriberKey:
              'SUB_HISTORY',
            debtStatus: 'SIN DEUDA',
            cycleDate: '2026-07-15'
          }
        ];
      },
      async getCatalogEntries() {
        return [];
      }
    };

    const service =
      createBillingAnalysisService({
        repository
      });

    const bills =
      await service.getBillHistory(
        'SUB_HISTORY',
        { limit: 99 }
      );

    assert.equal(
      requested.headerLimit,
      6
    );
    assert.deepEqual(
      requested.invoices,
      ['INV3', 'INV2', 'INV1']
    );
    assert.equal(bills.length, 3);
    assert.equal(
      bills[0].anchorSubscriberKey,
      'SUB_HISTORY'
    );
  }
);
