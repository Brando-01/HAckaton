const {
  aggregateInvoice,
  compareInvoices,
  buildInvoiceEvidence,
  normalizeOrderContext,
  uniqueValues
} = require(
  './desafio1BillingLogic'
);

function normalizeIdentifier(
  value
) {
  const normalized =
    String(
      value ?? ''
    ).trim();

  return normalized ||
    null;
}

class BillingAnalysisError
  extends Error {
  constructor(
    code,
    message
  ) {
    super(message);

    this.name =
      'BillingAnalysisError';

    this.code = code;
  }
}

class BillingAnalysisService {
  constructor({
    repository = null,
    dbPath = null
  } = {}) {
    if (repository) {
      this.repository =
        repository;

      this.ownsRepository =
        false;
    } else {
      // Carga diferida para que las pruebas de lógica
      // puedan ejecutarse sin abrir SQLite.
      const {
        createDesafio1Repository
      } = require(
        './desafio1Repository'
      );

      this.repository =
        createDesafio1Repository({
          dbPath
        });

      this.ownsRepository =
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

    this.opened = true;

    return this;
  }

  async close() {
    if (
      !this.opened
    ) {
      return;
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

  async hydrateInvoice(
    header
  ) {
    const charges =
      await this.repository
        .getInvoiceCharges(
          header.invoiceNumber,
          header.billingArrangement
        );

    if (!charges.length) {
      throw new BillingAnalysisError(
        'INVOICE_WITHOUT_CHARGES',
        `La factura ${header.invoiceNumber} no tiene cargos disponibles`
      );
    }

    const catalogEntries =
      await this.repository
        .getCatalogEntries(
          uniqueValues(
            charges.map(
              (charge) =>
                charge.chargeCode
            )
          )
        );

    return aggregateInvoice({
      header,
      charges,
      catalogEntries
    });
  }

  async getEvidenceForInvoice(
    invoice
  ) {
    const [
      prorations,
      reconnections,
      discounts,
      creditNotes
    ] =
      await Promise.all([
        this.repository
          .getProrationsForInvoice({
            invoiceNumber:
              invoice.invoiceNumber,

            billingArrangement:
              invoice.billingArrangement
          }),

        this.repository
          .getReconnectionsForInvoice({
            invoiceNumber:
              invoice.invoiceNumber,

            billingArrangement:
              invoice.billingArrangement
          }),

        this.repository
          .getDiscountsForCycle({
            billingArrangement:
              invoice.billingArrangement,

            cycleDate:
              invoice.cycleDate
          }),

        this.repository
          .getCreditNotesForCycle({
            billingArrangement:
              invoice.billingArrangement,

            cycleDate:
              invoice.cycleDate
          })
      ]);

    return buildInvoiceEvidence({
      invoice,
      prorations,
      reconnections,
      discounts,
      creditNotes
    });
  }

  async getBillHistory(
    subscriberKey,
    {
      limit = 6
    } = {}
  ) {
    await this.ensureOpen();

    const key =
      normalizeIdentifier(
        subscriberKey
      );

    if (!key) {
      throw new BillingAnalysisError(
        'SUBSCRIBER_REQUIRED',
        'Se requiere un subscriberKey'
      );
    }

    const subscriber =
      await this.repository
        .getSubscriber(key);

    if (!subscriber) {
      throw new BillingAnalysisError(
        'SUBSCRIBER_NOT_FOUND',
        `No existe el suscriptor ${key} en PLANTA CLIENTES`
      );
    }

    const safeLimit =
      Math.min(
        Math.max(
          Number.parseInt(
            limit,
            10
          ) || 6,
          1
        ),
        6
      );

    const headers =
      await this.repository
        .listInvoiceHeadersForSubscriber(
          key,
          {
            limit: safeLimit
          }
        );

    const bills = [];

    for (const header of headers) {
      bills.push(
        await this.hydrateInvoice({
          ...header,
          anchorSubscriberKey:
            key
        })
      );
    }

    return bills;
  }

  async analyzeSubscriber(
    subscriberKey
  ) {
    await this.ensureOpen();

    const key =
      normalizeIdentifier(
        subscriberKey
      );

    if (!key) {
      throw new BillingAnalysisError(
        'SUBSCRIBER_REQUIRED',
        'Se requiere un subscriberKey'
      );
    }

    const subscriber =
      await this.repository
        .getSubscriber(key);

    if (!subscriber) {
      throw new BillingAnalysisError(
        'SUBSCRIBER_NOT_FOUND',
        `No existe el suscriptor ${key} en PLANTA CLIENTES`
      );
    }

    const headers =
      await this.repository
        .listInvoiceHeadersForSubscriber(
          key,
          {
            limit: 2
          }
        );

    if (!headers.length) {
      throw new BillingAnalysisError(
        'NO_BILLS_FOR_SUBSCRIBER',
        `El suscriptor ${key} existe, pero no tiene recibos en FACTURACION-CLIENTES`
      );
    }

    const currentHeader = {
      ...headers[0],
      anchorSubscriberKey:
        key
    };

    const previousHeader =
      headers[1]
        ? {
            ...headers[1],
            anchorSubscriberKey:
              key
          }
        : null;

    const currentBill =
      await this.hydrateInvoice(
        currentHeader
      );

    const previousBill =
      previousHeader
        ? await this.hydrateInvoice(
            previousHeader
          )
        : null;

    const comparison =
      compareInvoices(
        currentBill,
        previousBill
      );

    const currentEvidence =
      await this.getEvidenceForInvoice(
        currentBill
      );

    const previousEvidence =
      previousBill
        ? await this.getEvidenceForInvoice(
            previousBill
          )
        : null;

    let ordersBetweenBills = [];

    if (previousBill) {
      const subscribers =
        uniqueValues([
          ...currentBill.subscriberKeys,
          ...previousBill.subscriberKeys
        ]);

      const orderRows =
        await this.repository
          .getOrdersBetweenBills({
            subscriberKeys:
              subscribers,

            startDate:
              previousBill.cycleDate,

            endDate:
              currentBill.cycleDate
          });

      ordersBetweenBills =
        normalizeOrderContext(
          orderRows
        );
    }

    const datasetMetadata =
      typeof this.repository
        .getImportMetadata ===
        'function'
        ? await this.repository
            .getImportMetadata()
        : [];

    return {
      schemaVersion:
        'desafio1-billing-analysis-v1',

      phase:
        'PHASE_2',

      generatedAt:
        new Date().toISOString(),

      subscriber,

      currentBill,

      previousBill,

      comparison,

      evidence: {
        current:
          currentEvidence,

        previous:
          previousEvidence,

        ordersBetweenBills
      },

      dataLineage: {
        sourceDatabase:
          'desafio1.db',

        datasets:
          datasetMetadata
            .map(
              (dataset) => ({
                datasetKey:
                  dataset.datasetKey,

                fileName:
                  dataset.fileName,

                sha256:
                  dataset.sha256,

                importedRows:
                  dataset.importedRows,

                importedAt:
                  dataset.importedAt
              })
            )
      },

      safeguards: {
        financialExplanationGenerated:
          false,

        evidenceAmountsSummedAsCauses:
          false,

        note:
          'Fase 2 reconstruye recibos, diferencias y evidencia. La interpretación causal se implementará en Fase 3.'
      }
    };
  }
}

function createBillingAnalysisService(
  options = {}
) {
  return new BillingAnalysisService(
    options
  );
}

async function analyzeSubscriberBilling(
  subscriberKey,
  options = {}
) {
  const service =
    createBillingAnalysisService(
      options
    );

  try {
    return await service
      .analyzeSubscriber(
        subscriberKey
      );
  } finally {
    await service.close();
  }
}

module.exports = {
  BillingAnalysisError,
  BillingAnalysisService,
  createBillingAnalysisService,
  analyzeSubscriberBilling
};
