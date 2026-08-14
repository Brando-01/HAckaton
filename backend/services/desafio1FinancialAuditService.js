const {
  createBillingExplanationService
} = require(
  './billingExplanationService'
);

const {
  auditFinancialExplanation,
  buildSafeCaseAudit,
  mergeAuditCases
} = require(
  './desafio1FinancialAuditLogic'
);

function clampLimit(
  value,
  fallback = 300
) {
  const parsed =
    Number.parseInt(value, 10);

  return Math.min(
    Math.max(
      Number.isInteger(parsed)
        ? parsed
        : fallback,
      1
    ),
    2000
  );
}

function clampConcurrency(
  value,
  fallback = 4
) {
  const parsed =
    Number.parseInt(value, 10);

  return Math.min(
    Math.max(
      Number.isInteger(parsed)
        ? parsed
        : fallback,
      1
    ),
    8
  );
}

function selectEvenlySpaced(
  rows = [],
  limit = 300
) {
  if (!rows.length) {
    return [];
  }

  const safeLimit = Math.min(
    clampLimit(limit),
    rows.length
  );

  if (safeLimit >= rows.length) {
    return rows.slice();
  }

  if (safeLimit === 1) {
    return [rows[0]];
  }

  const result = [];
  const used = new Set();

  for (
    let index = 0;
    index < safeLimit;
    index += 1
  ) {
    const rawPosition =
      index *
      (rows.length - 1) /
      (safeLimit - 1);
    let position =
      Math.round(rawPosition);

    while (
      used.has(position) &&
      position + 1 < rows.length
    ) {
      position += 1;
    }

    if (used.has(position)) {
      position = Math.max(
        0,
        position - 1
      );
      while (
        used.has(position) &&
        position > 0
      ) {
        position -= 1;
      }
    }

    if (!used.has(position)) {
      used.add(position);
      result.push(rows[position]);
    }
  }

  return result;
}

function buildCaseRef(index) {
  return `AUD${String(
    index + 1
  ).padStart(6, '0')}`;
}

class FinancialAuditService {
  constructor({
    repository = null,
    explanationService = null,
    dbPath = null
  } = {}) {
    if (repository) {
      this.repository = repository;
      this.ownsRepository = false;
    } else {
      // Carga diferida para permitir pruebas de lógica sin sqlite3.
      const {
        createDesafio1Repository
      } = require(
        './desafio1Repository'
      );

      this.repository =
        createDesafio1Repository({
          dbPath
        });
      this.ownsRepository = true;
    }

    if (explanationService) {
      this.explanationService =
        explanationService;
      this.ownsExplanationService =
        false;
    } else {
      this.explanationService =
        createBillingExplanationService({
          repository:
            this.repository
        });
      this.ownsExplanationService =
        true;
    }

    this.opened = false;
  }

  async open() {
    if (this.opened) {
      return this;
    }

    if (
      this.repository &&
      typeof this.repository.open ===
        'function'
    ) {
      await this.repository.open();
    }

    if (
      this.explanationService &&
      typeof this.explanationService
        .open === 'function'
    ) {
      await this.explanationService
        .open();
    }

    this.opened = true;
    return this;
  }

  async close() {
    if (!this.opened) {
      return;
    }

    if (
      this.ownsExplanationService &&
      this.explanationService &&
      typeof this.explanationService
        .close === 'function'
    ) {
      await this.explanationService
        .close();
    }

    if (
      this.ownsRepository &&
      this.repository &&
      typeof this.repository.close ===
        'function'
    ) {
      await this.repository.close();
    }

    this.opened = false;
  }

  async ensureOpen() {
    if (!this.opened) {
      await this.open();
    }
  }

  async loadRawEvidence(
    bill
  ) {
    if (!bill) {
      return {
        prorations: [],
        reconnections: [],
        discounts: [],
        creditNotes: []
      };
    }

    const [
      prorations,
      reconnections,
      discounts,
      creditNotes
    ] = await Promise.all([
      this.repository
        .getProrationsForInvoice({
          invoiceNumber:
            bill.invoiceNumber,
          billingArrangement:
            bill.billingArrangement
        }),
      this.repository
        .getReconnectionsForInvoice({
          invoiceNumber:
            bill.invoiceNumber,
          billingArrangement:
            bill.billingArrangement
        }),
      this.repository
        .getDiscountsForCycle({
          billingArrangement:
            bill.billingArrangement,
          cycleDate:
            bill.cycleDate
        }),
      this.repository
        .getCreditNotesForCycle({
          billingArrangement:
            bill.billingArrangement,
          cycleDate:
            bill.cycleDate
        })
    ]);

    return {
      prorations,
      reconnections,
      discounts,
      creditNotes
    };
  }

