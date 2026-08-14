const test = require('node:test');
const assert = require('node:assert/strict');

const {
  selectEvenlySpaced,
  buildCaseRef,
  FinancialAuditService
} = require(
  '../services/desafio1FinancialAuditService'
);

function explanationFor(
  subscriberKey = 'PRIVATE-1'
) {
  return {
    currentBill: {
      invoiceNumber: 'INV-2',
      billingArrangement: 'BA-1',
      cycleDate: '2026-07-31',
      total: 60,
      netTotal: 60,
      rawChargeRows: 1,
      subscriberKeys: [subscriberKey],
      items: [
        {
          chargeCode: 'PLAN',
          amount: 60,
          netAmount: 60,
          sourceRows: [2]
        }
      ]
    },
    previousBill: {
      invoiceNumber: 'INV-1',
      billingArrangement: 'BA-1',
      cycleDate: '2026-06-30',
      total: 50,
      netTotal: 50,
      rawChargeRows: 1,
      subscriberKeys: [subscriberKey],
      items: [
        {
          chargeCode: 'PLAN',
          amount: 50,
          netAmount: 50,
          sourceRows: [1]
        }
      ]
    },
    comparison: {
      currentTotal: 60,
      previousTotal: 50,
      difference: 10,
      reconciliationResidual: 0,
      chargeChanges: [
        {
          chargeCode: 'PLAN',
          previousAmount: 50,
          currentAmount: 60,
          delta: 10
        }
      ]
    },
    interpretation: {
      status: 'FULLY_EXPLAINED',
      explainedNetAmount: 10,
      causes: [
        {
          code: 'PACKAGES',
          impactAmount: 10,
          claimedChargeCodes: ['PLAN'],
          evidence: {}
        }
      ],
      currentBillFindings: []
    },
    safeguards: {
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
}

function createRepository({
  subscriberKeys = ['100', '200', '300'],
  failKey = null
} = {}) {
  const calls = {
    open: 0,
    close: 0,
    raw: 0
  };

  const repository = {
    calls,
    async open() {
      calls.open += 1;
    },
    async close() {
      calls.close += 1;
    },
    async listCoverageSubscriberSeeds() {
      return subscriberKeys.map(
        (subscriberKey) => ({
          subscriberKey,
          invoiceCount: 2
        })
      );
    },
    async getInvoiceCharges(
      invoiceNumber
    ) {
      calls.raw += 1;
      if (invoiceNumber === 'INV-2') {
        return [
          {
            chargeCode: 'PLAN',
            chargeTotalAmount: 60,
            chargeNetAmount: 60,
            sourceRow: 2,
            group: 'PAQUETES',
            classification: 'PAQUETE'
          }
        ];
      }
      return [
        {
          chargeCode: 'PLAN',
          chargeTotalAmount: 50,
          chargeNetAmount: 50,
          sourceRow: 1,
          group: 'PAQUETES',
          classification: 'PAQUETE'
        }
      ];
    },
    async getProrationsForInvoice() {
      return [];
    },
    async getReconnectionsForInvoice() {
      return [];
    },
    async getDiscountsForCycle() {
      return [];
    },
    async getCreditNotesForCycle() {
      return [];
    },
    async getOrdersBetweenBills() {
      return [];
    }
  };

  const explanationService = {
    opened: 0,
    closed: 0,
    async open() {
      this.opened += 1;
    },
    async close() {
      this.closed += 1;
    },
    async explainSubscriber(key) {
      if (key === failKey) {
        const error = new Error(
          'simulated private failure'
        );
        error.code = 'SIMULATED_ERROR';
        throw error;
      }
      return explanationFor(key);
    }
  };

  return {
    repository,
    explanationService
  };
}

test(
  'selectEvenlySpaced cubre inicio y final de una población sin depender de ids aleatorios',
  () => {
    const rows = Array.from(
      { length: 10 },
      (_, index) => index
    );

    assert.deepEqual(
      selectEvenlySpaced(rows, 4),
      [0, 3, 6, 9]
    );
  }
);

test(
  'buildCaseRef genera aliases de auditoría y nunca reutiliza la llave privada',
  () => {
    assert.equal(
      buildCaseRef(0),
      'AUD000001'
    );
    assert.equal(
      buildCaseRef(41),
      'AUD000042'
    );
  }
);

test(
  'auditSubscriber compara la explicación con filas crudas y devuelve solo proyección segura',
  async () => {
    const {
      repository,
      explanationService
    } = createRepository();

    const service =
      new FinancialAuditService({
        repository,
        explanationService
      });

    try {
      const result =
        await service.auditSubscriber(
          'PRIVATE-1',
          {
            caseRef: 'AUD000009'
          }
        );

      assert.equal(
        result.status,
        'PASS'
      );
      assert.equal(
        result.metrics
          .retrievalAccuracyPct,
        100
      );
      assert.equal(
        result.metrics
          .detectableFinancialHallucinationRatePct,
        0
      );

      const serialized =
        JSON.stringify(result);
      assert.equal(
        serialized.includes(
          'PRIVATE-1'
        ),
        false
      );
      assert.equal(
        serialized.includes('INV-2'),
        false
      );
    } finally {
      await service.close();
    }
  }
);

test(
  'runBenchmark audita una muestra reproducible y solo publica AUD refs',
  async () => {
    const {
      repository,
      explanationService
    } = createRepository({
      subscriberKeys: [
        'PRIVATE-A',
        'PRIVATE-B',
        'PRIVATE-C',
        'PRIVATE-D',
        'PRIVATE-E'
      ]
    });

    const service =
      new FinancialAuditService({
        repository,
        explanationService
      });

    try {
      const report =
        await service.runBenchmark({
          limit: 3,
          concurrency: 2
        });

      assert.equal(
        report.selection.population,
        5
      );
      assert.equal(
        report.selection.evaluated,
        3
      );
      assert.deepEqual(
        report.cases.map(
          (item) => item.caseRef
        ),
        [
          'AUD000001',
          'AUD000002',
          'AUD000003'
        ]
      );
      assert.equal(
        report.status,
        'PASS'
      );

      const serialized =
        JSON.stringify(report);
      assert.equal(
        serialized.includes(
          'PRIVATE-A'
        ),
        false
      );
      assert.equal(
        serialized.includes(
          'PRIVATE-C'
        ),
        false
      );
      assert.equal(
        serialized.includes(
          'PRIVATE-E'
        ),
        false
      );
    } finally {
      await service.close();
    }
  }
);

test(
  'runBenchmark convierte un fallo de caso en observación segura sin imprimir el mensaje privado',
  async () => {
    const {
      repository,
      explanationService
    } = createRepository({
      subscriberKeys: [
        'PRIVATE-A',
        'PRIVATE-B'
      ],
      failKey: 'PRIVATE-B'
    });

    const service =
      new FinancialAuditService({
        repository,
        explanationService
      });

    try {
      const report =
        await service.runBenchmark({
          limit: 2,
          concurrency: 1
        });

      assert.equal(
        report.status,
        'FAIL'
      );
      assert.equal(
        report.cases[1].caseRef,
        'AUD000002'
      );
      assert.equal(
        report.cases[1]
          .failedAssertions[0]
          .reason,
        'SIMULATED_ERROR'
      );
      assert.equal(
        JSON.stringify(report)
          .includes(
            'simulated private failure'
          ),
        false
      );
    } finally {
      await service.close();
    }
  }
);

test(
  'un servicio inyectado no cierra dependencias que no le pertenecen',
  async () => {
    const {
      repository,
      explanationService
    } = createRepository();

    const service =
      new FinancialAuditService({
        repository,
        explanationService
      });

    await service.open();
    await service.close();

    assert.equal(
      repository.calls.close,
      0
    );
    assert.equal(
      explanationService.closed,
      0
    );
  }
);