  async auditSubscriber(
    subscriberKey,
    {
      caseRef = 'AUD000001'
    } = {}
  ) {
    await this.ensureOpen();

    const explanation =
      await this.explanationService
        .explainSubscriber(
          subscriberKey
        );

    const current =
      explanation.currentBill;
    const previous =
      explanation.previousBill;

    const subscriberKeys = Array.from(
      new Set([
        ...(current.subscriberKeys || []),
        ...(previous?.subscriberKeys || [])
      ].filter(Boolean))
    );

    const [
      rawCurrentCharges,
      rawPreviousCharges,
      rawEvidence,
      rawPreviousEvidence,
      rawOrders
    ] = await Promise.all([
      this.repository
        .getInvoiceCharges(
          current.invoiceNumber,
          current.billingArrangement
        ),
      previous
        ? this.repository
            .getInvoiceCharges(
              previous.invoiceNumber,
              previous.billingArrangement
            )
        : Promise.resolve([]),
      this.loadRawEvidence(current),
      previous
        ? this.loadRawEvidence(previous)
        : Promise.resolve({
            prorations: [],
            reconnections: [],
            discounts: [],
            creditNotes: []
          }),
      previous && subscriberKeys.length
        ? this.repository
            .getOrdersBetweenBills({
              subscriberKeys,
              startDate:
                previous.cycleDate,
              endDate:
                current.cycleDate
            })
        : Promise.resolve([])
    ]);

    const audit =
      auditFinancialExplanation({
        explanation,
        rawCurrentCharges,
        rawPreviousCharges,
        rawEvidence,
        rawPreviousEvidence,
        rawOrders
      });

    const safe = buildSafeCaseAudit(
      audit,
      {
        caseRef,
        explanation
      }
    );

    return {
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
    };
  }

  async listBillablePopulation() {
    await this.ensureOpen();

    const seeds =
      await this.repository
        .listCoverageSubscriberSeeds({
          limit: null
        });

    return seeds.filter(
      (seed) =>
        Number(seed.invoiceCount) > 0
    );
  }

  async runBenchmark({
    limit = 300,
    concurrency = 4,
    onProgress = null
  } = {}) {
    await this.ensureOpen();

    const safeLimit =
      clampLimit(limit);
    const workerCount =
      clampConcurrency(concurrency);
    const population =
      await this.listBillablePopulation();
    const selected =
      selectEvenlySpaced(
        population,
        safeLimit
      );

    const cases =
      new Array(selected.length);
    let cursor = 0;
    let processed = 0;
    let violations = 0;
    let errors = 0;

    const runWorker = async () => {
      while (true) {
        const index = cursor;
        cursor += 1;

        if (index >= selected.length) {
          return;
        }

        const seed = selected[index];
        const caseRef =
          buildCaseRef(index);

        try {
          const result =
            await this.auditSubscriber(
              seed.subscriberKey,
              { caseRef }
            );

          cases[index] = result;
          violations +=
            Number(
              result.assertions
                ?.failed || 0
            );
        } catch (error) {
          errors += 1;
          violations += 1;
          cases[index] = {
            caseRef,
            status: 'ERROR',
            explanationStatus: null,
            scenarios: [],
            metrics: {
              retrievalAccuracyPct: null,
              groundingAccuracyPct: null,
              policyCompliancePct: null,
              detectableFinancialHallucinationRatePct:
                null,
              financialClaimViolations: 0,
              totalViolations: 1
            },
            assertions: {
              total: 1,
              evaluable: 1,
              passed: 0,
              failed: 1,
              notEvaluable: 0
            },
            failedAssertions: [
              {
                id:
                  'CASE_AUDIT_EXECUTION',
                category:
                  'RETRIEVAL',
                reason:
                  error?.code ||
                  'AUDIT_EXECUTION_ERROR',
                source: null
              }
            ],
            _categorySummary: {
              RETRIEVAL: {
                total: 1,
                evaluable: 1,
                passed: 0,
                failed: 1,
                notEvaluable: 0
              }
            },
            _monetaryEvaluable: 0,
            _monetaryFailed: 0
          };
        }

        processed += 1;

        if (
          typeof onProgress ===
            'function'
        ) {
          onProgress({
            processed,
            total: selected.length,
            violations,
            errors
          });
        }
      }
    };

    await Promise.all(
      Array.from(
        {
          length: Math.min(
            workerCount,
            Math.max(
              selected.length,
              1
            )
          )
        },
        () => runWorker()
      )
    );

    return mergeAuditCases(
      cases.filter(Boolean),
      {
        requested: safeLimit,
        population:
          population.length
      }
    );
  }
}

function createFinancialAuditService(
  options = {}
) {
  return new FinancialAuditService(
    options
  );
}

module.exports = {
  clampLimit,
  clampConcurrency,
  selectEvenlySpaced,
  buildCaseRef,
  FinancialAuditService,
  createFinancialAuditService
};
